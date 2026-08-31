import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { isIP } from 'node:net';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import { ErroNaoAutenticado } from '../autorizacao/erros-autorizacao.js';
import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroCredenciaisInvalidas,
  ErroConfirmacaoRevogacaoSessaoNecessaria,
  ErroLimiteLoginExcedido,
  ErroMfaNecessario,
  ErroRequisicaoWebNaoConfiavel,
} from './erros-autenticacao.js';
import type {
  CredencialLoginWeb,
  EntradaLoginWeb,
  SessaoWebAutenticada,
  SessaoWebEmitida,
  SessaoWebPersistida,
  ResumoSessaoWeb,
} from './modelo-autenticacao.js';
import {
  REPOSITORIO_AUTENTICACAO,
  type RepositorioAutenticacao,
} from './repositorio-autenticacao.js';
import { ServicoSenha } from './servico-senha.js';
import { credencialExigeMfa } from './politica-mfa.js';

const JANELA_FALHAS_MS = 15 * 60 * 1_000;
const LIMITE_CONTA_IP = 5;
const LIMITE_IP = 50;
const DURACAO_INATIVIDADE_MS = 12 * 60 * 60 * 1_000;
const INTERVALO_REGISTRO_ATIVIDADE_MS = 5 * 60 * 1_000;
const LIMITE_SESSOES_WEB = 2;
const SEGREDO_OPACO = /^[A-Za-z0-9_-]{43}$/u;
const IDENTIFICADOR_LOGIN = /^[\p{L}\p{N}._@+-]{3,120}$/u;

