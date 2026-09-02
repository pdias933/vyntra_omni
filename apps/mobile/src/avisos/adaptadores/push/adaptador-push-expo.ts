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
const LIMITE_RESPOSTAS_PROCESSADAS = 200;

export interface ReceptorAvisosMobile {
  abrir(aviso: AvisoMobileRecebido): Promise<void>;
  receber(aviso: AvisoMobileRecebido): void;
}

export class AdaptadorPushExpo {
  private readonly ordemRespostasProcessadas: string[] = [];
  private receptoresAtivos = 0;
  private readonly respostasProcessadas = new Set<string>();

  public iniciar(receptor: ReceptorAvisosMobile): () => void {
    this.receptoresAtivos += 1;
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
      this.receptoresAtivos = Math.max(0, this.receptoresAtivos - 1);
    };
  }

  public async obterEstadoDiagnostico(): Promise<
    'ATIVO' | 'INDISPONIVEL' | 'NAO_INICIADO' | 'SEM_PERMISSAO'
  > {
    if (this.receptoresAtivos === 0) return 'NAO_INICIADO';
    try {
      const permissao = await Notifications.getPermissionsAsync();
      return permissao.granted ? 'ATIVO' : 'SEM_PERMISSAO';
    } catch {
      return 'INDISPONIVEL';
    }
  }

  private async processarResposta(
    receptor: ReceptorAvisosMobile,
    resposta: Notifications.NotificationResponse,
  ): Promise<void> {
    const identificador = resposta.notification.request.identifier;
    if (!this.registrarResposta(identificador)) return;
    try {
      const aviso = this.normalizar(
        resposta.notification.request.content.data,
      );
      if (aviso !== undefined) await receptor.abrir(aviso);
    } catch (erro) {
      this.respostasProcessadas.delete(identificador);
      const indice = this.ordemRespostasProcessadas.indexOf(identificador);
      if (indice >= 0) this.ordemRespostasProcessadas.splice(indice, 1);
      throw erro;
    }
  }

  private registrarResposta(identificador: string): boolean {
    if (this.respostasProcessadas.has(identificador)) return false;
    this.respostasProcessadas.add(identificador);
    this.ordemRespostasProcessadas.push(identificador);
    while (
      this.ordemRespostasProcessadas.length > LIMITE_RESPOSTAS_PROCESSADAS
    ) {
      const removido = this.ordemRespostasProcessadas.shift();
      if (removido !== undefined) this.respostasProcessadas.delete(removido);
    }
    return true;
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
