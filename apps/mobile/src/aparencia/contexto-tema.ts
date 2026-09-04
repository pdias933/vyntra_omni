import { createContext, useContext, useMemo } from 'react';
import type { CoresTema, ModoTema, PreferenciaTema } from '@vyntra/tema';

export interface AparenciaMobile {
  readonly cores: CoresTema;
  readonly modo: ModoTema;
  readonly preferencia: PreferenciaTema;
  readonly erroPersistencia: boolean;
  readonly escolher: (preferencia: PreferenciaTema) => void;
}

export const ContextoTema = createContext<AparenciaMobile | undefined>(undefined);

export function useTema(): AparenciaMobile {
  const contexto = useContext(ContextoTema);
  if (contexto === undefined) throw new Error('PROVEDOR_TEMA_AUSENTE');
  return contexto;
}

export function useEstilos<T>(criar: (cores: CoresTema) => T): T {
  const { cores } = useTema();
  return useMemo(() => criar(cores), [criar, cores]);
}
