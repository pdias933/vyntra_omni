import type { CoresTema } from '@vyntra/tema';
import { useEstilos } from '../aparencia/contexto-tema';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { MarcaVyntra } from '../componentes/MarcaVyntra';
import { RAIOS } from '../tema';

export function TelaCarregamento({
  rotulo = 'Abrindo Vyntra Omni',
}: {
  readonly rotulo?: string;
}) {
  const estilos = useEstilos(criarEstilos);
  const opacidade = useSharedValue(0.38);
  useEffect(() => {
    opacidade.value = withRepeat(
      withTiming(1, {
        duration: 720,
        easing: Easing.inOut(Easing.ease),
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      true,
    );
  }, [opacidade]);
  const estiloAnimado = useAnimatedStyle(() => ({ opacity: opacidade.value }));

  return (
    <View accessibilityLabel={rotulo} style={estilos.tela}>
      <MarcaVyntra />
      <Animated.View style={[estilos.indicador, estiloAnimado]} />
    </View>
  );
}

const criarEstilos = (CORES: CoresTema) => StyleSheet.create({
  indicador: { backgroundColor: CORES.acao, borderRadius: RAIOS.pílula, height: 4, marginTop: 28, width: 38 },
  tela: { alignItems: 'center', backgroundColor: CORES.fundo, flex: 1, justifyContent: 'center' },
});
