import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SessaoAplicativo } from '../autenticacao/servico-autenticacao-aplicativo';
import { MarcaVyntra } from '../componentes/MarcaVyntra';
import { CORES, ESPACOS, RAIOS } from '../tema';

type NomeIcone = ComponentProps<typeof Ionicons>['name'];
type RotasPrincipais = {
  Atendimentos: undefined;
  Contatos: undefined;
  Notificações: undefined;
  Perfil: undefined;
};

const Abas = createBottomTabNavigator<RotasPrincipais>();

function TelaVazia({
  descricao,
  icone,
  titulo,
}: {
  readonly descricao: string;
  readonly icone: NomeIcone;
  readonly titulo: string;
}) {
  return (
    <SafeAreaView edges={['top']} style={estilos.tela}>
      <View style={estilos.cabecalho}>
        <View>
          <Text accessibilityRole="header" style={estilos.tituloTela}>
            {titulo}
          </Text>
          <Text style={estilos.contexto}>Vyntra Omni</Text>
        </View>
        <MarcaVyntra compacta />
      </View>
      <View style={estilos.estadoVazio}>
        <View style={estilos.iconeVazio}>
          <Ionicons color={CORES.acao} name={icone} size={34} />
        </View>
        <Text style={estilos.tituloVazio}>Tudo tranquilo por aqui</Text>
        <Text style={estilos.descricaoVazio}>{descricao}</Text>
      </View>
    </SafeAreaView>
  );
}

