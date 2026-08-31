import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { isIP } from 'node:net';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroDispositivoNaoConfiavel,
  ErroLimitePareamentoQrExcedido,
  ErroPareamentoQrAguardandoConfirmacao,
  ErroPareamentoQrInvalido,
  ErroReautenticacaoNecessaria,
} from './erros-autenticacao.js';
import type { SessaoMobileEmitida } from './modelo-autenticacao-mobile.js';
import type {
  DispositivoPareamentoQrNormalizado,
  EntradaDispositivoPareamentoQr,
  EstadoPareamentoQrMobile,
  PareamentoQrGerado,
  PareamentoQrPersistido,
  ResgatePareamentoQrEmitido,
  ResumoPareamentoQrWeb,
} from './modelo-pareamento-qr.js';
import {
  REPOSITORIO_PAREAMENTO_QR,
  type RepositorioPareamentoQr,
} from './repositorio-pareamento-qr.js';
import { ServicoAutenticacaoMobile } from './servico-autenticacao-mobile.js';
import { ServicoAutenticacaoWeb } from './servico-autenticacao-web.js';

const DURACAO_PAREAMENTO_MS = 90 * 1_000;
const JANELA_LIMITE_MS = 10 * 60 * 1_000;
const JANELA_AUTENTICACAO_RECENTE_MS = 10 * 60 * 1_000;
const LIMITE_GERACOES = 5;
const LIMITE_RESGATES = 10;
const SEGREDO_OPACO = /^[A-Za-z0-9_-]{43}$/u;
const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function hashHex(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

function gerarSegredo(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class ServicoPareamentoQr {
  public constructor(
    @Inject(REPOSITORIO_PAREAMENTO_QR)
    private readonly repositorio: RepositorioPareamentoQr,
    @Inject(ServicoPrisma)
    private readonly prisma: ServicoPrisma,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
    @Inject(ServicoAutenticacaoWeb)
    private readonly autenticacaoWeb: ServicoAutenticacaoWeb,
    @Inject(ServicoAutenticacaoMobile)
    private readonly autenticacaoMobile: ServicoAutenticacaoMobile,
  ) {}

  public async gerar(token: string, csrf: string): Promise<PareamentoQrGerado> {
    const tokenQr = gerarSegredo();
    const id = randomUUID();
    const resultado = await this.autenticacaoWeb.executarComSessaoAtual(
      token,
      csrf,
      async (sessao, agora, transacao) => {
        await this.repositorio.serializarGeracao(sessao.usuarioId, transacao);
        const geracoes = await this.repositorio.contarGeracoesUsuario(
          sessao.usuarioId,
          new Date(agora.getTime() - JANELA_LIMITE_MS),
          transacao,
        );
        if (geracoes >= LIMITE_GERACOES) {
          await this.auditoria.registrar(
            {
              acao: 'GERAR_PAREAMENTO_QR_BLOQUEADO',
              dadosNovos: { resultado: 'BLOQUEADA' },
              entidadeId: sessao.id,
              entidadeTipo: 'SESSAO_WEB',
              origem: 'USUARIO',
              sessaoId: sessao.id,
              tipoEvento: 'GERACAO_PAREAMENTO_QR_BLOQUEADA',
              usuarioId: sessao.usuarioId,
            },
            transacao,
          );
          return { bloqueado: true } as const;
        }

        const expiraEm = new Date(agora.getTime() + DURACAO_PAREAMENTO_MS);
        const cancelados = await this.repositorio.cancelarAtivosSessao(
          sessao.id,
          agora,
          'NOVO_PAREAMENTO_QR',
          transacao,
        );
        await this.repositorio.criar(
          {
            criadoEm: agora,
            expiraEm,
            id,
            sessaoWebId: sessao.id,
            tokenQrHash: hashHex(tokenQr),
            usuarioId: sessao.usuarioId,
          },
          transacao,
        );
        await this.auditoria.registrar(
          {
            acao: 'GERAR_PAREAMENTO_QR',
            dadosNovos: { pareamentos_anteriores_cancelados: cancelados },
            entidadeId: id,
            entidadeTipo: 'PAREAMENTO_QR',
            origem: 'USUARIO',
            sessaoId: sessao.id,
            tipoEvento: 'PAREAMENTO_QR_GERADO',
            usuarioId: sessao.usuarioId,
          },
          transacao,
        );
        return { bloqueado: false, expiraEm } as const;
      },
    );
    if (resultado.bloqueado) throw new ErroLimitePareamentoQrExcedido();
    return { expiraEm: resultado.expiraEm, id, tokenQr };
  }

  public async consultarNaWeb(
    token: string,
    pareamentoId: string,
  ): Promise<ResumoPareamentoQrWeb> {
    this.validarUuid(pareamentoId);
    const sessao = await this.autenticacaoWeb.autenticar(token);
    const agora = new Date();
    const resultado = await this.prisma.executarTransacao(
      async (transacao) => {
        await this.repositorio.serializarPareamento(pareamentoId, transacao);
        const pareamento = await this.repositorio.obterPorId(
          pareamentoId,
          transacao,
        );
        if (
          pareamento === undefined ||
          pareamento.sessaoWebId !== sessao.contexto.sessaoId ||
          !this.estaAtivo(pareamento, agora)
        ) {
          await this.expirarSeNecessario(pareamento, agora, transacao);
          return { invalido: true } as const;
        }
        if (
          ![
            'AGUARDANDO_RESGATE',
            'AGUARDANDO_CONFIRMACAO',
            'CONFIRMADO',
          ].includes(pareamento.estado)
        ) {
          return { invalido: true } as const;
        }
        return { invalido: false, pareamento } as const;
      },
    );
    if (resultado.invalido) throw new ErroPareamentoQrInvalido();
    return this.resumirParaWeb(resultado.pareamento);
  }

  public async confirmar(
    token: string,
    csrf: string,
    pareamentoId: string,
  ): Promise<void> {
    this.validarUuid(pareamentoId);
    const resultado = await this.autenticacaoWeb.executarComSessaoAtual(
      token,
      csrf,
      async (sessao, agora, transacao) => {
        await this.repositorio.serializarPareamento(pareamentoId, transacao);
        const pareamento = await this.repositorio.obterPorId(
          pareamentoId,
          transacao,
        );
        if (
          pareamento === undefined ||
          pareamento.sessaoWebId !== sessao.id ||
          !this.estaAtivo(pareamento, agora)
        ) {
          await this.expirarSeNecessario(pareamento, agora, transacao);
          return { resultado: 'INVALIDO' } as const;
        }
        if (
          sessao.autenticadaEm <=
          new Date(agora.getTime() - JANELA_AUTENTICACAO_RECENTE_MS)
        ) {
          return { resultado: 'REAUTENTICAR' } as const;
        }
        if (pareamento.estado === 'CONFIRMADO') {
          return { resultado: 'CONFIRMADO' } as const;
        }
        if (pareamento.estado !== 'AGUARDANDO_CONFIRMACAO') {
          return { resultado: 'INVALIDO' } as const;
        }
        const confirmado = await this.repositorio.confirmar(
          pareamento.id,
          sessao.id,
          agora,
          transacao,
        );
        if (!confirmado) return { resultado: 'INVALIDO' } as const;
        await this.auditoria.registrar(
          {
            acao: 'CONFIRMAR_PAREAMENTO_QR',
            dadosNovos: { estado: 'CONFIRMADO' },
            entidadeId: pareamento.id,
            entidadeTipo: 'PAREAMENTO_QR',
            origem: 'USUARIO',
            sessaoId: sessao.id,
            tipoEvento: 'PAREAMENTO_QR_CONFIRMADO',
            usuarioId: sessao.usuarioId,
          },
          transacao,
        );
        return { resultado: 'CONFIRMADO' } as const;
      },
    );
    if (resultado.resultado === 'REAUTENTICAR') {
      throw new ErroReautenticacaoNecessaria();
    }
    if (resultado.resultado === 'INVALIDO') {
      throw new ErroPareamentoQrInvalido();
    }
  }

  public async cancelar(
    token: string,
    csrf: string,
    pareamentoId: string,
  ): Promise<void> {
    this.validarUuid(pareamentoId);
    const cancelado = await this.autenticacaoWeb.executarComSessaoAtual(
      token,
      csrf,
      async (sessao, agora, transacao) => {
        await this.repositorio.serializarPareamento(pareamentoId, transacao);
        const pareamento = await this.repositorio.obterPorId(
          pareamentoId,
          transacao,
        );
        if (
          pareamento === undefined ||
          pareamento.sessaoWebId !== sessao.id
        ) {
          return false;
        }
        const finalizado = await this.repositorio.finalizar(
          pareamento.id,
          'CANCELADO',
          agora,
          'CANCELAMENTO_PELO_USUARIO',
          transacao,
        );
        if (finalizado) {
          await this.auditoria.registrar(
            {
              acao: 'CANCELAR_PAREAMENTO_QR',
              dadosNovos: { estado: 'CANCELADO' },
              entidadeId: pareamento.id,
              entidadeTipo: 'PAREAMENTO_QR',
              origem: 'USUARIO',
              sessaoId: sessao.id,
              tipoEvento: 'PAREAMENTO_QR_CANCELADO',
              usuarioId: sessao.usuarioId,
            },
            transacao,
          );
        }
        return finalizado;
      },
    );
    if (!cancelado) throw new ErroPareamentoQrInvalido();
  }

  public async resgatar(
    tokenQr: string,
    entrada: EntradaDispositivoPareamentoQr,
    enderecoIp: string,
  ): Promise<ResgatePareamentoQrEmitido> {
    this.validarSegredo(tokenQr);
    this.validarEnderecoIp(enderecoIp);
    const dispositivo = this.normalizarDispositivo(entrada);
    await this.autenticacaoMobile.exigirVersaoPermitida(dispositivo);
    const tokenQrHash = hashHex(tokenQr);
    const comprovanteResgate = gerarSegredo();
    const agora = new Date();
    const resultado = await this.prisma.executarTransacao(
      async (transacao) => {
        await this.repositorio.serializarResgate(
          tokenQrHash,
          enderecoIp,
          dispositivo.identificadorInstalacaoHash,
          transacao,
        );
        const tentativas = await this.repositorio.contarTentativasResgate(
          enderecoIp,
          dispositivo.identificadorInstalacaoHash,
          new Date(agora.getTime() - JANELA_LIMITE_MS),
          transacao,
        );
        const bloqueado =
          tentativas.ip >= LIMITE_RESGATES ||
          tentativas.dispositivo >= LIMITE_RESGATES;
        const pareamento = bloqueado
          ? undefined
          : await this.repositorio.obterPorToken(tokenQrHash, transacao);
        const valido =
          !bloqueado &&
          pareamento !== undefined &&
          pareamento.estado === 'AGUARDANDO_RESGATE' &&
          this.estaAtivo(pareamento, agora);
        await this.repositorio.registrarTentativaResgate(
          {
            criadoEm: agora,
            enderecoIp,
            id: randomUUID(),
            identificadorInstalacaoHash:
              dispositivo.identificadorInstalacaoHash,
            resultado: bloqueado ? 'BLOQUEADA' : valido ? 'SUCESSO' : 'FALHA',
          },
          transacao,
        );

        if (bloqueado) {
          await this.auditoria.registrar(
            {
              acao: 'RESGATAR_PAREAMENTO_QR_BLOQUEADO',
              dadosNovos: { resultado: 'BLOQUEADA' },
              enderecoIp,
              origem: 'SISTEMA',
              tipoEvento: 'RESGATE_PAREAMENTO_QR_BLOQUEADO',
            },
            transacao,
          );
          return { resultado: 'BLOQUEADO' } as const;
        }
        if (!valido || pareamento === undefined) {
          await this.expirarSeNecessario(pareamento, agora, transacao);
          await this.auditoria.registrar(
            {
              acao: 'RESGATAR_PAREAMENTO_QR_RECUSADO',
              dadosNovos: { resultado: 'RECUSADO' },
              enderecoIp,
              origem: 'SISTEMA',
              tipoEvento: 'RESGATE_PAREAMENTO_QR_RECUSADO',
            },
            transacao,
          );
          return { resultado: 'INVALIDO' } as const;
        }
        const resgatado = await this.repositorio.resgatar(
          pareamento.id,
          hashHex(comprovanteResgate),
          dispositivo,
          enderecoIp,
          agora,
          transacao,
        );
        if (!resgatado) return { resultado: 'INVALIDO' } as const;
        await this.auditoria.registrar(
          {
            acao: 'RESGATAR_PAREAMENTO_QR',
            dadosNovos: { plataforma: dispositivo.plataforma },
            enderecoIp,
            entidadeId: pareamento.id,
            entidadeTipo: 'PAREAMENTO_QR',
            origem: 'USUARIO',
            sessaoId: pareamento.sessaoWebId,
            tipoEvento: 'PAREAMENTO_QR_RESGATADO',
            usuarioId: pareamento.usuarioId,
          },
          transacao,
        );
        return {
          expiraEm: pareamento.expiraEm,
          id: pareamento.id,
          resultado: 'RESGATADO',
        } as const;
      },
    );
    if (resultado.resultado === 'BLOQUEADO') {
      throw new ErroLimitePareamentoQrExcedido();
    }
    if (resultado.resultado === 'INVALIDO') {
      throw new ErroPareamentoQrInvalido();
    }
    return {
      comprovanteResgate,
      expiraEm: resultado.expiraEm,
      id: resultado.id,
    };
  }

  public async consultarNoMobile(
    pareamentoId: string,
    comprovanteResgate: string,
    entrada: EntradaDispositivoPareamentoQr,
  ): Promise<EstadoPareamentoQrMobile> {
    const consulta = await this.comPareamentoMobile(
      pareamentoId,
      comprovanteResgate,
      entrada,
      async (pareamento) => {
        if (
          pareamento.estado !== 'AGUARDANDO_CONFIRMACAO' &&
          pareamento.estado !== 'CONFIRMADO'
        ) {
          return { invalido: true } as const;
        }
        return {
          estado: pareamento.estado,
          expiraEm: pareamento.expiraEm,
          invalido: false,
        } as const;
      },
    );
    if (!consulta.valido) throw new ErroPareamentoQrInvalido();
    const resultado = consulta.valor;
    if (resultado.invalido) throw new ErroPareamentoQrInvalido();
    return { estado: resultado.estado, expiraEm: resultado.expiraEm };
  }

  public async concluir(
    pareamentoId: string,
    comprovanteResgate: string,
    entrada: EntradaDispositivoPareamentoQr,
  ): Promise<SessaoMobileEmitida> {
    const conclusao = await this.comPareamentoMobile(
      pareamentoId,
      comprovanteResgate,
      entrada,
      async (pareamento, dispositivo, agora, transacao) => {
        if (pareamento.estado === 'AGUARDANDO_CONFIRMACAO') {
          return { resultado: 'AGUARDANDO' } as const;
        }
        if (pareamento.estado !== 'CONFIRMADO') {
          return { resultado: 'INVALIDO' } as const;
        }
        const emissao =
          await this.autenticacaoMobile.emitirSessaoPorPareamento(
            {
              agora,
              dispositivo,
              enderecoIp: this.exigirEnderecoIpResgate(pareamento),
              nomeExibicao: pareamento.nomeExibicaoUsuario,
              usuarioId: pareamento.usuarioId,
            },
            transacao,
          );
        if (emissao.dispositivoNaoConfiavel) {
          await this.repositorio.finalizar(
            pareamento.id,
            'CANCELADO',
            agora,
            'DISPOSITIVO_NAO_CONFIAVEL',
            transacao,
          );
          return { resultado: 'DISPOSITIVO_NAO_CONFIAVEL' } as const;
        }
        const concluido = await this.repositorio.concluir(
          pareamento.id,
          agora,
          transacao,
        );
        if (!concluido) throw new Error('PAREAMENTO_QR_NAO_CONCLUIDO');
        await this.auditoria.registrar(
          {
            acao: 'CONCLUIR_PAREAMENTO_QR',
            dadosNovos: { estado: 'CONCLUIDO' },
            dispositivoId: emissao.sessao.dispositivoId,
            entidadeId: pareamento.id,
            entidadeTipo: 'PAREAMENTO_QR',
            origem: 'USUARIO',
            sessaoId: emissao.sessao.id,
            tipoEvento: 'PAREAMENTO_QR_CONCLUIDO',
            usuarioId: pareamento.usuarioId,
          },
          transacao,
        );
        return { resultado: 'CONCLUIDO', sessao: emissao.sessao } as const;
      },
    );
    if (!conclusao.valido) throw new ErroPareamentoQrInvalido();
    const resultado = conclusao.valor;
    if (resultado.resultado === 'AGUARDANDO') {
      throw new ErroPareamentoQrAguardandoConfirmacao();
    }
    if (resultado.resultado === 'DISPOSITIVO_NAO_CONFIAVEL') {
      throw new ErroDispositivoNaoConfiavel();
    }
    if (resultado.resultado === 'INVALIDO') {
      throw new ErroPareamentoQrInvalido();
    }
    return resultado.sessao;
  }

  private async comPareamentoMobile<T>(
    pareamentoId: string,
    comprovanteResgate: string,
    entrada: EntradaDispositivoPareamentoQr,
    operacao: (
      pareamento: PareamentoQrPersistido,
      dispositivo: DispositivoPareamentoQrNormalizado,
      agora: Date,
      transacao: TransacaoPrisma,
    ) => Promise<T>,
  ): Promise<
    | { readonly valido: false }
    | { readonly valido: true; readonly valor: T }
  > {
    this.validarUuid(pareamentoId);
    this.validarSegredo(comprovanteResgate);
    const dispositivo = this.normalizarDispositivo(entrada);
    await this.autenticacaoMobile.exigirVersaoPermitida(dispositivo);
    const agora = new Date();
    return this.prisma.executarTransacao(async (transacao) => {
      await this.repositorio.serializarPareamento(pareamentoId, transacao);
      const pareamento = await this.repositorio.obterPorComprovante(
        pareamentoId,
        hashHex(comprovanteResgate),
        transacao,
      );
      if (
        pareamento === undefined ||
        !this.estaAtivo(pareamento, agora) ||
        !this.mesmoDispositivo(pareamento, dispositivo)
      ) {
        await this.expirarSeNecessario(pareamento, agora, transacao);
        return { valido: false };
      }
      return {
        valido: true,
        valor: await operacao(pareamento, dispositivo, agora, transacao),
      };
    });
  }

  private normalizarDispositivo(
    entrada: EntradaDispositivoPareamentoQr,
  ): DispositivoPareamentoQrNormalizado {
    try {
      return this.autenticacaoMobile.normalizarDispositivo(entrada);
    } catch {
      throw new ErroPareamentoQrInvalido();
    }
  }

  private mesmoDispositivo(
    pareamento: PareamentoQrPersistido,
    dispositivo: DispositivoPareamentoQrNormalizado,
  ): boolean {
    return (
      pareamento.identificadorInstalacaoHash !== undefined &&
      pareamento.segredoVinculoHash !== undefined &&
      pareamento.plataforma === dispositivo.plataforma &&
      pareamento.versaoAplicativo === dispositivo.versaoAplicativo &&
      pareamento.modeloSanitizado === dispositivo.modeloSanitizado &&
      this.hashConfere(
        pareamento.identificadorInstalacaoHash,
        dispositivo.identificadorInstalacaoHash,
      ) &&
      this.hashConfere(
        pareamento.segredoVinculoHash,
        dispositivo.segredoVinculoHash,
      )
    );
  }

  private estaAtivo(pareamento: PareamentoQrPersistido, agora: Date): boolean {
    return (
      pareamento.usuarioAtivo &&
      pareamento.sessaoWebAtiva &&
      pareamento.sessaoWebExpiraEm > agora &&
      pareamento.expiraEm > agora
    );
  }

  private async expirarSeNecessario(
    pareamento: PareamentoQrPersistido | undefined,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    if (
      pareamento !== undefined &&
      pareamento.expiraEm <= agora &&
      [
        'AGUARDANDO_RESGATE',
        'AGUARDANDO_CONFIRMACAO',
        'CONFIRMADO',
      ].includes(pareamento.estado)
    ) {
      await this.repositorio.finalizar(
        pareamento.id,
        'EXPIRADO',
        agora,
        'PRAZO_PAREAMENTO_QR_EXPIRADO',
        transacao,
      );
    }
  }

  private resumirParaWeb(
    pareamento: PareamentoQrPersistido,
  ): ResumoPareamentoQrWeb {
    if (
      pareamento.estado !== 'AGUARDANDO_RESGATE' &&
      pareamento.estado !== 'AGUARDANDO_CONFIRMACAO' &&
      pareamento.estado !== 'CONFIRMADO'
    ) {
      throw new ErroPareamentoQrInvalido();
    }
    return {
      estado: pareamento.estado,
      expiraEm: pareamento.expiraEm,
      id: pareamento.id,
      ...(pareamento.plataforma === undefined
        ? {}
        : { plataforma: pareamento.plataforma }),
      ...(pareamento.modeloSanitizado === undefined
        ? {}
        : { modeloSanitizado: pareamento.modeloSanitizado }),
      ...(pareamento.versaoAplicativo === undefined
        ? {}
        : { versaoAplicativo: pareamento.versaoAplicativo }),
    };
  }

  private exigirEnderecoIpResgate(pareamento: PareamentoQrPersistido): string {
    const enderecoIp = pareamento.enderecoIpResgate;
    if (enderecoIp === undefined) throw new ErroPareamentoQrInvalido();
    return enderecoIp;
  }

  private validarSegredo(segredo: string): void {
    if (!SEGREDO_OPACO.test(segredo)) throw new ErroPareamentoQrInvalido();
  }

  private validarUuid(valor: string): void {
    if (!IDENTIFICADOR_UUID.test(valor)) throw new ErroPareamentoQrInvalido();
  }

  private validarEnderecoIp(enderecoIp: string): void {
    if (isIP(enderecoIp) === 0) throw new ErroPareamentoQrInvalido();
  }

  private hashConfere(recebido: string, esperado: string): boolean {
    return timingSafeEqual(
      Buffer.from(recebido, 'hex'),
      Buffer.from(esperado, 'hex'),
    );
  }
}
