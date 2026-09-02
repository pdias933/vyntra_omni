import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErroAutenticacaoMobile } from '../autenticacao/adaptador-autenticacao-http';
import {
  mensagemAutenticacao,
  type SessaoAplicativo,
  type ServicoAutenticacaoAplicativo,
} from '../autenticacao/servico-autenticacao-aplicativo';
import { BotaoPrimario } from '../componentes/BotaoPrimario';
import { CORES, ESPACOS, RAIOS } from '../tema';
import type { RotasEntrada } from './TelaEntrada';

type Propriedades = NativeStackScreenProps<RotasEntrada, 'PareamentoQr'> & {
  readonly aoAutenticar: (sessao: SessaoAplicativo) => void;
  readonly autenticacao: ServicoAutenticacaoAplicativo;
};

type EstadoPareamento = 'AGUARDANDO' | 'ERRO' | 'LENDO' | 'SOLICITAR_CAMERA';
const TOKEN_QR = /^[A-Za-z0-9_-]{43}$/u;

export function TelaPareamentoQr({
  aoAutenticar,
  autenticacao,
  navigation,
}: Propriedades) {
  const insets = useSafeAreaInsets();
  const [permissao, solicitarPermissao] = useCameraPermissions();
  const [estado, definirEstado] = useState<EstadoPareamento>('SOLICITAR_CAMERA');
  const [erro, definirErro] = useState<string>();
  const [expiraEm, definirExpiraEm] = useState<string>();
  const controlador = useRef<AbortController | undefined>(undefined);
  const leituraEmCurso = useRef(false);

  useEffect(
    () => () => {
      controlador.current?.abort();
    },
    [],
  );

  async function lerToken(tokenQr: string) {
    if (
      estado !== 'LENDO' ||
      leituraEmCurso.current ||
      !TOKEN_QR.test(tokenQr)
    ) {
      return;
    }
    leituraEmCurso.current = true;
    definirEstado('AGUARDANDO');
    definirErro(undefined);
    const novoControlador = new AbortController();
    controlador.current = novoControlador;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const comprovante = await autenticacao.resgatarPareamento(tokenQr);
      const sessao = await autenticacao.aguardarEConcluirPareamento(
        comprovante,
        definirExpiraEm,
        novoControlador.signal,
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      aoAutenticar(sessao);
    } catch (falha) {
      if (
        falha instanceof ErroAutenticacaoMobile &&
        falha.codigo === 'PAREAMENTO_CANCELADO'
      ) {
        return;
      }
      definirErro(mensagemAutenticacao(falha));
      definirEstado('ERRO');
      leituraEmCurso.current = false;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function permitirCamera() {
    const resultado = await solicitarPermissao();
    if (resultado.granted) definirEstado('LENDO');
  }

  const cameraPermitida = permissao?.granted === true;

  return (
    <View style={estilos.tela}>
      <View style={[estilos.cabecalho, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="Voltar"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => navigation.goBack()}
          style={estilos.voltar}
        >
          <Ionicons color={CORES.texto} name="chevron-back" size={26} />
        </Pressable>
        <Text accessibilityRole="header" style={estilos.tituloCabecalho}>
          Entrar com QR Code
        </Text>
        <View style={estilos.espacoCabecalho} />
      </View>

      {estado === 'LENDO' && cameraPermitida ? (
        <Animated.View
          entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
          style={estilos.areaCamera}
        >
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => void lerToken(data)}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={estilos.mascaraCamera}>
            <View style={estilos.guiaQr} />
          </View>
        </Animated.View>
      ) : (
        <View style={estilos.estadoCentral}>
          {estado === 'AGUARDANDO' ? (
            <>
              <View style={estilos.iconeEstado}>
                <Ionicons color={CORES.acao} name="shield-checkmark-outline" size={34} />
              </View>
              <Text style={estilos.tituloEstado}>Confirme este aparelho na web</Text>
              <Text style={estilos.descricaoEstado}>
                Mantenha esta tela aberta. Assim que você confirmar, o acesso será concluído automaticamente.
              </Text>
              {expiraEm !== undefined && (
                <Text style={estilos.validade}>
                  Código válido até {new Date(expiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
              <View style={estilos.pontos}>
                <View style={estilos.pontoAtivo} />
                <View style={estilos.ponto} />
                <View style={estilos.ponto} />
              </View>
            </>
          ) : (
            <>
              <View style={[estilos.iconeEstado, estado === 'ERRO' && estilos.iconeErro]}>
                <Ionicons
                  color={estado === 'ERRO' ? CORES.alerta : CORES.acao}
                  name={estado === 'ERRO' ? 'alert-circle-outline' : 'qr-code-outline'}
                  size={36}
                />
              </View>
              <Text style={estilos.tituloEstado}>
                {estado === 'ERRO' ? 'Não foi possível parear' : 'Leia o código exibido na web'}
              </Text>
              <Text style={estilos.descricaoEstado}>
                {erro ?? 'Na versão web, abra seu perfil e escolha “Conectar celular”. O código é temporário e funciona uma única vez.'}
              </Text>
              <View style={estilos.acaoCamera}>
                <BotaoPrimario
                  onPress={() => {
                    if (cameraPermitida) definirEstado('LENDO');
                    else void permitirCamera();
                  }}
                  texto={estado === 'ERRO' ? 'Ler outro código' : 'Abrir câmera'}
                />
              </View>
            </>
          )}
        </View>
      )}

      {estado === 'LENDO' && (
        <View style={[estilos.instrucaoCamera, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={estilos.tituloInstrucao}>Posicione o QR dentro do quadro</Text>
          <Text style={estilos.descricaoInstrucao}>A leitura acontece automaticamente.</Text>
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  acaoCamera: { alignSelf: 'stretch', marginTop: ESPACOS.medio },
  areaCamera: { flex: 1, overflow: 'hidden' },
  cabecalho: {
    alignItems: 'center',
    backgroundColor: CORES.superficie,
    flexDirection: 'row',
    paddingBottom: 14,
    paddingHorizontal: 14,
  },
  descricaoEstado: { color: CORES.textoSecundario, fontSize: 15, lineHeight: 22, maxWidth: 330, textAlign: 'center' },
  descricaoInstrucao: { color: 'rgba(255,255,255,0.72)', fontSize: 13, marginTop: 5, textAlign: 'center' },
  espacoCabecalho: { width: 42 },
  estadoCentral: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 30 },
  guiaQr: { borderColor: CORES.textoInvertido, borderRadius: 28, borderWidth: 3, height: 246, width: 246 },
  iconeErro: { backgroundColor: CORES.alertaClara },
  iconeEstado: { alignItems: 'center', backgroundColor: CORES.acaoClara, borderRadius: RAIOS.cartao, height: 72, justifyContent: 'center', marginBottom: 22, width: 72 },
  instrucaoCamera: { backgroundColor: CORES.primario, paddingHorizontal: 20, paddingTop: 22 },
  mascaraCamera: { alignItems: 'center', backgroundColor: 'rgba(4, 16, 11, 0.28)', flex: 1, justifyContent: 'center' },
  ponto: { backgroundColor: '#B9C4BE', borderRadius: RAIOS.pílula, height: 7, width: 7 },
  pontoAtivo: { backgroundColor: CORES.acao, borderRadius: RAIOS.pílula, height: 7, width: 24 },
  pontos: { flexDirection: 'row', gap: 7, marginTop: 26 },
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  tituloCabecalho: { color: CORES.texto, flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  tituloEstado: { color: CORES.texto, fontSize: 25, fontWeight: '700', letterSpacing: -0.5, marginBottom: 10, textAlign: 'center' },
  tituloInstrucao: { color: CORES.textoInvertido, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  validade: { color: CORES.acao, fontSize: 13, fontWeight: '600', marginTop: 18 },
  voltar: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
});
