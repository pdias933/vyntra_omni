import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PoliticaVersaoAplicativo } from '../atualizacao/adaptador-politica-versao-http';
import { BotaoPrimario } from '../componentes/BotaoPrimario';
import { MarcaVyntra } from '../componentes/MarcaVyntra';
import { CORES, ESPACOS, RAIOS } from '../tema';

export function TelaAtualizacaoObrigatoria({
  abrindoLoja,
  aoAbrirLoja,
  aoVerificar,
  erro,
  politica,
  verificando,
}: {
  readonly abrindoLoja: boolean;
  readonly aoAbrirLoja: () => void;
  readonly aoVerificar: () => void;
  readonly erro?: string;
  readonly politica: PoliticaVersaoAplicativo;
  readonly verificando: boolean;
}) {
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
          <Ionicons color={CORES.info} name="arrow-up-circle-outline" size={46} />
        </View>
        <Text accessibilityRole="header" style={estilos.titulo}>
          Atualização necessária
        </Text>
        <Text style={estilos.descricao}>
          {politica.mensagem ??
            'Instale a versão mais recente para continuar usando o Vyntra Omni com segurança.'}
        </Text>
        <Text style={estilos.versao}>
          Versão mínima: {politica.versaoMinima}
        </Text>
        {erro !== undefined && (
          <View accessibilityLiveRegion="polite" style={estilos.avisoErro}>
            <Ionicons color={CORES.alerta} name="alert-circle-outline" size={19} />
            <Text style={estilos.textoErro}>{erro}</Text>
          </View>
        )}
        <View style={estilos.acoes}>
          <BotaoPrimario
            carregando={abrindoLoja}
            desabilitado={verificando}
            onPress={aoAbrirLoja}
            texto="Atualizar aplicativo"
          />
          <BotaoPrimario
            carregando={verificando}
            desabilitado={abrindoLoja}
            onPress={aoVerificar}
            texto="Verificar novamente"
            variante="secundario"
          />
        </View>
      </Animated.View>
      <Text style={estilos.rodape}>
        Não é possível ignorar esta atualização.
      </Text>
    </SafeAreaView>
  );
}

export function TelaFalhaVerificacaoVersao({
  aoTentarNovamente,
  verificando,
}: {
  readonly aoTentarNovamente: () => void;
  readonly verificando: boolean;
}) {
  return (
    <SafeAreaView style={estilos.tela}>
      <View style={estilos.marca}>
        <MarcaVyntra />
      </View>
      <View style={estilos.conteudo}>
        <View style={[estilos.icone, estilos.iconeAtencao]}>
          <Ionicons color={CORES.alerta} name="cloud-offline-outline" size={42} />
        </View>
        <Text accessibilityRole="header" style={estilos.titulo}>
          Não foi possível verificar a versão
        </Text>
        <Text style={estilos.descricao}>
          Confira sua conexão e tente novamente para entrar com segurança.
        </Text>
        <View style={estilos.acoes}>
          <BotaoPrimario
            carregando={verificando}
            onPress={aoTentarNovamente}
            texto="Tentar novamente"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  acoes: { alignSelf: 'stretch', gap: ESPACOS.pequeno, marginTop: 28 },
  avisoErro: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: CORES.alertaClara, borderRadius: RAIOS.campo, flexDirection: 'row', gap: 9, marginTop: 22, padding: 13 },
  conteudo: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 30 },
  descricao: { color: CORES.textoSecundario, fontSize: 15, lineHeight: 22, maxWidth: 350, textAlign: 'center' },
  icone: { alignItems: 'center', backgroundColor: '#EAF0FF', borderRadius: RAIOS.cartao, height: 86, justifyContent: 'center', marginBottom: 24, width: 86 },
  iconeAtencao: { backgroundColor: CORES.alertaClara },
  marca: { paddingHorizontal: ESPACOS.grande, paddingTop: ESPACOS.medio },
  rodape: { color: CORES.textoSecundario, fontSize: 12, padding: ESPACOS.grande, textAlign: 'center' },
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  textoErro: { color: CORES.alerta, flex: 1, fontSize: 13, lineHeight: 18 },
  titulo: { color: CORES.texto, fontSize: 28, fontWeight: '700', letterSpacing: -0.7, marginBottom: 11, textAlign: 'center' },
  versao: { color: CORES.info, fontSize: 12, fontWeight: '600', marginTop: 15 },
});
