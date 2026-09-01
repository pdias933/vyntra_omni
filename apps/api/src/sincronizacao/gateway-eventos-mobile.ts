import type { IncomingMessage, Server as ServidorHttp } from 'node:http';
import type { Duplex } from 'node:stream';

import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  WebSocket,
  WebSocketServer,
  type RawData,
} from 'ws';

import {
  NOME_HEADER_DISPOSITIVO_MOBILE,
  NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE,
} from '../autenticacao/controlador-autenticacao-mobile.js';
import type { SessaoMobileAutenticada } from '../autenticacao/modelo-autenticacao-mobile.js';
import { ServicoAutenticacaoMobile } from '../autenticacao/servico-autenticacao-mobile.js';
import { CoordenadorWebSocketMobileSemLacuna } from './coordenador-websocket-mobile-sem-lacuna.js';
import type { PayloadEventoMobile } from './modelo-projecao-evento.js';

const CAMINHO_EVENTOS_MOBILE = '/api/v1/sincronizacao/eventos-mobile';
const INTERVALO_HEARTBEAT_MS = 20_000;
const LIMITE_BYTES_PENDENTES = 1_048_576;
const LIMITE_EVENTOS_SEM_CONFIRMACAO = 1_000;

interface MensagemConfirmacao {
  readonly tipo: 'CONFIRMAR';
  readonly sequencia_evento: string;
}

interface CredenciaisConexaoMobile {
  readonly dispositivoId: string;
  readonly segredoDispositivo: string;
  readonly tokenAcesso: string;
}

export class ControleConfirmacaoWebSocketMobile {
  private maiorEnviada: bigint;
  private maiorConfirmada: bigint;
  private readonly pendentes = new Set<bigint>();

  public constructor(cursorInicial: string) {
    this.maiorEnviada = this.lerSequencia(cursorInicial);
    this.maiorConfirmada = this.maiorEnviada;
  }

  public registrarEnvio(sequenciaRecebida: string): void {
    const sequencia = this.lerSequencia(sequenciaRecebida);
    if (sequencia <= this.maiorEnviada) {
      throw new Error('ORDEM_ENVIO_WEBSOCKET_MOBILE_INVALIDA');
    }
    this.maiorEnviada = sequencia;
    this.pendentes.add(sequencia);
    if (this.pendentes.size > LIMITE_EVENTOS_SEM_CONFIRMACAO) {
      throw new Error('CONFIRMACOES_WEBSOCKET_MOBILE_PENDENTES');
    }
  }

  public confirmar(sequenciaRecebida: string): string {
    const sequencia = this.lerSequencia(sequenciaRecebida);
    if (sequencia < this.maiorConfirmada || sequencia > this.maiorEnviada) {
      throw new Error('CONFIRMACAO_WEBSOCKET_MOBILE_INVALIDA');
    }
    if (sequencia === this.maiorConfirmada) return sequencia.toString();
    this.maiorConfirmada = sequencia;
    for (const pendente of this.pendentes) {
      if (pendente <= sequencia) this.pendentes.delete(pendente);
    }
    return sequencia.toString();
  }

  private lerSequencia(valor: string): bigint {
    if (!/^(0|[1-9][0-9]{0,18})$/u.test(valor)) {
      throw new Error('SEQUENCIA_WEBSOCKET_MOBILE_INVALIDA');
    }
    return BigInt(valor);
  }
}

@Injectable()
export class GatewayEventosMobile implements OnModuleDestroy {
  private readonly servidorWebSocket = new WebSocketServer({
    clientTracking: true,
    maxPayload: 8_192,
    noServer: true,
    perMessageDeflate: false,
  });
  private servidorHttp: ServidorHttp | undefined;
  private manipuladorUpgrade:
    | ((requisicao: IncomingMessage, socket: Duplex, cabecalho: Buffer) => void)
    | undefined;

  public constructor(
    @Inject(ServicoAutenticacaoMobile)
    private readonly autenticacao: ServicoAutenticacaoMobile,
    @Inject(CoordenadorWebSocketMobileSemLacuna)
    private readonly coordenador: CoordenadorWebSocketMobileSemLacuna,
  ) {}

