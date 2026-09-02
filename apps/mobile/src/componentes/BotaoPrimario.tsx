import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { CORES, RAIOS } from '../tema';

export function BotaoPrimario({
  carregando = false,
  desabilitado = false,
  onPress,
  texto,
  variante = 'primario',
}: {
  readonly carregando?: boolean;
  readonly desabilitado?: boolean;
  readonly onPress: () => void;
  readonly texto: string;
  readonly variante?: 'primario' | 'secundario';
}) {
  const indisponivel = carregando || desabilitado;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={indisponivel}
      onPress={onPress}
      style={({ pressed }) => [
        estilos.botao,
        variante === 'secundario' && estilos.secundario,
        indisponivel && estilos.desabilitado,
        pressed && !indisponivel &&
          (variante === 'secundario'
            ? estilos.secundarioPressionado
            : estilos.pressionado),
      ]}
    >
      {carregando ? (
        <ActivityIndicator
          color={
            variante === 'secundario' ? CORES.acao : CORES.textoInvertido
          }
        />
      ) : (
        <Text
          style={[
            estilos.texto,
            variante === 'secundario' && estilos.textoSecundario,
          ]}
        >
          {texto}
        </Text>
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
  secundario: { backgroundColor: CORES.superficie, borderColor: CORES.borda, borderWidth: 1 },
  secundarioPressionado: { backgroundColor: CORES.acaoClara, transform: [{ scale: 0.99 }] },
  texto: { color: CORES.textoInvertido, fontSize: 16, fontWeight: '700' },
  textoSecundario: { color: CORES.acao },
});
