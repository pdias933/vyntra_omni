import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export type SituacaoConhecidaContratoSnapshot =
  | 'ATIVO'
  | 'ENCERRADO'
  | 'SUSPENSO'
  | 'DESCONHECIDO';

export interface ContratoConhecidoSnapshotCliente {
  readonly vinculoContratoId: string;
  readonly situacao: SituacaoConhecidaContratoSnapshot;
  readonly servico?: string;
  readonly enderecoResumido?: string;
}

export interface DadosSnapshotCliente {
  readonly nomeExibicao?: string;
  readonly documentoMascarado?: string;
  readonly telefoneMascarado?: string;
  readonly plano?: string;
  readonly velocidade?: string;
  readonly enderecosResumidos?: readonly string[];
  readonly contratosConhecidos?: readonly ContratoConhecidoSnapshotCliente[];
}

export interface EntradaAtualizacaoSnapshotCliente {
  readonly vinculoClienteId: string;
  readonly capturadoEm: Date;
  readonly dados: DadosSnapshotCliente;
}

export interface SnapshotClientePersistido {
  readonly id: string;
  readonly vinculoClienteId: string;
  readonly origem: 'INTEGRACAO_ERP';
  readonly dadosProtegidos: ObjetoJsonProtegido;
  readonly conteudoHash: string;
  readonly capturadoEm: Date;
  readonly persistidoEm: Date;
  readonly atualizadoEm: Date;
  readonly versao: number;
}

export interface LeituraSnapshotCliente {
  readonly origem: 'SNAPSHOT';
  readonly origemAtualizacao: 'INTEGRACAO_ERP';
  readonly vinculoClienteId: string;
  readonly dadosProtegidos: ObjetoJsonProtegido;
  readonly capturadoEm: Date;
  readonly idadeSegundos: number;
  readonly versao: number;
}

export interface ResultadoAtualizacaoSnapshotCliente {
  readonly situacao: 'ATUALIZADO' | 'IGNORADO_MAIS_ANTIGO' | 'REPETIDO';
  readonly snapshot: SnapshotClientePersistido;
}
