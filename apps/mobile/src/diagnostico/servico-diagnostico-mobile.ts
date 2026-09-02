import { Platform } from 'react-native';

import type { AdaptadorPushExpo } from '../avisos/adaptadores/push/adaptador-push-expo';
import { CONFIGURACAO_APLICATIVO } from '../configuracao-aplicativo';
import type { ServicoSincronizacaoAplicativo } from '../sincronizacao/servico-sincronizacao-aplicativo';

const CODIGO_SANITIZADO = /^[A-Z][A-Z0-9_]{0,63}$/u;
const LIMITE_CODIGOS = 10;
const LIMITE_RELATORIO_CARACTERES = 2_048;

export interface DiagnosticoMobile {
  readonly codigosFalhaRecentes: readonly string[];
  readonly estadoPush: string;
  readonly estadoSincronizacao: string;
  readonly estadoWebSocket: string;
  readonly modeloDispositivo: string;
  readonly plataforma: 'Android' | 'iOS';
  readonly servidor: string;
  readonly ultimaSequenciaAplicada: string;
  readonly versaoAplicativo: string;
  readonly versaoSistemaOperacional: string;
}

function limitar(valor: string, tamanho: number): string {
  const normalizado = valor.trim();
  return (normalizado || 'Não informado').slice(0, tamanho);
}

function modeloDispositivo(): string {
  const chave = Platform.OS === 'android' ? 'Model' : 'interfaceIdiom';
  const encontrado = Object.entries(Platform.constants).find(
    ([nome]) => nome === chave,
  )?.[1];
  return typeof encontrado === 'string'
    ? limitar(encontrado, 80)
    : Platform.OS === 'ios'
      ? 'Dispositivo Apple'
      : 'Dispositivo Android';
}

export class ServicoDiagnosticoMobile {
  public constructor(
    private readonly sincronizacao: ServicoSincronizacaoAplicativo,
    private readonly push: AdaptadorPushExpo,
  ) {}

  public async obter(): Promise<DiagnosticoMobile> {
    const [sincronizacao, estadoPush] = await Promise.all([
      this.sincronizacao.obterDiagnostico(),
      this.push.obterEstadoDiagnostico(),
    ]);
    return {
      codigosFalhaRecentes: sincronizacao.codigosFalhaRecentes
        .filter((codigo) => CODIGO_SANITIZADO.test(codigo))
        .slice(-LIMITE_CODIGOS),
      estadoPush,
      estadoSincronizacao: sincronizacao.estado,
      estadoWebSocket: sincronizacao.estadoWebSocket,
      modeloDispositivo: modeloDispositivo(),
      plataforma: Platform.OS === 'ios' ? 'iOS' : 'Android',
      servidor: limitar(CONFIGURACAO_APLICATIVO.servidor, 200),
      ultimaSequenciaAplicada: /^(0|[1-9][0-9]{0,18})$/u.test(
        sincronizacao.ultimaSequenciaAplicada,
      )
        ? sincronizacao.ultimaSequenciaAplicada
        : '0',
      versaoAplicativo: limitar(CONFIGURACAO_APLICATIVO.versao, 64),
      versaoSistemaOperacional: limitar(String(Platform.Version), 64),
    };
  }

  public criarRelatorio(diagnostico: DiagnosticoMobile): string {
    const codigos = diagnostico.codigosFalhaRecentes.length
      ? diagnostico.codigosFalhaRecentes.join(', ')
      : 'Nenhum';
    const relatorio = [
      'Diagnóstico Vyntra Omni',
      `Versão do app: ${diagnostico.versaoAplicativo}`,
      `Sistema: ${diagnostico.plataforma} ${diagnostico.versaoSistemaOperacional}`,
      `Modelo: ${diagnostico.modeloDispositivo}`,
      `Servidor: ${diagnostico.servidor}`,
      `WebSocket: ${diagnostico.estadoWebSocket}`,
      `Push: ${diagnostico.estadoPush}`,
      `Sincronização: ${diagnostico.estadoSincronizacao}`,
      `Última sequência aplicada: ${diagnostico.ultimaSequenciaAplicada}`,
      `Falhas recentes: ${codigos}`,
    ].join('\n');
    if (relatorio.length > LIMITE_RELATORIO_CARACTERES) {
      throw new Error('RELATORIO_DIAGNOSTICO_EXCEDE_LIMITE');
    }
    return relatorio;
  }
}
