import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export function Aplicacao() {
  return (
    <View style={estilos.conteudo}>
      <Text accessibilityRole="header" style={estilos.titulo}>
        Omnichannel V1
      </Text>
      <Text>Fundação técnica pronta para receber a experiência mobile.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const estilos = StyleSheet.create({
  conteudo: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
});
