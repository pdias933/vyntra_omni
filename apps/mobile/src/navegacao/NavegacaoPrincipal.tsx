import type { CoresTema } from '@vyntra/tema';
import { useTema, useEstilos } from '../aparencia/contexto-tema';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { type ComponentProps, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SeletorAparencia } from '../aparencia/SeletorAparencia';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SessaoAplicativo } from '../autenticacao/servico-autenticacao-aplicativo';
import type { PoliticaVersaoAplicativo } from '../atualizacao/adaptador-politica-versao-http';
import type { ServicoAtendimentosMobile } from '../atendimentos/servico-atendimentos-mobile';
import type { CaixaAvisosMobile } from '../avisos/caixa-avisos-mobile';
import type { AvisoMobileRecebido } from '../avisos/modelo-aviso-mobile';
import { MarcaVyntra } from '../componentes/MarcaVyntra';
import type { ServicoDiagnosticoMobile } from '../diagnostico/servico-diagnostico-mobile';
import type {
  RepositorioReplicaLocal,
  ResumoAtendimentoLocal,
} from '../offline/repositorio-replica-local';
import type { ServicoPendenciasSaidaMobile } from '../offline/servico-pendencias-saida-mobile';
import type { EstadoSincronizacaoMobile } from '../sincronizacao/motor-sincronizacao-mobile';
import { TelaListaAtendimentos } from '../telas/TelaListaAtendimentos';
import { TelaNotificacoesMobile } from '../telas/TelaNotificacoesMobile';
import { TelaConversaMobile } from '../telas/TelaConversaMobile';
import { TelaDetalhesContatoMobile } from '../telas/TelaDetalhesContatoMobile';
import { TelaDiagnosticoMobile } from '../telas/TelaDiagnosticoMobile';
import { ESPACOS, RAIOS } from '../tema';

type NomeIcone = ComponentProps<typeof Ionicons>['name'];
export type RotasAtendimentos = {
  Conversa: { atendimento: ResumoAtendimentoLocal };
  Detalhes: { atendimento: ResumoAtendimentoLocal };
  Lista: undefined;
};
export type RotasPrincipais = {
  Atendimentos: NavigatorScreenParams<RotasAtendimentos> | undefined;
  Contatos: undefined;
  Notificações: undefined;
  Perfil: NavigatorScreenParams<RotasPerfil> | undefined;
};
type RotasPerfil = { Diagnostico: undefined; Resumo: undefined };

const Abas = createBottomTabNavigator<RotasPrincipais>();
const PilhaAtendimentos = createNativeStackNavigator<RotasAtendimentos>();
const PilhaPerfil = createNativeStackNavigator<RotasPerfil>();

function FluxoAtendimentos({
  acessoOffline,
  estadoSincronizacao,
  repositorio,
  servico,
  servicoPendencias,
  usuarioId,
}: {
  readonly acessoOffline: boolean;
  readonly estadoSincronizacao: EstadoSincronizacaoMobile;
  readonly repositorio: RepositorioReplicaLocal;
  readonly servico: ServicoAtendimentosMobile;
  readonly servicoPendencias: ServicoPendenciasSaidaMobile;
  readonly usuarioId: string;
}) {
  const reduzirMovimento = useReducedMotion();
  return (
    <PilhaAtendimentos.Navigator
      screenOptions={{
        animation: reduzirMovimento ? 'none' : 'slide_from_right',
        headerShown: false,
      }}
    >
      <PilhaAtendimentos.Screen name="Lista">
        {({ navigation }) => (
          <TelaListaAtendimentos
            aoAbrirAtendimento={(atendimento) =>
              navigation.navigate('Conversa', { atendimento })
            }
            estadoSincronizacao={estadoSincronizacao}
            repositorio={repositorio}
            usuarioId={usuarioId}
          />
        )}
      </PilhaAtendimentos.Screen>
      <PilhaAtendimentos.Screen name="Conversa">
        {({ navigation, route }) => (
          <TelaConversaMobile
            acessoOffline={acessoOffline}
            aoAbrirDetalhes={() =>
              navigation.navigate('Detalhes', {
                atendimento: route.params.atendimento,
              })
            }
            aoVoltar={() => navigation.goBack()}
            atendimento={route.params.atendimento}
            repositorio={repositorio}
            servico={servico}
            servicoPendencias={servicoPendencias}
            usuarioId={usuarioId}
          />
        )}
      </PilhaAtendimentos.Screen>
      <PilhaAtendimentos.Screen name="Detalhes">
        {({ navigation, route }) => (
          <TelaDetalhesContatoMobile
            acessoOffline={acessoOffline}
            aoVoltar={() => navigation.goBack()}
            atendimento={route.params.atendimento}
            servico={servico}
          />
        )}
      </PilhaAtendimentos.Screen>
    </PilhaAtendimentos.Navigator>
  );
}

