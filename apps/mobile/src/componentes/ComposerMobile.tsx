import type { CoresTema } from '@vyntra/tema';
import { useTema, useEstilos } from '../aparencia/contexto-tema';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ErroAtendimentoMobile,
} from '../atendimentos/adaptador-atendimentos-http';
import type {
  ModeloAprovadoMobile,
  RespostaRapidaMobile,
} from '../atendimentos/modelo-atendimento-mobile';
import type { ServicoAtendimentosMobile } from '../atendimentos/servico-atendimentos-mobile';
import {
  AdaptadorSelecaoMidiaNativa,
  ErroSelecaoMidiaMobile,
  type MidiaSelecionadaMobile,
} from '../midias/adaptador-selecao-midia-nativa';
import type { RepositorioReplicaLocal } from '../offline/repositorio-replica-local';
import type {
  PendenciaSaidaTextoLocal,
} from '../offline/repositorio-replica-local';
import type { ServicoPendenciasSaidaMobile } from '../offline/servico-pendencias-saida-mobile';
import { ESPACOS, RAIOS } from '../tema';
import { FolhaAcoesSistemaMobile } from './FolhaAcoesSistemaMobile';

const seletorMidia = new AdaptadorSelecaoMidiaNativa();

function tamanhoLegivel(tamanhoBytes: number): string {
  const megabytes = tamanhoBytes / (1024 * 1024);
  if (megabytes >= 1) return `${megabytes.toFixed(1).replace('.', ',')} MB`;
  return `${Math.ceil(tamanhoBytes / 1024)} KB`;
}

function mensagemSelecaoMidia(erro: unknown): string {
  if (erro instanceof ErroSelecaoMidiaMobile) {
    if (erro.codigo === 'TAMANHO_EXCEDIDO') {
      return 'O arquivo ultrapassa o limite permitido para este formato.';
    }
    if (erro.codigo === 'FORMATO_NAO_PERMITIDO') {
      return 'Este formato não é permitido. Use imagem, áudio, vídeo MP4 ou PDF.';
    }
  }
  return 'Não foi possível acessar o arquivo selecionado.';
}

function mensagemFalha(erro: unknown): string {
  if (erro instanceof ErroAtendimentoMobile) {
    if (erro.codigo === 'JANELA_META_EXPIRADA') {
      return 'A janela Meta encerrou. Use uma mensagem aprovada.';
    }
    if (erro.statusHttp === 401 || erro.statusHttp === 403) {
      return 'Seu acesso mudou. O texto foi preservado.';
    }
  }
  return 'Não foi possível enviar. O texto foi preservado.';
}

