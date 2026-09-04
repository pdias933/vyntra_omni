import type { CoresTema } from '@vyntra/tema';
import { useTema, useEstilos } from '../aparencia/contexto-tema';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  AcaoErpMobile,
  DetalhesContatoMobile,
  PreviaAcaoErpMobile,
  ResultadoAcaoErpMobile,
  ResumoFinanceiroContatoMobile,
} from '../atendimentos/modelo-atendimento-mobile';
import type { ServicoAtendimentosMobile } from '../atendimentos/servico-atendimentos-mobile';
import { ESPACOS, RAIOS } from '../tema';

type CodigoAcao =
  | 'CLIENTE'
  | 'CONEXAO'
  | 'DESBLOQUEIO'
  | 'FATURAS'
  | 'FORMULARIO'
  | 'NOTA'
  | 'ORDEM_SERVICO';

const GRUPOS_ACOES: readonly {
  readonly acoes: readonly {
    readonly codigo: CodigoAcao;
    readonly icone: keyof typeof Ionicons.glyphMap;
    readonly rotulo: string;
  }[];
  readonly titulo: string;
}[] = [
  {
    acoes: [
      { codigo: 'CLIENTE', icone: 'person-outline', rotulo: 'Cliente e contrato' },
      { codigo: 'FATURAS', icone: 'receipt-outline', rotulo: 'Consultar faturas' },
    ],
    titulo: 'Cliente e financeiro',
  },
  {
    acoes: [
      { codigo: 'CONEXAO', icone: 'wifi-outline', rotulo: 'Consultar conexão' },
      { codigo: 'DESBLOQUEIO', icone: 'flash-outline', rotulo: 'Desbloqueio de confiança' },
      { codigo: 'ORDEM_SERVICO', icone: 'construct-outline', rotulo: 'Criar ordem de serviço' },
    ],
    titulo: 'Suporte',
  },
  {
    acoes: [
      { codigo: 'FORMULARIO', icone: 'reader-outline', rotulo: 'Solicitar WhatsApp Flow' },
      { codigo: 'NOTA', icone: 'lock-closed-outline', rotulo: 'Adicionar nota interna' },
    ],
    titulo: 'Atendimento',
  },
];

function dinheiro(valorCentavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    currency: 'BRL',
    style: 'currency',
  }).format(valorCentavos / 100);
}

function descricaoOrigemFinanceira(
  financeiro: ResumoFinanceiroContatoMobile,
): string {
  if (financeiro.origem === 'INDISPONIVEL') {
    return 'ERP indisponível — nenhum snapshot usado';
  }
  return financeiro.cobertura === 'JANELA_LIMITADA'
    ? `Dados do ERP em tempo real · período consultado: ${financeiro.quantidadeMeses} mês`
    : 'Dados do ERP em tempo real · cobertura integral';
}

function mensagemResultado(resultado: ResultadoAcaoErpMobile): string {
  if (resultado.situacao === 'CONCLUIDO' || resultado.situacao === 'CONCLUIDA') {
    return 'A ação foi confirmada pelo ERP.';
  }
  if (
    resultado.situacao === 'PROCESSAMENTO_EM_CURSO' ||
    resultado.situacao === 'AGUARDANDO_NOVA_TENTATIVA'
  ) {
    return 'A ação foi registrada e continua em processamento seguro.';
  }
  if (resultado.situacao === 'RECONCILIACAO_NECESSARIA') {
    return 'O resultado ainda precisa ser confirmado. A operação não será repetida às cegas.';
  }
  return 'O ERP não confirmou a ação. Nenhum sucesso foi presumido.';
}

