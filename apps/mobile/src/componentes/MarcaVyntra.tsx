import type { CoresTema } from '@vyntra/tema';
import { useEstilos } from '../aparencia/contexto-tema';
import { Text, View, StyleSheet } from 'react-native';

import { RAIOS } from '../tema';

export function MarcaVyntra({ compacta = false }: { readonly compacta?: boolean }) {
  const estilos = useEstilos(criarEstilos);
  return (
    <View accessibilityLabel="Vyntra Omni" style={estilos.linha}>
      <View style={[estilos.simbolo, compacta && estilos.simboloCompacto]}>
        <Text style={[estilos.letra, compacta && estilos.letraCompacta]}>V</Text>
      </View>
      {!compacta && <Text style={estilos.nome}>vyntra</Text>}
    </View>
  );
}

const criarEstilos = (CORES: CoresTema) => StyleSheet.create({
  letra: {
    color: CORES.textoInvertido,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -2,
  },
  letraCompacta: { fontSize: 17 },
  linha: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  nome: {
    color: CORES.texto,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -1,
  },
  simbolo: {
    alignItems: 'center',
    backgroundColor: CORES.acao,
    borderRadius: RAIOS.botao,
    height: 48,
    justifyContent: 'center',
    transform: [{ rotate: '-7deg' }],
    width: 48,
  },
  simboloCompacto: { borderRadius: 11, height: 34, width: 34 },
});
