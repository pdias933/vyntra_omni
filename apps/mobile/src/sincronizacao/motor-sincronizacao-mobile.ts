import type {
  CredenciaisSincronizacaoAplicativo,
} from '../autenticacao/servico-autenticacao-aplicativo';
import type { RepositorioReplicaLocal } from '../offline/repositorio-replica-local';
import type { VerificadorAutorizacaoOffline } from '../offline/verificador-autorizacao-offline';
import {
  AdaptadorEventosWebSocketMobile,
  type ConexaoEventosMobile,
} from './adaptador-eventos-websocket-mobile';
import {
  AdaptadorSincronizacaoHttp,
  ErroSincronizacaoMobile,
} from './adaptador-sincronizacao-http';
import {
  CoordenadorInvalidacaoEscopoMobile,
  type EventoInvalidacaoEscopoMobile,
} from './coordenador-invalidacao-escopo';
import type {
  EventoSincronizacaoMobile,
  SnapshotMobileValidado,
} from './modelo-sincronizacao-mobile';

const ANTECEDENCIA_RENOVACAO_MS = 5 * 60 * 1_000;
const ATRASO_MAXIMO_RECONEXAO_MS = 30_000;
const LIMITE_PAGINAS_INCREMENTAIS = 100;
const PRAZO_ABERTURA_AVISO_MS = 30_000;

export type EstadoSincronizacaoMobile =
  | 'ACESSO_REVOGADO'
  | 'BLOQUEADO'
  | 'CONECTADO'
  | 'CONECTANDO'
  | 'ESCOPO_ATUALIZANDO'
  | 'SEM_CONEXAO'
  | 'SINCRONIZANDO';

export interface GanchosSegurancaSincronizacaoMobile {
  aoEscopoSubstituido(snapshot: SnapshotMobileValidado): Promise<void>;
  aoSessaoRevogada(): Promise<void>;
  reconciliarPendencias(): Promise<void>;
}

export interface DiagnosticoSincronizacaoMobile {
  readonly codigosFalhaRecentes: readonly string[];
  readonly estado: EstadoSincronizacaoMobile;
  readonly estadoWebSocket: 'CONECTADO' | 'CONECTANDO' | 'DESCONECTADO';
  readonly ultimaSequenciaAplicada: string;
}

type ObterCredenciais = (
  forcarRenovacao?: boolean,
) => Promise<CredenciaisSincronizacaoAplicativo>;

interface EstadoConvergenteMobile {
  readonly autorizacaoOfflineValidaAte: string;
  readonly sequenciaBase: string;
}

export class MotorSincronizacaoMobile {
  private ativa = false;
  private conexao: ConexaoEventosMobile | undefined;
  private readonly coordenadorInvalidacao: CoordenadorInvalidacaoEscopoMobile<SnapshotMobileValidado>;
  private credenciaisInvalidacao:
    | CredenciaisSincronizacaoAplicativo
    | undefined;
  private escopoEmAtualizacao = false;
  private estado: EstadoSincronizacaoMobile = 'SEM_CONEXAO';
  private execucao: Promise<void> | undefined;
  private readonly falhasRecentes: string[] = [];
  private geracao = 0;
  private ganchosSeguranca: GanchosSegurancaSincronizacaoMobile;
  private readonly observadores = new Set<(estado: EstadoSincronizacaoMobile) => void>();
  private repeticao = 0;
  private revogacaoEmCurso: Promise<void> | undefined;
  private snapshotInvalidacao: SnapshotMobileValidado | undefined;
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  private versaoConexao = 0;

