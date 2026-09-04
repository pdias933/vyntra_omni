import type { CoresTema } from '@vyntra/tema';
import { useTema, useEstilos } from '../aparencia/contexto-tema';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarcaVyntra } from '../componentes/MarcaVyntra';
import {
  FILTROS_ATENDIMENTOS_MOBILE,
  type FiltroAtendimentosMobile,
  type RepositorioReplicaLocal,
  type ResumoAtendimentoLocal,
} from '../offline/repositorio-replica-local';
import type { EstadoSincronizacaoMobile } from '../sincronizacao/motor-sincronizacao-mobile';
import { ESPACOS, RAIOS } from '../tema';

const ROTULOS_FILTRO: Readonly<Record<FiltroAtendimentosMobile, string>> = {
  EM_AUTOMACAO: 'Em automação',
  EXPIRANDO: 'Expirando',
  MEUS: 'Meus',
  NAO_LIDOS: 'Não lidos',
  PENDENTES: 'Pendentes',
  SLA: 'SLA',
};

const ESTADOS_CONEXAO: Readonly<
  Partial<Record<EstadoSincronizacaoMobile, { icone: 'cloud-offline-outline' | 'sync'; texto: string }>>
> = {
  CONECTANDO: { icone: 'sync', texto: 'Conectando...' },
  SEM_CONEXAO: { icone: 'cloud-offline-outline', texto: 'Sem conexão' },
  SINCRONIZANDO: { icone: 'sync', texto: 'Sincronizando...' },
};

const CONTAGENS_VAZIAS: Readonly<Record<FiltroAtendimentosMobile, number>> = {
  EM_AUTOMACAO: 0,
  EXPIRANDO: 0,
  MEUS: 0,
  NAO_LIDOS: 0,
  PENDENTES: 0,
  SLA: 0,
};

function iniciais(nome: string): string {
  return (
    nome
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((parte) => parte[0]?.toLocaleUpperCase('pt-BR'))
      .join('') || '?'
  );
}