export function ComposerMobile({
  acessoOffline,
  aoAbrirDetalhes,
  aoEnviado,
  atendimentoId,
  conversaId,
  janelaAberta,
  repositorio,
  servico,
  servicoPendencias,
  usuarioId,
}: {
  readonly acessoOffline: boolean;
  readonly aoAbrirDetalhes: () => void;
  readonly aoEnviado: () => Promise<void>;
  readonly atendimentoId: string;
  readonly conversaId: string;
  readonly janelaAberta: boolean;
  readonly repositorio: RepositorioReplicaLocal;
  readonly servico: ServicoAtendimentosMobile;
  readonly servicoPendencias: ServicoPendenciasSaidaMobile;
  readonly usuarioId: string;
}) {
  const { cores: CORES, modo } = useTema();
  const estilos = useEstilos(criarEstilos);
  const reduzirMovimento = useReducedMotion();
  const campo = useRef<TextInput>(null);
  const salvamento = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const filaSalvamento = useRef<Promise<void>>(Promise.resolve());
  const editado = useRef(false);
  const textoAtual = useRef('');
  const [texto, definirTexto] = useState('');
  const [respostas, definirRespostas] = useState<readonly RespostaRapidaMobile[]>([]);
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState<string>();
  const [acoesAbertas, definirAcoesAbertas] = useState(false);
  const [midiaSelecionada, definirMidiaSelecionada] =
    useState<MidiaSelecionadaMobile>();
  const [modelosAbertos, definirModelosAbertos] = useState(false);
  const [modelos, definirModelos] = useState<readonly ModeloAprovadoMobile[]>([]);
  const [modeloSelecionado, definirModeloSelecionado] = useState<ModeloAprovadoMobile>();
  const [parametros, definirParametros] = useState<readonly string[]>([]);
  const [carregandoModelos, definirCarregandoModelos] = useState(false);
  const [pendencias, definirPendencias] = useState<
    readonly PendenciaSaidaTextoLocal[]
  >([]);

  const persistirRascunho = useCallback((valor: string): Promise<void> => {
    const proximo = filaSalvamento.current
      .catch(() => undefined)
      .then(() => repositorio.salvarRascunho(conversaId, valor));
    filaSalvamento.current = proximo.catch(() => undefined);
    return proximo;
  }, [conversaId, repositorio]);

  useEffect(() => {
    let ativo = true;
    editado.current = false;
    const carregar = setTimeout(() => {
      void repositorio.obterRascunho(conversaId).then((rascunho) => {
        if (!ativo || editado.current) return;
        textoAtual.current = rascunho;
        definirTexto(rascunho);
      }).catch(() => {
        if (ativo) definirErro('O rascunho local não pôde ser recuperado.');
      });
    }, 0);
    return () => {
      ativo = false;
      clearTimeout(carregar);
      if (salvamento.current !== undefined) clearTimeout(salvamento.current);
      void persistirRascunho(textoAtual.current).catch(() => undefined);
    };
  }, [conversaId, persistirRascunho, repositorio]);

  useEffect(() => {
    let ativo = true;
    const carregar = () => {
      void repositorio.listarPendenciasSaidaTexto(conversaId)
        .then((itens) => {
          if (ativo) definirPendencias(itens);
        })
        .catch(() => {
          if (ativo) definirErro('As pendências locais não puderam ser lidas.');
        });
    };
    carregar();
    const parar = repositorio.observarMudancas(carregar);
    return () => {
      ativo = false;
      parar();
    };
  }, [conversaId, repositorio]);

  useEffect(() => {
    if (!texto.startsWith('/') || acessoOffline) return;
    const busca = texto.slice(1).trim();
    const pesquisa = setTimeout(() => {
      void servico.listarRespostasRapidas(atendimentoId, busca)
        .then(definirRespostas)
        .catch(() => definirRespostas([]));
    }, 120);
    return () => clearTimeout(pesquisa);
  }, [acessoOffline, atendimentoId, servico, texto]);

  function alterarTexto(valor: string) {
    editado.current = true;
    textoAtual.current = valor;
    definirTexto(valor);
    definirErro(undefined);
    if (!valor.startsWith('/')) definirRespostas([]);
    if (salvamento.current !== undefined) clearTimeout(salvamento.current);
    salvamento.current = setTimeout(() => {
      void persistirRascunho(valor).catch(() => {
        definirErro('O rascunho não pôde ser salvo neste aparelho.');
      });
    }, 250);
  }

  function escolherResposta(resposta: RespostaRapidaMobile) {
    alterarTexto(resposta.texto);
    definirRespostas([]);
    campo.current?.focus();
    void Haptics.selectionAsync();
  }

  async function enviar() {
    const normalizado = texto.trim();
    if (normalizado.length === 0 || ocupado) return;
    if (acessoOffline) {
      definirOcupado(true);
      definirErro(undefined);
      try {
        if (salvamento.current !== undefined) clearTimeout(salvamento.current);
        await filaSalvamento.current.catch(() => undefined);
        await servicoPendencias.criar({
          atendimentoId,
          conversaId,
          texto: normalizado,
          usuarioId,
        });
        textoAtual.current = '';
        definirTexto('');
        definirRespostas([]);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      } catch {
        definirErro(
          'Não foi possível guardar o envio. O rascunho foi preservado.',
        );
      } finally {
        definirOcupado(false);
      }
      return;
    }
    if (!janelaAberta) {
      definirErro('A janela Meta encerrou. Use uma mensagem aprovada.');
      return;
    }
    definirOcupado(true);
    definirErro(undefined);
    try {
      await servico.enviarTexto(atendimentoId, {
        mensagemClienteId: Crypto.randomUUID(),
        texto: normalizado,
      });
      if (salvamento.current !== undefined) clearTimeout(salvamento.current);
      textoAtual.current = '';
      definirTexto('');
      definirRespostas([]);
      await persistirRascunho('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await aoEnviado();
    } catch (falha) {
      definirErro(mensagemFalha(falha));
    } finally {
      definirOcupado(false);
    }
  }

  async function abrirModelos() {
    if (acessoOffline) {
      definirErro('Conecte-se para consultar mensagens aprovadas.');
      return;
    }
    definirModelosAbertos(true);
    definirModeloSelecionado(undefined);
    definirParametros([]);
    definirCarregandoModelos(true);
    definirErro(undefined);
    try {
      definirModelos(await servico.listarModelosAprovados(atendimentoId));
    } catch {
      definirModelos([]);
      definirErro('Não foi possível consultar as mensagens aprovadas.');
    } finally {
      definirCarregandoModelos(false);
    }
  }

  async function enviarModelo() {
    if (
      modeloSelecionado === undefined ||
      ocupado ||
      acessoOffline ||
      parametros.some((item) => item.trim().length === 0)
    ) {
      return;
    }
    definirOcupado(true);
    definirErro(undefined);
    try {
      await servico.enviarModeloAprovado(atendimentoId, {
        mensagemClienteId: Crypto.randomUUID(),
        modeloId: modeloSelecionado.id,
        parametros,
      });
      definirModelosAbertos(false);
      definirModeloSelecionado(undefined);
      definirParametros([]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await aoEnviado();
    } catch (falha) {
      definirErro(mensagemFalha(falha));
    } finally {
      definirOcupado(false);
    }
  }

  async function selecionarMidia() {
    if (ocupado) return;
    if (acessoOffline) {
      definirErro('Conecte-se para selecionar e enviar um anexo.');
      return;
    }
    if (!janelaAberta) {
      definirErro('A janela Meta encerrou. Anexos não podem ser enviados agora.');
      return;
    }
    definirOcupado(true);
    definirErro(undefined);
    try {
      const selecao = await seletorMidia.selecionar();
      if (selecao === undefined) return;
      definirMidiaSelecionada(selecao);
      void Haptics.selectionAsync();
    } catch (falha) {
      definirErro(mensagemSelecaoMidia(falha));
    } finally {
      definirOcupado(false);
    }
  }

  async function enviarMidia() {
    if (
      midiaSelecionada === undefined ||
      ocupado ||
      acessoOffline ||
      !janelaAberta
    ) {
      return;
    }
    definirOcupado(true);
    definirErro(undefined);
    try {
      const arquivo = await seletorMidia.materializar(midiaSelecionada);
      await servico.enviarMidia(
        atendimentoId,
        arquivo,
        Crypto.randomUUID(),
      );
      definirMidiaSelecionada(undefined);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await aoEnviado();
    } catch (falha) {
      definirErro(
        falha instanceof ErroSelecaoMidiaMobile
          ? mensagemSelecaoMidia(falha)
          : 'Não foi possível enviar. O anexo foi preservado para tentar novamente.',
      );
    } finally {
      definirOcupado(false);
    }
  }

  async function editarPendencia(pendencia: PendenciaSaidaTextoLocal) {
    if (ocupado) return;
    definirOcupado(true);
    definirErro(undefined);
    try {
      const recuperado = await servicoPendencias.editarComoRascunho(
        pendencia.id,
      );
      alterarTexto(recuperado);
      campo.current?.focus();
    } catch {
      definirErro('Não foi possível editar esta pendência.');
    } finally {
      definirOcupado(false);
    }
  }

  async function descartarPendencia(pendencia: PendenciaSaidaTextoLocal) {
    if (ocupado) return;
    definirOcupado(true);
    definirErro(undefined);
    try {
      await servicoPendencias.descartar(pendencia.id);
    } catch {
      definirErro('Não foi possível descartar esta pendência.');
    } finally {
      definirOcupado(false);
    }
  }

  async function enviarPendenciaMesmoAssim(
    pendencia: PendenciaSaidaTextoLocal,
  ) {
    if (ocupado || acessoOffline) return;
    definirOcupado(true);
    definirErro(undefined);
    try {
      await servicoPendencias.enviarMesmoAssim(pendencia);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await aoEnviado();
    } catch (falha) {
      definirErro(mensagemFalha(falha));
    } finally {
      definirOcupado(false);
    }
  }

  async function tentarReconciliar() {
    if (ocupado || acessoOffline) return;
    definirOcupado(true);
    definirErro(undefined);
    try {
      await servicoPendencias.reconciliarAguardando();
    } catch {
      definirErro('Não foi possível reconciliar agora. Tente novamente.');
    } finally {
      definirOcupado(false);
    }
  }

  const possuiTexto = texto.trim().length > 0;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={estilos.area}>
        {pendencias.map((pendencia) => (
          <View
            accessibilityLiveRegion="polite"
            key={pendencia.id}
            style={[
              estilos.pendencia,
              pendencia.estado === 'REVISAO_NECESSARIA' &&
                estilos.pendenciaRevisao,
            ]}
          >
            <View style={estilos.cabecalhoPendencia}>
              <Ionicons
                color={
                  pendencia.estado === 'REVISAO_NECESSARIA'
                    ? CORES.atencao
                    : CORES.textoSecundario
                }
                name={
                  pendencia.estado === 'REVISAO_NECESSARIA'
                    ? 'alert-circle-outline'
                    : 'cloud-offline-outline'
                }
                size={17}
              />
              <Text style={estilos.tituloPendencia}>
                {pendencia.estado === 'REVISAO_NECESSARIA'
                  ? 'Revisão necessária'
                  : 'Aguardando conexão'}
              </Text>
            </View>
            <Text numberOfLines={3} style={estilos.textoPendencia}>
              {pendencia.texto}
            </Text>
            {pendencia.estado === 'REVISAO_NECESSARIA' && (
              <>
                <Text style={estilos.descricaoPendencia}>
                  A conversa ou sua responsabilidade mudou antes do envio.
                </Text>
                <View style={estilos.acoesPendencia}>
                  <Pressable
                    disabled={ocupado}
                    onPress={() => void editarPendencia(pendencia)}
                    style={estilos.acaoPendencia}
                  >
                    <Text style={estilos.textoAcaoPendencia}>Editar</Text>
                  </Pressable>
                  <Pressable
                    disabled={ocupado}
                    onPress={() => void descartarPendencia(pendencia)}
                    style={estilos.acaoPendencia}
                  >
                    <Text style={estilos.textoAcaoPendencia}>Descartar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityState={{ disabled: ocupado || acessoOffline }}
                    disabled={ocupado || acessoOffline}
                    onPress={() => void enviarPendenciaMesmoAssim(pendencia)}
                    style={[
                      estilos.acaoPendenciaPrincipal,
                      acessoOffline && estilos.acaoPendenciaDesabilitada,
                    ]}
                  >
                    <Text style={estilos.textoAcaoPendenciaPrincipal}>
                      Enviar mesmo assim
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
            {pendencia.estado === 'AGUARDANDO_CONEXAO' && !acessoOffline && (
              <Pressable
                disabled={ocupado}
                onPress={() => void tentarReconciliar()}
                style={estilos.tentarPendencia}
              >
                <Text style={estilos.textoAcaoPendencia}>Tentar agora</Text>
              </Pressable>
            )}
          </View>
        ))}
        {texto.startsWith('/') && respostas.length > 0 && (
          <View accessibilityLiveRegion="polite" style={estilos.sugestoes}>
            <Text style={estilos.tituloSugestoes}>Respostas rápidas</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={estilos.listaSugestoes}>
              {respostas.map((resposta) => (
                <Pressable
                  accessibilityRole="button"
                  key={resposta.id}
                  onPress={() => escolherResposta(resposta)}
                  style={({ pressed }) => [estilos.resposta, pressed && estilos.respostaPressionada]}
                >
                  <Text style={estilos.atalho}>/{resposta.atalho}</Text>
                  <Text style={estilos.tituloResposta}>{resposta.titulo}</Text>
                  <Text numberOfLines={2} style={estilos.previaResposta}>{resposta.texto}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        {erro !== undefined && <Text accessibilityLiveRegion="polite" style={estilos.erro}>{erro}</Text>}
        {!janelaAberta && (
          <View style={estilos.janelaFechada}>
            <View style={estilos.textoJanelaFechada}>
              <Text style={estilos.tituloJanelaFechada}>Janela Meta encerrada</Text>
              <Text style={estilos.descricaoJanelaFechada}>Inicie com uma mensagem aprovada.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => void abrirModelos()}
              style={estilos.botaoModelo}
            >
              <Text style={estilos.textoBotaoModelo}>Escolher mensagem</Text>
            </Pressable>
          </View>
        )}
        <SafeAreaView edges={['bottom']} style={estilos.rodape}>
          <View style={estilos.linhaComposer}>
            <Pressable
              accessibilityLabel="Anexar"
              accessibilityState={{
                disabled: ocupado || acessoOffline || !janelaAberta,
              }}
              disabled={ocupado || acessoOffline || !janelaAberta}
              onPress={() => void selecionarMidia()}
              style={[
                estilos.botaoSecundario,
                (acessoOffline || !janelaAberta) && estilos.botaoAnexoDesabilitado,
              ]}
            >
              <Ionicons color={CORES.textoSecundario} name="attach-outline" size={23} />
            </Pressable>
            <View style={estilos.campo}>
              <TextInput
                    keyboardAppearance={modo === 'escuro' ? 'dark' : 'light'}
                    selectionColor={CORES.acao}
                accessibilityLabel="Mensagem"
                editable={!ocupado && janelaAberta}
                maxLength={4_096}
                multiline
                onChangeText={alterarTexto}
                placeholder={janelaAberta ? 'Digite uma mensagem…' : 'Janela encerrada — use mensagem aprovada'}
                placeholderTextColor={CORES.textoSecundario}
                ref={campo}
                style={estilos.entrada}
                value={texto}
              />
              {texto.length === 0 && janelaAberta && <Text style={estilos.dicaBarra}>/</Text>}
            </View>
            {possuiTexto ? (
              <Pressable
                accessibilityLabel="Enviar mensagem"
                accessibilityState={{ disabled: ocupado || !janelaAberta }}
                disabled={ocupado || !janelaAberta}
                onPress={() => void enviar()}
                style={({ pressed }) => [
                  estilos.botaoPrincipal,
                  !janelaAberta && estilos.botaoDesabilitado,
                  pressed && estilos.botaoPressionado,
                ]}
              >
                <Ionicons color={CORES.textoInvertido} name="send" size={20} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityLabel="Ações do sistema"
                onPress={() => {
                  definirAcoesAbertas(true);
                  void Haptics.selectionAsync();
                }}
                style={({ pressed }) => [estilos.botaoPrincipal, pressed && estilos.botaoPressionado]}
              >
                <Ionicons color={CORES.textoInvertido} name="grid-outline" size={20} />
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </View>

      <FolhaAcoesSistemaMobile
        acessoOffline={acessoOffline}
        aoAbrirDetalhes={aoAbrirDetalhes}
        aoFechar={() => definirAcoesAbertas(false)}
        atendimentoId={atendimentoId}
        reduzirMovimento={reduzirMovimento}
        servico={servico}
        visivel={acoesAbertas}
      />

      <Modal
        animationType={reduzirMovimento ? 'fade' : 'slide'}
        onRequestClose={() => definirMidiaSelecionada(undefined)}
        transparent
        visible={midiaSelecionada !== undefined}
      >
        <View style={estilos.fundoModal}>
          <Pressable
            accessibilityLabel="Cancelar envio do anexo"
            onPress={() => definirMidiaSelecionada(undefined)}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={['bottom']} style={estilos.folhaMidia}>
            <View style={estilos.alca} />
            <Text style={estilos.tituloFolha}>Revisar anexo</Text>
            <Text style={estilos.descricaoFolha}>
              O arquivo só será enviado depois da sua confirmação.
            </Text>
            {midiaSelecionada?.categoria === 'IMAGEM' ? (
              <Image
                accessibilityLabel="Prévia da imagem selecionada"
                resizeMode="contain"
                source={{ uri: midiaSelecionada.uri }}
                style={estilos.previaImagem}
              />
            ) : (
              <View style={estilos.previaArquivo}>
                <Ionicons
                  color={CORES.acao}
                  name={
                    midiaSelecionada?.categoria === 'AUDIO'
                      ? 'musical-notes-outline'
                      : midiaSelecionada?.categoria === 'VIDEO'
                        ? 'videocam-outline'
                        : 'document-text-outline'
                  }
                  size={38}
                />
              </View>
            )}
            <Text numberOfLines={2} style={estilos.nomeArquivo}>
              {midiaSelecionada?.nome}
            </Text>
            <Text style={estilos.metaArquivo}>
              {midiaSelecionada === undefined
                ? ''
                : `${tamanhoLegivel(midiaSelecionada.tamanhoBytes)} · Origem: este aparelho`}
            </Text>
            {erro !== undefined && (
              <Text accessibilityLiveRegion="polite" style={estilos.erroMidia}>
                {erro}
              </Text>
            )}
            <View style={estilos.acoesMidia}>
              <Pressable
                disabled={ocupado}
                onPress={() => definirMidiaSelecionada(undefined)}
                style={estilos.cancelarMidia}
              >
                <Text style={estilos.textoCancelarMidia}>Cancelar</Text>
              </Pressable>
              <Pressable
                accessibilityState={{ disabled: ocupado }}
                disabled={ocupado}
                onPress={() => void enviarMidia()}
                style={[estilos.confirmarMidia, ocupado && estilos.botaoDesabilitado]}
              >
                <Text style={estilos.textoConfirmarMidia}>
                  {ocupado ? 'Enviando…' : 'Confirmar envio'}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        animationType={reduzirMovimento ? 'fade' : 'slide'}
        onRequestClose={() => definirModelosAbertos(false)}
        transparent
        visible={modelosAbertos}
      >
        <View style={estilos.fundoModal}>
          <Pressable
            accessibilityLabel="Fechar mensagens aprovadas"
            onPress={() => definirModelosAbertos(false)}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={['bottom']} style={estilos.folha}>
            <View style={estilos.alca} />
            <View style={estilos.cabecalhoModelos}>
              {modeloSelecionado !== undefined && (
                <Pressable
                  accessibilityLabel="Voltar aos modelos"
                  onPress={() => {
                    definirModeloSelecionado(undefined);
                    definirParametros([]);
                  }}
                  style={estilos.voltarModelos}
                >
                  <Ionicons color={CORES.texto} name="chevron-back" size={23} />
                </Pressable>
              )}
              <View style={estilos.textoCabecalhoModelos}>
                <Text style={estilos.tituloFolha}>Mensagens aprovadas</Text>
                <Text style={estilos.descricaoModelo}>Canal e parâmetros são revalidados ao enviar.</Text>
              </View>
              <Pressable
                accessibilityLabel="Fechar mensagens aprovadas"
                onPress={() => definirModelosAbertos(false)}
                style={estilos.voltarModelos}
              >
                <Ionicons color={CORES.textoSecundario} name="close" size={23} />
              </Pressable>
            </View>
            {erro !== undefined && <Text accessibilityLiveRegion="polite" style={estilos.erroModelo}>{erro}</Text>}
            {modeloSelecionado === undefined ? (
              <ScrollView style={estilos.listaModelos} showsVerticalScrollIndicator={false}>
                {carregandoModelos ? (
                  <View style={estilos.skeletonModelo} />
                ) : modelos.length === 0 ? (
                  <Text style={estilos.semModelos}>Nenhuma mensagem aprovada disponível.</Text>
                ) : modelos.map((modelo) => (
                  <Pressable
                    key={modelo.id}
                    onPress={() => {
                      definirModeloSelecionado(modelo);
                      definirParametros(Array.from({ length: modelo.quantidadeParametros }, () => ''));
                    }}
                    style={({ pressed }) => [estilos.modelo, pressed && estilos.respostaPressionada]}
                  >
                    <View style={estilos.iconeAcao}>
                      <Ionicons color={CORES.acao} name="chatbubble-ellipses-outline" size={19} />
                    </View>
                    <View style={estilos.textoModelo}>
                      <Text style={estilos.nomeModelo}>{modelo.nome.replaceAll('_', ' ')}</Text>
                      <Text style={estilos.descricaoModelo}>{modelo.idioma} · {modelo.quantidadeParametros} campos</Text>
                    </View>
                    <Ionicons color={CORES.textoSecundario} name="chevron-forward" size={18} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" style={estilos.listaModelos}>
                <View style={estilos.modeloSelecionado}>
                  <Text style={estilos.nomeModelo}>{modeloSelecionado.nome.replaceAll('_', ' ')}</Text>
                  <Text style={estilos.descricaoModelo}>{modeloSelecionado.idioma}</Text>
                </View>
                {parametros.map((valor, indice) => (
                  <View key={indice} style={estilos.parametro}>
                    <Text style={estilos.rotuloParametro}>Campo {indice + 1}</Text>
                    <TextInput
                    keyboardAppearance={modo === 'escuro' ? 'dark' : 'light'}
                    selectionColor={CORES.acao}
                      maxLength={1_000}
                      onChangeText={(novo) => definirParametros((atuais) =>
                        atuais.map((atual, posicao) => posicao === indice ? novo : atual))}
                      style={estilos.entradaParametro}
                      value={valor}
                    />
                  </View>
                ))}
                <Pressable
                  accessibilityState={{ disabled: ocupado || parametros.some((item) => item.trim().length === 0) }}
                  disabled={ocupado || parametros.some((item) => item.trim().length === 0)}
                  onPress={() => void enviarModelo()}
                  style={[estilos.enviarModelo, ocupado && estilos.botaoDesabilitado]}
                >
                  <Text style={estilos.textoEnviarModelo}>{ocupado ? 'Enviando…' : 'Enviar mensagem aprovada'}</Text>
                </Pressable>
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (CORES: CoresTema) => StyleSheet.create({
  acaoPendencia: { paddingHorizontal: 8, paddingVertical: 7 },
  acaoPendenciaDesabilitada: { opacity: 0.45 },
  acaoPendenciaPrincipal: { backgroundColor: CORES.atencao, borderRadius: RAIOS.pílula, paddingHorizontal: 12, paddingVertical: 7 },
  acoesPendencia: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  alca: { alignSelf: 'center', backgroundColor: CORES.bordaForte, borderRadius: RAIOS.pílula, height: 4, marginBottom: 18, width: 38 },
  acoesMidia: { flexDirection: 'row', gap: 10, marginTop: 18 },
  area: { backgroundColor: CORES.superficie, borderTopColor: CORES.borda, borderTopWidth: 1, position: 'relative' },
  atalho: { color: CORES.acao, fontSize: 12, fontWeight: '800' },
  botaoDesabilitado: { backgroundColor: CORES.superficieDesabilitada },
  botaoAnexoDesabilitado: { opacity: 0.42 },
  botaoPressionado: { opacity: 0.82, transform: [{ scale: 0.96 }] },
  botaoPrincipal: { alignItems: 'center', backgroundColor: CORES.acao, borderRadius: RAIOS.pílula, height: 44, justifyContent: 'center', width: 44 },
  botaoModelo: { backgroundColor: CORES.acaoClara, borderRadius: RAIOS.pílula, paddingHorizontal: 12, paddingVertical: 8 },
  botaoSecundario: { alignItems: 'center', borderColor: CORES.borda, borderRadius: RAIOS.pílula, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  cancelarMidia: { alignItems: 'center', borderColor: CORES.borda, borderRadius: RAIOS.campo, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  campo: { alignItems: 'center', backgroundColor: CORES.superficieElevada, borderColor: CORES.borda, borderRadius: 22, borderWidth: 1, flex: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: 13 },
  cabecalhoModelos: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  cabecalhoPendencia: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  descricaoPendencia: { color: CORES.textoNota, fontSize: 11, lineHeight: 15, marginTop: 5 },
  descricaoJanelaFechada: { color: CORES.textoSecundario, fontSize: 10, marginTop: 2 },
  descricaoModelo: { color: CORES.textoSecundario, fontSize: 11, marginTop: 2 },
  descricaoFolha: { color: CORES.textoSecundario, fontSize: 13, marginBottom: 15, marginTop: 3 },
  dicaBarra: { color: CORES.textoSecundario, fontSize: 15, fontWeight: '700' },
  confirmarMidia: { alignItems: 'center', backgroundColor: CORES.acao, borderRadius: RAIOS.campo, flex: 1.4, justifyContent: 'center', minHeight: 48 },
  entrada: { color: CORES.texto, flex: 1, fontSize: 15, lineHeight: 20, maxHeight: 112, minHeight: 42, paddingVertical: 10 },
  entradaParametro: { borderColor: CORES.borda, borderRadius: RAIOS.campo, borderWidth: 1, color: CORES.texto, fontSize: 14, minHeight: 44, paddingHorizontal: 12 },
  enviarModelo: { alignItems: 'center', backgroundColor: CORES.acao, borderRadius: RAIOS.campo, justifyContent: 'center', marginTop: 14, minHeight: 48 },
  erro: { backgroundColor: CORES.alertaClara, color: CORES.alerta, fontSize: 11, lineHeight: 16, paddingHorizontal: ESPACOS.grande, paddingVertical: 7 },
  erroModelo: { color: CORES.alerta, fontSize: 11, lineHeight: 16, marginTop: 10 },
  erroMidia: { color: CORES.alerta, fontSize: 11, lineHeight: 16, marginTop: 12 },
  folha: { backgroundColor: CORES.superficie, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '84%', padding: ESPACOS.grande, width: '100%' },
  folhaMidia: { backgroundColor: CORES.superficie, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: ESPACOS.grande, width: '100%' },
  fundoModal: { backgroundColor: CORES.sobreposicao, flex: 1, justifyContent: 'flex-end' },
  iconeAcao: { alignItems: 'center', backgroundColor: CORES.superficieElevada, borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  janelaFechada: { alignItems: 'center', backgroundColor: CORES.atencaoClara, borderBottomColor: CORES.atencaoBorda, borderBottomWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  linhaComposer: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingTop: 8 },
  listaSugestoes: { maxHeight: 250 },
  listaModelos: { marginTop: 15, maxHeight: 440 },
  modelo: { alignItems: 'center', borderTopColor: CORES.borda, borderTopWidth: 1, flexDirection: 'row', gap: 10, minHeight: 58, paddingVertical: 10 },
  modeloSelecionado: { backgroundColor: CORES.superficieElevada, borderRadius: RAIOS.campo, marginBottom: 12, padding: 12 },
  metaArquivo: { color: CORES.textoSecundario, fontSize: 11, marginTop: 4 },
  nomeArquivo: { color: CORES.texto, fontSize: 14, fontWeight: '700', marginTop: 12 },
  nomeModelo: { color: CORES.texto, fontSize: 13, fontWeight: '700' },
  parametro: { gap: 5, marginBottom: 10 },
  pendencia: { backgroundColor: CORES.superficieElevada, borderBottomColor: CORES.borda, borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  pendenciaRevisao: { backgroundColor: CORES.atencaoClara, borderBottomColor: CORES.atencaoBorda },
  previaResposta: { color: CORES.textoSecundario, fontSize: 11, lineHeight: 15, marginTop: 3 },
  previaArquivo: { alignItems: 'center', backgroundColor: CORES.superficieElevada, borderRadius: RAIOS.campo, height: 144, justifyContent: 'center' },
  previaImagem: { backgroundColor: CORES.superficieElevada, borderRadius: RAIOS.campo, height: 230, width: '100%' },
  resposta: { borderTopColor: CORES.borda, borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  respostaPressionada: { backgroundColor: CORES.superficieElevada },
  rotuloParametro: { color: CORES.textoSecundario, fontSize: 11, fontWeight: '600' },
  rodape: { backgroundColor: CORES.superficie },
  sugestoes: { backgroundColor: CORES.superficie, borderColor: CORES.borda, borderRadius: 16, borderWidth: 1, bottom: '100%', left: 10, maxHeight: 290, overflow: 'hidden', position: 'absolute', right: 10, zIndex: 20 },
  semModelos: { color: CORES.textoSecundario, fontSize: 13, paddingVertical: 22, textAlign: 'center' },
  skeletonModelo: { backgroundColor: CORES.skeleton, borderRadius: RAIOS.campo, height: 64 },
  textoBotaoModelo: { color: CORES.acao, fontSize: 11, fontWeight: '700' },
  textoCancelarMidia: { color: CORES.textoSecundario, fontSize: 13, fontWeight: '700' },
  textoConfirmarMidia: { color: CORES.textoInvertido, fontSize: 13, fontWeight: '700' },
  textoAcaoPendencia: { color: CORES.textoSecundario, fontSize: 11, fontWeight: '700' },
  textoAcaoPendenciaPrincipal: { color: CORES.textoInvertido, fontSize: 11, fontWeight: '700' },
  textoCabecalhoModelos: { flex: 1 },
  textoEnviarModelo: { color: CORES.textoInvertido, fontSize: 14, fontWeight: '700' },
  textoJanelaFechada: { flex: 1 },
  textoPendencia: { color: CORES.texto, fontSize: 12, lineHeight: 16, marginTop: 4 },
  tentarPendencia: { alignSelf: 'flex-start', marginTop: 5, paddingVertical: 4 },
  tituloFolha: { color: CORES.texto, fontSize: 20, fontWeight: '800' },
  tituloJanelaFechada: { color: CORES.textoNota, fontSize: 12, fontWeight: '700' },
  tituloPendencia: { color: CORES.texto, fontSize: 11, fontWeight: '800' },
  tituloResposta: { color: CORES.texto, fontSize: 13, fontWeight: '700', marginTop: 2 },
  tituloSugestoes: { color: CORES.textoSecundario, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, padding: 11, textTransform: 'uppercase' },
  textoModelo: { flex: 1 },
  voltarModelos: { alignItems: 'center', height: 40, justifyContent: 'center', width: 36 },
});