  public anexar(servidorHttp: ServidorHttp): void {
    if (this.servidorHttp !== undefined) {
      throw new Error('GATEWAY_EVENTOS_MOBILE_JA_ANEXADO');
    }
    this.servidorHttp = servidorHttp;
    this.manipuladorUpgrade = (requisicao, socket, cabecalho) => {
      void this.processarUpgrade(requisicao, socket, cabecalho);
    };
    servidorHttp.on('upgrade', this.manipuladorUpgrade);
  }

  public onModuleDestroy(): void {
    if (this.servidorHttp !== undefined && this.manipuladorUpgrade !== undefined) {
      this.servidorHttp.off('upgrade', this.manipuladorUpgrade);
    }
    for (const cliente of this.servidorWebSocket.clients) {
      cliente.close(1001, 'SERVIDOR_ENCERRANDO');
    }
    this.servidorHttp = undefined;
    this.manipuladorUpgrade = undefined;
  }

  private async processarUpgrade(
    requisicao: IncomingMessage,
    socket: Duplex,
    cabecalho: Buffer,
  ): Promise<void> {
    let endereco: URL;
    try {
      endereco = new URL(requisicao.url ?? '', 'http://gateway.local');
    } catch {
      this.recusarUpgrade(socket, 400, 'Bad Request');
      return;
    }
    if (endereco.pathname !== CAMINHO_EVENTOS_MOBILE) {
      this.recusarUpgrade(socket, 404, 'Not Found');
      return;
    }
    const cursor = endereco.searchParams.get('apos');
    if (cursor === null || !/^(0|[1-9][0-9]{0,18})$/u.test(cursor)) {
      this.recusarUpgrade(socket, 400, 'Bad Request');
      return;
    }

    socket.pause();
    let sessao: SessaoMobileAutenticada;
    let credenciais: CredenciaisConexaoMobile;
    try {
      credenciais = {
        dispositivoId: this.exigirCabecalho(
          requisicao,
          NOME_HEADER_DISPOSITIVO_MOBILE,
        ),
        segredoDispositivo: this.exigirCabecalho(
          requisicao,
          NOME_HEADER_SEGREDO_DISPOSITIVO_MOBILE,
        ),
        tokenAcesso: this.obterTokenAcesso(requisicao),
      };
      sessao = await this.autenticacao.autenticar(
        credenciais.tokenAcesso,
        credenciais.dispositivoId,
        credenciais.segredoDispositivo,
      );
    } catch {
      this.recusarUpgrade(socket, 401, 'Unauthorized');
      return;
    }

    this.servidorWebSocket.handleUpgrade(
      requisicao,
      socket,
      cabecalho,
      (conexao) => {
        socket.resume();
        this.aceitarConexao(conexao, sessao, credenciais, cursor);
      },
    );
  }

  private aceitarConexao(
    conexao: WebSocket,
    sessao: SessaoMobileAutenticada,
    credenciais: CredenciaisConexaoMobile,
    cursor: string,
  ): void {
    const confirmacoes = new ControleConfirmacaoWebSocketMobile(cursor);
    let respondeuHeartbeat = true;
    let validacaoEmCurso = false;
    let fecharCoordenador: (() => void) | undefined;
    const heartbeat = setInterval(() => {
      if (!respondeuHeartbeat) {
        conexao.terminate();
        return;
      }
      respondeuHeartbeat = false;
      conexao.ping();
      if (!validacaoEmCurso) {
        validacaoEmCurso = true;
        void this.revalidar(credenciais)
          .catch(() => conexao.close(4003, 'AUTORIZACAO_INVALIDADA'))
          .finally(() => {
            validacaoEmCurso = false;
          });
      }
    }, INTERVALO_HEARTBEAT_MS);
    const limpar = (): void => {
      clearInterval(heartbeat);
      fecharCoordenador?.();
      fecharCoordenador = undefined;
    };

    conexao.once('close', limpar);
    conexao.on('error', () => undefined);
    conexao.on('pong', () => {
      respondeuHeartbeat = true;
    });
    let processamentoMensagens = Promise.resolve();
    conexao.on('message', (dados, binaria) => {
      processamentoMensagens = processamentoMensagens
        .then(() =>
          this.processarMensagem(
            conexao,
            confirmacoes,
            credenciais,
            dados,
            binaria,
          ),
        )
        .catch(() => conexao.close(1011, 'PROCESSAMENTO_INDISPONIVEL'));
    });

    try {
      fecharCoordenador = this.coordenador.abrir(
        sessao.contexto,
        cursor,
        {
          enviar: (evento) =>
            this.enviarEvento(conexao, confirmacoes, evento),
          falhar: () => conexao.close(1011, 'SINCRONIZACAO_INDISPONIVEL'),
          pronto: (sequenciaServidor) =>
            this.enviar(conexao, {
              sequencia_servidor: sequenciaServidor,
              tipo: 'PRONTO',
            }),
        },
      );
    } catch {
      conexao.close(1008, 'CURSOR_INVALIDO');
    }
  }

