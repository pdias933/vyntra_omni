import { useSyncExternalStore } from 'react';
import { TEMAS } from '@vyntra/tema';
import { criarControladorAparencia } from './controlador-aparencia';

const controlador = criarControladorAparencia(window);

export function useAparencia() {
  const estado = useSyncExternalStore(controlador.observar, controlador.obter);
  return { ...estado, cores: TEMAS[estado.modo], escolher: controlador.escolher };
}