  public constructor(
    private readonly repositorio: RepositorioReplicaLocal,
    private readonly verificador: VerificadorAutorizacaoOffline,
    private readonly obterCredenciais: ObterCredenciais,
    private readonly http = new AdaptadorSincronizacaoHttp(),
    private readonly eventos = new AdaptadorEventosWebSocketMobile(),
    aoSessaoRevogada: () => Promise<void> = async () => undefined,
  ) {
    this.ganchosSeguranca = {
      aoEscopoSubstituido: async () => undefined,
      aoSessaoRevogada,
      reconciliarPendencias: async () => undefined,
    };
    this.coordenadorInvalidacao =
      new CoordenadorInvalidacaoEscopoMobile<SnapshotMobileValidado>({
        abrirTempoReal: async (apos) => {
          const credenciais = this.credenciaisInvalidacao;
          if (credenciais === undefined) {
            throw new Error('CREDENCIAIS_INVALIDACAO_AUSENTES');
          }
          await this.abrirTempoReal(apos, credenciais, this.geracao);
        },
        bloquearAreaAutenticada: async () => {
          this.publicarEstado('BLOQUEADO');
        },
        fecharTempoReal: async () => {
          this.fecharTempoReal();
        },
        invalidarReplicaLocal: async (evento) => {
          await this.repositorio.invalidarAutorizacaoEscopo(
            evento.sequenciaEvento,
            evento.dados.versaoPermissoes,
          );
        },
        obterSnapshotAutorizado: async (evento) => {
          const credenciais = await this.obterCredenciais(false);
          this.validarDestinoInvalidacao(evento, credenciais);
          this.credenciaisInvalidacao = credenciais;
          return this.obterSnapshotValidado(
            credenciais,
            evento.sequenciaEvento,
          );
        },
        pausarComandosDependentes: async () => {
          this.cancelarTemporizador();
          this.publicarEstado('ESCOPO_ATUALIZANDO');
        },
        reconciliarPendencias: async () => {
          await this.ganchosSeguranca.reconciliarPendencias();
        },
        retomarComandosAutorizados: async () => {
          const snapshot = this.snapshotInvalidacao;
          if (snapshot === undefined) {
            throw new Error('SNAPSHOT_INVALIDACAO_AUSENTE');
          }
          this.agendarRenovacao(snapshot.autorizacaoOfflineValidaAte);
          this.publicarEstado('CONECTADO');
          this.credenciaisInvalidacao = undefined;
          this.snapshotInvalidacao = undefined;
        },
        substituirReplicaRemovendoAusentes: async (snapshot) => {
          await this.repositorio.aplicarSnapshot(snapshot, true);
          this.snapshotInvalidacao = snapshot;
          await this.ganchosSeguranca.aoEscopoSubstituido(snapshot);
        },
      });
  }

  public configurarGanchosSeguranca(
    ganchos: Partial<GanchosSegurancaSincronizacaoMobile>,
  ): void {
    this.ganchosSeguranca = { ...this.ganchosSeguranca, ...ganchos };
  }

  public iniciar(): void {
    if (this.ativa) return;
    this.ativa = true;
    this.geracao += 1;
    this.repeticao = 0;
    this.solicitarSincronizacao(false, false);
  }

  public pausar(): void {
    this.ativa = false;
    this.geracao += 1;
    this.cancelarTemporizador();
    this.fecharTempoReal();
  }

  public observar(
    observador: (estado: EstadoSincronizacaoMobile) => void,
  ): () => void {
    this.observadores.add(observador);
    observador(this.estado);
    return () => this.observadores.delete(observador);
  }

  public sincronizarAgora(): void {
    if (!this.ativa) return;
    this.repeticao = 0;
    this.solicitarSincronizacao(false, false);
  }

  public async obterDiagnostico(): Promise<DiagnosticoSincronizacaoMobile> {
    const estadoReplica = await this.repositorio.obterEstado();
    return {
      codigosFalhaRecentes: [...this.falhasRecentes],
      estado: this.estado,
      estadoWebSocket:
        this.estado === 'CONECTADO'
          ? 'CONECTADO'
          : this.estado === 'CONECTANDO'
            ? 'CONECTANDO'
            : 'DESCONECTADO',
      ultimaSequenciaAplicada: estadoReplica?.sequenciaEvento ?? '0',
    };
  }

  public aguardarSequencia(sequenciaMinima: string): Promise<void> {
    if (!/^(0|[1-9][0-9]{0,18})$/u.test(sequenciaMinima)) {
      return Promise.reject(new Error('SEQUENCIA_AVISO_INVALIDA'));
    }
    const minima = BigInt(sequenciaMinima);
    return new Promise((resolver, rejeitar) => {
      let concluida = false;
      let consultando = false;
      let pararEstado: () => void = () => undefined;
      let pararRepositorio: () => void = () => undefined;
      const temporizador = setTimeout(
        () => finalizar(new Error('SINCRONIZACAO_AVISO_EXPIRADA')),
        PRAZO_ABERTURA_AVISO_MS,
      );
      const finalizar = (erro?: Error) => {
        if (concluida) return;
        concluida = true;
        clearTimeout(temporizador);
        pararEstado();
        pararRepositorio();
        if (erro === undefined) resolver();
        else rejeitar(erro);
      };
      const avaliar = () => {
        if (concluida || consultando) return;
        if (this.estado === 'BLOQUEADO') {
          finalizar(new Error('SINCRONIZACAO_AVISO_BLOQUEADA'));
          return;
        }
        if (this.estado !== 'CONECTADO') return;
        consultando = true;
        void this.repositorio.obterEstado()
          .then((estado) => {
            if (
              estado !== undefined &&
              !estado.precisaRessincronizar &&
              BigInt(estado.sequenciaEvento) >= minima
            ) {
              finalizar();
            }
          })
          .catch(() => undefined)
          .finally(() => {
            consultando = false;
          });
      };
      pararRepositorio = this.repositorio.observarMudancas(avaliar);
      pararEstado = this.observar(avaliar);
      avaliar();
    });
  }