export function FolhaAcoesSistemaMobile({
  acessoOffline,
  aoAbrirDetalhes,
  aoFechar,
  atendimentoId,
  reduzirMovimento,
  servico,
  visivel,
}: {
  readonly acessoOffline: boolean;
  readonly aoAbrirDetalhes: () => void;
  readonly aoFechar: () => void;
  readonly atendimentoId: string;
  readonly reduzirMovimento: boolean;
  readonly servico: ServicoAtendimentosMobile;
  readonly visivel: boolean;
}) {
  const { cores: CORES, modo } = useTema();
  const estilos = useEstilos(criarEstilos);
  const [detalhes, definirDetalhes] = useState<DetalhesContatoMobile>();
  const [financeiro, definirFinanceiro] =
    useState<ResumoFinanceiroContatoMobile>();
  const [previa, definirPrevia] = useState<PreviaAcaoErpMobile>();
  const [assunto, definirAssunto] = useState('Suporte técnico');
  const [descricao, definirDescricao] = useState('');
  const [resultado, definirResultado] = useState<string>();
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState<string>();

  useEffect(() => {
    if (!visivel) return;
    let ativo = true;
    const carregar = setTimeout(() => {
      if (!ativo) return;
      definirDetalhes(undefined);
      definirFinanceiro(undefined);
      definirPrevia(undefined);
      definirResultado(undefined);
      definirErro(undefined);
      if (acessoOffline) return;
      definirOcupado(true);
      void servico.obterDetalhes(atendimentoId)
        .then((recebidos) => {
          if (ativo) definirDetalhes(recebidos);
        })
        .catch(() => {
          if (ativo) definirErro('Não foi possível carregar as ações autorizadas.');
        })
        .finally(() => {
          if (ativo) definirOcupado(false);
        });
    }, 0);
    return () => {
      ativo = false;
      clearTimeout(carregar);
    };
  }, [acessoOffline, atendimentoId, servico, visivel]);

  function estaDisponivel(codigo: CodigoAcao): boolean {
    if (acessoOffline || detalhes === undefined) return false;
    if (codigo === 'CLIENTE') return true;
    if (codigo === 'FATURAS') return detalhes.permissoes.consultarFinanceiro;
    if (codigo === 'DESBLOQUEIO') return detalhes.permissoes.executarDesbloqueio;
    if (codigo === 'ORDEM_SERVICO') return detalhes.permissoes.criarOrdemServico;
    return false;
  }

  async function consultarFaturas() {
    definirOcupado(true);
    definirErro(undefined);
    definirResultado(undefined);
    try {
      definirFinanceiro(await servico.consultarFinanceiro(atendimentoId));
    } catch {
      definirFinanceiro({ faturas: [], origem: 'INDISPONIVEL' });
    } finally {
      definirOcupado(false);
    }
  }

  async function preparar(acao: AcaoErpMobile) {
    definirOcupado(true);
    definirErro(undefined);
    definirResultado(undefined);
    try {
      definirPrevia(await servico.prepararAcaoErp(atendimentoId, acao));
      definirDescricao('');
    } catch {
      definirErro('Não foi possível preparar a ação. Nada foi executado.');
    } finally {
      definirOcupado(false);
    }
  }

  async function executar() {
    if (
      previa === undefined ||
      !previa.disponivel ||
      ocupado ||
      acessoOffline ||
      (previa.acao === 'CRIAR_ORDEM_SERVICO' &&
        (assunto.trim().length === 0 || descricao.trim().length === 0))
    ) {
      return;
    }
    definirOcupado(true);
    definirErro(undefined);
    try {
      const resposta = await servico.executarAcaoErp(atendimentoId, {
        acao: previa.acao,
        chaveIdempotencia: Crypto.randomUUID(),
        ...(previa.acao === 'CRIAR_ORDEM_SERVICO'
          ? { assunto: assunto.trim(), descricao: descricao.trim() }
          : {}),
      });
      definirResultado(mensagemResultado(resposta));
      definirPrevia(undefined);
      void Haptics.notificationAsync(
        resposta.situacao === 'CONCLUIDO' || resposta.situacao === 'CONCLUIDA'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    } catch {
      definirErro('A ação não foi concluída. Nenhum sucesso foi presumido.');
    } finally {
      definirOcupado(false);
    }
  }

  function escolher(codigo: CodigoAcao) {
    if (codigo === 'CLIENTE') {
      aoFechar();
      aoAbrirDetalhes();
    } else if (codigo === 'FATURAS') {
      void consultarFaturas();
    } else if (codigo === 'DESBLOQUEIO') {
      void preparar('EXECUTAR_DESBLOQUEIO');
    } else if (codigo === 'ORDEM_SERVICO') {
      void preparar('CRIAR_ORDEM_SERVICO');
    }
  }

  return (
    <Modal
      animationType={reduzirMovimento ? 'fade' : 'slide'}
      onRequestClose={aoFechar}
      transparent
      visible={visivel}
    >
      <View style={estilos.fundoModal}>
        <Pressable
          accessibilityLabel="Fechar ações"
          onPress={aoFechar}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView edges={['bottom']} style={estilos.folha}>
          <View style={estilos.alca} />
          <View style={estilos.cabecalho}>
            <View>
              <Text style={estilos.titulo}>Ações</Text>
              <Text style={estilos.descricao}>Sistema e ERP no contexto atual.</Text>
            </View>
            <Pressable accessibilityLabel="Fechar ações" onPress={aoFechar}>
              <Ionicons color={CORES.textoSecundario} name="close" size={24} />
            </Pressable>
          </View>

          {acessoOffline && (
            <View style={estilos.aviso}>
              <Ionicons color={CORES.atencao} name="cloud-offline-outline" size={18} />
              <Text style={estilos.textoAviso}>Conecte-se para consultar ou executar ações.</Text>
            </View>
          )}
          {erro !== undefined && <Text accessibilityLiveRegion="polite" style={estilos.erro}>{erro}</Text>}
          {resultado !== undefined && (
            <View accessibilityLiveRegion="polite" style={estilos.resultado}>
              <Ionicons color={CORES.acao} name="checkmark-circle-outline" size={20} />
              <Text style={estilos.textoResultado}>{resultado}</Text>
            </View>
          )}

          {previa !== undefined ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Pressable onPress={() => definirPrevia(undefined)} style={estilos.voltar}>
                <Ionicons color={CORES.texto} name="chevron-back" size={19} />
                <Text style={estilos.textoVoltar}>Voltar às ações</Text>
              </Pressable>
              <Text style={estilos.tituloPrevia}>Revise antes de confirmar</Text>
              <Text style={estilos.descricaoPrevia}>O backend revalidará permissão, contexto e estado ao executar.</Text>
              <View style={estilos.resumo}>
                {previa.resumo.map((item, indice) => (
                  <View key={`${item.rotulo}:${indice}`} style={estilos.itemResumo}>
                    <Text style={estilos.rotuloResumo}>{item.rotulo}</Text>
                    <Text style={estilos.valorResumo}>{item.valor}</Text>
                  </View>
                ))}
              </View>
              {previa.acao === 'CRIAR_ORDEM_SERVICO' && (
                <>
                  <Text style={estilos.rotuloCampo}>Assunto</Text>
                  <TextInput
                    keyboardAppearance={modo === 'escuro' ? 'dark' : 'light'}
                    selectionColor={CORES.acao}
                    maxLength={200}
                    onChangeText={definirAssunto}
                    style={estilos.campo}
                    value={assunto}
                  />
                  <Text style={estilos.rotuloCampo}>Descrição</Text>
                  <TextInput
                    keyboardAppearance={modo === 'escuro' ? 'dark' : 'light'}
                    selectionColor={CORES.acao}
                    maxLength={4_000}
                    multiline
                    onChangeText={definirDescricao}
                    placeholder="Descreva o que precisa ser atendido"
                    placeholderTextColor={CORES.textoSecundario}
                    style={[estilos.campo, estilos.campoDescricao]}
                    value={descricao}
                  />
                </>
              )}
              {!previa.disponivel && (
                <Text style={estilos.indisponivel}>Esta ação não está disponível para o contexto atual.</Text>
              )}
              <View style={estilos.acoesConfirmacao}>
                <Pressable onPress={() => definirPrevia(undefined)} style={estilos.botaoCancelar}>
                  <Text style={estilos.textoCancelar}>Cancelar</Text>
                </Pressable>
                <Pressable
                  accessibilityState={{ disabled: ocupado || !previa.disponivel }}
                  disabled={ocupado || !previa.disponivel}
                  onPress={() => void executar()}
                  style={[estilos.botaoConfirmar, !previa.disponivel && estilos.desabilitado]}
                >
                  <Text style={estilos.textoConfirmar}>{ocupado ? 'Executando…' : 'Confirmar e executar'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : financeiro !== undefined ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable onPress={() => definirFinanceiro(undefined)} style={estilos.voltar}>
                <Ionicons color={CORES.texto} name="chevron-back" size={19} />
                <Text style={estilos.textoVoltar}>Voltar às ações</Text>
              </Pressable>
              <View style={estilos.origem}>
                <Ionicons color={financeiro.origem === 'TEMPO_REAL' ? CORES.acao : CORES.atencao} name="pulse-outline" size={18} />
                <Text style={estilos.textoOrigem}>
                  {descricaoOrigemFinanceira(financeiro)}
                </Text>
              </View>
              {financeiro.faturas.length === 0 ? (
                <Text style={estilos.vazio}>{financeiro.origem === 'TEMPO_REAL' ? 'Nenhuma fatura retornada no período consultado.' : 'Tente novamente quando a integração normalizar.'}</Text>
              ) : financeiro.faturas.map((fatura, indice) => (
                <View key={`${fatura.vencimento}-${fatura.situacao}-${fatura.valorCentavos}-${indice}`} style={estilos.fatura}>
                  <View style={estilos.textoFatura}>
                    <Text style={estilos.nomeFatura}>Vencimento {fatura.vencimento}</Text>
                    <Text style={estilos.metaFatura}>{fatura.situacao}</Text>
                  </View>
                  <Text style={estilos.valorFatura}>{dinheiro(fatura.valorCentavos)}</Text>
                </View>
              ))}
              <Text style={estilos.notaFatura}>Segunda via e Pix só serão habilitados quando a entrega ao cliente estiver conectada ao caso de uso autorizado.</Text>
            </ScrollView>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {ocupado && detalhes === undefined && <View style={estilos.skeleton} />}
              {GRUPOS_ACOES.map((grupo) => (
                <View key={grupo.titulo} style={estilos.grupo}>
                  <Text style={estilos.tituloGrupo}>{grupo.titulo}</Text>
                  {grupo.acoes.map((acao) => {
                    const disponivel = estaDisponivel(acao.codigo);
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !disponivel }}
                        disabled={!disponivel || ocupado}
                        key={acao.codigo}
                        onPress={() => escolher(acao.codigo)}
                        style={({ pressed }) => [estilos.acao, pressed && estilos.acaoPressionada]}
                      >
                        <View style={estilos.iconeAcao}>
                          <Ionicons color={disponivel ? CORES.acao : CORES.textoSecundario} name={acao.icone} size={19} />
                        </View>
                        <Text style={[estilos.rotuloAcao, !disponivel && estilos.textoDesabilitado]}>{acao.rotulo}</Text>
                        {disponivel ? (
                          <Ionicons color={CORES.textoSecundario} name="chevron-forward" size={18} />
                        ) : (
                          <Text style={estilos.emBreve}>{acessoOffline ? 'Online' : 'Indisponível'}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const criarEstilos = (CORES: CoresTema) => StyleSheet.create({
  acao: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 50 },
  acaoPressionada: { opacity: 0.65 },
  acoesConfirmacao: { flexDirection: 'row', gap: 10, marginTop: 18 },
  alca: { alignSelf: 'center', backgroundColor: CORES.bordaForte, borderRadius: RAIOS.pílula, height: 4, marginBottom: 18, width: 38 },
  aviso: { alignItems: 'center', backgroundColor: CORES.atencaoClara, borderRadius: RAIOS.campo, flexDirection: 'row', gap: 8, marginBottom: 12, padding: 11 },
  botaoCancelar: { alignItems: 'center', borderColor: CORES.borda, borderRadius: RAIOS.campo, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  botaoConfirmar: { alignItems: 'center', backgroundColor: CORES.acao, borderRadius: RAIOS.campo, flex: 1.5, justifyContent: 'center', minHeight: 48 },
  cabecalho: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13 },
  campo: { backgroundColor: CORES.superficieElevada, borderColor: CORES.borda, borderRadius: RAIOS.campo, borderWidth: 1, color: CORES.texto, fontSize: 14, minHeight: 46, padding: 12 },
  campoDescricao: { minHeight: 100, textAlignVertical: 'top' },
  desabilitado: { opacity: 0.42 },
  descricao: { color: CORES.textoSecundario, fontSize: 13, marginTop: 3 },
  descricaoPrevia: { color: CORES.textoSecundario, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  emBreve: { color: CORES.textoSecundario, fontSize: 10 },
  erro: { color: CORES.alerta, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  fatura: { alignItems: 'center', borderBottomColor: CORES.borda, borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 14 },
  folha: { backgroundColor: CORES.superficie, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '88%', padding: ESPACOS.grande, width: '100%' },
  fundoModal: { backgroundColor: CORES.sobreposicao, flex: 1, justifyContent: 'flex-end' },
  grupo: { borderTopColor: CORES.borda, borderTopWidth: 1, paddingVertical: 11 },
  iconeAcao: { alignItems: 'center', backgroundColor: CORES.superficieElevada, borderRadius: 11, height: 36, justifyContent: 'center', width: 36 },
  indisponivel: { backgroundColor: CORES.atencaoClara, borderRadius: RAIOS.campo, color: CORES.textoNota, fontSize: 12, lineHeight: 17, marginTop: 12, padding: 11 },
  itemResumo: { borderBottomColor: CORES.borda, borderBottomWidth: 1, paddingVertical: 9 },
  metaFatura: { color: CORES.textoSecundario, fontSize: 11, marginTop: 3 },
  nomeFatura: { color: CORES.texto, fontSize: 13, fontWeight: '700' },
  notaFatura: { color: CORES.textoSecundario, fontSize: 11, lineHeight: 16, marginTop: 14 },
  origem: { alignItems: 'center', backgroundColor: CORES.acaoClara, borderRadius: RAIOS.campo, flexDirection: 'row', gap: 8, marginBottom: 8, padding: 11 },
  resultado: { alignItems: 'flex-start', backgroundColor: CORES.acaoClara, borderRadius: RAIOS.campo, flexDirection: 'row', gap: 8, marginBottom: 12, padding: 11 },
  resumo: { backgroundColor: CORES.fundo, borderRadius: RAIOS.campo, marginBottom: 12, paddingHorizontal: 12 },
  rotuloAcao: { color: CORES.texto, flex: 1, fontSize: 14, fontWeight: '600' },
  rotuloCampo: { color: CORES.textoSecundario, fontSize: 11, fontWeight: '700', marginBottom: 5, marginTop: 10 },
  rotuloResumo: { color: CORES.textoSecundario, fontSize: 10 },
  skeleton: { backgroundColor: CORES.skeleton, borderRadius: RAIOS.campo, height: 58, marginBottom: 10 },
  textoAviso: { color: CORES.textoNota, flex: 1, fontSize: 12 },
  textoCancelar: { color: CORES.textoSecundario, fontSize: 13, fontWeight: '700' },
  textoConfirmar: { color: CORES.textoInvertido, fontSize: 13, fontWeight: '700' },
  textoDesabilitado: { color: CORES.textoSecundario },
  textoFatura: { flex: 1 },
  textoOrigem: { color: CORES.texto, flex: 1, fontSize: 12, fontWeight: '700' },
  textoResultado: { color: CORES.texto, flex: 1, fontSize: 12, lineHeight: 17 },
  textoVoltar: { color: CORES.texto, fontSize: 12, fontWeight: '700' },
  titulo: { color: CORES.texto, fontSize: 20, fontWeight: '800' },
  tituloGrupo: { color: CORES.textoSecundario, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' },
  tituloPrevia: { color: CORES.texto, fontSize: 17, fontWeight: '800', marginTop: 8 },
  valorFatura: { color: CORES.texto, fontSize: 13, fontWeight: '800' },
  valorResumo: { color: CORES.texto, fontSize: 13, fontWeight: '600', marginTop: 3 },
  vazio: { color: CORES.textoSecundario, fontSize: 13, paddingVertical: 24, textAlign: 'center' },
  voltar: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 3, paddingVertical: 7 },
});
