import type {
  FluxoPersistido,
  VersaoFluxoPersistida,
} from './modelo-fluxo.js';

export interface FluxoEditorPersistido extends FluxoPersistido {
  readonly versoes: readonly VersaoFluxoPersistida[];
}