  private solicitarSincronizacao(
    forcarSnapshot: boolean,
    forcarRenovacao: boolean,
  ): void {
    if (!this.ativa || this.execucao !== undefined) return;
    this.cancelarTemporizador();
    const geracao = this.geracao;
    let repetirRenovando = false;
    this.execucao = this.sincronizar(geracao, forcarSnapshot, forcarRenovacao)
      .then(() => {
        this.repeticao = 0;
      })
      .catch(async (erro: unknown) => {
        if (!this.ativa || geracao !== this.geracao) return;
        if (this.escopoEmAtualizacao) return;
        this.registrarFalha(erro);
        if (this.statusHttp(erro) === 401 && !forcarRenovacao) {
          repetirRenovando = true;
          return;
        }
        if (this.exigeRevogacaoLocal(erro)) {
          await this.revogarSessaoLocal();
          return;
        }
        if (this.bloqueiaAcesso(erro)) {
          this.publicarEstado('BLOQUEADO');
          return;
        }
        this.publicarEstado('SEM_CONEXAO');
        this.agendarReconexao();
      })
      .finally(() => {
        this.execucao = undefined;
        if (repetirRenovando) {
          this.solicitarSincronizacao(forcarSnapshot, true);
        }
      });
  }

  private async sincronizar(
    geracao: number,
    forcarSnapshot: boolean,
    forcarRenovacao: boolean,
  ): Promise<void> {
    this.fecharTempoReal();
    this.publicarEstado('CONECTANDO');
    const credenciais = await this.obterCredenciais(forcarRenovacao);
    this.exigirAtiva(geracao);
    const estado = await this.repositorio.obterEstado();
    const autorizacaoProximaDoFim =
      estado === undefined ||
      new Date(estado.autorizacaoOfflineValidaAte).getTime() - Date.now() <=
        ANTECEDENCIA_RENOVACAO_MS;

    let convergente: EstadoConvergenteMobile;
    if (
      forcarSnapshot ||
      estado === undefined ||
      estado.precisaRessincronizar ||
      autorizacaoProximaDoFim
    ) {
      this.publicarEstado('SINCRONIZANDO');
      convergente = await this.obterEAplicarSnapshot(
        credenciais,
        estado?.sequenciaEvento,
      );
    } else {
      convergente = await this.aplicarIncrementos(
        estado.sequenciaEvento,
        credenciais,
      );
    }
    this.exigirAtiva(geracao);
    await this.abrirTempoReal(convergente.sequenciaBase, credenciais, geracao);
    this.exigirAtiva(geracao);
    this.publicarEstado('CONECTADO');
    this.agendarRenovacao(convergente.autorizacaoOfflineValidaAte);
  }

