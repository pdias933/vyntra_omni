import type { CoresTema } from '@vyntra/tema';
import { useTema, useEstilos } from '../aparencia/contexto-tema';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  DiagnosticoMobile,
  ServicoDiagnosticoMobile,
} from '../diagnostico/servico-diagnostico-mobile';
import { ESPACOS, RAIOS } from '../tema';

function Linha({ rotulo, valor }: { readonly rotulo: string; readonly valor: string }) {
  const estilos = useEstilos(criarEstilos);
  return (
    <View accessible accessibilityLabel={`${rotulo}: ${valor}`} style={estilos.linha}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text selectable style={estilos.valor}>{valor}</Text>
    </View>
  );
}

export function TelaDiagnosticoMobile({
  aoVoltar,
  servico,
}: {
  readonly aoVoltar: () => void;
  readonly servico: ServicoDiagnosticoMobile;
}) {
  const { cores: CORES } = useTema();
  const estilos = useEstilos(criarEstilos);
  const [diagnostico, definirDiagnostico] = useState<DiagnosticoMobile>();
  const [falhou, definirFalhou] = useState(false);
  const [carregando, definirCarregando] = useState(true);

  const carregar = useCallback(async () => {
    definirCarregando(true);
    try {
      definirDiagnostico(await servico.obter());
      definirFalhou(false);
    } catch {
      definirFalhou(true);
    } finally {
      definirCarregando(false);
    }
  }, [servico]);

  useEffect(() => {
    const temporizador = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(temporizador);
  }, [carregar]);

  function confirmarCompartilhamento() {
    if (diagnostico === undefined) return;
    Alert.alert(
      'Compartilhar diagnóstico?',
      'O relatório não inclui mensagens, contatos, credenciais ou identificadores da sua conta.',
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          onPress: () =>
            void Share.share({
              message: servico.criarRelatorio(diagnostico),
            }).catch(() =>
              Alert.alert(
                'Não foi possível compartilhar',
                'Tente novamente sem sair desta tela.',
              ),
            ),
          text: 'Compartilhar',
        },
      ],
    );
  }

  const falhas = diagnostico?.codigosFalhaRecentes.join(', ') || 'Nenhuma';
  return (
    <SafeAreaView edges={['top']} style={estilos.tela}>
      <View style={estilos.cabecalho}>
        <Pressable
          accessibilityLabel="Voltar ao perfil"
          accessibilityRole="button"
          onPress={aoVoltar}
          style={estilos.botaoCabecalho}
        >
          <Ionicons color={CORES.texto} name="chevron-back" size={26} />
        </Pressable>
        <Text accessibilityRole="header" style={estilos.titulo}>Diagnóstico</Text>
        <View style={estilos.botaoCabecalho} />
      </View>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <View style={estilos.privacidade}>
          <Ionicons color={CORES.info} name="shield-checkmark-outline" size={21} />
          <Text style={estilos.textoPrivacidade}>
            Informações técnicas sanitizadas. Nenhum conteúdo de conversa é incluído.
          </Text>
        </View>
        {carregando ? (
          <Text accessibilityLiveRegion="polite" style={estilos.estado}>
            Verificando diagnóstico…
          </Text>
        ) : falhou || diagnostico === undefined ? (
          <View style={estilos.erro}>
            <Text accessibilityLiveRegion="polite" style={estilos.textoErro}>
              Não foi possível montar o diagnóstico neste momento.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void carregar()}>
              <Text style={estilos.tentarNovamente}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={estilos.cartao}>
              <Linha rotulo="Versão do app" valor={diagnostico.versaoAplicativo} />
              <Linha
                rotulo="Sistema operacional"
                valor={`${diagnostico.plataforma} ${diagnostico.versaoSistemaOperacional}`}
              />
              <Linha rotulo="Modelo do aparelho" valor={diagnostico.modeloDispositivo} />
              <Linha rotulo="Servidor conectado" valor={diagnostico.servidor} />
              <Linha rotulo="WebSocket" valor={diagnostico.estadoWebSocket} />
              <Linha rotulo="Push" valor={diagnostico.estadoPush} />
              <Linha rotulo="Sincronização" valor={diagnostico.estadoSincronizacao} />
              <Linha
                rotulo="Última sequência aplicada"
                valor={diagnostico.ultimaSequenciaAplicada}
              />
              <Linha rotulo="Falhas recentes" valor={falhas} />
            </View>
            <Pressable
              accessibilityHint="Abre a confirmação antes de compartilhar"
              accessibilityRole="button"
              onPress={confirmarCompartilhamento}
              style={({ pressed }) => [
                estilos.compartilhar,
                pressed && estilos.compartilharPressionado,
              ]}
            >
              <Ionicons color={CORES.textoInvertido} name="share-outline" size={20} />
              <Text style={estilos.textoCompartilhar}>Compartilhar relatório</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const criarEstilos = (CORES: CoresTema) => StyleSheet.create({
  botaoCabecalho: { alignItems: 'center', minHeight: 44, justifyContent: 'center', width: 44 },
  cabecalho: { alignItems: 'center', backgroundColor: CORES.superficie, borderBottomColor: CORES.borda, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 62, paddingHorizontal: 5 },
  cartao: { backgroundColor: CORES.superficie, borderColor: CORES.borda, borderRadius: RAIOS.cartao, borderWidth: 1, overflow: 'hidden' },
  compartilhar: { alignItems: 'center', backgroundColor: CORES.acao, borderRadius: RAIOS.campo, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 52, paddingHorizontal: 18 },
  compartilharPressionado: { opacity: 0.82 },
  conteudo: { gap: ESPACOS.medio, padding: ESPACOS.grande },
  erro: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  estado: { color: CORES.textoSecundario, paddingVertical: 28, textAlign: 'center' },
  linha: { borderBottomColor: CORES.borda, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4, minHeight: 62, paddingHorizontal: 16, paddingVertical: 11 },
  privacidade: { alignItems: 'flex-start', backgroundColor: CORES.infoClara, borderColor: CORES.infoBorda, borderRadius: RAIOS.campo, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 14 },
  rotulo: { color: CORES.textoSecundario, fontSize: 12, fontWeight: '600' },
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  textoCompartilhar: { color: CORES.textoInvertido, fontSize: 14, fontWeight: '700' },
  textoErro: { color: CORES.textoSecundario, lineHeight: 20, textAlign: 'center' },
  textoPrivacidade: { color: CORES.textoSecundario, flex: 1, fontSize: 13, lineHeight: 19 },
  tentarNovamente: { color: CORES.acao, fontSize: 14, fontWeight: '700' },
  titulo: { color: CORES.texto, fontSize: 18, fontWeight: '800' },
  valor: { color: CORES.texto, fontSize: 14, lineHeight: 20 },
});
