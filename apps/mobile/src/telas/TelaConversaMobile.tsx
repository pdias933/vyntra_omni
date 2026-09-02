import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  ItemTimelineMobile,
  PaginaTimelineMobile,
} from '../atendimentos/modelo-atendimento-mobile';
import type { ServicoAtendimentosMobile } from '../atendimentos/servico-atendimentos-mobile';
import { ComposerMobile } from '../componentes/ComposerMobile';
import type {
  ItemTimelineLocal,
  RepositorioReplicaLocal,
  ResumoAtendimentoLocal,
} from '../offline/repositorio-replica-local';
import type { ServicoPendenciasSaidaMobile } from '../offline/servico-pendencias-saida-mobile';
import { CORES, ESPACOS, RAIOS } from '../tema';

function dataSeparador(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  if (data.toDateString() === hoje.toDateString()) return 'Hoje';
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (data.toDateString() === ontem.toDateString()) return 'Ontem';
  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: data.getFullYear() === hoje.getFullYear() ? undefined : 'numeric',
  });
}

function horario(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tempoRestanteJanela(expiraEm: string, agora: number): string {
  const minutos = Math.max(0, Math.ceil((new Date(expiraEm).getTime() - agora) / 60_000));
  if (minutos < 1) return 'menos de 1 min';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const restantes = minutos % 60;
  return restantes === 0 ? `${horas}h` : `${horas}h ${restantes}min`;
}

function textoMensagem(item: ItemTimelineMobile): string {
  if (item.texto !== undefined) return item.texto;
  const rotulos: Readonly<Record<string, string>> = {
    AUDIO: 'Áudio',
    IMAGEM: 'Imagem',
    INTERATIVA: 'Interação recebida',
    MODELO_APROVADO: 'Mensagem aprovada',
    PDF: 'Documento PDF',
    VIDEO: 'Vídeo',
  };
  return rotulos[item.mensagemTipo ?? ''] ?? 'Mensagem';
}

function iconeEstado(estado?: string) {
  if (estado === undefined || estado === 'NA_FILA' || estado === 'ENVIANDO') {
    return 'time-outline' as const;
  }
  if (estado === 'FALHOU' || estado === 'CANCELADA') {
    return 'alert-circle-outline' as const;
  }
  return estado === 'ENVIADA' ? ('checkmark' as const) : ('checkmark-done' as const);
}

function ItemTimeline({
  aoAbrirFormulario,
  item,
  mostrarData,
}: {
  readonly aoAbrirFormulario: (item: ItemTimelineMobile) => void;
  readonly item: ItemTimelineMobile;
  readonly mostrarData: boolean;
}) {
  const mensagemSaida = item.tipo === 'MENSAGEM' && item.direcao === 'SAIDA';
  const interno =
    item.tipo === 'NOTA_INTERNA' || item.tipo === 'EVENTO_OPERACIONAL';
  const formulario = item.tipo === 'FORMULARIO';

  return (
    <View>
      {mostrarData && (
        <View style={estilos.separadorData}>
          <Text style={estilos.textoSeparador}>{dataSeparador(item.ocorridoEm)}</Text>
        </View>
      )}
      {item.tipo === 'SEPARADOR_ATENDIMENTO' ? (
        <View style={estilos.evento}>
          <Ionicons color={CORES.textoSecundario} name="git-branch-outline" size={15} />
          <View style={estilos.corpoEvento}>
            <Text style={estilos.textoEvento}>{item.rotulo ?? 'Atendimento'}</Text>
            {item.contaWhatsAppNome !== undefined && (
              <Text style={estilos.metaEvento}>{item.contaWhatsAppNome}</Text>
            )}
          </View>
        </View>
      ) : interno ? (
        <View style={[estilos.interno, item.tipo === 'NOTA_INTERNA' && estilos.nota]}>
          <View style={estilos.rotuloEquipe}>
            <Ionicons color="#805A00" name="lock-closed" size={12} />
            <Text style={estilos.textoEquipe}>Somente equipe</Text>
          </View>
          <Text style={estilos.textoInterno}>{item.texto ?? item.rotulo}</Text>
          <Text style={estilos.horaInterna}>{horario(item.ocorridoEm)}</Text>
        </View>
      ) : (
        <View
          style={[
            estilos.bolha,
            mensagemSaida ? estilos.bolhaSaida : estilos.bolhaEntrada,
            formulario && estilos.bolhaFormulario,
          ]}
        >
          {item.contaWhatsAppNome !== undefined && (
            <Text style={estilos.origem}>{item.contaWhatsAppNome}</Text>
          )}
          {item.citacaoTexto !== undefined && (
            <View style={estilos.citacao}>
              <Text numberOfLines={2} style={estilos.textoCitacao}>
                {item.citacaoTexto}
              </Text>
            </View>
          )}
          {formulario && (
            <View style={estilos.tituloFormulario}>
              <Ionicons color="#5D4DB4" name="reader-outline" size={18} />
              <Text style={estilos.textoTituloFormulario}>Informações recebidas</Text>
            </View>
          )}
          <Text style={estilos.textoBolha}>
            {formulario ? item.rotulo ?? textoMensagem(item) : textoMensagem(item)}
          </Text>
          {formulario && (
            <Pressable
              accessibilityRole="button"
              onPress={() => aoAbrirFormulario(item)}
              style={estilos.botaoVerFormulario}
            >
              <Text style={estilos.verFormulario}>Ver formulário</Text>
              <Ionicons color="#5D4DB4" name="chevron-forward" size={15} />
            </Pressable>
          )}
          {item.reacoes !== undefined && (
            <Text style={estilos.reacoes}>
              {item.reacoes.map(({ emoji }) => emoji).join(' ')}
            </Text>
          )}
          <View style={estilos.metaMensagem}>
            <Text style={estilos.horaMensagem}>{horario(item.ocorridoEm)}</Text>
            {mensagemSaida && (
              <Ionicons
                color={item.estadoMensagem === 'FALHOU' ? CORES.alerta : CORES.acao}
                name={iconeEstado(item.estadoMensagem)}
                size={15}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function converterLocal(item: ItemTimelineLocal): ItemTimelineMobile {
  return { ...item };
}

export function TelaConversaMobile({
  acessoOffline,
  aoAbrirDetalhes,
  aoVoltar,
  atendimento,
  repositorio,
  servico,
  servicoPendencias,
  usuarioId,
}: {
  readonly acessoOffline: boolean;
  readonly aoAbrirDetalhes: () => void;
  readonly aoVoltar: () => void;
  readonly atendimento: ResumoAtendimentoLocal;
  readonly repositorio: RepositorioReplicaLocal;
  readonly servico: ServicoAtendimentosMobile;
  readonly servicoPendencias: ServicoPendenciasSaidaMobile;
  readonly usuarioId: string;
}) {
  const reduzirMovimento = useReducedMotion();
  const lista = useRef<FlatList<ItemTimelineMobile>>(null);
  const leituraEmVoo = useRef<string | undefined>(undefined);
  const primeiraPosicao = useRef(false);
  const [itens, definirItens] = useState<readonly ItemTimelineMobile[]>([]);
  const [cursor, definirCursor] = useState<string>();
  const [carregando, definirCarregando] = useState(true);
  const [carregandoAnteriores, definirCarregandoAnteriores] = useState(false);
  const [erro, definirErro] = useState(false);
  const [formularioAberto, definirFormularioAberto] = useState<ItemTimelineMobile>();
  const [agora, definirAgora] = useState<number>();

  const aplicarPagina = useCallback(
    async (pagina: PaginaTimelineMobile) => {
      definirItens(pagina.itens);
      definirCursor(pagina.proximoCursor);
      definirErro(false);
      const ultimaEntrada = [...pagina.itens]
        .reverse()
        .find(
          (item) =>
            (item.tipo === 'MENSAGEM' || item.tipo === 'FORMULARIO') &&
            item.direcao === 'ENTRADA',
        );
      if (
        ultimaEntrada === undefined ||
        pagina.marcador.ultimaMensagemLidaId === ultimaEntrada.id ||
        leituraEmVoo.current === ultimaEntrada.id
      ) {
        return;
      }
      leituraEmVoo.current = ultimaEntrada.id;
      try {
        await servico.confirmarLeitura(
          atendimento.atendimentoId,
          ultimaEntrada.id,
          pagina.marcador.versao,
        );
        await repositorio.confirmarLeituraLocal(
          atendimento.atendimentoId,
          atendimento.conversaId,
        );
      } catch {
        // O marcador permanece pendente e será reconciliado na próxima leitura online.
      } finally {
        leituraEmVoo.current = undefined;
      }
    },
    [atendimento.atendimentoId, atendimento.conversaId, repositorio, servico],
  );

  const carregar = useCallback(async () => {
    let locais: readonly ItemTimelineLocal[];
    try {
      locais = await repositorio.listarTimeline(atendimento.conversaId);
    } catch {
      definirErro(true);
      definirCarregando(false);
      return;
    }
    definirItens(locais.map(converterLocal));
    definirErro(false);
    definirCarregando(false);
    if (acessoOffline) return;
    try {
      await aplicarPagina(await servico.obterTimeline(atendimento.atendimentoId));
    } catch {
      definirItens([]);
      definirErro(true);
    }
  }, [acessoOffline, aplicarPagina, atendimento, repositorio, servico]);

  useEffect(() => {
    const inicial = setTimeout(() => void carregar(), 0);
    const remover = repositorio.observarMudancas(() => void carregar());
    return () => {
      clearTimeout(inicial);
      remover();
    };
  }, [carregar, repositorio]);

  useEffect(() => {
    if (atendimento.janelaExpiraEm === undefined) return;
    const inicial = setTimeout(() => definirAgora(Date.now()), 0);
    const atualizar = setInterval(() => definirAgora(Date.now()), 30_000);
    return () => {
      clearTimeout(inicial);
      clearInterval(atualizar);
    };
  }, [atendimento.janelaExpiraEm]);

  async function carregarAnteriores() {
    if (cursor === undefined || carregandoAnteriores || acessoOffline) return;
    definirCarregandoAnteriores(true);
    try {
      const pagina = await servico.obterTimeline(atendimento.atendimentoId, cursor);
      definirItens((atuais) => {
        const conhecidos = new Set(atuais.map(({ id }) => id));
        return [...pagina.itens.filter(({ id }) => !conhecidos.has(id)), ...atuais];
      });
      definirCursor(pagina.proximoCursor);
    } catch {
      // A página atual permanece utilizável; nova tentativa ocorre na próxima rolagem.
    } finally {
      definirCarregandoAnteriores(false);
    }
  }

  function observarRolagem(evento: NativeSyntheticEvent<NativeScrollEvent>) {
    if (evento.nativeEvent.contentOffset.y < 72) void carregarAnteriores();
  }

  const janela = atendimento.janelaExpiraEm;
  const janelaAberta = janela !== undefined && agora !== undefined && new Date(janela).getTime() > agora;
  return (
    <SafeAreaView edges={['top']} style={estilos.tela}>
      <View style={estilos.cabecalho}>
        <Pressable accessibilityLabel="Voltar" onPress={aoVoltar} style={estilos.acaoCabecalho}>
          <Ionicons color={CORES.texto} name="chevron-back" size={26} />
        </Pressable>
        <Pressable
          accessibilityHint="Abre os detalhes do contato"
          accessibilityLabel={`${atendimento.nomeContato}. ${atendimento.identidadeSecundaria ?? atendimento.filaNome}`}
          accessibilityRole="button"
          onPress={aoAbrirDetalhes}
          style={estilos.contatoCabecalho}
        >
          <View style={estilos.avatar}>
            <Text style={estilos.iniciais}>{atendimento.nomeContato.slice(0, 1).toLocaleUpperCase('pt-BR')}</Text>
          </View>
          <View style={estilos.identidadeCabecalho}>
            <Text numberOfLines={1} style={estilos.nomeContato}>{atendimento.nomeContato}</Text>
            <Text numberOfLines={1} style={estilos.contextoContato}>
              {atendimento.identidadeSecundaria ?? atendimento.filaNome}
            </Text>
          </View>
        </Pressable>
        <View style={estilos.acaoCabecalho} />
      </View>
      {janelaAberta && (
        <View style={estilos.janelaMeta}>
          <Ionicons color={CORES.acao} name="logo-whatsapp" size={17} />
          <Text style={estilos.textoJanela}>Janela Meta aberta</Text>
          <Text style={estilos.tempoJanela}>
            expira em {tempoRestanteJanela(janela, agora)}
          </Text>
        </View>
      )}
      {acessoOffline && (
        <View style={estilos.avisoOffline}>
          <Text style={estilos.textoOffline}>Sem conexão · histórico recente disponível</Text>
        </View>
      )}
      {carregando ? (
        <View style={estilos.carregando}>
          <View style={estilos.skeletonMensagem} />
          <View style={[estilos.skeletonMensagem, estilos.skeletonDireita]} />
          <View style={estilos.skeletonMensagemCurta} />
        </View>
      ) : erro ? (
        <View style={estilos.vazio}>
          <Ionicons color={CORES.textoSecundario} name="cloud-offline-outline" size={30} />
          <Text style={estilos.tituloVazio}>Conversa indisponível</Text>
          <Text style={estilos.textoVazio}>A recuperação acontecerá automaticamente.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={estilos.timeline}
          data={itens}
          initialNumToRender={24}
          keyExtractor={(item) => item.id}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          maxToRenderPerBatch={16}
          onContentSizeChange={() => {
            if (primeiraPosicao.current || itens.length === 0) return;
            primeiraPosicao.current = true;
            lista.current?.scrollToEnd({ animated: false });
          }}
          onScroll={observarRolagem}
          ref={lista}
          renderItem={({ index, item }) => (
            <ItemTimeline
              aoAbrirFormulario={definirFormularioAberto}
              item={item}
              mostrarData={
                index === 0 ||
                dataSeparador(itens[index - 1]?.ocorridoEm ?? '') !==
                  dataSeparador(item.ocorridoEm)
              }
            />
          )}
          scrollEventThrottle={80}
          showsVerticalScrollIndicator={false}
          style={estilos.listaTimeline}
          updateCellsBatchingPeriod={32}
          windowSize={9}
        />
      )}
      {!erro && (
        <ComposerMobile
          acessoOffline={acessoOffline}
          aoAbrirDetalhes={aoAbrirDetalhes}
          aoEnviado={carregar}
          atendimentoId={atendimento.atendimentoId}
          conversaId={atendimento.conversaId}
          janelaAberta={janelaAberta}
          repositorio={repositorio}
          servico={servico}
          servicoPendencias={servicoPendencias}
          usuarioId={usuarioId}
        />
      )}
      <Modal
        animationType={reduzirMovimento ? 'fade' : 'slide'}
        onRequestClose={() => definirFormularioAberto(undefined)}
        transparent
        visible={formularioAberto !== undefined}
      >
        <View style={estilos.fundoFormulario}>
          <Pressable
            accessibilityLabel="Fechar formulário"
            onPress={() => definirFormularioAberto(undefined)}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={['bottom']} style={estilos.folhaFormulario}>
            <View style={estilos.alcaFormulario} />
            <View style={estilos.cabecalhoFormulario}>
              <View style={estilos.iconeFormulario}>
                <Ionicons color="#5D4DB4" name="reader-outline" size={21} />
              </View>
              <View style={estilos.textoCabecalhoFormulario}>
                <Text style={estilos.tituloFolhaFormulario}>Informações recebidas</Text>
                <Text style={estilos.nomeFormulario}>{formularioAberto?.rotulo ?? 'WhatsApp Flow'}</Text>
              </View>
              <Pressable
                accessibilityLabel="Fechar formulário"
                onPress={() => definirFormularioAberto(undefined)}
                style={estilos.fecharFormulario}
              >
                <Ionicons color={CORES.textoSecundario} name="close" size={24} />
              </Pressable>
            </View>
            {formularioAberto?.camposFormulario === undefined ? (
              <Text style={estilos.formularioSemCampos}>
                Os campos deste formulário não estão disponíveis nesta cópia recente.
              </Text>
            ) : (
              <ScrollView style={estilos.camposFormulario} showsVerticalScrollIndicator={false}>
                {formularioAberto.camposFormulario.map((campo, indice) => (
                  <View key={`${campo.rotulo}:${indice}`} style={estilos.campoFormulario}>
                    <Text style={estilos.rotuloCampoFormulario}>{campo.rotulo}</Text>
                    <Text selectable style={estilos.valorCampoFormulario}>{campo.valor}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <Text style={estilos.privacidadeFormulario}>
              Dados sensíveis são mascarados conforme suas permissões.
            </Text>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  acaoCabecalho: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  avatar: { alignItems: 'center', backgroundColor: '#DFE8E3', borderRadius: RAIOS.pílula, height: 42, justifyContent: 'center', width: 42 },
  avisoOffline: { alignItems: 'center', backgroundColor: '#FFF4DE', paddingVertical: 6 },
  alcaFormulario: { alignSelf: 'center', backgroundColor: '#D5DAD7', borderRadius: RAIOS.pílula, height: 4, marginBottom: 18, width: 38 },
  bolha: { borderRadius: 17, marginBottom: 7, maxWidth: '84%', paddingHorizontal: 12, paddingVertical: 9 },
  bolhaEntrada: { alignSelf: 'flex-start', backgroundColor: CORES.superficie, borderColor: CORES.borda, borderWidth: 1, borderTopLeftRadius: 5 },
  bolhaFormulario: { borderColor: '#D9D2FF', paddingTop: 11 },
  bolhaSaida: { alignSelf: 'flex-end', backgroundColor: '#DDF7E8', borderTopRightRadius: 5 },
  botaoVerFormulario: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 2, marginTop: 8 },
  cabecalhoFormulario: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  cabecalho: { alignItems: 'center', backgroundColor: CORES.superficie, borderBottomColor: CORES.borda, borderBottomWidth: 1, flexDirection: 'row', minHeight: 62, paddingHorizontal: 4 },
  carregando: { flex: 1, gap: 12, padding: ESPACOS.grande, paddingTop: 70 },
  campoFormulario: { borderTopColor: CORES.borda, borderTopWidth: 1, gap: 3, paddingVertical: 11 },
  camposFormulario: { marginTop: 16 },
  citacao: { borderLeftColor: CORES.acao, borderLeftWidth: 3, marginBottom: 7, paddingHorizontal: 8, paddingVertical: 5 },
  contatoCabecalho: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10 },
  contextoContato: { color: CORES.textoSecundario, fontSize: 12, marginTop: 1 },
  corpoEvento: { alignItems: 'center' },
  evento: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#EEF1EF', borderRadius: 13, flexDirection: 'row', gap: 7, marginBottom: 10, maxWidth: '88%', paddingHorizontal: 12, paddingVertical: 8 },
  fecharFormulario: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  folhaFormulario: { backgroundColor: CORES.superficie, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '84%', padding: ESPACOS.grande, width: '100%' },
  formularioSemCampos: { color: CORES.textoSecundario, fontSize: 13, lineHeight: 19, marginTop: 18 },
  fundoFormulario: { backgroundColor: 'rgba(9,20,15,0.36)', flex: 1, justifyContent: 'flex-end' },
  horaInterna: { alignSelf: 'flex-end', color: '#896D31', fontSize: 10 },
  horaMensagem: { color: CORES.textoSecundario, fontSize: 10 },
  identidadeCabecalho: { flex: 1 },
  iconeFormulario: { alignItems: 'center', backgroundColor: '#EEE8FF', borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  iniciais: { color: '#4A5B53', fontSize: 16, fontWeight: '700' },
  interno: { alignSelf: 'center', backgroundColor: '#EEF1EF', borderRadius: 14, marginBottom: 9, maxWidth: '88%', padding: 11 },
  janelaMeta: { alignItems: 'center', backgroundColor: '#F2FBF5', borderBottomColor: '#DCEBE1', borderBottomWidth: 1, flexDirection: 'row', gap: 7, minHeight: 35, paddingHorizontal: ESPACOS.grande },
  listaTimeline: { flex: 1 },
  metaEvento: { color: CORES.textoSecundario, fontSize: 10, marginTop: 1 },
  metaMensagem: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 3, marginTop: 3 },
  nomeContato: { color: CORES.texto, fontSize: 16, fontWeight: '700' },
  nomeFormulario: { color: CORES.textoSecundario, fontSize: 12, marginTop: 2 },
  nota: { backgroundColor: '#FFF4D7', borderColor: '#F2D99A', borderWidth: 1 },
  origem: { color: CORES.acao, fontSize: 10, fontWeight: '700', marginBottom: 4 },
  privacidadeFormulario: { color: CORES.textoSecundario, fontSize: 10, lineHeight: 15, marginTop: 10 },
  reacoes: { alignSelf: 'flex-start', backgroundColor: CORES.superficie, borderRadius: RAIOS.pílula, fontSize: 15, marginTop: 5, paddingHorizontal: 7, paddingVertical: 3 },
  rotuloEquipe: { alignItems: 'center', flexDirection: 'row', gap: 4, marginBottom: 5 },
  separadorData: { alignItems: 'center', marginBottom: 10, marginTop: 4 },
  skeletonDireita: { alignSelf: 'flex-end', width: '66%' },
  skeletonMensagem: { backgroundColor: '#E6EBE8', borderRadius: 17, height: 70, width: '74%' },
  skeletonMensagemCurta: { backgroundColor: '#E6EBE8', borderRadius: 17, height: 52, width: '48%' },
  tela: { backgroundColor: '#F3F6F4', flex: 1 },
  tempoJanela: { color: CORES.textoSecundario, fontSize: 11, marginLeft: 'auto' },
  textoCabecalhoFormulario: { flex: 1 },
  textoBolha: { color: CORES.texto, fontSize: 15, lineHeight: 21 },
  textoCitacao: { color: CORES.textoSecundario, fontSize: 12, lineHeight: 16 },
  textoEquipe: { color: '#805A00', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  textoEvento: { color: CORES.textoSecundario, fontSize: 12, textAlign: 'center' },
  textoInterno: { color: '#5C4B25', fontSize: 13, lineHeight: 18 },
  textoJanela: { color: CORES.acao, fontSize: 12, fontWeight: '700' },
  textoOffline: { color: '#805A00', fontSize: 11, fontWeight: '600' },
  textoSeparador: { backgroundColor: '#E8ECEA', borderRadius: RAIOS.pílula, color: CORES.textoSecundario, fontSize: 11, fontWeight: '600', overflow: 'hidden', paddingHorizontal: 11, paddingVertical: 5 },
  textoTituloFormulario: { color: '#5D4DB4', fontSize: 13, fontWeight: '700' },
  textoVazio: { color: CORES.textoSecundario, fontSize: 13, marginTop: 5, textAlign: 'center' },
  timeline: { flexGrow: 1, paddingBottom: 18, paddingHorizontal: 12, paddingTop: 14 },
  tituloFormulario: { alignItems: 'center', flexDirection: 'row', gap: 7, marginBottom: 7 },
  tituloFolhaFormulario: { color: CORES.texto, fontSize: 17, fontWeight: '800' },
  tituloVazio: { color: CORES.texto, fontSize: 17, fontWeight: '700', marginTop: 10 },
  vazio: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 30 },
  valorCampoFormulario: { color: CORES.texto, fontSize: 14, lineHeight: 20 },
  rotuloCampoFormulario: { color: CORES.textoSecundario, fontSize: 11, fontWeight: '600' },
  verFormulario: { color: '#5D4DB4', fontSize: 12, fontWeight: '700' },
});