  private async aplicarIncrementos(
    cursorInicial: string,
    credenciais: CredenciaisSincronizacaoAplicativo,
  ): Promise<EstadoConvergenteMobile> {
    this.publicarEstado('SINCRONIZANDO');
    let cursor = cursorInicial;
    for (let pagina = 0; pagina < LIMITE_PAGINAS_INCREMENTAIS; pagina += 1) {
      let lote;
      try {
        lote = await this.http.obterLote(cursor, credenciais);
      } catch (erro) {
        if (
          erro instanceof ErroSincronizacaoMobile &&
          erro.statusHttp === 409 &&
          erro.codigo === 'RESSINCRONIZACAO_COMPLETA_NECESSARIA'
        ) {
          return this.obterEAplicarSnapshot(credenciais, cursor);
        }
        throw erro;
      }
      const invalidacao = this.ultimaInvalidacao(lote.eventos, credenciais);
      if (invalidacao !== undefined) {
        return this.aplicarInvalidacaoDuranteSincronizacao(
          invalidacao,
          credenciais,
        );
      }
      await this.repositorio.aplicarLote(
        cursor,
        lote.eventos,
        lote.sequenciaFinal,
      );
      cursor = lote.sequenciaFinal;
      if (!lote.temMais) {
        if (cursor !== cursorInicial) {
          return this.obterEAplicarSnapshot(credenciais, cursor);
        }
        const atual = await this.repositorio.obterEstado();
        if (atual === undefined) throw new Error('ESTADO_REPLICA_LOCAL_AUSENTE');
        return {
          autorizacaoOfflineValidaAte: atual.autorizacaoOfflineValidaAte,
          sequenciaBase: atual.sequenciaEvento,
        };
      }
    }
    return this.obterEAplicarSnapshot(credenciais, cursor);
  }

  private async obterEAplicarSnapshot(
    credenciais: CredenciaisSincronizacaoAplicativo,
    sequenciaMinima = '0',
  ): Promise<SnapshotMobileValidado> {
    const snapshot = await this.obterSnapshotValidado(
      credenciais,
      sequenciaMinima,
    );
    await this.repositorio.aplicarSnapshot(snapshot);
    return snapshot;
  }

  private async obterSnapshotValidado(
    credenciais: CredenciaisSincronizacaoAplicativo,
    sequenciaMinima = '0',
  ): Promise<SnapshotMobileValidado> {
    const snapshot = await this.http.obterSnapshot(credenciais);
    if (BigInt(snapshot.sequenciaBase) < BigInt(sequenciaMinima)) {
      throw new Error('SNAPSHOT_SINCRONIZACAO_DESATUALIZADO');
    }
    const resultado = await this.verificador.avaliarInformada(
      {
        sequenciaEvento: snapshot.sequenciaBase,
        token: snapshot.autorizacaoOffline,
        validaAte: snapshot.autorizacaoOfflineValidaAte,
        versaoPermissoes: snapshot.versaoPermissoes,
      },
      credenciais.credencial,
      credenciais.identidade,
    );
    if (resultado.estado !== 'AUTORIZADO') {
      throw new Error('AUTORIZACAO_OFFLINE_RECEBIDA_INVALIDA');
    }
    return snapshot;
  }

  private async abrirTempoReal(
    cursor: string,
    credenciais: CredenciaisSincronizacaoAplicativo,
    geracao: number,
  ): Promise<void> {
    const versaoConexao = ++this.versaoConexao;
    const conexao = await this.eventos.abrir(cursor, credenciais, {
      aoEncerrar: (codigo, motivo) => {
        if (
          !this.ativa ||
          geracao !== this.geracao ||
          versaoConexao !== this.versaoConexao
        ) {
          return;
        }
        this.conexao = undefined;
        this.registrarFalhaCodigo(
          motivo === 'AUTORIZACAO_INVALIDADA'
            ? 'WS_AUTORIZACAO_INVALIDADA'
            : motivo === 'ESCOPO_ALTERADO'
              ? 'WS_ESCOPO_ALTERADO'
              : `WS_ENCERRADO_${codigo}`,
        );
        if (codigo === 4003 && motivo === 'AUTORIZACAO_INVALIDADA') {
          void this.revogarSessaoLocal();
          return;
        }
        if (
          codigo === 4003 &&
          motivo === 'ESCOPO_ALTERADO' &&
          this.escopoEmAtualizacao
        ) {
          return;
        }
        this.publicarEstado('SEM_CONEXAO');
        this.agendarReconexao(codigo === 4003);
      },
      aoEvento: async (evento) => this.aplicarEventoTempoReal(evento, credenciais),
      aoPronto: async (sequenciaServidor) => {
        const estado = await this.repositorio.obterEstado();
        if (
          estado !== undefined &&
          BigInt(sequenciaServidor) > BigInt(estado.sequenciaEvento)
        ) {
          await this.repositorio.aplicarLote(
            estado.sequenciaEvento,
            [],
            sequenciaServidor,
          );
          const snapshot = await this.obterEAplicarSnapshot(
            credenciais,
            sequenciaServidor,
          );
          this.agendarRenovacao(snapshot.autorizacaoOfflineValidaAte);
        }
      },
    });
    if (!this.ativa || geracao !== this.geracao) {
      conexao.fechar();
      throw new Error('SINCRONIZACAO_PAUSADA');
    }
    if (versaoConexao !== this.versaoConexao) {
      conexao.fechar();
      return;
    }
    this.conexao = conexao;
  }