  private async processarMensagem(
    conexao: WebSocket,
    confirmacoes: ControleConfirmacaoWebSocketMobile,
    credenciais: CredenciaisConexaoMobile,
    dados: RawData,
    binaria: boolean,
  ): Promise<void> {
    if (binaria) {
      conexao.close(1003, 'MENSAGEM_BINARIA_NAO_SUPORTADA');
      return;
    }
    try {
      await this.revalidar(credenciais);
    } catch {
      conexao.close(4003, 'AUTORIZACAO_INVALIDADA');
      return;
    }
    try {
      const mensagem = JSON.parse(dados.toString()) as Partial<MensagemConfirmacao>;
      if (
        mensagem.tipo !== 'CONFIRMAR' ||
        typeof mensagem.sequencia_evento !== 'string'
      ) {
        throw new Error('MENSAGEM_WEBSOCKET_MOBILE_INVALIDA');
      }
      const sequenciaConfirmada = confirmacoes.confirmar(
        mensagem.sequencia_evento,
      );
      this.enviar(conexao, {
        sequencia_evento: sequenciaConfirmada,
        tipo: 'CONFIRMADO',
      });
    } catch {
      conexao.close(1008, 'CONFIRMACAO_INVALIDA');
    }
  }

  private enviarEvento(
    conexao: WebSocket,
    confirmacoes: ControleConfirmacaoWebSocketMobile,
    evento: PayloadEventoMobile,
  ): void {
    if (conexao.bufferedAmount > LIMITE_BYTES_PENDENTES) {
      throw new Error('PRESSAO_WEBSOCKET_MOBILE_EXCEDIDA');
    }
    confirmacoes.registrarEnvio(evento.sequenciaEvento);
    this.enviar(conexao, {
      evento,
      sequencia_evento: evento.sequenciaEvento,
      tipo: 'EVENTO',
    });
    if (evento.tipo === 'PERMISSOES_ALTERADAS') {
      conexao.close(4003, 'ESCOPO_ALTERADO');
    }
  }

  private async revalidar(
    credenciais: CredenciaisConexaoMobile,
  ): Promise<void> {
    await this.autenticacao.autenticar(
      credenciais.tokenAcesso,
      credenciais.dispositivoId,
      credenciais.segredoDispositivo,
    );
  }

  private enviar(conexao: WebSocket, mensagem: Readonly<object>): void {
    if (conexao.readyState !== WebSocket.OPEN) {
      throw new Error('WEBSOCKET_MOBILE_ENCERRADO');
    }
    conexao.send(JSON.stringify(mensagem));
  }

  private obterTokenAcesso(requisicao: IncomingMessage): string {
    const autorizacao = this.exigirCabecalho(requisicao, 'authorization');
    const correspondencia = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(autorizacao);
    if (correspondencia?.[1] === undefined) {
      throw new Error('TOKEN_WEBSOCKET_MOBILE_INVALIDO');
    }
    return correspondencia[1];
  }

  private exigirCabecalho(
    requisicao: IncomingMessage,
    nome: string,
  ): string {
    const valor = requisicao.headers[nome];
    if (typeof valor !== 'string' || valor.length === 0) {
      throw new Error('CABECALHO_WEBSOCKET_MOBILE_AUSENTE');
    }
    return valor;
  }

  private recusarUpgrade(socket: Duplex, codigo: number, texto: string): void {
    if (socket.destroyed) return;
    socket.end(
      `HTTP/1.1 ${codigo} ${texto}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
  }
}
