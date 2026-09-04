import type { CoresTema } from '@vyntra/tema';
import { useTema, useEstilos } from '../aparencia/contexto-tema';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotaoPrimario } from '../componentes/BotaoPrimario';
import { MarcaVyntra } from '../componentes/MarcaVyntra';
import { ESPACOS, RAIOS } from '../tema';

export function TelaBloqueio({
  carregando,
  indisponivel,
  mensagem,
  aoDesbloquear,
  aoUsarSenha,
}: {
  readonly carregando: boolean;
  readonly indisponivel: boolean;
  readonly mensagem?: string;
  readonly aoDesbloquear: () => void;
  readonly aoUsarSenha: () => void;
}) {
  const { cores: CORES } = useTema();
  const estilos = useEstilos(criarEstilos);
  return (
    <SafeAreaView style={estilos.tela}>
      <View style={estilos.marca}>
        <MarcaVyntra />
      </View>
      <Animated.View
        entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
        style={estilos.conteudo}
      >
        <View style={estilos.icone}>
          <Ionicons color={CORES.acao} name="finger-print-outline" size={44} />
        </View>
        <Text accessibilityRole="header" style={estilos.titulo}>
          Vyntra Omni está bloqueado
        </Text>
        <Text style={estilos.descricao}>
          {indisponivel
            ? 'Cadastre biometria ou um código de bloqueio seguro no aparelho para usar o acesso rápido.'
            : mensagem ?? 'Use a biometria ou o código do aparelho para continuar.'}
        </Text>
        <View style={estilos.acoes}>
          <BotaoPrimario
            carregando={carregando}
            desabilitado={indisponivel}
            onPress={aoDesbloquear}
            texto="Desbloquear"
          />
          <Pressable
            accessibilityRole="button"
            disabled={carregando}
            onPress={aoUsarSenha}
            style={({ pressed }) => [estilos.senha, pressed && estilos.senhaPressionada]}
          >
            <Text style={estilos.textoSenha}>Sair e entrar com senha</Text>
          </Pressable>
        </View>
      </Animated.View>
      <View style={estilos.rodape}>
        <Ionicons color={CORES.textoSecundario} name="shield-checkmark-outline" size={17} />
        <Text style={estilos.textoRodape}>Seus tokens não ficam no histórico nem no banco local.</Text>
      </View>
    </SafeAreaView>
  );
}

const criarEstilos = (CORES: CoresTema) => StyleSheet.create({
  acoes: { alignSelf: 'stretch', gap: ESPACOS.pequeno, marginTop: 34 },
  conteudo: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 30 },
  descricao: { color: CORES.textoSecundario, fontSize: 15, lineHeight: 22, maxWidth: 330, textAlign: 'center' },
  icone: { alignItems: 'center', backgroundColor: CORES.acaoClara, borderRadius: RAIOS.cartao, height: 82, justifyContent: 'center', marginBottom: 24, width: 82 },
  marca: { paddingHorizontal: ESPACOS.grande, paddingTop: ESPACOS.medio },
  rodape: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', padding: ESPACOS.grande },
  senha: { alignItems: 'center', borderRadius: RAIOS.botao, height: 50, justifyContent: 'center' },
  senhaPressionada: { backgroundColor: CORES.skeleton },
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  textoRodape: { color: CORES.textoSecundario, flexShrink: 1, fontSize: 12 },
  textoSenha: { color: CORES.texto, fontSize: 14, fontWeight: '600' },
  titulo: { color: CORES.texto, fontSize: 27, fontWeight: '700', letterSpacing: -0.7, marginBottom: 10, textAlign: 'center' },
});