  private async aplicarEventoTempoReal(
    evento: EventoSincronizacaoMobile,
    credenciais: CredenciaisSincronizacaoAplicativo,
  ): Promise<void> {
    const estado = await this.repositorio.obterEstado();
    if (estado === undefined) throw new Error('ESTADO_REPLICA_LOCAL_AUSENTE');
    if (BigInt(evento.sequenciaEvento) <= BigInt(estado.sequenciaEvento)) return;
    if (evento.tipo === 'PERMISSOES_ALTERADAS') {
      const invalidacao = this.projetarInvalidacao(evento, credenciais);
      this.escopoEmAtualizacao = true;
      try {
        await this.coordenadorInvalidacao.invalidar(invalidacao);
      } catch (erro) {
        if (this.exigeRevogacaoLocal(erro)) {
          await this.revogarSessaoLocal();
        }
        throw erro;
      } finally {
        this.escopoEmAtualizacao = false;
      }
      return;
    }
    await this.repositorio.aplicarLote(
      estado.sequenciaEvento,
      [evento],
      evento.sequenciaEvento,
    );
    const snapshot = await this.obterEAplicarSnapshot(
      credenciais,
      evento.sequenciaEvento,
    );
    this.agendarRenovacao(snapshot.autorizacaoOfflineValidaAte);
  }

  private agendarRenovacao(validaAte: string): void {
    this.cancelarTemporizador();
    const atraso = Math.max(
      1_000,
      new Date(validaAte).getTime() - Date.now() - ANTECEDENCIA_RENOVACAO_MS,
    );
    this.temporizador = setTimeout(
      () => this.solicitarSincronizacao(true, false),
      Math.min(atraso, 2_147_483_647),
    );
  }

  private agendarReconexao(forcarRenovacao = false): void {
    if (!this.ativa || this.temporizador !== undefined) return;
    const atraso = Math.min(
      ATRASO_MAXIMO_RECONEXAO_MS,
      1_000 * 2 ** Math.min(this.repeticao, 5),
    );
    this.repeticao += 1;
    this.temporizador = setTimeout(() => {
      this.temporizador = undefined;
      this.solicitarSincronizacao(false, forcarRenovacao);
    }, atraso);
  }

  private publicarEstado(estado: EstadoSincronizacaoMobile): void {
    if (this.estado === estado) return;
    this.estado = estado;
    for (const observador of this.observadores) observador(estado);
  }

  private fecharTempoReal(): void {
    this.versaoConexao += 1;
    const conexao = this.conexao;
    this.conexao = undefined;
    conexao?.fechar();
  }

  private cancelarTemporizador(): void {
    if (this.temporizador !== undefined) clearTimeout(this.temporizador);
    this.temporizador = undefined;
  }

  private exigirAtiva(geracao: number): void {
    if (!this.ativa || geracao !== this.geracao) {
      throw new Error('SINCRONIZACAO_PAUSADA');
    }
  }

  private bloqueiaAcesso(erro: unknown): boolean {
    return (
      (this.statusHttp(erro) !== undefined &&
        (this.statusHttp(erro) === 401 || this.statusHttp(erro) === 403)) ||
      (erro instanceof Error &&
        (erro.message === 'AUTORIZACAO_OFFLINE_RECEBIDA_INVALIDA' ||
          erro.message === 'CONTRATO_SINCRONIZACAO_INVALIDO'))
    );
  }

  private exigeRevogacaoLocal(erro: unknown): boolean {
    const status = this.statusHttp(erro);
    return status === 401 || status === 403;
  }

  private registrarFalha(erro: unknown): void {
    if (erro instanceof ErroSincronizacaoMobile) {
      this.registrarFalhaCodigo(erro.codigo);
      return;
    }
    const status = this.statusHttp(erro);
    if (status !== undefined) {
      this.registrarFalhaCodigo(`HTTP_${status}`);
      return;
    }
    const codigo = erro instanceof Error ? erro.message : '';
    this.registrarFalhaCodigo(
      /^[A-Z][A-Z0-9_]{0,63}$/u.test(codigo)
        ? codigo
        : 'FALHA_SINCRONIZACAO',
    );
  }

