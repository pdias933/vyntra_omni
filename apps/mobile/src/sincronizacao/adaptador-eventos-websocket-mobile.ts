import { CONFIGURACAO_APLICATIVO } from '../configuracao-aplicativo';
import type { CredenciaisTransporteSincronizacaoMobile } from './adaptador-sincronizacao-http';
import {
  normalizarEventoMobile,
  type EventoSincronizacaoMobile,
} from './modelo-sincronizacao-mobile';

const LIMITE_MENSAGEM_CARACTERES = 8_192;
const SEQUENCIA = /^(0|[1-9][0-9]{0,18})$/u;

interface OuvinteEventosMobile {
  aoEncerrar(codigo: number, motivo: string): void;
  aoEvento(evento: EventoSincronizacaoMobile): Promise<void>;
  aoPronto(sequenciaServidor: string): Promise<void>;
}

interface ConstrutorWebSocketMobile {
  new (
    endereco: string,
    protocolos: null,
    opcoes: { readonly headers: Readonly<Record<string, string>> },
  ): WebSocket;
}

export interface ConexaoEventosMobile {
  fechar(): void;
}

function objeto(valor: unknown): Record<string, unknown> {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('MENSAGEM_WEBSOCKET_MOBILE_INVALIDA');
  }
  return valor as Record<string, unknown>;
}

function exigirChaves(
  valor: Record<string, unknown>,
  esperadas: readonly string[],
): void {
  if (
    JSON.stringify(Object.keys(valor).sort()) !==
    JSON.stringify([...esperadas].sort())
  ) {
    throw new Error('MENSAGEM_WEBSOCKET_MOBILE_INVALIDA');
  }
}

function lerSequencia(valor: unknown): string {
  if (typeof valor !== 'string' || !SEQUENCIA.test(valor)) {
    throw new Error('MENSAGEM_WEBSOCKET_MOBILE_INVALIDA');
  }
  return valor;
}

function enderecoWebSocket(cursor: string): string {
  const endereco = new URL('/api/v1/sincronizacao/eventos-mobile', CONFIGURACAO_APLICATIVO.servidor);
  endereco.protocol = endereco.protocol === 'https:' ? 'wss:' : 'ws:';
  endereco.searchParams.set('apos', cursor);
  return endereco.toString();
}

export class AdaptadorEventosWebSocketMobile {
  public abrir(
    cursor: string,
    credenciais: CredenciaisTransporteSincronizacaoMobile,
    ouvinte: OuvinteEventosMobile,
  ): Promise<ConexaoEventosMobile> {
    if (!SEQUENCIA.test(cursor)) {
      return Promise.reject(new Error('CURSOR_WEBSOCKET_MOBILE_INVALIDO'));
    }
    return new Promise((resolver, rejeitar) => {
      const WebSocketMobile = WebSocket as unknown as ConstrutorWebSocketMobile;
      const conexao = new WebSocketMobile(enderecoWebSocket(cursor), null, {
        headers: {
          Authorization: `Bearer ${credenciais.tokenAcesso}`,
          'x-dispositivo-id': credenciais.dispositivoId,
          'x-segredo-dispositivo': credenciais.segredoDispositivo,
        },
      });
      let aberta = false;
      let encerradaIntencionalmente = false;
      let falhou = false;
      let pronta = false;
      let fila = Promise.resolve();
      const controle: ConexaoEventosMobile = {
        fechar: () => {
          encerradaIntencionalmente = true;
          conexao.close(1000, 'PAUSADO');
        },
      };
      const limiteAbertura = setTimeout(() => {
        rejeitar(new Error('WEBSOCKET_MOBILE_INDISPONIVEL'));
        conexao.close();
      }, 15_000);

      const fecharComFalha = () => {
        falhou = true;
        conexao.close(1008, 'CONTRATO_INVALIDO');
      };
      conexao.onopen = () => {
        aberta = true;
      };
      conexao.onerror = () => {
        clearTimeout(limiteAbertura);
        if (!pronta) rejeitar(new Error('WEBSOCKET_MOBILE_INDISPONIVEL'));
      };
      conexao.onclose = (evento) => {
        clearTimeout(limiteAbertura);
        if (!pronta) rejeitar(new Error('WEBSOCKET_MOBILE_INDISPONIVEL'));
        if (!encerradaIntencionalmente) {
          ouvinte.aoEncerrar(evento.code ?? 1006, evento.reason ?? '');
        }
      };
      conexao.onmessage = (mensagem) => {
        fila = fila
          .then(async () => {
            if (falhou) return;
            if (
              typeof mensagem.data !== 'string' ||
              mensagem.data.length > LIMITE_MENSAGEM_CARACTERES
            ) {
              throw new Error('MENSAGEM_WEBSOCKET_MOBILE_INVALIDA');
            }
            const lida = objeto(JSON.parse(mensagem.data) as unknown);
            if (lida.tipo === 'PRONTO') {
              if (!aberta || pronta) {
                throw new Error('MENSAGEM_WEBSOCKET_MOBILE_INVALIDA');
              }
              exigirChaves(lida, ['sequencia_servidor', 'tipo']);
              await ouvinte.aoPronto(lerSequencia(lida.sequencia_servidor));
              pronta = true;
              clearTimeout(limiteAbertura);
              resolver(controle);
              return;
            }
            if (lida.tipo === 'CONFIRMADO') {
              exigirChaves(lida, ['sequencia_evento', 'tipo']);
              lerSequencia(lida.sequencia_evento);
              return;
            }
            if (lida.tipo !== 'EVENTO') {
              throw new Error('MENSAGEM_WEBSOCKET_MOBILE_INVALIDA');
            }
            exigirChaves(lida, ['evento', 'sequencia_evento', 'tipo']);
            const sequenciaEnvelope = lerSequencia(lida.sequencia_evento);
            const evento = normalizarEventoMobile(lida.evento);
            if (evento.sequenciaEvento !== sequenciaEnvelope) {
              throw new Error('MENSAGEM_WEBSOCKET_MOBILE_INVALIDA');
            }
            await ouvinte.aoEvento(evento);
            if (conexao.readyState === WebSocket.OPEN) {
              conexao.send(
                JSON.stringify({
                  sequencia_evento: evento.sequenciaEvento,
                  tipo: 'CONFIRMAR',
                }),
              );
            }
          })
          .catch(fecharComFalha);
      };
    });
  }
}
