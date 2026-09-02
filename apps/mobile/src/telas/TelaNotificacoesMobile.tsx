import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  CaixaAvisosMobile,
  GrupoAvisosMobile,
} from '../avisos/caixa-avisos-mobile';
import type { TipoAvisoMobile } from '../avisos/modelo-aviso-mobile';
import { MarcaVyntra } from '../componentes/MarcaVyntra';
import { CORES, ESPACOS, RAIOS } from '../tema';

const APRESENTACAO: Readonly<
  Record<
    TipoAvisoMobile,
    {
      readonly descricao: string;
      readonly icone: keyof typeof Ionicons.glyphMap;
      readonly titulo: string;
    }
  >
> = {
  CLIENTE_AGUARDANDO: {
    descricao: 'Abra para consultar o atendimento atualizado.',
    icone: 'time-outline',
    titulo: 'Cliente aguardando',
  },
  JANELA_EXPIRANDO: {
    descricao: 'Consulte a janela atual antes de responder.',
    icone: 'timer-outline',
    titulo: 'Janela próxima de expirar',
  },
  NOVA_MENSAGEM: {
    descricao: 'Abra para ver a atualização da conversa.',
    icone: 'chatbubble-ellipses-outline',
    titulo: 'Nova mensagem',
  },
  NOVO_PENDENTE: {
    descricao: 'Há um novo atendimento na fila autorizada.',
    icone: 'people-outline',
    titulo: 'Novo atendimento pendente',
  },
  TRANSFERENCIA_DIRETA: {
    descricao: 'Um atendimento foi transferido diretamente para você.',
    icone: 'swap-horizontal-outline',
    titulo: 'Atendimento transferido',
  },
};

function horario(recebidoEm: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(recebidoEm));
}

export function TelaNotificacoesMobile({
  aoAbrir,
  caixa,
}: {
  readonly aoAbrir: (grupo: GrupoAvisosMobile) => Promise<void>;
  readonly caixa: CaixaAvisosMobile;
}) {
  const [grupos, definirGrupos] = useState(() => caixa.listar());
  const [abrindo, definirAbrindo] = useState<string>();
  const [erro, definirErro] = useState<string>();

  useEffect(
    () => caixa.observar(() => definirGrupos(caixa.listar())),
    [caixa],
  );

  async function abrir(grupo: GrupoAvisosMobile) {
    if (abrindo !== undefined) return;
    definirAbrindo(grupo.aviso.chaveAgrupamento);
    definirErro(undefined);
    try {
      await aoAbrir(grupo);
      void Haptics.selectionAsync();
    } catch {
      definirErro(
        'Não foi possível abrir agora. O aviso foi mantido para tentar novamente.',
      );
    } finally {
      definirAbrindo(undefined);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={estilos.tela}>
      <View style={estilos.cabecalho}>
        <View>
          <Text accessibilityRole="header" style={estilos.tituloTela}>
            Notificações
          </Text>
          <Text style={estilos.contexto}>Atualizações importantes</Text>
        </View>
        <MarcaVyntra compacta />
      </View>
      {erro !== undefined && (
        <Text accessibilityLiveRegion="polite" style={estilos.erro}>
          {erro}
        </Text>
      )}
      <FlatList
        contentContainerStyle={
          grupos.length === 0 ? estilos.listaVazia : estilos.lista
        }
        data={grupos}
        keyExtractor={(grupo) => grupo.aviso.chaveAgrupamento}
        ListEmptyComponent={
          <View style={estilos.vazio}>
            <View style={estilos.iconeVazio}>
              <Ionicons
                color={CORES.acao}
                name="notifications-outline"
                size={34}
              />
            </View>
            <Text style={estilos.tituloVazio}>Tudo tranquilo por aqui</Text>
            <Text style={estilos.descricaoVazio}>
              Novos avisos dos seus atendimentos aparecerão aqui.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const apresentacao = APRESENTACAO[item.aviso.tipo];
          const carregando = abrindo === item.aviso.chaveAgrupamento;
          return (
            <Pressable
              accessibilityLabel={`${apresentacao.titulo}. ${apresentacao.descricao}`}
              accessibilityRole="button"
              disabled={abrindo !== undefined}
              onPress={() => void abrir(item)}
              style={({ pressed }) => [
                estilos.aviso,
                pressed && estilos.avisoPressionado,
              ]}
            >
              <View style={estilos.iconeAviso}>
                <Ionicons
                  color={CORES.acao}
                  name={apresentacao.icone}
                  size={22}
                />
              </View>
              <View style={estilos.textoAviso}>
                <View style={estilos.linhaTitulo}>
                  <Text numberOfLines={1} style={estilos.tituloAviso}>
                    {apresentacao.titulo}
                  </Text>
                  <Text style={estilos.horario}>{horario(item.recebidoEm)}</Text>
                </View>
                <Text numberOfLines={2} style={estilos.descricaoAviso}>
                  {carregando ? 'Sincronizando atendimento…' : apresentacao.descricao}
                </Text>
              </View>
              {item.quantidade > 1 && (
                <View style={estilos.contagem}>
                  <Text style={estilos.textoContagem}>
                    {Math.min(item.quantidade, 99)}
                  </Text>
                </View>
              )}
              <Ionicons
                color={CORES.textoSecundario}
                name="chevron-forward"
                size={18}
              />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  aviso: { alignItems: 'center', backgroundColor: CORES.superficie, borderBottomColor: CORES.borda, borderBottomWidth: 1, flexDirection: 'row', gap: 11, minHeight: 78, paddingHorizontal: ESPACOS.grande, paddingVertical: 12 },
  avisoPressionado: { backgroundColor: '#F1F6F3' },
  cabecalho: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: ESPACOS.grande, paddingVertical: 18 },
  contagem: { alignItems: 'center', backgroundColor: CORES.acao, borderRadius: RAIOS.pílula, justifyContent: 'center', minHeight: 22, minWidth: 22, paddingHorizontal: 6 },
  contexto: { color: CORES.textoSecundario, fontSize: 13, marginTop: 2 },
  descricaoAviso: { color: CORES.textoSecundario, fontSize: 12, lineHeight: 17, marginTop: 4 },
  descricaoVazio: { color: CORES.textoSecundario, fontSize: 14, lineHeight: 21, maxWidth: 290, textAlign: 'center' },
  erro: { backgroundColor: '#FFF1ED', color: '#9B3326', fontSize: 12, lineHeight: 17, paddingHorizontal: ESPACOS.grande, paddingVertical: 9 },
  horario: { color: CORES.textoSecundario, fontSize: 11 },
  iconeAviso: { alignItems: 'center', backgroundColor: CORES.acaoClara, borderRadius: RAIOS.pílula, height: 42, justifyContent: 'center', width: 42 },
  iconeVazio: { alignItems: 'center', backgroundColor: CORES.acaoClara, borderRadius: RAIOS.cartao, height: 68, justifyContent: 'center', marginBottom: 18, width: 68 },
  linhaTitulo: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  lista: { paddingBottom: 18 },
  listaVazia: { flexGrow: 1 },
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  textoAviso: { flex: 1 },
  textoContagem: { color: CORES.textoInvertido, fontSize: 11, fontWeight: '800' },
  tituloAviso: { color: CORES.texto, flex: 1, fontSize: 14, fontWeight: '700' },
  tituloTela: { color: CORES.texto, fontSize: 29, fontWeight: '800', letterSpacing: -0.8 },
  tituloVazio: { color: CORES.texto, fontSize: 18, fontWeight: '700', marginBottom: 7 },
  vazio: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
});