function Perfil({
  aoSair,
  carregando,
  sessao,
}: {
  readonly aoSair: () => void;
  readonly carregando: boolean;
  readonly sessao: SessaoAplicativo;
}) {
  const iniciais = sessao.nomeExibicao
    .split(/\s+/u)
    .slice(0, 2)
    .map((parte) => parte[0]?.toLocaleUpperCase('pt-BR'))
    .join('');
  return (
    <SafeAreaView edges={['top']} style={estilos.tela}>
      <View style={estilos.cabecalho}>
        <View>
          <Text accessibilityRole="header" style={estilos.tituloTela}>Perfil</Text>
          <Text style={estilos.contexto}>Conta e segurança</Text>
        </View>
        <MarcaVyntra compacta />
      </View>
      <View style={estilos.perfilConteudo}>
        {sessao.dispositivoSubstituido && (
          <View accessibilityLiveRegion="polite" style={estilos.avisoSubstituicao}>
            <Ionicons color={CORES.info} name="phone-portrait-outline" size={20} />
            <Text style={estilos.textoSubstituicao}>
              O aparelho mais antigo foi desconectado para manter o limite de dois dispositivos.
            </Text>
          </View>
        )}
        <View style={estilos.cartaoPerfil}>
          <View style={estilos.avatar}>
            <Text style={estilos.iniciais}>{iniciais || 'V'}</Text>
          </View>
          <View style={estilos.identidade}>
            <Text style={estilos.nome}>{sessao.nomeExibicao}</Text>
            <View style={estilos.protegida}>
              <Ionicons color={CORES.acao} name="shield-checkmark" size={15} />
              <Text style={estilos.textoProtegida}>Sessão protegida neste aparelho</Text>
            </View>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={carregando}
          onPress={aoSair}
          style={({ pressed }) => [estilos.sair, pressed && estilos.sairPressionado]}
        >
          <Ionicons color={CORES.alerta} name="log-out-outline" size={21} />
          <Text style={estilos.textoSair}>{carregando ? 'Saindo…' : 'Sair deste aparelho'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export function NavegacaoPrincipal({
  aoSair,
  saindo,
  sessao,
}: {
  readonly aoSair: () => void;
  readonly saindo: boolean;
  readonly sessao: SessaoAplicativo;
}) {
  const reduzirMovimento = useReducedMotion();

  return (
    <Abas.Navigator
      screenListeners={{
        tabPress: () => void Haptics.selectionAsync(),
      }}
      screenOptions={({ route }) => ({
        animation: reduzirMovimento ? 'none' : 'shift',
        headerShown: false,
        tabBarActiveTintColor: CORES.acao,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, focused, size }) => {
          const icones: Readonly<Record<keyof RotasPrincipais, NomeIcone>> = {
            Atendimentos: focused ? 'chatbubbles' : 'chatbubbles-outline',
            Contatos: focused ? 'people' : 'people-outline',
            Notificações: focused ? 'notifications' : 'notifications-outline',
            Perfil: focused ? 'person-circle' : 'person-circle-outline',
          };
          return <Ionicons color={color} name={icones[route.name]} size={size + 1} />;
        },
        tabBarInactiveTintColor: '#7B8681',
        tabBarLabelStyle: estilos.rotuloAba,
        tabBarStyle: estilos.barraAbas,
      })}
    >
      <Abas.Screen name="Atendimentos">
        {() => (
          <TelaVazia
            descricao="Seus atendimentos e pendências autorizadas aparecerão aqui."
            icone="chatbubbles-outline"
            titulo="Atendimentos"
          />
        )}
      </Abas.Screen>
      <Abas.Screen name="Contatos">
        {() => (
          <TelaVazia
            descricao="Contatos disponíveis para sua equipe aparecerão aqui."
            icone="people-outline"
            titulo="Contatos"
          />
        )}
      </Abas.Screen>
      <Abas.Screen name="Notificações">
        {() => (
          <TelaVazia
            descricao="Você não tem nenhuma notificação nova."
            icone="notifications-outline"
            titulo="Notificações"
          />
        )}
      </Abas.Screen>
      <Abas.Screen name="Perfil">
        {() => <Perfil aoSair={aoSair} carregando={saindo} sessao={sessao} />}
      </Abas.Screen>
    </Abas.Navigator>
  );
}

const estilos = StyleSheet.create({
  avatar: { alignItems: 'center', backgroundColor: CORES.acao, borderRadius: RAIOS.pílula, height: 62, justifyContent: 'center', width: 62 },
  avisoSubstituicao: { alignItems: 'center', backgroundColor: '#EAF0FF', borderRadius: RAIOS.campo, flexDirection: 'row', gap: 10, padding: 14 },
  barraAbas: { borderTopColor: CORES.borda, height: 76, paddingBottom: 9, paddingTop: 7 },
  cabecalho: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: ESPACOS.grande, paddingVertical: 18 },
  cartaoPerfil: { alignItems: 'center', backgroundColor: CORES.superficie, borderColor: CORES.borda, borderRadius: RAIOS.cartao, borderWidth: 1, flexDirection: 'row', gap: 16, padding: 18 },
  contexto: { color: CORES.textoSecundario, fontSize: 13, marginTop: 2 },
  descricaoVazio: { color: CORES.textoSecundario, fontSize: 14, lineHeight: 21, maxWidth: 290, textAlign: 'center' },
  estadoVazio: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  iconeVazio: { alignItems: 'center', backgroundColor: CORES.acaoClara, borderRadius: RAIOS.cartao, height: 68, justifyContent: 'center', marginBottom: 18, width: 68 },
  identidade: { flex: 1 },
  iniciais: { color: CORES.textoInvertido, fontSize: 20, fontWeight: '700' },
  nome: { color: CORES.texto, fontSize: 19, fontWeight: '700' },
  perfilConteudo: { gap: ESPACOS.medio, padding: ESPACOS.grande },
  protegida: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 7 },
  rotuloAba: { fontSize: 11, fontWeight: '600' },
  sair: { alignItems: 'center', backgroundColor: CORES.superficie, borderColor: CORES.borda, borderRadius: RAIOS.campo, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 54, paddingHorizontal: 17 },
  sairPressionado: { backgroundColor: CORES.alertaClara },
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  textoProtegida: { color: CORES.acao, flexShrink: 1, fontSize: 12, fontWeight: '600' },
  textoSair: { color: CORES.alerta, fontSize: 15, fontWeight: '600' },
  textoSubstituicao: { color: CORES.info, flex: 1, fontSize: 13, lineHeight: 19 },
  tituloTela: { color: CORES.texto, fontSize: 29, fontWeight: '800', letterSpacing: -0.8 },
  tituloVazio: { color: CORES.texto, fontSize: 18, fontWeight: '700', marginBottom: 7 },
});
