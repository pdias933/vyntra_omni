import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { isIP } from 'node:net';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import {
  ErroNaoAutenticado,
  ErroPermissaoNegada,
} from '../autorizacao/erros-autorizacao.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroCredenciaisInvalidas,
  ErroDispositivoNaoConfiavel,
  ErroLimiteLoginExcedido,
  ErroMfaNecessario,
} from './erros-autenticacao.js';
import type {
  CredencialLoginMobile,
  EntradaDispositivoMobile,
  EntradaLoginMobile,
  ResumoDispositivoMobile,
  SessaoMobileAutenticada,
  SessaoMobileEmitida,
  SessaoMobilePersistida,
} from './modelo-autenticacao-mobile.js';
import { credencialExigeMfa } from './politica-mfa.js';
import {
  REPOSITORIO_AUTENTICACAO_MOBILE,
  type RepositorioAutenticacaoMobile,
} from './repositorio-autenticacao-mobile.js';
import { ServicoSenha } from './servico-senha.js';

const JANELA_FALHAS_MS = 15 * 60 * 1_000;
const LIMITE_CONTA_IP_DISPOSITIVO = 5;
const LIMITE_IP = 50;
const LIMITE_DISPOSITIVOS_MOBILE = 2;
const DURACAO_ACESSO_MS = 15 * 60 * 1_000;
const DURACAO_REFRESH_MS = 30 * 24 * 60 * 60 * 1_000;
const SEGREDO_OPACO = /^[A-Za-z0-9_-]{43}$/u;
const IDENTIFICADOR_LOGIN = /^[\p{L}\p{N}._@+-]{3,120}$/u;
const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERSAO_APLICATIVO = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/u;

