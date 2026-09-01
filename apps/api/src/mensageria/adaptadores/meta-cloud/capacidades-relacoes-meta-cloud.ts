import type { CapacidadesRelacoesCanal } from '../../../mensagens/relacoes-mensagem.js';
import type { CaracterizacaoMetaCloud } from './caracterizacao-meta-cloud.js';

export function projetarCapacidadesRelacoesMetaCloud(
  caracterizacao: CaracterizacaoMetaCloud,
): CapacidadesRelacoesCanal {
  return {
    previaUrl: caracterizacao.capacidades.urlPreview === 'HABILITADA',
    reacaoNativa: caracterizacao.capacidades.reactions === 'HABILITADA',
    respostaNativa: caracterizacao.capacidades.replyContext === 'HABILITADA',
  };
}
