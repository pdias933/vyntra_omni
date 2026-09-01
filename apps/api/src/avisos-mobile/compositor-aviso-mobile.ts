import type { PayloadEventoPush } from '../sincronizacao/modelo-projecao-evento.js';
import type { AvisoMobile, TipoAvisoMobile } from './modelo-aviso-mobile.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CHAVES_PERMITIDAS = new Set([
  'atendimentoId',
  'audiencia',
  'chaveAgrupamento',
  'conversaId',
  'sequenciaEvento',
  'tipoNotificacao',
]);

const TEXTOS: Readonly<
  Record<TipoAvisoMobile, { readonly corpo: string; readonly titulo: string }>
> = {
  CLIENTE_AGUARDANDO: {
    corpo: 'Abra o app para atualizar o atendimento.',
    titulo: 'Cliente aguardando',
  },
  JANELA_EXPIRANDO: {
    corpo: 'Abra o app para consultar a janela de atendimento.',
    titulo: 'Janela próxima de expirar',
  },
  NOVA_MENSAGEM: {
    corpo: 'Abra o app para ver a atualização.',
    titulo: 'Nova mensagem',
  },
  NOVO_PENDENTE: {
    corpo: 'Abra o app para consultar a fila.',
    titulo: 'Novo atendimento pendente',
  },
  TRANSFERENCIA_DIRETA: {
    corpo: 'Abra o app para consultar o atendimento.',
    titulo: 'Atendimento transferido',
  },
};

export class CompositorAvisoMobile {
  public compor(
    destinatarioDispositivoId: string,
    evento: PayloadEventoPush,
  ): AvisoMobile {
    this.validarEvento(evento);
    if (!UUID.test(destinatarioDispositivoId)) {
      throw new Error('DESTINATARIO_AVISO_MOBILE_INVALIDO');
    }
    const chaveAgrupamento = evento.conversaId ?? evento.atendimentoId;
    if (chaveAgrupamento === undefined) {
      throw new Error('DESTINO_AVISO_MOBILE_AUSENTE');
    }
    const textos = TEXTOS[evento.tipoNotificacao];
    return {
      ...(evento.atendimentoId === undefined
        ? {}
        : { atendimentoId: evento.atendimentoId }),
      chaveAgrupamento,
      ...(evento.conversaId === undefined
        ? {}
        : { conversaId: evento.conversaId }),
      corpo: textos.corpo,
      destinatarioDispositivoId,
      sequenciaObservada: evento.sequenciaEvento,
      tipo: evento.tipoNotificacao,
      titulo: textos.titulo,
    };
  }

  private validarEvento(evento: PayloadEventoPush): void {
    if (
      evento.audiencia !== 'PUSH' ||
      !/^[1-9][0-9]{0,18}$/u.test(evento.sequenciaEvento) ||
      !(evento.tipoNotificacao in TEXTOS) ||
      (evento.atendimentoId !== undefined &&
        !UUID.test(evento.atendimentoId)) ||
      (evento.conversaId !== undefined && !UUID.test(evento.conversaId)) ||
      (evento.chaveAgrupamento !== undefined &&
        evento.chaveAgrupamento !== evento.conversaId) ||
      Object.keys(evento).some((chave) => !CHAVES_PERMITIDAS.has(chave))
    ) {
      throw new Error('EVENTO_AVISO_MOBILE_INVALIDO');
    }
  }
}
