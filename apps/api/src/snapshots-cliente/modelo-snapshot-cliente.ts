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
  readonly estado: 'ATUAL' | 'EXCLUIDO' | 'OBSOLETO';
  readonly motivoObsolescencia?:
    | 'AUSENTE_RECONCILIACAO_COMPLETA'
    | 'TOMBSTONE_ERP';
  readonly obsoletoEm?: Date;
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
  readonly estado: 'ATUAL' | 'EXCLUIDO' | 'OBSOLETO';
  readonly motivoObsolescencia?:
    | 'AUSENTE_RECONCILIACAO_COMPLETA'
    | 'TOMBSTONE_ERP';
  readonly obsoletoEm?: Date;
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

export interface EntradaObsolescenciaSnapshotCliente {
  readonly vinculoClienteId: string;
  readonly evidenciadaEm: Date;
  readonly motivo:
    | 'AUSENTE_RECONCILIACAO_COMPLETA'
    | 'TOMBSTONE_ERP';
}

export type ResultadoObsolescenciaSnapshotCliente =
  | {
      readonly situacao: 'ATUALIZADO' | 'IGNORADO_MAIS_ANTIGO' | 'REPETIDO';
      readonly snapshot: SnapshotClientePersistido;
    }
  | { readonly situacao: 'IGNORADO_SEM_SNAPSHOT' };