function TelaVazia({
  descricao,
  icone,
  titulo,
}: {
  readonly descricao: string;
  readonly icone: NomeIcone;
  readonly titulo: string;
}) {
  const { cores: CORES } = useTema();
  const estilos = useEstilos(criarEstilos);
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
  abrindoLoja,
  aoAbrirDiagnostico,
  aoAtualizar,
  aoSair,
  carregando,
  erroAtualizacao,
  politicaVersao,
  sessao,
}: {
  readonly abrindoLoja: boolean;
  readonly aoAbrirDiagnostico: () => void;
  readonly aoAtualizar: () => void;
  readonly aoSair: () => void;
  readonly carregando: boolean;
  readonly erroAtualizacao?: string;
  readonly politicaVersao?: PoliticaVersaoAplicativo;
  readonly sessao: SessaoAplicativo;
}) {
  const { cores: CORES } = useTema();
  const estilos = useEstilos(criarEstilos);
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
      <ScrollView contentContainerStyle={estilos.perfilConteudo}>
        <SeletorAparencia />
        {sessao.dispositivoSubstituido && (
          <View accessibilityLiveRegion="polite" style={estilos.avisoSubstituicao}>
            <Ionicons color={CORES.info} name="phone-portrait-outline" size={20} />
            <Text style={estilos.textoSubstituicao}>
              O aparelho mais antigo foi desconectado para manter o limite de dois dispositivos.
            </Text>
          </View>
        )}
        {politicaVersao?.atualizacaoRecomendada === true && (
          <View accessibilityLiveRegion="polite" style={estilos.avisoAtualizacao}>
            <View style={estilos.iconeAtualizacao}>
              <Ionicons color={CORES.info} name="arrow-up-circle-outline" size={22} />
            </View>
            <View style={estilos.textoAtualizacao}>
              <Text style={estilos.tituloAtualizacao}>Atualização disponível</Text>
              <Text style={estilos.descricaoAtualizacao}>
                Versão recomendada {politicaVersao.versaoRecomendada}. Você pode continuar trabalhando.
              </Text>
              {erroAtualizacao !== undefined && (
                <Text style={estilos.erroAtualizacao}>{erroAtualizacao}</Text>
              )}
            </View>
            <Pressable
              accessibilityLabel="Abrir loja para atualizar"
              accessibilityRole="button"
              disabled={abrindoLoja}
              onPress={aoAtualizar}
              style={({ pressed }) => [estilos.atualizar, pressed && estilos.atualizarPressionado]}
            >
              <Text style={estilos.textoAtualizar}>{abrindoLoja ? 'Abrindo…' : 'Atualizar'}</Text>
            </Pressable>
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
          accessibilityHint="Mostra informações técnicas sem conteúdo de conversa"
          accessibilityRole="button"
          onPress={aoAbrirDiagnostico}
          style={({ pressed }) => [
            estilos.opcaoPerfil,
            pressed && estilos.opcaoPerfilPressionada,
          ]}
        >
          <View style={estilos.iconeOpcaoPerfil}>
            <Ionicons color={CORES.info} name="pulse-outline" size={21} />
          </View>
          <View style={estilos.textoOpcaoPerfil}>
            <Text style={estilos.tituloOpcaoPerfil}>Diagnóstico</Text>
            <Text style={estilos.descricaoOpcaoPerfil}>
              Conexão, versão e falhas sanitizadas
            </Text>
          </View>
          <Ionicons color={CORES.textoSecundario} name="chevron-forward" size={19} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={carregando}
          onPress={aoSair}
          style={({ pressed }) => [estilos.sair, pressed && estilos.sairPressionado]}
        >
          <Ionicons color={CORES.alerta} name="log-out-outline" size={21} />
          <Text style={estilos.textoSair}>{carregando ? 'Saindo…' : 'Sair deste aparelho'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function FluxoPerfil({
  abrindoLoja,
  aoAtualizar,
  aoSair,
  carregando,
  erroAtualizacao,
  politicaVersao,
  servicoDiagnostico,
  sessao,
}: {
  readonly abrindoLoja: boolean;
  readonly aoAtualizar: () => void;
  readonly aoSair: () => void;
  readonly carregando: boolean;
  readonly erroAtualizacao?: string;
  readonly politicaVersao?: PoliticaVersaoAplicativo;
  readonly servicoDiagnostico: ServicoDiagnosticoMobile;
  readonly sessao: SessaoAplicativo;
}) {
  const reduzirMovimento = useReducedMotion();
  return (
    <PilhaPerfil.Navigator
      screenOptions={{
        animation: reduzirMovimento ? 'none' : 'slide_from_right',
        headerShown: false,
      }}
    >
      <PilhaPerfil.Screen name="Resumo">
        {({ navigation }) => (
          <Perfil
            abrindoLoja={abrindoLoja}
            aoAbrirDiagnostico={() => navigation.navigate('Diagnostico')}
            aoAtualizar={aoAtualizar}
            aoSair={aoSair}
            carregando={carregando}
            {...(erroAtualizacao === undefined ? {} : { erroAtualizacao })}
            {...(politicaVersao === undefined ? {} : { politicaVersao })}
            sessao={sessao}
          />
        )}
      </PilhaPerfil.Screen>
      <PilhaPerfil.Screen name="Diagnostico">
        {({ navigation }) => (
          <TelaDiagnosticoMobile
            aoVoltar={() => navigation.goBack()}
            servico={servicoDiagnostico}
          />
        )}
      </PilhaPerfil.Screen>
    </PilhaPerfil.Navigator>
  );
}

export function NavegacaoPrincipal({
  abrindoLoja,
  aoAbrirAviso,
  aoAtualizar,
  aoSair,
  caixaAvisos,
  erroAtualizacao,
  estadoSincronizacao,
  politicaVersao,
  repositorio,
  servicoAtendimentos,
  servicoDiagnostico,
  servicoPendencias,
  saindo,
  sessao,
}: {
  readonly abrindoLoja: boolean;
  readonly aoAbrirAviso: (aviso: AvisoMobileRecebido) => Promise<void>;
  readonly aoAtualizar: () => void;
  readonly aoSair: () => void;
  readonly caixaAvisos: CaixaAvisosMobile;
  readonly erroAtualizacao?: string;
  readonly estadoSincronizacao: EstadoSincronizacaoMobile;
  readonly politicaVersao?: PoliticaVersaoAplicativo;
  readonly repositorio: RepositorioReplicaLocal;
  readonly servicoAtendimentos: ServicoAtendimentosMobile;
  readonly servicoDiagnostico: ServicoDiagnosticoMobile;
  readonly servicoPendencias: ServicoPendenciasSaidaMobile;
  readonly saindo: boolean;
  readonly sessao: SessaoAplicativo;
}) {
  const { cores: CORES } = useTema();
  const estilos = useEstilos(criarEstilos);
  const reduzirMovimento = useReducedMotion();
  const [quantidadeAvisos, definirQuantidadeAvisos] = useState(
    () => caixaAvisos.listar().length,
  );

  useEffect(
    () =>
      caixaAvisos.observar(() =>
        definirQuantidadeAvisos(caixaAvisos.listar().length),
      ),
    [caixaAvisos],
  );

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
        tabBarInactiveTintColor: CORES.textoSecundario,
        tabBarLabelStyle: estilos.rotuloAba,
        tabBarStyle: estilos.barraAbas,
      })}
    >
      <Abas.Screen name="Atendimentos">
        {() => (
          <FluxoAtendimentos
            acessoOffline={estadoSincronizacao !== 'CONECTADO'}
            estadoSincronizacao={estadoSincronizacao}
            repositorio={repositorio}
            servico={servicoAtendimentos}
            servicoPendencias={servicoPendencias}
            usuarioId={sessao.usuarioId}
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
      <Abas.Screen
        name="Notificações"
        options={{
          ...(quantidadeAvisos === 0 ? {} : { tabBarBadge: quantidadeAvisos }),
          tabBarBadgeStyle: estilos.badgeAba,
        }}
      >
        {() => (
          <TelaNotificacoesMobile
            aoAbrir={(grupo) => aoAbrirAviso(grupo.aviso)}
            caixa={caixaAvisos}
          />
        )}
      </Abas.Screen>
      <Abas.Screen name="Perfil">
        {() => (
          <FluxoPerfil
            abrindoLoja={abrindoLoja}
            aoAtualizar={aoAtualizar}
            aoSair={aoSair}
            carregando={saindo}
            {...(erroAtualizacao === undefined ? {} : { erroAtualizacao })}
            {...(politicaVersao === undefined ? {} : { politicaVersao })}
            servicoDiagnostico={servicoDiagnostico}
            sessao={sessao}
          />
        )}
      </Abas.Screen>
    </Abas.Navigator>
  );
}

const criarEstilos = (CORES: CoresTema) => StyleSheet.create({
  atualizar: { alignItems: 'center', borderColor: CORES.info, borderRadius: RAIOS.pílula, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 12 },
  atualizarPressionado: { backgroundColor: CORES.infoClara },
  avatar: { alignItems: 'center', backgroundColor: CORES.acao, borderRadius: RAIOS.pílula, height: 62, justifyContent: 'center', width: 62 },
  avisoAtualizacao: { alignItems: 'center', backgroundColor: CORES.infoClara, borderColor: CORES.infoBorda, borderRadius: RAIOS.campo, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 14 },
  avisoSubstituicao: { alignItems: 'center', backgroundColor: CORES.infoClara, borderRadius: RAIOS.campo, flexDirection: 'row', gap: 10, padding: 14 },
  badgeAba: { backgroundColor: CORES.alerta, color: CORES.textoInvertido, fontSize: 10, fontWeight: '800' },
  barraAbas: { borderTopColor: CORES.borda, height: 76, paddingBottom: 9, paddingTop: 7 },
  cabecalho: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: ESPACOS.grande, paddingVertical: 18 },
  cartaoPerfil: { alignItems: 'center', backgroundColor: CORES.superficie, borderColor: CORES.borda, borderRadius: RAIOS.cartao, borderWidth: 1, flexDirection: 'row', gap: 16, padding: 18 },
  contexto: { color: CORES.textoSecundario, fontSize: 13, marginTop: 2 },
  descricaoOpcaoPerfil: { color: CORES.textoSecundario, fontSize: 12, marginTop: 2 },
  descricaoVazio: { color: CORES.textoSecundario, fontSize: 14, lineHeight: 21, maxWidth: 290, textAlign: 'center' },
  descricaoAtualizacao: { color: CORES.textoSecundario, fontSize: 12, lineHeight: 17, marginTop: 2 },
  erroAtualizacao: { color: CORES.alerta, fontSize: 12, marginTop: 5 },
  estadoVazio: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  iconeVazio: { alignItems: 'center', backgroundColor: CORES.acaoClara, borderRadius: RAIOS.cartao, height: 68, justifyContent: 'center', marginBottom: 18, width: 68 },
  iconeAtualizacao: { alignItems: 'center', backgroundColor: CORES.infoClara, borderRadius: RAIOS.pílula, height: 38, justifyContent: 'center', width: 38 },
  iconeOpcaoPerfil: { alignItems: 'center', backgroundColor: CORES.infoClara, borderRadius: RAIOS.pílula, height: 38, justifyContent: 'center', width: 38 },
  identidade: { flex: 1 },
  iniciais: { color: CORES.textoInvertido, fontSize: 20, fontWeight: '700' },
  nome: { color: CORES.texto, fontSize: 19, fontWeight: '700' },
  opcaoPerfil: { alignItems: 'center', backgroundColor: CORES.superficie, borderColor: CORES.borda, borderRadius: RAIOS.campo, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 58, paddingHorizontal: 14, paddingVertical: 9 },
  opcaoPerfilPressionada: { backgroundColor: CORES.superficieElevada },
  perfilConteudo: { gap: ESPACOS.medio, padding: ESPACOS.grande },
  protegida: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 7 },
  rotuloAba: { fontSize: 11, fontWeight: '600' },
  sair: { alignItems: 'center', backgroundColor: CORES.superficie, borderColor: CORES.borda, borderRadius: RAIOS.campo, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 54, paddingHorizontal: 17 },
  sairPressionado: { backgroundColor: CORES.alertaClara },
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  textoProtegida: { color: CORES.acao, flexShrink: 1, fontSize: 12, fontWeight: '600' },
  textoAtualizacao: { flex: 1 },
  textoAtualizar: { color: CORES.info, fontSize: 12, fontWeight: '700' },
  textoOpcaoPerfil: { flex: 1 },
  textoSair: { color: CORES.alerta, fontSize: 15, fontWeight: '600' },
  textoSubstituicao: { color: CORES.info, flex: 1, fontSize: 13, lineHeight: 19 },
  tituloTela: { color: CORES.texto, fontSize: 29, fontWeight: '800', letterSpacing: -0.8 },
  tituloAtualizacao: { color: CORES.texto, fontSize: 14, fontWeight: '700' },
  tituloOpcaoPerfil: { color: CORES.texto, fontSize: 14, fontWeight: '700' },
  tituloVazio: { color: CORES.texto, fontSize: 18, fontWeight: '700', marginBottom: 7 },
});
