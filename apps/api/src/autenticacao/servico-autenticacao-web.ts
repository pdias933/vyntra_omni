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
import { MATRIZ_PERMISSOES_BASE } from '../autorizacao/matriz-permissoes.js';
import type { CodigoPermissaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroCredenciaisInvalidas,
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
} from './modelo-autenticacao.js';
import {
  REPOSITORIO_AUTENTICACAO,
  type RepositorioAutenticacao,
} from './repositorio-autenticacao.js';
import { ServicoSenha } from './servico-senha.js';

const JANELA_FALHAS_MS = 15 * 60 * 1_000;
const LIMITE_CONTA_IP = 5;
const LIMITE_IP = 50;
const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1_000;
const SEGREDO_OPACO = /^[A-Za-z0-9_-]{43}$/u;
const IDENTIFICADOR_LOGIN = /^[\p{L}\p{N}._@+-]{3,120}$/u;
const PERMISSOES_PRIVILEGIADAS = new Set<CodigoPermissaoAutorizacao>([
  'ADMINISTRAR_USUARIOS',
  'ADMINISTRAR_INTEGRACOES',
  'PUBLICAR_FLUXO',
  'EXPORTAR_HISTORICO',
]);

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

    if (this.exigeMfa(credencial)) {
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
    const expiraEm = new Date(agora.getTime() + DURACAO_SESSAO_MS);
    await this.prisma.executarTransacao(async (transacao) => {
      await this.confirmarTentativa(reserva.id, transacao);
      await this.repositorio.criarSessao(
        {
          agenteUsuarioHash: hashHex(entrada.agenteUsuario),
          autenticadaEm: agora,
          csrfHash: hashHex(csrf),
          enderecoIp: entrada.enderecoIp,
          expiraEm,
          id: sessaoId,
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
    });

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

  public async rotacionar(token: string, csrf: string): Promise<SessaoWebEmitida> {
    this.validarSegredo(token);
    this.validarSegredo(csrf);
    const tokenHashAtual = hashHex(token);
    const csrfHashAtual = hashHex(csrf);
    const tokenNovo = gerarSegredo();
    const csrfNovo = gerarSegredo();
    const agora = new Date();

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
        expiraEm: sessao.expiraEm,
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

  private async obterSessaoAtiva(token: string): Promise<SessaoWebPersistida> {
    this.validarSegredo(token);
    const sessao = await this.repositorio.obterSessao(hashHex(token));
    this.validarSessaoPersistida(sessao, new Date());
    return sessao;
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

  private exigeMfa(credencial: CredencialLoginWeb): boolean {
    const papelBase = credencial.papelBase;
    if (!credencial.perfilAtivo || papelBase === undefined) {
      return false;
    }
    if (papelBase === 'ADMINISTRADOR') {
      return true;
    }
    return [...PERMISSOES_PRIVILEGIADAS].some((permissao) => {
      const ajuste = credencial.ajustes.find(({ codigo }) => codigo === permissao);
      if (ajuste?.efeito === 'NEGAR') {
        return false;
      }
      return (
        ajuste?.efeito === 'CONCEDER' ||
        MATRIZ_PERMISSOES_BASE[papelBase].includes(permissao)
      );
    });
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
