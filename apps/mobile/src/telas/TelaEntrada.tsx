import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { ErroAutenticacaoMobile } from '../autenticacao/adaptador-autenticacao-http';
import {
  mensagemAutenticacao,
  type SessaoAplicativo,
} from '../autenticacao/servico-autenticacao-aplicativo';
import { BotaoPrimario } from '../componentes/BotaoPrimario';
import { MarcaVyntra } from '../componentes/MarcaVyntra';
import { CORES, ESPACOS, RAIOS } from '../tema';

export type RotasEntrada = {
  Entrada: undefined;
  PareamentoQr: undefined;
};

type Propriedades = NativeStackScreenProps<RotasEntrada, 'Entrada'> & {
  readonly aoAutenticar: (sessao: SessaoAplicativo) => void;
  readonly entrar: (
    identificador: string,
    senha: string,
    codigoMfa?: string,
  ) => Promise<SessaoAplicativo>;
};

export function TelaEntrada({ aoAutenticar, entrar, navigation }: Propriedades) {
  const [identificador, definirIdentificador] = useState('');
  const [senha, definirSenha] = useState('');
  const [codigoMfa, definirCodigoMfa] = useState('');
  const [mostrarSenha, definirMostrarSenha] = useState(false);
  const [solicitaMfa, definirSolicitaMfa] = useState(false);
  const [carregando, definirCarregando] = useState(false);
  const [erro, definirErro] = useState<string>();

  const podeEntrar =
    identificador.trim().length > 0 &&
    senha.length >= 12 &&
    (!solicitaMfa || codigoMfa.trim().length >= 6);

  async function enviar() {
    if (!podeEntrar || carregando) return;
    definirCarregando(true);
    definirErro(undefined);
    try {
      const sessao = await entrar(
        identificador,
        senha,
        solicitaMfa ? codigoMfa.trim() : undefined,
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      aoAutenticar(sessao);
    } catch (falha) {
      if (
        falha instanceof ErroAutenticacaoMobile &&
        falha.codigo === 'MFA_NECESSARIO'
      ) {
        definirSolicitaMfa(true);
      }
      definirErro(mensagemAutenticacao(falha));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      definirCarregando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={estilos.tela}
    >
      <ScrollView
        contentContainerStyle={estilos.conteudo}
        keyboardShouldPersistTaps="handled"
      >
        <View pointerEvents="none" style={estilos.orbeSuperior} />
        <View pointerEvents="none" style={estilos.orbeInferior} />

        <Animated.View
          entering={FadeInDown.duration(360).reduceMotion(ReduceMotion.System)}
          style={estilos.cartao}
        >
          <MarcaVyntra />
          <View style={estilos.apresentacao}>
            <Text accessibilityRole="header" style={estilos.titulo}>
              Seu atendimento, onde você estiver.
            </Text>
            <Text style={estilos.subtitulo}>
              Entre para continuar suas conversas com segurança.
            </Text>
          </View>

          <View style={estilos.formulario}>
            <View style={estilos.grupoCampo}>
              <Text style={estilos.rotulo}>Usuário</Text>
              <View style={estilos.campo}>
                <Ionicons color={CORES.textoSecundario} name="person-outline" size={20} />
                <TextInput
                  accessibilityLabel="Usuário"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!carregando}
                  maxLength={120}
                  onChangeText={definirIdentificador}
                  placeholder="seu.usuario"
                  placeholderTextColor="#8A9690"
                  returnKeyType="next"
                  style={estilos.entrada}
                  textContentType="username"
                  value={identificador}
                />
              </View>
            </View>

            <View style={estilos.grupoCampo}>
              <Text style={estilos.rotulo}>Senha</Text>
              <View style={estilos.campo}>
                <Ionicons color={CORES.textoSecundario} name="lock-closed-outline" size={20} />
                <TextInput
                  accessibilityLabel="Senha"
                  editable={!carregando}
                  maxLength={128}
                  onChangeText={definirSenha}
                  onSubmitEditing={() => void enviar()}
                  placeholder="Sua senha"
                  placeholderTextColor="#8A9690"
                  returnKeyType={solicitaMfa ? 'next' : 'go'}
                  secureTextEntry={!mostrarSenha}
                  style={estilos.entrada}
                  textContentType="password"
                  value={senha}
                />
                <Pressable
                  accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => definirMostrarSenha((atual) => !atual)}
                >
                  <Ionicons
                    color={CORES.textoSecundario}
                    name={mostrarSenha ? 'eye-off-outline' : 'eye-outline'}
                    size={21}
                  />
                </Pressable>
              </View>
            </View>

            {solicitaMfa && (
              <Animated.View
                entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)}
                style={estilos.grupoCampo}
              >
                <Text style={estilos.rotulo}>Código de segurança</Text>
                <View style={estilos.campo}>
                  <Ionicons color={CORES.textoSecundario} name="shield-checkmark-outline" size={20} />
                  <TextInput
                    accessibilityLabel="Código de segurança"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!carregando}
                    maxLength={23}
                    onChangeText={definirCodigoMfa}
                    onSubmitEditing={() => void enviar()}
                    placeholder="6 dígitos ou recuperação"
                    placeholderTextColor="#8A9690"
                    returnKeyType="go"
                    style={estilos.entrada}
                    textContentType="oneTimeCode"
                    value={codigoMfa}
                  />
                </View>
              </Animated.View>
            )}

            {erro !== undefined && (
              <View accessibilityLiveRegion="polite" style={estilos.avisoErro}>
                <Ionicons color={CORES.alerta} name="alert-circle-outline" size={19} />
                <Text style={estilos.textoErro}>{erro}</Text>
              </View>
            )}

            <BotaoPrimario
              carregando={carregando}
              desabilitado={!podeEntrar}
              onPress={() => void enviar()}
              texto={solicitaMfa ? 'Confirmar e entrar' : 'Entrar'}
            />
          </View>

          <View style={estilos.divisor}>
            <View style={estilos.linha} />
            <Text style={estilos.textoDivisor}>ou</Text>
            <View style={estilos.linha} />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={carregando}
            onPress={() => navigation.navigate('PareamentoQr')}
            style={({ pressed }) => [estilos.botaoQr, pressed && estilos.botaoQrPressionado]}
          >
            <View style={estilos.iconeQr}>
              <Ionicons color={CORES.acao} name="qr-code-outline" size={22} />
            </View>
            <View style={estilos.textoQr}>
              <Text style={estilos.tituloQr}>Entrar com QR Code</Text>
              <Text style={estilos.subtituloQr}>Leia o código exibido na versão web</Text>
            </View>
            <Ionicons color={CORES.textoSecundario} name="chevron-forward" size={20} />
          </Pressable>
        </Animated.View>

        <Text style={estilos.rodape}>Acesso protegido e vinculado a este aparelho</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  apresentacao: { gap: 10, marginTop: 34 },
  avisoErro: {
    alignItems: 'center',
    backgroundColor: CORES.alertaClara,
    borderRadius: RAIOS.campo,
    flexDirection: 'row',
    gap: 10,
    padding: 13,
  },
  botaoQr: {
    alignItems: 'center',
    borderColor: CORES.borda,
    borderRadius: RAIOS.campo,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    padding: 12,
  },
  botaoQrPressionado: { backgroundColor: CORES.fundo },
  campo: {
    alignItems: 'center',
    backgroundColor: CORES.fundo,
    borderColor: CORES.borda,
    borderRadius: RAIOS.campo,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 15,
  },
  cartao: {
    backgroundColor: CORES.superficie,
    borderColor: 'rgba(16, 25, 21, 0.06)',
    borderRadius: 30,
    borderWidth: 1,
    padding: ESPACOS.grande,
    shadowColor: '#0A2118',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 40,
  },
  conteudo: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 30,
    paddingHorizontal: 18,
    paddingTop: 54,
  },
  divisor: { alignItems: 'center', flexDirection: 'row', gap: 12, marginVertical: 22 },
  entrada: { color: CORES.texto, flex: 1, fontSize: 16, minHeight: 52, paddingVertical: 0 },
  formulario: { gap: ESPACOS.medio, marginTop: 30 },
  grupoCampo: { gap: ESPACOS.minimo },
  iconeQr: {
    alignItems: 'center',
    backgroundColor: CORES.acaoClara,
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  linha: { backgroundColor: CORES.borda, flex: 1, height: 1 },
  orbeInferior: {
    backgroundColor: '#D8F1E6',
    borderRadius: 160,
    bottom: -55,
    height: 210,
    position: 'absolute',
    right: -90,
    width: 210,
  },
  orbeSuperior: {
    backgroundColor: '#E7EFEA',
    borderRadius: 130,
    height: 180,
    left: -85,
    position: 'absolute',
    top: 8,
    width: 180,
  },
  rodape: { color: CORES.textoSecundario, fontSize: 12, marginTop: 24, textAlign: 'center' },
  rotulo: { color: CORES.texto, fontSize: 13, fontWeight: '600' },
  subtitulo: { color: CORES.textoSecundario, fontSize: 16, lineHeight: 23 },
  subtituloQr: { color: CORES.textoSecundario, fontSize: 12, marginTop: 3 },
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  textoDivisor: { color: CORES.textoSecundario, fontSize: 13 },
  textoErro: { color: CORES.alerta, flex: 1, fontSize: 13, lineHeight: 18 },
  textoQr: { flex: 1 },
  titulo: { color: CORES.texto, fontSize: 34, fontWeight: '700', letterSpacing: -1.2, lineHeight: 39 },
  tituloQr: { color: CORES.texto, fontSize: 15, fontWeight: '700' },
});