function hashHex(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

function gerarSegredo(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class ServicoAutenticacaoMobile {
  public constructor(
    @Inject(REPOSITORIO_AUTENTICACAO_MOBILE)
    private readonly repositorio: RepositorioAutenticacaoMobile,
    @Inject(ServicoPrisma)
    private readonly prisma: ServicoPrisma,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
    @Inject(ServicoSenha)
    private readonly senhas: ServicoSenha,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
  ) {}

  public async entrar(entrada: EntradaLoginMobile): Promise<SessaoMobileEmitida> {
    const identificadorNormalizado = this.normalizarIdentificador(
      entrada.identificador,
    );
    const dispositivo = this.validarDispositivo(entrada);
    this.validarEnderecoIp(entrada.enderecoIp);
    const identificadorHash = hashHex(identificadorNormalizado);
    const agora = new Date();
    const reserva = await this.reservarTentativa(
      identificadorHash,
      entrada.enderecoIp,
      dispositivo.identificadorInstalacaoHash,
      agora,
    );
    if (reserva.bloqueada) throw new ErroLimiteLoginExcedido();

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
            acao: 'LOGIN_MOBILE_FALHOU',
            dadosNovos: { resultado: 'FALHA' },
            enderecoIp: entrada.enderecoIp,
            origem: 'SISTEMA',
            tipoEvento: 'LOGIN_MOBILE_FALHOU',
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
            acao: 'LOGIN_MOBILE_MFA_NECESSARIO',
            dadosNovos: { resultado: 'MFA_NECESSARIO' },
            enderecoIp: entrada.enderecoIp,
            entidadeId: credencial.usuarioId,
            entidadeTipo: 'USUARIO',
            origem: 'SISTEMA',
            tipoEvento: 'LOGIN_MOBILE_MFA_NECESSARIO',
          },
          transacao,
        );
      });
      throw new ErroMfaNecessario();
    }

    const tokenAcesso = gerarSegredo();
    const tokenRefresh = gerarSegredo();
    const sessaoId = randomUUID();
    const acessoExpiraEm = new Date(agora.getTime() + DURACAO_ACESSO_MS);
    const refreshExpiraEm = new Date(agora.getTime() + DURACAO_REFRESH_MS);
    const resultado = await this.prisma.executarTransacao(async (transacao) => {
      let dispositivosRevogadosPorLimite = 0;
      await this.repositorio.serializarDispositivosUsuario(
        credencial.usuarioId,
        transacao,
      );
      let persistido = await this.repositorio.obterDispositivo(
        credencial.usuarioId,
        dispositivo.identificadorInstalacaoHash,
        transacao,
      );
      if (
        persistido !== undefined &&
        (persistido.estado !== 'ATIVO' ||
          !this.hashConfere(
            dispositivo.segredoVinculoHash,
            persistido.segredoVinculoHash,
          ))
      ) {
        await this.auditoria.registrar(
          {
            acao: 'RECUSAR_DISPOSITIVO_MOBILE',
            dadosNovos: { resultado: 'DISPOSITIVO_NAO_CONFIAVEL' },
            enderecoIp: entrada.enderecoIp,
            entidadeId: persistido.id,
            entidadeTipo: 'DISPOSITIVO_MOBILE',
            origem: 'USUARIO',
            tipoEvento: 'DISPOSITIVO_MOBILE_RECUSADO',
            usuarioId: credencial.usuarioId,
          },
          transacao,
        );
        return { dispositivoNaoConfiavel: true } as const;
      }
      await this.confirmarTentativa(reserva.id, transacao);
      if (persistido === undefined) {
        const dispositivosAtivos =
          await this.repositorio.listarDispositivosAtivosUsuario(
            credencial.usuarioId,
            transacao,
          );
        const quantidadeRevogar = Math.max(
          0,
          dispositivosAtivos.length - LIMITE_DISPOSITIVOS_MOBILE + 1,
        );
        if (quantidadeRevogar > 0) {
          const dispositivosRevogados = dispositivosAtivos
            .slice(0, quantidadeRevogar)
            .map(({ id }) => id);
          const quantidade = await this.repositorio.revogarDispositivos(
            credencial.usuarioId,
            dispositivosRevogados,
            agora,
            'LIMITE_DISPOSITIVOS_MOBILE',
            transacao,
          );
          if (quantidade !== dispositivosRevogados.length) {
            throw new Error('LIMITE_DISPOSITIVOS_MOBILE_NAO_SERIALIZADO');
          }
          dispositivosRevogadosPorLimite = quantidade;
          const sessoesRevogadas =
            await this.repositorio.revogarSessoesAtivasDispositivos(
              credencial.usuarioId,
              dispositivosRevogados,
              agora,
              'DISPOSITIVO_REVOGADO_POR_LIMITE',
              transacao,
            );
          await this.auditoria.registrar(
            {
              acao: 'SUBSTITUIR_DISPOSITIVO_MOBILE_MAIS_ANTIGO',
              dadosNovos: {
                dispositivos_revogados: quantidade,
                sessoes_revogadas: sessoesRevogadas,
              },
              enderecoIp: entrada.enderecoIp,
              entidadeId: credencial.usuarioId,
              entidadeTipo: 'USUARIO',
              origem: 'USUARIO',
              tipoEvento: 'DISPOSITIVO_MOBILE_ANTIGO_REVOGADO',
              usuarioId: credencial.usuarioId,
            },
            transacao,
          );
        }
        const dispositivoId = randomUUID();
        await this.repositorio.criarDispositivo(
          {
            ...dispositivo,
            agora,
            id: dispositivoId,
            usuarioId: credencial.usuarioId,
          },
          transacao,
        );
        persistido = {
          estado: 'ATIVO',
          id: dispositivoId,
          segredoVinculoHash: dispositivo.segredoVinculoHash,
          usuarioId: credencial.usuarioId,
        };
        await this.auditoria.registrar(
          {
            acao: 'VINCULAR_DISPOSITIVO_MOBILE',
            dadosNovos: { plataforma: dispositivo.plataforma },
            dispositivoId,
            enderecoIp: entrada.enderecoIp,
            entidadeId: dispositivoId,
            entidadeTipo: 'DISPOSITIVO_MOBILE',
            origem: 'USUARIO',
            tipoEvento: 'DISPOSITIVO_MOBILE_VINCULADO',
            usuarioId: credencial.usuarioId,
          },
          transacao,
        );
      } else {
        const atualizado = await this.repositorio.atualizarDispositivo(
          persistido.id,
          dispositivo,
          agora,
          transacao,
        );
        if (!atualizado) return { dispositivoNaoConfiavel: true } as const;
      }

      const sessoesAnteriores =
        await this.repositorio.revogarSessoesAtivasDispositivo(
          persistido.id,
          agora,
          'NOVO_LOGIN_MESMO_DISPOSITIVO',
          transacao,
        );
      await this.repositorio.criarSessao(
        {
          acessoExpiraEm,
          autenticadaEm: agora,
          dispositivoId: persistido.id,
          id: sessaoId,
          refreshExpiraEm,
          tokenAcessoHash: hashHex(tokenAcesso),
          tokenRefreshHash: hashHex(tokenRefresh),
          usuarioId: credencial.usuarioId,
        },
        transacao,
      );
      await this.auditoria.registrar(
        {
          acao: 'LOGIN_MOBILE_CONCLUIDO',
          dadosNovos: { sessoes_anteriores_revogadas: sessoesAnteriores },
          dispositivoId: persistido.id,
          enderecoIp: entrada.enderecoIp,
          entidadeId: sessaoId,
          entidadeTipo: 'SESSAO_MOBILE',
          origem: 'USUARIO',
          sessaoId,
          tipoEvento: 'SESSAO_MOBILE_CRIADA',
          usuarioId: credencial.usuarioId,
        },
        transacao,
      );
      return {
        dispositivoId: persistido.id,
        dispositivoNaoConfiavel: false,
        dispositivosRevogadosPorLimite,
      } as const;
    });
    if (resultado.dispositivoNaoConfiavel) {
      throw new ErroDispositivoNaoConfiavel();
    }
    return {
      acessoExpiraEm,
      dispositivoId: resultado.dispositivoId,
      dispositivoSubstituido: resultado.dispositivosRevogadosPorLimite > 0,
      id: sessaoId,
      nomeExibicao: credencial.nomeExibicao,
      refreshExpiraEm,
      tokenAcesso,
      tokenRefresh,
      usuarioId: credencial.usuarioId,
    };
  }

  public async autenticar(
    tokenAcesso: string,
    dispositivoId: string,
    segredoVinculo: string,
  ): Promise<SessaoMobileAutenticada> {
    this.validarSegredo(tokenAcesso);
    this.validarIdentidadeApresentada(dispositivoId, segredoVinculo);
    const sessao = await this.repositorio.obterSessaoPorAcesso(
      hashHex(tokenAcesso),
    );
    this.validarSessao(
      sessao,
      dispositivoId,
      hashHex(segredoVinculo),
      new Date(),
      'ACESSO',
    );
    return {
      contexto: {
        estado: 'ATIVA',
        expiraEm: sessao.acessoExpiraEm,
        sessaoId: sessao.id,
        usuarioId: sessao.usuarioId,
      },
      dispositivoId: sessao.dispositivoId,
      nomeExibicao: sessao.nomeExibicao,
    };
  }

  public async listarDispositivos(
    tokenAcesso: string,
    dispositivoId: string,
    segredoVinculo: string,
  ): Promise<readonly ResumoDispositivoMobile[]> {
    return this.executarComSessaoAtual(
      tokenAcesso,
      dispositivoId,
      segredoVinculo,
      async (sessao, _agora, transacao) => {
        const dispositivos =
          await this.repositorio.listarDispositivosAtivosUsuario(
            sessao.usuarioId,
            transacao,
          );
        return dispositivos.map((dispositivo) => ({
          ...dispositivo,
          atual: dispositivo.id === sessao.dispositivoId,
        }));
      },
    );
  }

  public async revogarDispositivoDoUsuario(
    tokenAcesso: string,
    dispositivoId: string,
    segredoVinculo: string,
    dispositivoAlvoId: string,
  ): Promise<void> {
    await this.executarComSessaoAtual(
      tokenAcesso,
      dispositivoId,
      segredoVinculo,
      async (sessao, agora, transacao) => {
        const quantidade = await this.repositorio.revogarDispositivos(
          sessao.usuarioId,
          [dispositivoAlvoId],
          agora,
          'REVOGACAO_PELO_USUARIO',
          transacao,
        );
        if (quantidade !== 1) throw new ErroPermissaoNegada();
        const sessoesRevogadas =
          await this.repositorio.revogarSessoesAtivasDispositivos(
            sessao.usuarioId,
            [dispositivoAlvoId],
            agora,
            'DISPOSITIVO_REVOGADO_PELO_USUARIO',
            transacao,
          );
        await this.auditoria.registrar(
          {
            acao: 'REVOGAR_DISPOSITIVO_MOBILE',
            dadosNovos: { sessoes_revogadas: sessoesRevogadas },
            dispositivoId: sessao.dispositivoId,
            entidadeId: dispositivoAlvoId,
            entidadeTipo: 'DISPOSITIVO_MOBILE',
            origem: 'USUARIO',
            sessaoId: sessao.id,
            tipoEvento: 'DISPOSITIVO_MOBILE_REVOGADO_REMOTAMENTE',
            usuarioId: sessao.usuarioId,
          },
          transacao,
        );
      },
    );
  }

  public async revogarDispositivosAdministrativamente(
    sessaoAdministrativa: ContextoSessaoAutorizacao,
    usuarioAlvoId: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.autorizacao.autorizar(
      {
        permissao: 'ADMINISTRAR_USUARIOS',
        recurso: { id: usuarioAlvoId, tipo: 'USUARIO' },
        sessao: sessaoAdministrativa,
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
    await this.repositorio.serializarDispositivosUsuario(
      usuarioAlvoId,
      transacao,
    );
    const dispositivos =
      await this.repositorio.listarDispositivosAtivosUsuario(
        usuarioAlvoId,
        transacao,
      );
    const dispositivosIds = dispositivos.map(({ id }) => id);
    const quantidade = await this.repositorio.revogarDispositivos(
      usuarioAlvoId,
      dispositivosIds,
      agora,
      'REVOGACAO_ADMINISTRATIVA',
      transacao,
    );
    const sessoesRevogadas =
      await this.repositorio.revogarSessoesAtivasDispositivos(
        usuarioAlvoId,
        dispositivosIds,
        agora,
        'DISPOSITIVO_REVOGADO_ADMINISTRATIVAMENTE',
        transacao,
      );
    await this.auditoria.registrar(
      {
        acao: 'REVOGAR_DISPOSITIVOS_MOBILE_ADMINISTRATIVAMENTE',
        dadosNovos: {
          dispositivos_revogados: quantidade,
          sessoes_revogadas: sessoesRevogadas,
        },
        entidadeId: usuarioAlvoId,
        entidadeTipo: 'USUARIO',
        origem: 'USUARIO',
        sessaoId: sessaoAdministrativa.sessaoId,
        tipoEvento: 'DISPOSITIVOS_MOBILE_REVOGADOS_ADMINISTRATIVAMENTE',
        usuarioId: sessaoAdministrativa.usuarioId,
      },
      transacao,
    );
  }

  public async renovar(
    tokenRefresh: string,
    dispositivoId: string,
    segredoVinculo: string,
  ): Promise<SessaoMobileEmitida> {
    this.validarSegredo(tokenRefresh);
    this.validarIdentidadeApresentada(dispositivoId, segredoVinculo);
    const tokenRefreshHash = hashHex(tokenRefresh);
    const segredoVinculoHash = hashHex(segredoVinculo);
    const tokenAcessoNovo = gerarSegredo();
    const tokenRefreshNovo = gerarSegredo();
    const agora = new Date();
    const resultado = await this.prisma.executarTransacao(async (transacao) => {
      await this.repositorio.serializarTokenRefresh(tokenRefreshHash, transacao);
      const atual = await this.repositorio.obterSessaoPorRefreshAtual(
        tokenRefreshHash,
        transacao,
      );
      if (atual === undefined) {
        const usada = await this.repositorio.obterSessaoPorRefreshUsado(
          tokenRefreshHash,
          transacao,
        );
        if (usada === undefined) throw new ErroNaoAutenticado();
        this.validarVinculo(usada, dispositivoId, segredoVinculoHash);
        const revogada = await this.repositorio.revogarSessao(
          usada.id,
          agora,
          'REPLAY_TOKEN_REFRESH',
          transacao,
        );
        if (revogada) {
          await this.auditoria.registrar(
            {
              acao: 'REVOGAR_SESSAO_MOBILE_POR_REPLAY',
              dadosNovos: { estado: 'REVOGADA' },
              dispositivoId: usada.dispositivoId,
              entidadeId: usada.id,
              entidadeTipo: 'SESSAO_MOBILE',
              origem: 'SISTEMA',
              sessaoId: usada.id,
              tipoEvento: 'REPLAY_TOKEN_REFRESH_MOBILE',
            },
            transacao,
          );
        }
        return { replay: true } as const;
      }
      this.validarSessao(
        atual,
        dispositivoId,
        segredoVinculoHash,
        agora,
        'REFRESH',
      );
      const acessoExpiraEm = new Date(
        Math.min(
          agora.getTime() + DURACAO_ACESSO_MS,
          atual.refreshExpiraEm.getTime() - 1,
        ),
      );
      const rotacionada = await this.repositorio.rotacionarSessao(
        atual.id,
        tokenRefreshHash,
        hashHex(tokenAcessoNovo),
        hashHex(tokenRefreshNovo),
        acessoExpiraEm,
        agora,
        transacao,
      );
      if (!rotacionada) throw new ErroNaoAutenticado();
      await this.auditoria.registrar(
        {
          acao: 'ROTACIONAR_SESSAO_MOBILE',
          dadosNovos: { versao: atual.versao + 1 },
          dispositivoId: atual.dispositivoId,
          entidadeId: atual.id,
          entidadeTipo: 'SESSAO_MOBILE',
          origem: 'USUARIO',
          sessaoId: atual.id,
          tipoEvento: 'SESSAO_MOBILE_ROTACIONADA',
          usuarioId: atual.usuarioId,
        },
        transacao,
      );
      return { acessoExpiraEm, replay: false, sessao: atual } as const;
    });
    if (resultado.replay) throw new ErroNaoAutenticado();
    return {
      acessoExpiraEm: resultado.acessoExpiraEm,
      dispositivoId: resultado.sessao.dispositivoId,
      dispositivoSubstituido: false,
      id: resultado.sessao.id,
      nomeExibicao: resultado.sessao.nomeExibicao,
      refreshExpiraEm: resultado.sessao.refreshExpiraEm,
      tokenAcesso: tokenAcessoNovo,
      tokenRefresh: tokenRefreshNovo,
      usuarioId: resultado.sessao.usuarioId,
    };
  }

  public async sair(
    tokenAcesso: string,
    dispositivoId: string,
    segredoVinculo: string,
  ): Promise<void> {
    this.validarSegredo(tokenAcesso);
    this.validarIdentidadeApresentada(dispositivoId, segredoVinculo);
    const tokenHash = hashHex(tokenAcesso);
    const agora = new Date();
    await this.prisma.executarTransacao(async (transacao) => {
      const sessao = await this.repositorio.obterSessaoPorAcesso(
        tokenHash,
        transacao,
      );
      this.validarSessao(
        sessao,
        dispositivoId,
        hashHex(segredoVinculo),
        agora,
        'ACESSO',
      );
      const revogada = await this.repositorio.revogarSessao(
        sessao.id,
        agora,
        'LOGOUT',
        transacao,
      );
      if (!revogada) throw new ErroNaoAutenticado();
      await this.auditoria.registrar(
        {
          acao: 'SAIR_SESSAO_MOBILE',
          dadosNovos: { estado: 'REVOGADA' },
          dispositivoId: sessao.dispositivoId,
          entidadeId: sessao.id,
          entidadeTipo: 'SESSAO_MOBILE',
          origem: 'USUARIO',
          sessaoId: sessao.id,
          tipoEvento: 'SESSAO_MOBILE_REVOGADA',
          usuarioId: sessao.usuarioId,
        },
        transacao,
      );
    });
  }

  private validarDispositivo(entrada: EntradaLoginMobile): EntradaDispositivoMobile {
    if (
      !IDENTIFICADOR_UUID.test(entrada.identificadorInstalacao) ||
      !SEGREDO_OPACO.test(entrada.segredoVinculo) ||
      !VERSAO_APLICATIVO.test(entrada.versaoAplicativo) ||
      !['ANDROID', 'IOS'].includes(entrada.plataforma) ||
      (entrada.modeloSanitizado !== undefined &&
        (entrada.modeloSanitizado.length > 120 ||
          Array.from(entrada.modeloSanitizado).some((caractere) => {
            const codigo = caractere.charCodeAt(0);
            return codigo <= 31 || codigo === 127;
          })))
    ) {
      throw new ErroCredenciaisInvalidas();
    }
    return {
      identificadorInstalacaoHash: hashHex(entrada.identificadorInstalacao),
      ...(entrada.modeloSanitizado === undefined
        ? {}
        : { modeloSanitizado: entrada.modeloSanitizado }),
      plataforma: entrada.plataforma,
      segredoVinculoHash: hashHex(entrada.segredoVinculo),
      versaoAplicativo: entrada.versaoAplicativo,
    };
  }

  private async executarComSessaoAtual<T>(
    tokenAcesso: string,
    dispositivoId: string,
    segredoVinculo: string,
    operacao: (
      sessao: SessaoMobilePersistida,
      agora: Date,
      transacao: TransacaoPrisma,
    ) => Promise<T>,
  ): Promise<T> {
    this.validarSegredo(tokenAcesso);
    this.validarIdentidadeApresentada(dispositivoId, segredoVinculo);
    const tokenHash = hashHex(tokenAcesso);
    const segredoHash = hashHex(segredoVinculo);
    const agora = new Date();
    return this.prisma.executarTransacao(async (transacao) => {
      const inicial = await this.repositorio.obterSessaoPorAcesso(
        tokenHash,
        transacao,
      );
      this.validarSessao(
        inicial,
        dispositivoId,
        segredoHash,
        agora,
        'ACESSO',
      );
      await this.repositorio.serializarDispositivosUsuario(
        inicial.usuarioId,
        transacao,
      );
      const confirmada = await this.repositorio.obterSessaoPorAcesso(
        tokenHash,
        transacao,
      );
      this.validarSessao(
        confirmada,
        dispositivoId,
        segredoHash,
        agora,
        'ACESSO',
      );
      return operacao(confirmada, agora, transacao);
    });
  }

  private validarIdentidadeApresentada(
    dispositivoId: string,
    segredoVinculo: string,
  ): void {
    if (!IDENTIFICADOR_UUID.test(dispositivoId) || !SEGREDO_OPACO.test(segredoVinculo)) {
      throw new ErroNaoAutenticado();
    }
  }

  private validarSessao(
    sessao: SessaoMobilePersistida | undefined,
    dispositivoId: string,
    segredoVinculoHash: string,
    agora: Date,
    finalidade: 'ACESSO' | 'REFRESH',
  ): asserts sessao is SessaoMobilePersistida {
    if (
      sessao === undefined ||
      sessao.estado !== 'ATIVA' ||
      !sessao.usuarioAtivo ||
      !sessao.dispositivoAtivo ||
      (finalidade === 'ACESSO'
        ? sessao.acessoExpiraEm <= agora
        : sessao.refreshExpiraEm <= agora)
    ) {
      throw new ErroNaoAutenticado();
    }
    this.validarVinculo(sessao, dispositivoId, segredoVinculoHash);
  }

  private validarVinculo(
    sessao: SessaoMobilePersistida,
    dispositivoId: string,
    segredoVinculoHash: string,
  ): void {
    if (
      sessao.dispositivoId !== dispositivoId ||
      !this.hashConfere(segredoVinculoHash, sessao.segredoVinculoHash)
    ) {
      throw new ErroNaoAutenticado();
    }
  }

  private async reservarTentativa(
    identificadorHash: string,
    enderecoIp: string,
    identificadorInstalacaoHash: string,
    agora: Date,
  ): Promise<{ readonly bloqueada: boolean; readonly id: string }> {
    return this.prisma.executarTransacao(async (transacao) => {
      await this.repositorio.serializarLimiteLogin(
        identificadorHash,
        enderecoIp,
        identificadorInstalacaoHash,
        transacao,
      );
      const falhas = await this.repositorio.contarFalhasRecentes(
        identificadorHash,
        enderecoIp,
        identificadorInstalacaoHash,
        new Date(agora.getTime() - JANELA_FALHAS_MS),
        transacao,
      );
      const bloqueada =
        falhas.contaIpDispositivo >= LIMITE_CONTA_IP_DISPOSITIVO ||
        falhas.ip >= LIMITE_IP;
      const id = randomUUID();
      await this.repositorio.registrarTentativa(
        {
          criadoEm: agora,
          enderecoIp,
          id,
          identificadorHash,
          identificadorInstalacaoHash,
          resultado: bloqueada ? 'BLOQUEADA' : 'FALHA',
        },
        transacao,
      );
      if (bloqueada) {
        await this.auditoria.registrar(
          {
            acao: 'LOGIN_MOBILE_BLOQUEADO',
            dadosNovos: { resultado: 'BLOQUEADA' },
            enderecoIp,
            origem: 'SISTEMA',
            tipoEvento: 'LOGIN_MOBILE_BLOQUEADO',
          },
          transacao,
        );
      }
      return { bloqueada, id };
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
    if (!atualizada) throw new Error('TENTATIVA_LOGIN_MOBILE_NAO_CONFIRMADA');
  }

  private async verificarSenhaSemEnumeracao(
    senha: string,
    credencial: CredencialLoginMobile | undefined,
  ): Promise<boolean> {
    if (credencial === undefined) {
      await this.senhas.simularVerificacao(senha);
      return false;
    }
    return this.senhas.verificar(senha, credencial.senhaHash);
  }

  private normalizarIdentificador(identificador: string): string {
    const normalizado = identificador.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
    if (!IDENTIFICADOR_LOGIN.test(normalizado)) throw new ErroCredenciaisInvalidas();
    return normalizado;
  }

  private validarEnderecoIp(enderecoIp: string): void {
    if (isIP(enderecoIp) === 0) throw new ErroCredenciaisInvalidas();
  }

  private validarSegredo(segredo: string): void {
    if (!SEGREDO_OPACO.test(segredo)) throw new ErroNaoAutenticado();
  }

  private hashConfere(recebido: string, esperado: string): boolean {
    return timingSafeEqual(Buffer.from(recebido, 'hex'), Buffer.from(esperado, 'hex'));
  }
}
