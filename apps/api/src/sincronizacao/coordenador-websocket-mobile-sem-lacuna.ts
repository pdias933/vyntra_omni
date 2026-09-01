import { Inject, Injectable } from '@nestjs/common';

import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import type { PayloadEventoMobile } from './modelo-projecao-evento.js';
import { ServicoSincronizacaoIncremental } from './servico-sincronizacao-incremental.js';

const LIMITE_BUFFER = 1_000;
const INTERVALO_CONSULTA_MS = 1_000;

export interface DestinoWebSocketMobile {
  enviar(evento: PayloadEventoMobile): void;
  falhar(erro: unknown): void;
  pronto(sequenciaServidor: string): void;
}

export interface OpcoesWebSocketMobile {
  readonly intervaloConsultaMs?: number;
}

@Injectable()
export class CoordenadorWebSocketMobileSemLacuna {
  public constructor(
    @Inject(ServicoSincronizacaoIncremental)
    private readonly sincronizacao: ServicoSincronizacaoIncremental,
  ) {}

  public abrir(
    sessao: ContextoSessaoAutorizacao,
    depoisDe: string,
    destino: DestinoWebSocketMobile,
    opcoes: OpcoesWebSocketMobile = {},
  ): () => void {
    const cursorInicial = this.lerSequencia(depoisDe);
    let cursorAssinatura = cursorInicial;
    let maiorEmitida = cursorInicial;
    let marcaDagua = cursorInicial;
    let modo: 'BUFFER' | 'ENCERRADO' | 'VIVO' = 'BUFFER';
    let consultaEmCurso = false;
    const buffer: PayloadEventoMobile[] = [];
    const encerrado = (): boolean => modo === 'ENCERRADO';

    const encerrarComFalha = (erro: unknown): void => {
      if (modo === 'ENCERRADO') return;
      modo = 'ENCERRADO';
      clearInterval(consultaPeriodica);
      destino.falhar(erro);
    };
    const emitir = (evento: PayloadEventoMobile): void => {
      const sequencia = this.lerSequencia(evento.sequenciaEvento);
      if (sequencia <= maiorEmitida) return;
      maiorEmitida = sequencia;
      destino.enviar(evento);
    };
    const receberDaAssinatura = (
      eventos: readonly PayloadEventoMobile[],
    ): void => {
      if (modo === 'ENCERRADO') return;
      if (modo === 'BUFFER') {
        buffer.push(...eventos);
        if (buffer.length > LIMITE_BUFFER) {
          encerrarComFalha(new Error('BUFFER_WEBSOCKET_MOBILE_EXCEDIDO'));
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
            'MOBILE',
            cursorAssinatura.toString(),
            '100',
          );
          if (encerrado()) return;
          const proximo = this.lerSequencia(lote.sequenciaFinal);
          if (proximo < cursorAssinatura) {
            throw new Error('ORDEM_WEBSOCKET_MOBILE_INVALIDA');
          }
          cursorAssinatura = proximo;
          receberDaAssinatura(
            lote.eventos.filter(
              (evento): evento is PayloadEventoMobile =>
                evento.audiencia === 'MOBILE',
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
        destino.pronto(maiorEmitida.toString());
      })
      .catch(encerrarComFalha);

    return () => {
      if (modo === 'ENCERRADO') return;
      modo = 'ENCERRADO';
      clearInterval(consultaPeriodica);
      buffer.length = 0;
    };
  }

  private async inicializar(
    sessao: ContextoSessaoAutorizacao,
    cursorInicial: bigint,
    definirMarcaDagua: (sequencia: bigint) => void,
    emitir: (evento: PayloadEventoMobile) => void,
  ): Promise<void> {
    const marcaDagua = this.lerSequencia(
      await this.sincronizacao.obterMarcaDagua(sessao),
    );
    definirMarcaDagua(marcaDagua);
    let cursor = cursorInicial;
    while (cursor < marcaDagua) {
      const lote = await this.sincronizacao.sincronizar(
        sessao,
        'MOBILE',
        cursor.toString(),
        '100',
      );
      const proximo = this.lerSequencia(lote.sequenciaFinal);
      if (proximo <= cursor) {
        throw new Error('BACKFILL_WEBSOCKET_MOBILE_INCOMPLETO');
      }
      for (const evento of lote.eventos) {
        if (
          evento.audiencia === 'MOBILE' &&
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
      throw new Error('CURSOR_WEBSOCKET_MOBILE_INVALIDO');
    }
    return BigInt(valor);
  }
}
