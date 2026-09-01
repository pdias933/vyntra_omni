import { Inject, Injectable } from '@nestjs/common';

import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import type { PayloadEventoWeb } from './modelo-projecao-evento.js';
import { ServicoSincronizacaoIncremental } from './servico-sincronizacao-incremental.js';

const LIMITE_BUFFER = 1_000;
const INTERVALO_CONSULTA_MS = 1_000;
const INTERVALO_HEARTBEAT_MS = 15_000;

export interface DestinoSse {
  enviar(evento: PayloadEventoWeb): void;
  heartbeat(): void;
  falhar(erro: unknown): void;
}

export interface OpcoesSse {
  readonly intervaloConsultaMs?: number;
  readonly intervaloHeartbeatMs?: number;
}

@Injectable()
export class CoordenadorSseSemLacuna {
  public constructor(
    @Inject(ServicoSincronizacaoIncremental)
    private readonly sincronizacao: ServicoSincronizacaoIncremental,
  ) {}

  public abrir(
    sessao: ContextoSessaoAutorizacao,
    depoisDe: string,
    destino: DestinoSse,
    opcoes: OpcoesSse = {},
  ): () => void {
    const cursorInicial = this.lerSequencia(depoisDe);
    let cursorAssinatura = cursorInicial;
    let maiorEmitida = cursorInicial;
    let marcaDagua = cursorInicial;
    let modo: 'BUFFER' | 'ENCERRADO' | 'VIVO' = 'BUFFER';
    let consultaEmCurso = false;
    const buffer: PayloadEventoWeb[] = [];
    const encerrado = (): boolean => modo === 'ENCERRADO';

    const encerrarComFalha = (erro: unknown): void => {
      if (modo === 'ENCERRADO') return;
      modo = 'ENCERRADO';
      clearInterval(consultaPeriodica);
      clearInterval(heartbeat);
      destino.falhar(erro);
    };
    const emitir = (evento: PayloadEventoWeb): void => {
      const sequencia = this.lerSequencia(evento.sequenciaEvento);
      if (sequencia <= maiorEmitida) return;
      maiorEmitida = sequencia;
      destino.enviar(evento);
    };
    const receberDaAssinatura = (
      eventos: readonly PayloadEventoWeb[],
    ): void => {
      if (modo === 'ENCERRADO') return;
      if (modo === 'BUFFER') {
        buffer.push(...eventos);
        if (buffer.length > LIMITE_BUFFER) {
          encerrarComFalha(new Error('BUFFER_SSE_EXCEDIDO'));
        }
        return;
      }
      for (const evento of eventos) {
        if (this.lerSequencia(evento.sequenciaEvento) > marcaDagua) {
          emitir(evento);
        }
      }
    };
    const consultarAssinatura = async (): Promise<void> => {
      if (consultaEmCurso || modo === 'ENCERRADO') return;
      consultaEmCurso = true;
      try {
        let continuar = true;
        while (continuar) {
          const lote = await this.sincronizacao.sincronizar(
            sessao,
            'WEB',
            cursorAssinatura.toString(),
            '100',
          );
          if (encerrado()) return;
          const proximo = this.lerSequencia(lote.sequenciaFinal);
          if (proximo < cursorAssinatura) {
            throw new Error('ORDEM_SSE_INVALIDA');
          }
          cursorAssinatura = proximo;
          receberDaAssinatura(
            lote.eventos.filter(
              (evento): evento is PayloadEventoWeb =>
                evento.audiencia === 'WEB',
            ),
          );
          continuar = lote.temMais;
        }
      } catch (erro) {
        encerrarComFalha(erro);
      } finally {
        consultaEmCurso = false;
      }
    };

    const consultaPeriodica = setInterval(
      () => void consultarAssinatura(),
      opcoes.intervaloConsultaMs ?? INTERVALO_CONSULTA_MS,
    );
    const heartbeat = setInterval(
      () => {
        if (modo !== 'ENCERRADO') destino.heartbeat();
      },
      opcoes.intervaloHeartbeatMs ?? INTERVALO_HEARTBEAT_MS,
    );

    void consultarAssinatura();
    void this.inicializar(
      sessao,
      cursorInicial,
      (limite) => {
        marcaDagua = limite;
      },
      emitir,
    )
      .then(() => {
        if (modo === 'ENCERRADO') return;
        buffer
          .sort((a, b) =>
            this.lerSequencia(a.sequenciaEvento) <
            this.lerSequencia(b.sequenciaEvento)
              ? -1
              : 1,
          )
          .filter(
            (evento) =>
              this.lerSequencia(evento.sequenciaEvento) > marcaDagua,
          )
          .forEach(emitir);
        buffer.length = 0;
        modo = 'VIVO';
      })
      .catch(encerrarComFalha);

    return () => {
      if (modo === 'ENCERRADO') return;
      modo = 'ENCERRADO';
      clearInterval(consultaPeriodica);
      clearInterval(heartbeat);
      buffer.length = 0;
    };
  }

  private async inicializar(
    sessao: ContextoSessaoAutorizacao,
    cursorInicial: bigint,
    definirMarcaDagua: (sequencia: bigint) => void,
    emitir: (evento: PayloadEventoWeb) => void,
  ): Promise<void> {
    const marcaDagua = this.lerSequencia(
      await this.sincronizacao.obterMarcaDagua(sessao),
    );
    definirMarcaDagua(marcaDagua);
    let cursor = cursorInicial;
    while (cursor < marcaDagua) {
      const lote = await this.sincronizacao.sincronizar(
        sessao,
        'WEB',
        cursor.toString(),
        '100',
      );
      const proximo = this.lerSequencia(lote.sequenciaFinal);
      if (proximo <= cursor) throw new Error('BACKFILL_SSE_INCOMPLETO');
      for (const evento of lote.eventos) {
        if (
          evento.audiencia === 'WEB' &&
          this.lerSequencia(evento.sequenciaEvento) <= marcaDagua
        ) {
          emitir(evento);
        }
      }
      cursor = proximo;
    }
  }

  private lerSequencia(valor: string): bigint {
    if (!/^(0|[1-9][0-9]{0,18})$/u.test(valor)) {
      throw new Error('CURSOR_SSE_INVALIDO');
    }
    return BigInt(valor);
  }
}
