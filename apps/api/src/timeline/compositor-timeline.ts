import {
  TIPOS_ITEM_TIMELINE,
  type FontesTimeline,
  type ItemTimeline,
} from './modelo-timeline.js';

const TIPOS_VALIDOS = new Set<string>(TIPOS_ITEM_TIMELINE);
const PRIORIDADE_TIPO = new Map<string, number>(
  TIPOS_ITEM_TIMELINE.map((tipo, indice) => [tipo, indice]),
);

export class CompositorTimeline {
  public compor(fontes: FontesTimeline): readonly ItemTimeline[] {
    const itens: ItemTimeline[] = [
      ...fontes.mensagens,
      ...fontes.notasInternas,
      ...fontes.eventosOperacionais,
      ...fontes.formularios,
      ...fontes.separadoresAtendimento,
    ];
    for (const item of itens) this.validar(item);
    return Object.freeze(itens.sort((a, b) => this.comparar(a, b)));
  }

  private comparar(a: ItemTimeline, b: ItemTimeline): number {
    const tempo = a.ocorridoEm.getTime() - b.ocorridoEm.getTime();
    if (tempo !== 0) return tempo;
    if (a.sequenciaEvento !== b.sequenciaEvento) {
      return a.sequenciaEvento < b.sequenciaEvento ? -1 : 1;
    }
    const tipo = (PRIORIDADE_TIPO.get(a.tipo) ?? 99) -
      (PRIORIDADE_TIPO.get(b.tipo) ?? 99);
    return tipo === 0 ? a.id.localeCompare(b.id) : tipo;
  }

  private validar(item: ItemTimeline): void {
    if (
      !TIPOS_VALIDOS.has(item.tipo) ||
      !(item.ocorridoEm instanceof Date) ||
      !Number.isFinite(item.ocorridoEm.getTime()) ||
      typeof item.sequenciaEvento !== 'bigint' ||
      item.sequenciaEvento < 1n ||
      item.id.length === 0
    ) {
      throw new Error('ITEM_TIMELINE_INVALIDO');
    }
  }
}