  private registrarFalhaCodigo(codigo: string): void {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/u.test(codigo)) return;
    if (this.falhasRecentes.at(-1) === codigo) return;
    this.falhasRecentes.push(codigo);
    if (this.falhasRecentes.length > 10) this.falhasRecentes.shift();
  }

  private async revogarSessaoLocal(): Promise<void> {
    if (this.revogacaoEmCurso !== undefined) return this.revogacaoEmCurso;
    this.revogacaoEmCurso = (async () => {
      this.ativa = false;
      this.geracao += 1;
      this.cancelarTemporizador();
      this.fecharTempoReal();
      this.publicarEstado('ESCOPO_ATUALIZANDO');
      try {
        await this.ganchosSeguranca.aoSessaoRevogada();
        this.publicarEstado('ACESSO_REVOGADO');
      } catch {
        this.publicarEstado('BLOQUEADO');
      }
    })().finally(() => {
      this.revogacaoEmCurso = undefined;
    });
    return this.revogacaoEmCurso;
  }

  private projetarInvalidacao(
    evento: EventoSincronizacaoMobile,
    credenciais: CredenciaisSincronizacaoAplicativo,
  ): EventoInvalidacaoEscopoMobile {
    const versaoPermissoes = evento.dados.versaoPermissoes;
    if (
      evento.tipo !== 'PERMISSOES_ALTERADAS' ||
      evento.entidadeTipo !== 'USUARIO' ||
      evento.entidadeId !== credenciais.credencial.usuarioId ||
      typeof versaoPermissoes !== 'number' ||
      !Number.isSafeInteger(versaoPermissoes) ||
      versaoPermissoes < 2
    ) {
      throw new Error('EVENTO_INVALIDACAO_ESCOPO_INVALIDO');
    }
    return {
      dados: { versaoPermissoes },
      entidadeId: evento.entidadeId,
      sequenciaEvento: evento.sequenciaEvento,
      tipo: 'PERMISSOES_ALTERADAS',
    };
  }

  private validarDestinoInvalidacao(
    evento: EventoInvalidacaoEscopoMobile,
    credenciais: CredenciaisSincronizacaoAplicativo,
  ): void {
    if (evento.entidadeId !== credenciais.credencial.usuarioId) {
      throw new Error('DESTINO_INVALIDACAO_ESCOPO_DIVERGENTE');
    }
  }

  private ultimaInvalidacao(
    eventos: readonly EventoSincronizacaoMobile[],
    credenciais: CredenciaisSincronizacaoAplicativo,
  ): EventoInvalidacaoEscopoMobile | undefined {
    let ultima: EventoInvalidacaoEscopoMobile | undefined;
    for (const evento of eventos) {
      if (evento.tipo !== 'PERMISSOES_ALTERADAS') continue;
      const candidata = this.projetarInvalidacao(evento, credenciais);
      if (
        ultima === undefined ||
        BigInt(candidata.sequenciaEvento) > BigInt(ultima.sequenciaEvento)
      ) {
        ultima = candidata;
      }
    }
    return ultima;
  }

  private async aplicarInvalidacaoDuranteSincronizacao(
    evento: EventoInvalidacaoEscopoMobile,
    credenciais: CredenciaisSincronizacaoAplicativo,
  ): Promise<SnapshotMobileValidado> {
    this.escopoEmAtualizacao = true;
    this.publicarEstado('ESCOPO_ATUALIZANDO');
    try {
      await this.repositorio.invalidarAutorizacaoEscopo(
        evento.sequenciaEvento,
        evento.dados.versaoPermissoes,
      );
      const snapshot = await this.obterSnapshotValidado(
        credenciais,
        evento.sequenciaEvento,
      );
      if (snapshot.versaoPermissoes < evento.dados.versaoPermissoes) {
        throw new Error('SNAPSHOT_ESCOPO_DESATUALIZADO');
      }
      await this.repositorio.aplicarSnapshot(snapshot, true);
      await this.ganchosSeguranca.aoEscopoSubstituido(snapshot);
      return snapshot;
    } finally {
      this.escopoEmAtualizacao = false;
    }
  }

  private statusHttp(erro: unknown): number | undefined {
    if (erro instanceof ErroSincronizacaoMobile) return erro.statusHttp;
    if (erro !== null && typeof erro === 'object') {
      const status = Reflect.get(erro, 'statusHttp');
      if (typeof status === 'number') return status;
    }
    return undefined;
  }
}