function horario(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  if (data.toDateString() === hoje.toDateString()) {
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function prazo(iso: string, CORES: CoresTema): { cor: string; texto: string } {
  const minutos = Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000);
  if (minutos <= 0) return { cor: CORES.alerta, texto: 'Agora' };
  if (minutos < 60) {
    return {
      cor: minutos <= 15 ? CORES.alerta : CORES.atencao,
      texto: `${minutos} min`,
    };
  }
  const horas = Math.floor(minutos / 60);
  const restantes = minutos % 60;
  return { cor: CORES.textoSecundario, texto: `${horas}h ${restantes}min` };
}

function SkeletonLista() {
  const estilos = useEstilos(criarEstilos);
  const opacidade = useSharedValue(0.45);
  useEffect(() => {
    opacidade.value = withRepeat(
      withTiming(1, { duration: 760, reduceMotion: ReduceMotion.System }),
      -1,
      true,
    );
  }, [opacidade]);
  const animado = useAnimatedStyle(() => ({ opacity: opacidade.value }));
  return (
    <View accessibilityLabel="Carregando atendimentos" style={estilos.skeletonLista}>
      {Array.from({ length: 6 }, (_, indice) => (
        <Animated.View key={indice} style={[estilos.skeletonCartao, animado]}>
          <View style={estilos.skeletonAvatar} />
          <View style={estilos.skeletonTexto}>
            <View style={estilos.skeletonLinhaNome} />
            <View style={estilos.skeletonLinhaMensagem} />
            <View style={estilos.skeletonLinhaFila} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const CartaoAtendimento = memo(function CartaoAtendimento({
  aoAbrirAtendimento,
  item,
}: {
  readonly aoAbrirAtendimento: (atendimento: ResumoAtendimentoLocal) => void;
  readonly item: ResumoAtendimentoLocal;
}) {
  const { cores: CORES } = useTema();
  const estilos = useEstilos(criarEstilos);
  const limite = item.slaEm ?? item.janelaExpiraEm;
  const marcadorPrazo = limite === undefined ? undefined : prazo(limite, CORES);
  return (
    <Pressable
      accessibilityHint="Abre a conversa"
      accessibilityLabel={`${item.nomeContato}. ${item.ultimaMensagemResumo}. Fila ${item.filaNome}.${item.quantidadeNaoLida > 0 ? ` ${item.quantidadeNaoLida} não lidas.` : ''}`}
      accessibilityRole="button"
      onPress={() => aoAbrirAtendimento(item)}
      style={({ pressed }) => [estilos.cartao, pressed && estilos.cartaoPressionado]}
    >
      <View style={estilos.avatar}>
        <Text style={estilos.iniciais}>{iniciais(item.nomeContato)}</Text>
        <View style={estilos.canal}>
          <Ionicons color={CORES.textoInvertido} name="logo-whatsapp" size={12} />
        </View>
      </View>
      <View style={estilos.corpoCartao}>
        <View style={estilos.linhaPrincipal}>
          <Text numberOfLines={1} style={estilos.nomeContato}>
            {item.nomeContato}
          </Text>
          <Text style={estilos.horario}>{horario(item.ultimaAtividadeEm)}</Text>
        </View>
        <View style={estilos.linhaMensagem}>
          {item.ultimaMensagemDirecao === 'SAIDA' && (
            <Ionicons color={CORES.acao} name="checkmark-done" size={16} />
          )}
          <Text numberOfLines={1} style={estilos.mensagem}>
            {item.ultimaMensagemResumo}
          </Text>
          {item.quantidadeNaoLida > 0 && (
            <View style={estilos.naoLidas}>
              <Text style={estilos.textoNaoLidas}>
                {Math.min(item.quantidadeNaoLida, 99)}
              </Text>
            </View>
          )}
        </View>
        <View style={estilos.linhaContexto}>
          <View style={estilos.fila}>
            <Ionicons color={CORES.textoSecundario} name="folder-outline" size={13} />
            <Text numberOfLines={1} style={estilos.textoFila}>
              {item.filaNome}
            </Text>
          </View>
          {marcadorPrazo !== undefined && (
            <View style={estilos.prazo}>
              <Ionicons color={marcadorPrazo.cor} name="timer-outline" size={14} />
              <Text style={[estilos.textoPrazo, { color: marcadorPrazo.cor }]}>
                {marcadorPrazo.texto}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

function preservarItensInalterados(
  atuais: readonly ResumoAtendimentoLocal[],
  proximos: readonly ResumoAtendimentoLocal[],
): readonly ResumoAtendimentoLocal[] {
  const anteriores = new Map(atuais.map((item) => [item.conversaId, item]));
  return proximos.map((proximo) => {
    const anterior = anteriores.get(proximo.conversaId);
    if (anterior === undefined) return proximo;
    const chaves = Object.keys(proximo) as (keyof ResumoAtendimentoLocal)[];
    return Object.keys(anterior).length === chaves.length &&
      chaves.every((chave) => anterior[chave] === proximo[chave])
      ? anterior
      : proximo;
  });
}

export function TelaListaAtendimentos({
  aoAbrirAtendimento,
  estadoSincronizacao,
  repositorio,
  usuarioId,
}: {
  readonly aoAbrirAtendimento: (atendimento: ResumoAtendimentoLocal) => void;
  readonly estadoSincronizacao: EstadoSincronizacaoMobile;
  readonly repositorio: RepositorioReplicaLocal;
  readonly usuarioId: string;
}) {
  const { cores: CORES } = useTema();
  const estilos = useEstilos(criarEstilos);
  const reduzirMovimento = useReducedMotion();
  const [filtro, definirFiltro] = useState<FiltroAtendimentosMobile>('MEUS');
  const [itens, definirItens] = useState<readonly ResumoAtendimentoLocal[]>([]);
  const [contagens, definirContagens] = useState(CONTAGENS_VAZIAS);
  const [carregando, definirCarregando] = useState(true);
  const [falhou, definirFalhou] = useState(false);
  const requisicao = useRef(0);

  const carregar = useCallback(async () => {
    const atual = ++requisicao.current;
    try {
      const [lista, totais] = await Promise.all([
        repositorio.listarAtendimentos(filtro, usuarioId),
        repositorio.contarFiltrosAtendimentos(usuarioId),
      ]);
      if (requisicao.current !== atual) return;
      definirItens((atuais) => preservarItensInalterados(atuais, lista));
      definirContagens(totais);
      definirFalhou(false);
    } catch {
      if (requisicao.current === atual) definirFalhou(true);
    } finally {
      if (requisicao.current === atual) definirCarregando(false);
    }
  }, [filtro, repositorio, usuarioId]);

  useEffect(() => {
    const inicial = setTimeout(() => void carregar(), 0);
    const remover = repositorio.observarMudancas(() => void carregar());
    const relogio = setInterval(() => void carregar(), 30_000);
    return () => {
      requisicao.current += 1;
      clearTimeout(inicial);
      clearInterval(relogio);
      remover();
    };
  }, [carregar, repositorio]);

  const conexao = ESTADOS_CONEXAO[estadoSincronizacao];
  const renderizarItem = useCallback(
    ({ item }: { readonly item: ResumoAtendimentoLocal }) => (
      <CartaoAtendimento
        aoAbrirAtendimento={aoAbrirAtendimento}
        item={item}
      />
    ),
    [aoAbrirAtendimento],
  );
  return (
    <SafeAreaView edges={['top']} style={estilos.tela}>
      {conexao !== undefined && (
        <View accessibilityLiveRegion="polite" style={estilos.faixaConexao}>
          <Ionicons color={CORES.textoSecundario} name={conexao.icone} size={15} />
          <Text style={estilos.textoConexao}>{conexao.texto}</Text>
        </View>
      )}
      <View style={estilos.cabecalho}>
        <View>
          <Text accessibilityRole="header" style={estilos.titulo}>
            Atendimentos
          </Text>
          <Text style={estilos.subtitulo}>Conversas da sua operação</Text>
        </View>
        <MarcaVyntra compacta />
      </View>
      <ScrollView
        contentContainerStyle={estilos.filtros}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {FILTROS_ATENDIMENTOS_MOBILE.map((codigo) => {
          const ativo = filtro === codigo;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: ativo }}
              key={codigo}
              onPress={() => {
                if (codigo === filtro) return;
                void Haptics.selectionAsync();
                definirCarregando(true);
                definirFiltro(codigo);
              }}
              style={({ pressed }) => [
                estilos.filtro,
                ativo && estilos.filtroAtivo,
                pressed && estilos.filtroPressionado,
              ]}
            >
              <Text style={[estilos.textoFiltro, ativo && estilos.textoFiltroAtivo]}>
                {ROTULOS_FILTRO[codigo]}
              </Text>
              {contagens[codigo] > 0 && (
                <Text style={[estilos.contagemFiltro, ativo && estilos.contagemFiltroAtiva]}>
                  {Math.min(contagens[codigo], 99)}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {carregando && itens.length === 0 ? (
        <SkeletonLista />
      ) : falhou && itens.length === 0 ? (
        <View style={estilos.vazio}>
          <Ionicons color={CORES.textoSecundario} name="lock-closed-outline" size={30} />
          <Text style={estilos.tituloVazio}>Não foi possível abrir os atendimentos</Text>
          <Text style={estilos.textoVazio}>Desbloqueie novamente quando houver conexão.</Text>
        </View>
      ) : (
        <Animated.FlatList
          contentContainerStyle={itens.length === 0 ? estilos.listaVazia : estilos.lista}
          data={itens}
          initialNumToRender={12}
          {...(reduzirMovimento
            ? {}
            : { itemLayoutAnimation: LinearTransition.duration(180) })}
          keyExtractor={(item) => item.conversaId}
          maxToRenderPerBatch={10}
          ListEmptyComponent={
            <View style={estilos.vazio}>
              <View style={estilos.iconeVazio}>
                <Ionicons color={CORES.acao} name="chatbubbles-outline" size={28} />
              </View>
              <Text style={estilos.tituloVazio}>Nada por aqui</Text>
              <Text style={estilos.textoVazio}>
                Não há atendimentos neste filtro agora.
              </Text>
            </View>
          }
          renderItem={renderizarItem}
          showsVerticalScrollIndicator={false}
          updateCellsBatchingPeriod={32}
          windowSize={7}
        />
      )}
    </SafeAreaView>
  );
}

const criarEstilos = (CORES: CoresTema) => StyleSheet.create({
  avatar: { alignItems: 'center', backgroundColor: CORES.avatar, borderRadius: 25, height: 50, justifyContent: 'center', position: 'relative', width: 50 },
  cabecalho: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: ESPACOS.grande, paddingTop: 17 },
  canal: { alignItems: 'center', backgroundColor: CORES.acao, borderColor: CORES.superficie, borderRadius: RAIOS.pílula, borderWidth: 2, bottom: -2, height: 20, justifyContent: 'center', position: 'absolute', right: -3, width: 20 },
  cartao: { alignItems: 'center', backgroundColor: CORES.superficie, borderColor: CORES.borda, borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 13, marginBottom: 9, padding: 14 },
  cartaoPressionado: { backgroundColor: CORES.superficieElevada, transform: [{ scale: 0.995 }] },
  contagemFiltro: { color: CORES.textoSecundario, fontSize: 11, fontWeight: '700' },
  contagemFiltroAtiva: { color: CORES.acaoClara },
  corpoCartao: { flex: 1, gap: 5 },
  faixaConexao: { alignItems: 'center', backgroundColor: CORES.superficieElevada, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 29, paddingHorizontal: 12 },
  fila: { alignItems: 'center', backgroundColor: CORES.superficieElevada, borderRadius: RAIOS.pílula, flexDirection: 'row', gap: 5, maxWidth: '68%', paddingHorizontal: 8, paddingVertical: 4 },
  filtro: { alignItems: 'center', backgroundColor: CORES.superficie, borderColor: CORES.borda, borderRadius: RAIOS.pílula, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 38, paddingHorizontal: 15 },
  filtroAtivo: { backgroundColor: CORES.acao, borderColor: CORES.acao },
  filtroPressionado: { opacity: 0.78 },
  filtros: { gap: 8, paddingHorizontal: ESPACOS.grande },
  horario: { color: CORES.textoSecundario, fontSize: 11 },
  iconeVazio: { alignItems: 'center', backgroundColor: CORES.acaoClara, borderRadius: RAIOS.pílula, height: 58, justifyContent: 'center', marginBottom: 15, width: 58 },
  iniciais: { color: CORES.textoSecundario, fontSize: 16, fontWeight: '700' },
  linhaContexto: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 23 },
  linhaMensagem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  linhaPrincipal: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  lista: { paddingBottom: 18, paddingHorizontal: ESPACOS.pequeno, paddingTop: 15 },
  listaVazia: { flexGrow: 1, paddingHorizontal: ESPACOS.grande },
  mensagem: { color: CORES.textoSecundario, flex: 1, fontSize: 13, lineHeight: 18 },
  naoLidas: { alignItems: 'center', backgroundColor: CORES.acao, borderRadius: RAIOS.pílula, justifyContent: 'center', minHeight: 21, minWidth: 21, paddingHorizontal: 6 },
  nomeContato: { color: CORES.texto, flex: 1, fontSize: 16, fontWeight: '700' },
  prazo: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  skeletonAvatar: { backgroundColor: CORES.borda, borderRadius: 25, height: 50, width: 50 },
  skeletonCartao: { alignItems: 'center', backgroundColor: CORES.superficieElevada, borderRadius: 18, flexDirection: 'row', gap: 13, height: 105, padding: 14 },
  skeletonLinhaFila: { backgroundColor: CORES.borda, borderRadius: RAIOS.pílula, height: 16, width: '38%' },
  skeletonLinhaMensagem: { backgroundColor: CORES.borda, borderRadius: RAIOS.pílula, height: 11, width: '88%' },
  skeletonLinhaNome: { backgroundColor: CORES.borda, borderRadius: RAIOS.pílula, height: 14, width: '56%' },
  skeletonLista: { gap: 9, paddingHorizontal: ESPACOS.pequeno, paddingTop: 15 },
  skeletonTexto: { flex: 1, gap: 11 },
  subtitulo: { color: CORES.textoSecundario, fontSize: 12, marginTop: 2 },
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  textoConexao: { color: CORES.textoSecundario, fontSize: 12, fontWeight: '600' },
  textoFila: { color: CORES.textoSecundario, flexShrink: 1, fontSize: 11, fontWeight: '600' },
  textoFiltro: { color: CORES.texto, fontSize: 13, fontWeight: '600' },
  textoFiltroAtivo: { color: CORES.textoInvertido },
  textoNaoLidas: { color: CORES.textoInvertido, fontSize: 11, fontWeight: '800' },
  textoPrazo: { fontSize: 11, fontWeight: '700' },
  textoVazio: { color: CORES.textoSecundario, fontSize: 13, lineHeight: 19, marginTop: 5, textAlign: 'center' },
  titulo: { color: CORES.texto, fontSize: 29, fontWeight: '800', letterSpacing: -0.8 },
  tituloVazio: { color: CORES.texto, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  vazio: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
});
