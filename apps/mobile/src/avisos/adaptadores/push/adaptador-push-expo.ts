import * as Notifications from 'expo-notifications';

import type {
  AvisoMobileRecebido,
  TipoAvisoMobile,
} from '../../modelo-aviso-mobile';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TIPOS = new Set<TipoAvisoMobile>([
  'CLIENTE_AGUARDANDO',
  'JANELA_EXPIRANDO',
  'NOVA_MENSAGEM',
  'NOVO_PENDENTE',
  'TRANSFERENCIA_DIRETA',
]);
const CHAVES = new Set([
  'atendimento_id',
  'chave_agrupamento',
  'conversa_id',
  'sequencia_observada',
  'tipo',
]);

export interface ReceptorAvisosMobile {
  abrir(aviso: AvisoMobileRecebido): Promise<void>;
  receber(aviso: AvisoMobileRecebido): void;
}

export class AdaptadorPushExpo {
  private readonly respostasProcessadas = new Set<string>();

  public iniciar(receptor: ReceptorAvisosMobile): () => void {
    const recebimento = Notifications.addNotificationReceivedListener(
      (notificacao) => {
        const aviso = this.normalizar(notificacao.request.content.data);
        if (aviso !== undefined) receptor.receber(aviso);
      },
    );
    const abertura = Notifications.addNotificationResponseReceivedListener(
      (resposta) => {
        void this.processarResposta(receptor, resposta).catch(() => undefined);
      },
    );
    void Notifications.getLastNotificationResponseAsync()
      .then(async (resposta) => {
        if (resposta === null) return;
        await this.processarResposta(receptor, resposta);
        await Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => undefined);
    return () => {
      recebimento.remove();
      abertura.remove();
    };
  }

  private async processarResposta(
    receptor: ReceptorAvisosMobile,
    resposta: Notifications.NotificationResponse,
  ): Promise<void> {
    const identificador = resposta.notification.request.identifier;
    if (this.respostasProcessadas.has(identificador)) return;
    this.respostasProcessadas.add(identificador);
    try {
      const aviso = this.normalizar(
        resposta.notification.request.content.data,
      );
      if (aviso !== undefined) await receptor.abrir(aviso);
    } catch (erro) {
      this.respostasProcessadas.delete(identificador);
      throw erro;
    }
  }

  private normalizar(
    dados: Readonly<Record<string, unknown>> | undefined,
  ): AvisoMobileRecebido | undefined {
    if (dados === undefined) return undefined;
    if (Object.keys(dados).some((chave) => !CHAVES.has(chave))) {
      return undefined;
    }
    const tipo = dados.tipo;
    const sequencia = dados.sequencia_observada;
    const atendimentoId = dados.atendimento_id;
    const conversaId = dados.conversa_id;
    const chaveAgrupamento = dados.chave_agrupamento;
    if (
      typeof tipo !== 'string' ||
      !TIPOS.has(tipo as TipoAvisoMobile) ||
      typeof sequencia !== 'string' ||
      !/^[1-9][0-9]{0,18}$/u.test(sequencia) ||
      (atendimentoId !== undefined &&
        (typeof atendimentoId !== 'string' || !UUID.test(atendimentoId))) ||
      (conversaId !== undefined &&
        (typeof conversaId !== 'string' || !UUID.test(conversaId))) ||
      typeof chaveAgrupamento !== 'string' ||
      chaveAgrupamento !== (conversaId ?? atendimentoId)
    ) {
      return undefined;
    }
    return {
      ...(typeof atendimentoId === 'string' ? { atendimentoId } : {}),
      chaveAgrupamento,
      ...(typeof conversaId === 'string' ? { conversaId } : {}),
      sequenciaObservada: sequencia,
      tipo: tipo as TipoAvisoMobile,
    };
  }
}