function hashHex(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

function gerarSegredo(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class ServicoAutenticacaoWeb {
  public constructor(
    @Inject(REPOSITORIO_AUTENTICACAO)
    private readonly repositorio: RepositorioAutenticacao,
    @Inject(ServicoPrisma)
    private readonly prisma: ServicoPrisma,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
    @Inject(ServicoSenha)
    private readonly senhas: ServicoSenha,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
  ) {}

  public async entrar(entrada: EntradaLoginWeb): Promise<SessaoWebEmitida> {
    const identificadorNormalizado = this.normalizarIdentificador(
      entrada.identificador,
    );
    this.validarContextoCliente(entrada.enderecoIp, entrada.agenteUsuario);
    const identificadorHash = hashHex(identificadorNormalizado);
    const agora = new Date();
    const reserva = await this.reservarTentativa(
      identificadorHash,
      entrada.enderecoIp,
      agora,
    );
    if (reserva.bloqueada) {
      throw new ErroLimiteLoginExcedido();
    }

    const credencial = await this.repositorio.obterCredencial(
      identificadorNormalizado,
    );
    const senhaCorreta = await this.verificarSenhaSemEnumeracao(
      entrada.senha,
      credencial,
    );
    if (
      credencial === undefined ||
      !senhaCorreta ||
      !credencial.credencialAtiva ||
      !credencial.usuarioAtivo
    ) {
      await this.prisma.executarTransacao(async (transacao) =>
        this.auditoria.registrar(
          {
            acao: 'LOGIN_WEB_FALHOU',
            dadosNovos: { resultado: 'FALHA' },
            enderecoIp: entrada.enderecoIp,
            origem: 'SISTEMA',
            tipoEvento: 'LOGIN_WEB_FALHOU',
          },
          transacao,
        ),
      );
      throw new ErroCredenciaisInvalidas();
    }

    if (credencialExigeMfa(credencial)) {
      await this.prisma.executarTransacao(async (transacao) => {
        await this.confirmarTentativa(reserva.id, transacao);
        await this.auditoria.registrar(
          {
            acao: 'LOGIN_WEB_MFA_NECESSARIO',
            dadosNovos: { resultado: 'MFA_NECESSARIO' },
            enderecoIp: entrada.enderecoIp,
            entidadeId: credencial.usuarioId,
            entidadeTipo: 'USUARIO',
            origem: 'SISTEMA',
            tipoEvento: 'LOGIN_WEB_MFA_NECESSARIO',
          },
          transacao,
        );
      });
      throw new ErroMfaNecessario();
    }

    const token = gerarSegredo();
    const csrf = gerarSegredo();
    const sessaoId = randomUUID();
    const expiraEm = new Date(agora.getTime() + DURACAO_INATIVIDADE_MS);
    const criacao = await this.prisma.executarTransacao(async (transacao) => {
      await this.confirmarTentativa(reserva.id, transacao);
      await this.repositorio.serializarSessoesUsuario(
        credencial.usuarioId,
        transacao,
      );
      const sessoesAtivas = await this.repositorio.listarSessoesAtivasUsuario(
        credencial.usuarioId,
        agora,
        transacao,
      );
      if (
        sessoesAtivas.length >= LIMITE_SESSOES_WEB &&
        !entrada.confirmarRevogacaoSessaoMaisAntiga
      ) {
        await this.auditoria.registrar(
          {
            acao: 'CONFIRMAR_SUBSTITUICAO_SESSAO_WEB',
            dadosNovos: { sessoes_ativas: sessoesAtivas.length },
            enderecoIp: entrada.enderecoIp,
            entidadeId: credencial.usuarioId,
            entidadeTipo: 'USUARIO',
            origem: 'USUARIO',
            tipoEvento: 'CONFIRMACAO_REVOGACAO_SESSAO_WEB_SOLICITADA',
            usuarioId: credencial.usuarioId,
          },
          transacao,
        );
        return { confirmacaoNecessaria: true } as const;
      }

      if (sessoesAtivas.length >= LIMITE_SESSOES_WEB) {
        const quantidadeRevogar =
          sessoesAtivas.length - LIMITE_SESSOES_WEB + 1;
        const sessoesRevogadas = sessoesAtivas
          .slice(0, quantidadeRevogar)
          .map(({ id }) => id);
        const quantidade = await this.repositorio.revogarSessoes(
          credencial.usuarioId,
          sessoesRevogadas,
          agora,
          'LIMITE_SESSOES_WEB',
          transacao,
        );
        if (quantidade !== sessoesRevogadas.length) {
          throw new Error('LIMITE_SESSOES_WEB_NAO_SERIALIZADO');
        }
        await this.auditoria.registrar(
          {
            acao: 'SUBSTITUIR_SESSAO_WEB_MAIS_ANTIGA',
            dadosNovos: { quantidade },
            enderecoIp: entrada.enderecoIp,
            entidadeId: credencial.usuarioId,
            entidadeTipo: 'USUARIO',
            origem: 'USUARIO',
            tipoEvento: 'SESSAO_WEB_ANTIGA_REVOGADA',
            usuarioId: credencial.usuarioId,
          },
          transacao,
        );
      }
      await this.repositorio.criarSessao(
        {
          agenteUsuarioHash: hashHex(entrada.agenteUsuario),
          autenticadaEm: agora,
          csrfHash: hashHex(csrf),
          enderecoIp: entrada.enderecoIp,
          expiraEm,
          id: sessaoId,
          ultimaAtividadeEm: agora,
          tokenHash: hashHex(token),
          usuarioId: credencial.usuarioId,
        },
        transacao,
      );
      await this.auditoria.registrar(
        {
          acao: 'LOGIN_WEB_CONCLUIDO',
          dadosNovos: { resultado: 'SUCESSO' },
          enderecoIp: entrada.enderecoIp,
          entidadeId: sessaoId,
          entidadeTipo: 'SESSAO_WEB',
          origem: 'USUARIO',
          sessaoId,
          tipoEvento: 'SESSAO_WEB_CRIADA',
          usuarioId: credencial.usuarioId,
        },
        transacao,
      );
      return { confirmacaoNecessaria: false } as const;
    });

    if (criacao.confirmacaoNecessaria) {
      throw new ErroConfirmacaoRevogacaoSessaoNecessaria();
    }

    return {
      csrf,
      expiraEm,
      id: sessaoId,
      nomeExibicao: credencial.nomeExibicao,
      token,
      usuarioId: credencial.usuarioId,
    };
  }

  public async autenticar(token: string): Promise<SessaoWebAutenticada> {
    const sessao = await this.obterSessaoAtiva(token);
    return {
      contexto: {
        estado: 'ATIVA',
        expiraEm: sessao.expiraEm,
        sessaoId: sessao.id,
        usuarioId: sessao.usuarioId,
      },
      nomeExibicao: sessao.nomeExibicao,
    };
  }

  public async listarSessoes(token: string): Promise<readonly ResumoSessaoWeb[]> {
    const sessao = await this.obterSessaoAtiva(token);
    const agora = new Date();
    const sessoes = await this.repositorio.listarSessoesAtivasUsuario(
      sessao.usuarioId,
      agora,
    );
    return sessoes.map((item) => ({ ...item, atual: item.id === sessao.id }));
  }

  public async rotacionar(token: string, csrf: string): Promise<SessaoWebEmitida> {
    this.validarSegredo(token);
    this.validarSegredo(csrf);
    const tokenHashAtual = hashHex(token);
    const csrfHashAtual = hashHex(csrf);
    const tokenNovo = gerarSegredo();
    const csrfNovo = gerarSegredo();
    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + DURACAO_INATIVIDADE_MS);

    return this.prisma.executarTransacao(async (transacao) => {
      const sessao = await this.repositorio.obterSessao(
        tokenHashAtual,
        transacao,
      );
      this.validarSessaoPersistida(sessao, agora);
      if (!this.hashConfere(csrfHashAtual, sessao.csrfHash)) {
        throw new ErroRequisicaoWebNaoConfiavel();
      }
      const rotacionada = await this.repositorio.rotacionarSessao(
        sessao.id,
        tokenHashAtual,
        hashHex(tokenNovo),
        hashHex(csrfNovo),
        agora,
        expiraEm,
        transacao,
      );
      if (!rotacionada) {
        throw new ErroNaoAutenticado();
      }
      await this.auditoria.registrar(
        {
          acao: 'ROTACIONAR_SESSAO_WEB',
          dadosNovos: { versao: sessao.versao + 1 },
          entidadeId: sessao.id,
          entidadeTipo: 'SESSAO_WEB',
          origem: 'USUARIO',
          sessaoId: sessao.id,
          tipoEvento: 'SESSAO_WEB_ROTACIONADA',
          usuarioId: sessao.usuarioId,
        },
        transacao,
      );
      return {
        csrf: csrfNovo,
        expiraEm,
        id: sessao.id,
        nomeExibicao: sessao.nomeExibicao,
        token: tokenNovo,
        usuarioId: sessao.usuarioId,
      };
    });
  }

  public async sair(token: string, csrf: string): Promise<void> {
    this.validarSegredo(token);
    this.validarSegredo(csrf);
    const tokenHash = hashHex(token);
    const csrfHash = hashHex(csrf);
    const agora = new Date();
    await this.prisma.executarTransacao(async (transacao) => {
      const sessao = await this.repositorio.obterSessao(tokenHash, transacao);
      this.validarSessaoPersistida(sessao, agora);
      if (!this.hashConfere(csrfHash, sessao.csrfHash)) {
        throw new ErroRequisicaoWebNaoConfiavel();
      }
      const revogada = await this.repositorio.revogarSessao(
        sessao.id,
        tokenHash,
        agora,
        'LOGOUT',
        transacao,
      );
      if (!revogada) {
        throw new ErroNaoAutenticado();
      }
      await this.auditoria.registrar(
        {
          acao: 'SAIR_SESSAO_WEB',
          dadosNovos: { estado: 'REVOGADA' },
          entidadeId: sessao.id,
          entidadeTipo: 'SESSAO_WEB',
          origem: 'USUARIO',
          sessaoId: sessao.id,
          tipoEvento: 'SESSAO_WEB_REVOGADA',
          usuarioId: sessao.usuarioId,
        },
        transacao,
      );
    });
  }

  public async sairDeTodas(token: string, csrf: string): Promise<void> {
    await this.revogarComSessaoAtual(token, csrf, async (sessao, agora, transacao) => {
      await this.repositorio.serializarSessoesUsuario(sessao.usuarioId, transacao);
      const ativas = await this.repositorio.listarSessoesAtivasUsuario(
        sessao.usuarioId,
        agora,
        transacao,
      );
      const quantidade = await this.repositorio.revogarSessoes(
        sessao.usuarioId,
        ativas.map(({ id }) => id),
        agora,
        'LOGOUT_GLOBAL',
        transacao,
      );
      await this.auditoria.registrar(
        {
          acao: 'SAIR_DE_TODAS_SESSOES_WEB',
          dadosNovos: { quantidade },
          entidadeId: sessao.usuarioId,
          entidadeTipo: 'USUARIO',
          origem: 'USUARIO',
          sessaoId: sessao.id,
          tipoEvento: 'SESSOES_WEB_REVOGADAS_GLOBALMENTE',
          usuarioId: sessao.usuarioId,
        },
        transacao,
      );
    });
  }

  public async revogarSessaoDoUsuario(
    token: string,
    csrf: string,
    sessaoAlvoId: string,
  ): Promise<void> {
    await this.revogarComSessaoAtual(token, csrf, async (sessao, agora, transacao) => {
      await this.repositorio.serializarSessoesUsuario(sessao.usuarioId, transacao);
      const quantidade = await this.repositorio.revogarSessoes(
        sessao.usuarioId,
        [sessaoAlvoId],
        agora,
        'REVOGACAO_PELO_USUARIO',
        transacao,
      );
      if (quantidade !== 1) {
        throw new ErroPermissaoNegada();
      }
      await this.auditoria.registrar(
        {
          acao: 'REVOGAR_SESSAO_WEB',
          dadosNovos: { estado: 'REVOGADA' },
          entidadeId: sessaoAlvoId,
          entidadeTipo: 'SESSAO_WEB',
          origem: 'USUARIO',
          sessaoId: sessao.id,
          tipoEvento: 'SESSAO_WEB_REVOGADA_REMOTAMENTE',
          usuarioId: sessao.usuarioId,
        },
        transacao,
      );
    });
  }

  public async revogarSessoesAdministrativamente(
    token: string,
    csrf: string,
    usuarioAlvoId: string,
  ): Promise<void> {
    await this.revogarComSessaoAtual(token, csrf, async (sessao, agora, transacao) => {
      await this.autorizacao.autorizar(
        {
          permissao: 'ADMINISTRAR_USUARIOS',
          recurso: { id: usuarioAlvoId, tipo: 'USUARIO' },
          sessao: {
            estado: 'ATIVA',
            expiraEm: sessao.expiraEm,
            sessaoId: sessao.id,
            usuarioId: sessao.usuarioId,
          },
        },
        async (_autorizacao, transacaoAutorizacao) => ({
          acessivel:
            transacaoAutorizacao !== undefined &&
            (await this.repositorio.usuarioAtivo(
              usuarioAlvoId,
              transacaoAutorizacao,
            )),
          estadoPermiteAcao: true,
        }),
        transacao,
      );
      await this.repositorio.serializarSessoesUsuario(usuarioAlvoId, transacao);
      const ativas = await this.repositorio.listarSessoesAtivasUsuario(
        usuarioAlvoId,
        agora,
        transacao,
      );
      const quantidade = await this.repositorio.revogarSessoes(
        usuarioAlvoId,
        ativas.map(({ id }) => id),
        agora,
        'REVOGACAO_ADMINISTRATIVA',
        transacao,
      );
      await this.auditoria.registrar(
        {
          acao: 'REVOGAR_SESSOES_WEB_ADMINISTRATIVAMENTE',
          dadosNovos: { quantidade },
          entidadeId: usuarioAlvoId,
          entidadeTipo: 'USUARIO',
          origem: 'USUARIO',
          sessaoId: sessao.id,
          tipoEvento: 'SESSOES_WEB_REVOGADAS_ADMINISTRATIVAMENTE',
          usuarioId: sessao.usuarioId,
        },
        transacao,
      );
    });
  }

  private async obterSessaoAtiva(token: string): Promise<SessaoWebPersistida> {
    this.validarSegredo(token);
    const tokenHash = hashHex(token);
    const agora = new Date();
    return this.prisma.executarTransacao(async (transacao) => {
      const sessao = await this.repositorio.obterSessao(tokenHash, transacao);
      this.validarSessaoPersistida(sessao, agora);
      const limiteRegistro = new Date(
        agora.getTime() - INTERVALO_REGISTRO_ATIVIDADE_MS,
      );
      if (sessao.ultimaAtividadeEm <= limiteRegistro) {
        const expiraEm = new Date(agora.getTime() + DURACAO_INATIVIDADE_MS);
        const atualizada = await this.repositorio.registrarAtividadeSessao(
          sessao.id,
          tokenHash,
          limiteRegistro,
          agora,
          expiraEm,
          transacao,
        );
        if (atualizada) {
          return { ...sessao, expiraEm, ultimaAtividadeEm: agora };
        }
      }
      return sessao;
    });
  }

  private async revogarComSessaoAtual(
    token: string,
    csrf: string,
    operacao: (
      sessao: SessaoWebPersistida,
      agora: Date,
      transacao: TransacaoPrisma,
    ) => Promise<void>,
  ): Promise<void> {
    this.validarSegredo(token);
    this.validarSegredo(csrf);
    const tokenHash = hashHex(token);
    const csrfHash = hashHex(csrf);
    const agora = new Date();
    await this.prisma.executarTransacao(async (transacao) => {
      const sessao = await this.repositorio.obterSessao(tokenHash, transacao);
      this.validarSessaoPersistida(sessao, agora);
      if (!this.hashConfere(csrfHash, sessao.csrfHash)) {
        throw new ErroRequisicaoWebNaoConfiavel();
      }
      await operacao(sessao, agora, transacao);
    });
  }

  private validarSessaoPersistida(
    sessao: SessaoWebPersistida | undefined,
    agora: Date,
  ): asserts sessao is SessaoWebPersistida {
    if (
      sessao === undefined ||
      sessao.estado !== 'ATIVA' ||
      !sessao.usuarioAtivo ||
      sessao.expiraEm <= agora
    ) {
      throw new ErroNaoAutenticado();
    }
  }

  private async verificarSenhaSemEnumeracao(
    senha: string,
    credencial: CredencialLoginWeb | undefined,
  ): Promise<boolean> {
    if (credencial === undefined) {
      await this.senhas.simularVerificacao(senha);
      return false;
    }
    return this.senhas.verificar(senha, credencial.senhaHash);
  }

  private async reservarTentativa(
    identificadorHash: string,
    enderecoIp: string,
    agora: Date,
  ): Promise<{ readonly bloqueada: boolean; readonly id: string }> {
    return this.prisma.executarTransacao(async (transacao) => {
      await this.repositorio.serializarLimiteLogin(
        identificadorHash,
        enderecoIp,
        transacao,
      );
      const falhas = await this.repositorio.contarFalhasRecentes(
        identificadorHash,
        enderecoIp,
        new Date(agora.getTime() - JANELA_FALHAS_MS),
        transacao,
      );
      const bloqueada =
        falhas.contaIp >= LIMITE_CONTA_IP || falhas.ip >= LIMITE_IP;
      const tentativaId = randomUUID();
      await this.repositorio.registrarTentativa(
        {
          criadoEm: agora,
          enderecoIp,
          id: tentativaId,
          identificadorHash,
          resultado: bloqueada ? 'BLOQUEADA' : 'FALHA',
        },
        transacao,
      );
      if (bloqueada) {
        await this.auditoria.registrar(
          {
            acao: 'LOGIN_WEB_BLOQUEADO',
            dadosNovos: { resultado: 'BLOQUEADA' },
            enderecoIp,
            origem: 'SISTEMA',
            tipoEvento: 'LOGIN_WEB_BLOQUEADO',
          },
          transacao,
        );
      }
      return { bloqueada, id: tentativaId };
    });
  }

  private async confirmarTentativa(
    tentativaId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    const atualizada = await this.repositorio.atualizarResultadoTentativa(
      tentativaId,
      'SUCESSO',
      transacao,
    );
    if (!atualizada) {
      throw new Error('TENTATIVA_LOGIN_NAO_CONFIRMADA');
    }
  }

  private normalizarIdentificador(identificador: string): string {
    const normalizado = identificador.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
    if (!IDENTIFICADOR_LOGIN.test(normalizado)) {
      throw new ErroCredenciaisInvalidas();
    }
    return normalizado;
  }

  private validarContextoCliente(enderecoIp: string, agenteUsuario: string): void {
    if (isIP(enderecoIp) === 0 || agenteUsuario.length < 1 || agenteUsuario.length > 1_000) {
      throw new ErroCredenciaisInvalidas();
    }
  }

  private validarSegredo(segredo: string): void {
    if (!SEGREDO_OPACO.test(segredo)) {
      throw new ErroNaoAutenticado();
    }
  }

  private hashConfere(recebido: string, esperado: string): boolean {
    return timingSafeEqual(Buffer.from(recebido, 'hex'), Buffer.from(esperado, 'hex'));
  }
}
