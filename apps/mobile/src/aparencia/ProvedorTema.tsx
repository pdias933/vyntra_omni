import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { normalizarPreferenciaTema, resolverModoTema, TEMAS, type PreferenciaTema } from '@vyntra/tema';
import { ContextoTema } from './contexto-tema';

const CHAVE_APARENCIA = 'vyntra.aparencia.v1';

function lerPreferencia(): { preferencia: PreferenciaTema; erro: boolean } {
  try {
    return { preferencia: normalizarPreferenciaTema(SecureStore.getItem(CHAVE_APARENCIA)), erro: false };
  } catch {
    return { preferencia: 'sistema', erro: true };
  }
}

export function ProvedorTema({ children }: { readonly children: ReactNode }) {
  const [inicial] = useState(lerPreferencia);
  const [preferencia, definirPreferencia] = useState(inicial.preferencia);
  const [erroPersistencia, definirErro] = useState(inicial.erro);
  const sistema = useColorScheme();
  const gravacoes = useRef(Promise.resolve());
  const revisao = useRef(0);
  const modo = resolverModoTema(preferencia, sistema === 'dark');

  useEffect(() => {
    Appearance.setColorScheme(preferencia === 'sistema' ? 'unspecified' : preferencia === 'escuro' ? 'dark' : 'light');
  }, [preferencia]);

  const escolher = useCallback((valor: PreferenciaTema) => {
    const proxima = normalizarPreferenciaTema(valor);
    definirPreferencia(proxima);
    const atual = ++revisao.current;
    // Serialização impede que uma escrita lenta sobrescreva a última escolha.
    gravacoes.current = gravacoes.current.then(async () => {
      try {
        await SecureStore.setItemAsync(CHAVE_APARENCIA, proxima);
        if (revisao.current === atual) definirErro(false);
      } catch {
        if (revisao.current === atual) definirErro(true);
      }
    });
  }, []);

  const valor = useMemo(() => ({
    cores: TEMAS[modo], modo, preferencia, erroPersistencia, escolher,
  }), [modo, preferencia, erroPersistencia, escolher]);

  return <ContextoTema.Provider value={valor}>{children}</ContextoTema.Provider>;
}
