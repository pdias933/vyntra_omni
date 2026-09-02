import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { CORES, RAIOS } from '../tema';

export function BotaoPrimario({
  carregando = false,
  desabilitado = false,
  onPress,
  texto,
}: {
  readonly carregando?: boolean;
  readonly desabilitado?: boolean;
  readonly onPress: () => void;
  readonly texto: string;
}) {
  const indisponivel = carregando || desabilitado;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={indisponivel}
      onPress={onPress}
      style={({ pressed }) => [
        estilos.botao,
        indisponivel && estilos.desabilitado,
        pressed && !indisponivel && estilos.pressionado,
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={CORES.textoInvertido} />
      ) : (
        <Text style={estilos.texto}>{texto}</Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  botao: {
    alignItems: 'center',
    backgroundColor: CORES.acao,
    borderRadius: RAIOS.botao,
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  desabilitado: { opacity: 0.48 },
  pressionado: { backgroundColor: CORES.acaoPressionada, transform: [{ scale: 0.99 }] },
  texto: { color: CORES.textoInvertido, fontSize: 16, fontWeight: '700' },
});
