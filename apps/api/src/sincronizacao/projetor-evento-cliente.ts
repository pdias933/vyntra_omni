import type { EventoDominio } from '../eventos/modelo-eventos.js';
import type {
  AudienciaEventoCliente,
  ContextoAutorizacaoProjecao,
  PayloadEventoCliente,
  PayloadEventoMobile,
  PayloadEventoPush,
  PayloadEventoWeb,
  ValorDadoEventoCliente,
} from './modelo-projecao-evento.js';

const CHAVES_PERMITIDAS = new Set([
  'contadorNaoLidas',
  'estado',
  'expiraEm',
  'filaId',
  'formularioId',
  'marco',
  'nivel',
  'origem',
  'tipo',
  'usuarioResponsavelId',
  'versao',
  'versaoAtribuicao',
  'versaoPermissoes',
  'visibilidade',
]);

const TIPOS_PUBLICAVEIS = new Set([
  'ATENDIMENTO_ASSUMIDO_POR_SUPERVISOR',
  'ATENDIMENTO_CRIADO',
  'ATENDIMENTO_ENCERRADO',
  'ATENDIMENTO_RESGATADO',
  'ATENDIMENTO_TRANSFERIDO_PARA_FILA',
  'ATENDIMENTO_TRANSFERIDO_PARA_USUARIO',
  'CLIENTE_AGUARDANDO',
  'DISPARO_TRANSACIONAL_CRIADO',
  'ESTADO_MENSAGEM_ATUALIZADO',
  'FORMULARIO_RECEBIDO',
  'JANELA_CANAL_ATUALIZADA_POR_ENTRADA',
  'JANELA_EXPIRANDO',
  'MENSAGEM_ENTRADA_PERSISTIDA',
  'MENSAGEM_RECEBIDA',
  'MENSAGEM_SAIDA_CRIADA',
  'NOTA_INTERNA_ADICIONADA',
  'PERMISSOES_ALTERADAS',
  'SLA_OBRIGACAO_HUMANA_CONCLUIDA',
  'SLA_OBRIGACAO_HUMANA_INICIADA',
]);

const TIPOS_PUSH = new Map<string, PayloadEventoPush['tipoNotificacao']>([
  ['ATENDIMENTO_CRIADO', 'NOVO_PENDENTE'],
  ['ATENDIMENTO_TRANSFERIDO_PARA_USUARIO', 'TRANSFERENCIA_DIRETA'],
  ['CLIENTE_AGUARDANDO', 'CLIENTE_AGUARDANDO'],
  ['JANELA_EXPIRANDO', 'JANELA_EXPIRANDO'],
  ['MENSAGEM_RECEBIDA', 'NOVA_MENSAGEM'],
]);

export class ProjetorEventoCliente {
  public projetar(
    evento: EventoDominio,
    audiencia: AudienciaEventoCliente,
    autorizacao: ContextoAutorizacaoProjecao,
  ): PayloadEventoCliente | undefined {
    if (!this.autorizado(evento, autorizacao)) return undefined;
    if (audiencia === 'PUSH') return this.projetarPush(evento, autorizacao);

    const base = {
      ...(evento.atendimentoId === undefined
        ? {}
        : { atendimentoId: evento.atendimentoId }),
      ...(evento.conversaId === undefined
        ? {}
        : { conversaId: evento.conversaId }),
      entidadeId: evento.entidadeId,
      entidadeTipo: evento.entidadeTipo,
      ocorridoEm: evento.criadoEm.toISOString(),
      sequenciaEvento: evento.sequenciaEvento.toString(),
      tipo: TIPOS_PUBLICAVEIS.has(evento.tipo)
        ? evento.tipo
        : 'RECURSO_ATUALIZADO',
    };
    const dados = this.projetarDados(evento, autorizacao);
    if (audiencia === 'WEB') {
      return { ...base, audiencia: 'WEB', dados } satisfies PayloadEventoWeb;
    }
    return {
      ...base,
      audiencia: 'MOBILE',
      dados,
      politicaCache:
        evento.classificacaoDados === 'OPERACIONAL'
          ? 'OPERACIONAL'
          : 'PROTEGIDO',
    } satisfies PayloadEventoMobile;
  }

  private autorizado(
    evento: EventoDominio,
    autorizacao: ContextoAutorizacaoProjecao,
  ): boolean {
    if (!autorizacao.sessaoValida) return false;
    if (evento.tipo === 'PERMISSOES_ALTERADAS') {
      return evento.entidadeTipo === 'USUARIO' && evento.entidadeId === autorizacao.usuarioId;
    }
    return autorizacao.recursoAcessivel;
  }

  private projetarDados(
    evento: EventoDominio,
    autorizacao: ContextoAutorizacaoProjecao,
  ): Readonly<Record<string, ValorDadoEventoCliente>> {
    const podeVerClassificacao =
      evento.classificacaoDados === 'OPERACIONAL' ||
      (evento.classificacaoDados === 'DADO_PESSOAL' &&
        autorizacao.podeVerDadoPessoal) ||
      (evento.classificacaoDados === 'DADO_SENSIVEL' &&
        autorizacao.podeVerDadoSensivel);
    if (!podeVerClassificacao || !TIPOS_PUBLICAVEIS.has(evento.tipo)) return {};

    const dados: Record<string, ValorDadoEventoCliente> = {};
    for (const [chave, valor] of Object.entries(
      evento.dadosProtegidosMinimizados,
    )) {
      if (
        CHAVES_PERMITIDAS.has(chave) &&
        (valor === null ||
          typeof valor === 'boolean' ||
          typeof valor === 'number' ||
          typeof valor === 'string')
      ) {
        dados[chave] = valor;
      }
    }
    return dados;
  }

  private projetarPush(
    evento: EventoDominio,
    autorizacao: ContextoAutorizacaoProjecao,
  ): PayloadEventoPush | undefined {
    if (!autorizacao.podeReceberPush) return undefined;
    const tipoNotificacao = TIPOS_PUSH.get(evento.tipo);
    if (tipoNotificacao === undefined) return undefined;
    return {
      audiencia: 'PUSH',
      ...(evento.atendimentoId === undefined
        ? {}
        : { atendimentoId: evento.atendimentoId }),
      ...(evento.conversaId === undefined
        ? {}
        : {
            chaveAgrupamento: evento.conversaId,
            conversaId: evento.conversaId,
          }),
      sequenciaEvento: evento.sequenciaEvento.toString(),
      tipoNotificacao,
    };
  }
}
