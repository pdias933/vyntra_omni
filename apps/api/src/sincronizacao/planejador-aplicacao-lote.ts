import { ErroCursorSincronizacaoInvalido } from './erros-sincronizacao.js';
import type { LoteSincronizacaoIncremental } from './modelo-sincronizacao.js';

export class PlanejadorAplicacaoLote {
  public planejar(
    ultimaSequenciaAplicada: string,
    lote: LoteSincronizacaoIncremental,
  ): { readonly eventosNovos: LoteSincronizacaoIncremental['eventos']; readonly sequenciaParaPersistir: string } {
    const atual = this.ler(ultimaSequenciaAplicada);
    const final = this.ler(lote.sequenciaFinal);
    if (final < atual) throw new ErroCursorSincronizacaoInvalido();
    let anterior = atual;
    const eventosNovos = [];
    for (const evento of lote.eventos) {
      const sequencia = this.ler(evento.sequenciaEvento);
      if (sequencia <= atual) continue;
      if (sequencia <= anterior || sequencia > final) {
        throw new ErroCursorSincronizacaoInvalido();
      }
      eventosNovos.push(evento);
      anterior = sequencia;
    }
    return { eventosNovos, sequenciaParaPersistir: lote.sequenciaFinal };
  }

  private ler(valor: string): bigint {
    if (!/^(0|[1-9][0-9]{0,18})$/u.test(valor)) {
      throw new ErroCursorSincronizacaoInvalido();
    }
    return BigInt(valor);
  }
}
