import { Pressable, StyleSheet, Text, View } from 'react-native';
import { OPCOES_TEMA, type CoresTema } from '@vyntra/tema';
import { useEstilos, useTema } from './contexto-tema';

export function SeletorAparencia() {
  const { preferencia, escolher, erroPersistencia } = useTema();
  const estilos = useEstilos(criarEstilos);
  return (
    <View style={estilos.area}>
      <Text accessibilityRole="header" style={estilos.rotulo}>Aparência</Text>
      <View accessibilityRole="radiogroup" style={estilos.opcoes}>
        {OPCOES_TEMA.map((opcao) => (
          <Pressable
            key={opcao.valor}
            accessibilityRole="radio"
            accessibilityLabel={opcao.rotulo}
            accessibilityState={{ checked: preferencia === opcao.valor }}
            onPress={() => escolher(opcao.valor)}
            style={[estilos.opcao, preferencia === opcao.valor && estilos.selecionada]}
          >
            <Text style={[estilos.texto, preferencia === opcao.valor && estilos.textoSelecionado]}>
              {opcao.rotulo}
            </Text>
          </Pressable>
        ))}
      </View>
      {erroPersistencia && <Text accessibilityLiveRegion="polite" style={estilos.erro}>A aparência vale nesta abertura, mas não foi possível salvá-la.</Text>}
    </View>
  );
}

const criarEstilos = (cores: CoresTema) => StyleSheet.create({
  area: { gap: 8, paddingVertical: 12 },
  rotulo: { color: cores.textoSecundario, fontSize: 13, fontWeight: '600' },
  opcoes: { flexDirection: 'row', gap: 6 },
  opcao: { alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 44, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: cores.bordaForte, backgroundColor: cores.superficie },
  selecionada: { backgroundColor: cores.acaoClara, borderColor: cores.acao },
  texto: { color: cores.textoSecundario, fontSize: 13 },
  textoSelecionado: { color: cores.acao, fontWeight: '700' },
  erro: { color: cores.alerta, fontSize: 12 },
});
