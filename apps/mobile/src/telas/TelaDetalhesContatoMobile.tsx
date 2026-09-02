import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  DetalhesContatoMobile,
  ResumoFinanceiroContatoMobile,
  VinculoContatoMobile,
} from '../atendimentos/modelo-atendimento-mobile';
import type { ServicoAtendimentosMobile } from '../atendimentos/servico-atendimentos-mobile';
import type { ResumoAtendimentoLocal } from '../offline/repositorio-replica-local';
import { CORES, ESPACOS, RAIOS } from '../tema';

interface SelecaoContexto {
  readonly vinculoClienteId: string;
  readonly vinculoContratoId?: string;
}

function dinheiro(valorCentavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    currency: 'BRL',
    style: 'currency',
  }).format(valorCentavos / 100);
}

function LinhaInformacao({
  icone,
  rotulo,
  valor,
}: {
  readonly icone: keyof typeof Ionicons.glyphMap;
  readonly rotulo: string;
  readonly valor: string;
}) {
  return (
    <View style={estilos.linhaInformacao}>
      <View style={estilos.iconeLinha}>
        <Ionicons color={CORES.acao} name={icone} size={17} />
      </View>
      <View style={estilos.textoLinha}>
        <Text style={estilos.rotuloLinha}>{rotulo}</Text>
        <Text selectable style={estilos.valorLinha}>{valor}</Text>
      </View>
    </View>
  );
}

function CartaoContexto({
  ativo,
  vinculo,
}: {
  readonly ativo: boolean;
  readonly vinculo: VinculoContatoMobile;
}) {
  return (
    <View style={[estilos.vinculo, ativo && estilos.vinculoAtivo]}>
      <View style={estilos.linhaVinculo}>
        <View style={estilos.iconeCliente}>
          <Ionicons color={CORES.acao} name="person-outline" size={18} />
        </View>
        <View style={estilos.textoVinculo}>
          <Text style={estilos.nomeVinculo}>{vinculo.nomeExibicao}</Text>
          <Text style={estilos.metaVinculo}>
            {vinculo.documentoMascarado ?? vinculo.tipo} · Snapshot {vinculo.estadoSnapshot.toLocaleLowerCase('pt-BR')}
          </Text>
        </View>
        {ativo && <Text style={estilos.seloAtivo}>Ativo</Text>}
      </View>
      {vinculo.contratos.map((contrato) => (
        <View key={contrato.id} style={estilos.contrato}>
          <Ionicons color={CORES.textoSecundario} name="document-text-outline" size={16} />
          <View style={estilos.textoContrato}>
            <Text style={estilos.nomeContrato}>{contrato.servico ?? 'Contrato'}</Text>
            <Text style={estilos.metaContrato}>
              {contrato.situacao}
              {contrato.enderecoResumido === undefined
                ? ''
                : ` · ${contrato.enderecoResumido}`}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function TelaDetalhesContatoMobile({
  acessoOffline,
  aoVoltar,
  atendimento,
  servico,
}: {
  readonly acessoOffline: boolean;
  readonly aoVoltar: () => void;
  readonly atendimento: ResumoAtendimentoLocal;
  readonly servico: ServicoAtendimentosMobile;
}) {
  const [detalhes, definirDetalhes] = useState<DetalhesContatoMobile>();
  const [financeiro, definirFinanceiro] = useState<ResumoFinanceiroContatoMobile>();
  const [carregando, definirCarregando] = useState(!acessoOffline);
  const [falhou, definirFalhou] = useState(false);
  const [selecao, definirSelecao] = useState<SelecaoContexto>();
  const [confirmando, definirConfirmando] = useState(false);
  const [erroContexto, definirErroContexto] = useState<string>();

  useEffect(() => {
    if (acessoOffline) return;
    let ativa = true;
    const carregar = async () => {
      try {
        const recebidos = await servico.obterDetalhes(atendimento.atendimentoId);
        if (!ativa) return;
        definirDetalhes(recebidos);
        definirFalhou(false);
        if (recebidos.permissoes.consultarFinanceiro) {
          try {
            const resultado = await servico.consultarFinanceiro(
              atendimento.atendimentoId,
            );
            if (ativa) definirFinanceiro(resultado);
          } catch {
            if (ativa) definirFinanceiro({ faturas: [], origem: 'INDISPONIVEL' });
          }
        }
      } catch {
        if (ativa) definirFalhou(true);
      } finally {
        if (ativa) definirCarregando(false);
      }
    };
    const temporizador = setTimeout(() => void carregar(), 0);
    return () => {
      ativa = false;
      clearTimeout(temporizador);
    };
  }, [acessoOffline, atendimento.atendimentoId, servico]);

  async function confirmarContexto() {
    if (selecao === undefined || detalhes?.contexto === undefined) return;
    definirConfirmando(true);
    definirErroContexto(undefined);
    try {
      const atualizado = await servico.alterarContexto(
        atendimento.atendimentoId,
        {
          versaoEsperada: detalhes.contexto.versao,
          vinculoClienteId: selecao.vinculoClienteId,
          ...(selecao.vinculoContratoId === undefined
            ? {}
            : { vinculoContratoId: selecao.vinculoContratoId }),
        },
      );
      definirDetalhes(atualizado);
      if (atualizado.permissoes.consultarFinanceiro) {
        try {
          definirFinanceiro(
            await servico.consultarFinanceiro(atendimento.atendimentoId),
          );
        } catch {
          definirFinanceiro({ faturas: [], origem: 'INDISPONIVEL' });
        }
      }
      definirSelecao(undefined);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      definirErroContexto(
        'O contexto mudou ou não está mais disponível. Feche e tente novamente.',
      );
    } finally {
      definirConfirmando(false);
    }
  }

  const contexto = detalhes?.contexto;
  const vinculoAtual = detalhes?.vinculos.find(
    ({ id }) => id === contexto?.vinculoClienteId,
  );
  const contratoAtual = vinculoAtual?.contratos.find(
    ({ id }) => id === contexto?.vinculoContratoId,
  );
  const identidades = detalhes?.identidades ?? [];

  return (
    <SafeAreaView edges={['top']} style={estilos.tela}>
      <View style={estilos.cabecalho}>
        <Pressable accessibilityLabel="Voltar à conversa" onPress={aoVoltar} style={estilos.voltar}>
          <Ionicons color={CORES.texto} name="chevron-back" size={26} />
        </Pressable>
        <Text accessibilityRole="header" style={estilos.titulo}>Detalhes do contato</Text>
        <View style={estilos.voltar} />
      </View>
      <ScrollView contentContainerStyle={estilos.conteudo} showsVerticalScrollIndicator={false}>
        <View style={estilos.identidade}>
          <View style={estilos.avatar}>
            <Text style={estilos.iniciais}>{atendimento.nomeContato.slice(0, 1).toLocaleUpperCase('pt-BR')}</Text>
            <View style={estilos.canal}>
              <Ionicons color={CORES.textoInvertido} name="logo-whatsapp" size={14} />
            </View>
          </View>
          <Text style={estilos.nome}>{detalhes?.nomeExibicao ?? atendimento.nomeContato}</Text>
          <Text style={estilos.identidadeSecundaria}>
            {identidades[0]?.nomeUsuario ?? identidades[0]?.telefoneMascarado ?? atendimento.identidadeSecundaria ?? 'WhatsApp'}
          </Text>
          {detalhes !== undefined && (
            <View style={[estilos.estadoIdentidade, detalhes.vinculos.length === 0 && estilos.estadoNaoIdentificado]}>
              <Text style={[estilos.textoEstadoIdentidade, detalhes.vinculos.length === 0 && estilos.textoNaoIdentificado]}>
                {detalhes.vinculos.length === 0 ? 'Contato não identificado' : 'Cliente identificado'}
              </Text>
            </View>
          )}
        </View>

        {acessoOffline && (
          <View style={estilos.avisoOffline}>
            <Ionicons color="#805A00" name="cloud-offline-outline" size={20} />
            <View style={estilos.textoAviso}>
              <Text style={estilos.tituloAviso}>Detalhes online indisponíveis</Text>
              <Text style={estilos.descricaoAviso}>A conversa recente permanece acessível. Cliente, contrato e financeiro serão revalidados ao conectar.</Text>
            </View>
          </View>
        )}

        {carregando && (
          <View style={estilos.skeleton}>
            <View style={estilos.skeletonLinhaGrande} />
            <View style={estilos.skeletonLinha} />
            <View style={estilos.skeletonLinha} />
          </View>
        )}

        {falhou && (
          <View style={estilos.avisoOffline}>
            <Ionicons color="#805A00" name="alert-circle-outline" size={20} />
            <View style={estilos.textoAviso}>
              <Text style={estilos.tituloAviso}>Não foi possível atualizar os detalhes</Text>
              <Text style={estilos.descricaoAviso}>Volte à conversa e tente novamente quando a conexão normalizar.</Text>
            </View>
          </View>
        )}

        {detalhes !== undefined && (
          <>
            {detalhes.vinculos.length === 0 ? (
              <View style={estilos.naoIdentificado}>
                <View style={estilos.iconeNaoIdentificado}>
                  <Ionicons color="#6D4AD9" name="link-outline" size={24} />
                </View>
                <Text style={estilos.tituloNaoIdentificado}>Contato não identificado</Text>
                <Text style={estilos.descricaoNaoIdentificado}>Vincule este número a um cliente existente para consultar dados e contratos.</Text>
                <Pressable accessibilityState={{ disabled: true }} disabled style={estilos.botaoVincular}>
                  <Text style={estilos.textoBotaoVincular}>Vincular a cliente</Text>
                </Pressable>
                <Text style={estilos.indisponivelVinculo}>Disponível quando o cadastro ERP for habilitado.</Text>
              </View>
            ) : (
              <View style={estilos.secao}>
                <View style={estilos.cabecalhoSecao}>
                  <Text style={estilos.tituloSecao}>Contexto atual</Text>
                  {detalhes.permissoes.alterarContexto && contexto !== undefined && (
                    <Pressable
                      onPress={() =>
                        definirSelecao({
                          vinculoClienteId: contexto.vinculoClienteId,
                          ...(contexto.vinculoContratoId === undefined
                            ? {}
                            : { vinculoContratoId: contexto.vinculoContratoId }),
                        })
                      }
                    >
                      <Text style={estilos.acaoSecao}>Trocar</Text>
                    </Pressable>
                  )}
                </View>
                {vinculoAtual !== undefined ? (
                  <CartaoContexto ativo vinculo={vinculoAtual} />
                ) : (
                  <Text style={estilos.textoSemContexto}>Selecione um cliente e contrato para o atendimento atual.</Text>
                )}
                {contratoAtual !== undefined && contratoAtual.enderecoResumido !== undefined && (
                  <LinhaInformacao icone="location-outline" rotulo="Endereço" valor={contratoAtual.enderecoResumido} />
                )}
              </View>
            )}

            <View style={estilos.secao}>
              <Text style={estilos.tituloSecao}>Conversa</Text>
              <View style={estilos.gradeContagens}>
                {[
                  ['Atendimentos', detalhes.contagens.atendimentos],
                  ['Mídias e documentos', detalhes.contagens.midias],
                  ['Notas internas', detalhes.contagens.notas],
                  ['Ordens de serviço', detalhes.contagens.ordensServico],
                ].map(([rotulo, valor]) => (
                  <View key={String(rotulo)} style={estilos.contagem}>
                    <Text style={estilos.numeroContagem}>{valor}</Text>
                    <Text style={estilos.rotuloContagem}>{rotulo}</Text>
                  </View>
                ))}
              </View>
            </View>

            {detalhes.permissoes.consultarFinanceiro && (
              <View style={estilos.secao}>
                <Text style={estilos.tituloSecao}>Situação financeira</Text>
                {financeiro === undefined ? (
                  <Text style={estilos.textoSemContexto}>Consultando em tempo real…</Text>
                ) : financeiro.origem === 'INDISPONIVEL' ? (
                  <Text style={estilos.textoSemContexto}>ERP indisponível. Nenhum snapshot é usado para ação financeira.</Text>
                ) : financeiro.faturas.length === 0 ? (
                  <View style={estilos.financeiroOk}>
                    <Ionicons color={CORES.acao} name="checkmark-circle" size={20} />
                    <Text style={estilos.textoFinanceiroOk}>Nenhuma fatura retornada em aberto</Text>
                  </View>
                ) : (
                  financeiro.faturas.slice(0, 3).map((fatura) => (
                    <View key={fatura.referencia} style={estilos.fatura}>
                      <View>
                        <Text style={estilos.nomeContrato}>{fatura.referencia}</Text>
                        <Text style={estilos.metaContrato}>{fatura.situacao} · vence {fatura.vencimento}</Text>
                      </View>
                      <Text style={estilos.valorFatura}>{dinheiro(fatura.valorCentavos)}</Text>
                    </View>
                  ))
                )}
              </View>
            )}

            <View style={estilos.secao}>
              <Text style={estilos.tituloSecao}>Identidade WhatsApp</Text>
              {identidades.map((identidade, indice) => (
                <View key={`${identidade.bsuid ?? identidade.nomeUsuario ?? identidade.telefoneMascarado ?? 'identidade'}:${indice}`}>
                  {identidade.nomePerfil !== undefined && <LinhaInformacao icone="person-outline" rotulo="Nome do perfil" valor={identidade.nomePerfil} />}
                  {identidade.nomeUsuario !== undefined && <LinhaInformacao icone="at-outline" rotulo="Username" valor={identidade.nomeUsuario} />}
                  {identidade.telefoneMascarado !== undefined && <LinhaInformacao icone="call-outline" rotulo="Telefone" valor={identidade.telefoneMascarado} />}
                  {identidade.bsuid !== undefined && <LinhaInformacao icone="shield-checkmark-outline" rotulo="BSUID" valor={identidade.bsuid} />}
                </View>
              ))}
              {detalhes.protocolo !== undefined && <LinhaInformacao icone="receipt-outline" rotulo="Protocolo ERP" valor={detalhes.protocolo} />}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => definirSelecao(undefined)}
        transparent
        visible={selecao !== undefined}
      >
        <View style={estilos.fundoModal}>
          <Pressable accessibilityLabel="Fechar seleção" onPress={() => definirSelecao(undefined)} style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={['bottom']} style={estilos.folha}>
            <View style={estilos.alca} />
            <Text style={estilos.tituloFolha}>Cliente e contrato ativos</Text>
            <Text style={estilos.descricaoFolha}>As próximas consultas e ações usarão o contexto confirmado.</Text>
            <ScrollView style={estilos.opcoesContexto}>
              {detalhes?.vinculos.map((vinculo) => (
                <View key={vinculo.id} style={estilos.opcaoCliente}>
                  <Pressable onPress={() => definirSelecao({ vinculoClienteId: vinculo.id })} style={estilos.botaoOpcao}>
                    <Ionicons color={selecao?.vinculoClienteId === vinculo.id ? CORES.acao : CORES.textoSecundario} name={selecao?.vinculoClienteId === vinculo.id ? 'radio-button-on' : 'radio-button-off'} size={21} />
                    <View style={estilos.textoVinculo}>
                      <Text style={estilos.nomeVinculo}>{vinculo.nomeExibicao}</Text>
                      <Text style={estilos.metaVinculo}>{vinculo.documentoMascarado ?? vinculo.tipo}</Text>
                    </View>
                  </Pressable>
                  {vinculo.contratos.map((contrato) => (
                    <Pressable
                      key={contrato.id}
                      onPress={() => definirSelecao({ vinculoClienteId: vinculo.id, vinculoContratoId: contrato.id })}
                      style={estilos.botaoContrato}
                    >
                      <Ionicons color={selecao?.vinculoContratoId === contrato.id ? CORES.acao : CORES.textoSecundario} name={selecao?.vinculoContratoId === contrato.id ? 'checkmark-circle' : 'ellipse-outline'} size={19} />
                      <View style={estilos.textoContrato}>
                        <Text style={estilos.nomeContrato}>{contrato.servico ?? 'Contrato'}</Text>
                        <Text style={estilos.metaContrato}>{contrato.situacao}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
            {erroContexto !== undefined && <Text style={estilos.erroContexto}>{erroContexto}</Text>}
            <View style={estilos.acoesFolha}>
              <Pressable onPress={() => definirSelecao(undefined)} style={estilos.botaoCancelar}>
                <Text style={estilos.textoCancelar}>Cancelar</Text>
              </Pressable>
              <Pressable disabled={confirmando} onPress={() => void confirmarContexto()} style={estilos.botaoConfirmar}>
                <Text style={estilos.textoConfirmar}>{confirmando ? 'Confirmando…' : 'Confirmar troca'}</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  acaoSecao: { color: CORES.acao, fontSize: 13, fontWeight: '700' },
  acoesFolha: { flexDirection: 'row', gap: 10, marginTop: 14 },
  alca: { alignSelf: 'center', backgroundColor: '#D5DAD7', borderRadius: RAIOS.pílula, height: 4, marginBottom: 18, width: 38 },
  avatar: { alignItems: 'center', backgroundColor: '#E4EAE7', borderRadius: 42, height: 84, justifyContent: 'center', position: 'relative', width: 84 },
  avisoOffline: { alignItems: 'flex-start', backgroundColor: '#FFF5DF', borderColor: '#F1D99F', borderRadius: RAIOS.cartao, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 14 },
  botaoCancelar: { alignItems: 'center', borderColor: CORES.borda, borderRadius: RAIOS.campo, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  botaoConfirmar: { alignItems: 'center', backgroundColor: CORES.acao, borderRadius: RAIOS.campo, flex: 1.4, justifyContent: 'center', minHeight: 48 },
  botaoContrato: { alignItems: 'center', flexDirection: 'row', gap: 10, marginLeft: 30, paddingVertical: 9 },
  botaoOpcao: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 10 },
  botaoVincular: { alignItems: 'center', backgroundColor: '#D9CDFB', borderRadius: RAIOS.campo, marginTop: 14, minHeight: 44, justifyContent: 'center', width: '100%' },
  cabecalho: { alignItems: 'center', backgroundColor: CORES.superficie, borderBottomColor: CORES.borda, borderBottomWidth: 1, flexDirection: 'row', minHeight: 58, paddingHorizontal: 4 },
  cabecalhoSecao: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  canal: { alignItems: 'center', backgroundColor: '#20B95A', borderColor: CORES.superficie, borderRadius: RAIOS.pílula, borderWidth: 2, bottom: 0, height: 24, justifyContent: 'center', position: 'absolute', right: -2, width: 24 },
  conteudo: { gap: 12, padding: 12, paddingBottom: 34 },
  contagem: { backgroundColor: '#F6F8F7', borderRadius: 12, minHeight: 74, padding: 11, width: '48%' },
  contrato: { alignItems: 'flex-start', borderTopColor: CORES.borda, borderTopWidth: 1, flexDirection: 'row', gap: 9, marginTop: 10, paddingTop: 10 },
  descricaoAviso: { color: '#715C2B', fontSize: 12, lineHeight: 17, marginTop: 2 },
  descricaoFolha: { color: CORES.textoSecundario, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  descricaoNaoIdentificado: { color: CORES.textoSecundario, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  erroContexto: { color: CORES.alerta, fontSize: 12, lineHeight: 17, marginTop: 8 },
  estadoIdentidade: { backgroundColor: '#E5F7EA', borderRadius: RAIOS.pílula, marginTop: 10, paddingHorizontal: 10, paddingVertical: 5 },
  estadoNaoIdentificado: { backgroundColor: '#F0EAFF' },
  fatura: { alignItems: 'center', borderTopColor: CORES.borda, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11 },
  financeiroOk: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 12 },
  folha: { backgroundColor: CORES.superficie, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '84%', padding: ESPACOS.grande, width: '100%' },
  fundoModal: { backgroundColor: 'rgba(9,20,15,0.36)', flex: 1, justifyContent: 'flex-end' },
  gradeContagens: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  iconeCliente: { alignItems: 'center', backgroundColor: CORES.acaoClara, borderRadius: 10, height: 36, justifyContent: 'center', width: 36 },
  iconeLinha: { alignItems: 'center', backgroundColor: '#EFF5F1', borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  iconeNaoIdentificado: { alignItems: 'center', backgroundColor: '#EEE7FF', borderRadius: RAIOS.pílula, height: 50, justifyContent: 'center', width: 50 },
  identidade: { alignItems: 'center', backgroundColor: CORES.superficie, borderColor: CORES.borda, borderRadius: RAIOS.cartao, borderWidth: 1, padding: 20 },
  identidadeSecundaria: { color: CORES.textoSecundario, fontSize: 13, marginTop: 3 },
  indisponivelVinculo: { color: CORES.textoSecundario, fontSize: 10, marginTop: 7 },
  iniciais: { color: '#4A5B53', fontSize: 28, fontWeight: '700' },
  linhaInformacao: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, marginTop: 12 },
  linhaVinculo: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  metaContrato: { color: CORES.textoSecundario, fontSize: 11, lineHeight: 15, marginTop: 2 },
  metaVinculo: { color: CORES.textoSecundario, fontSize: 11, lineHeight: 15, marginTop: 2 },
  naoIdentificado: { alignItems: 'center', backgroundColor: '#F8F5FF', borderColor: '#E8DFFF', borderRadius: RAIOS.cartao, borderWidth: 1, padding: 18 },
  nome: { color: CORES.texto, fontSize: 20, fontWeight: '800', marginTop: 12 },
  nomeContrato: { color: CORES.texto, fontSize: 13, fontWeight: '700' },
  nomeVinculo: { color: CORES.texto, fontSize: 14, fontWeight: '700' },
  numeroContagem: { color: CORES.texto, fontSize: 19, fontWeight: '800' },
  opcaoCliente: { borderBottomColor: CORES.borda, borderBottomWidth: 1, paddingVertical: 3 },
  opcoesContexto: { maxHeight: 390 },
  rotuloContagem: { color: CORES.textoSecundario, fontSize: 11, lineHeight: 15, marginTop: 5 },
  rotuloLinha: { color: CORES.textoSecundario, fontSize: 10 },
  secao: { backgroundColor: CORES.superficie, borderColor: CORES.borda, borderRadius: RAIOS.cartao, borderWidth: 1, padding: 15 },
  seloAtivo: { backgroundColor: '#E4F7E9', borderRadius: RAIOS.pílula, color: CORES.acao, fontSize: 10, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  skeleton: { backgroundColor: CORES.superficie, borderRadius: RAIOS.cartao, gap: 13, padding: 18 },
  skeletonLinha: { backgroundColor: '#E7ECE9', borderRadius: RAIOS.pílula, height: 12, width: '88%' },
  skeletonLinhaGrande: { backgroundColor: '#E1E7E4', borderRadius: RAIOS.pílula, height: 17, width: '54%' },
  tela: { backgroundColor: CORES.fundo, flex: 1 },
  textoAviso: { flex: 1 },
  textoBotaoVincular: { color: '#5D4DB4', fontSize: 13, fontWeight: '700' },
  textoCancelar: { color: CORES.texto, fontSize: 14, fontWeight: '700' },
  textoConfirmar: { color: CORES.textoInvertido, fontSize: 14, fontWeight: '700' },
  textoContrato: { flex: 1 },
  textoEstadoIdentidade: { color: CORES.acao, fontSize: 11, fontWeight: '700' },
  textoFinanceiroOk: { color: CORES.texto, fontSize: 13, fontWeight: '600' },
  textoLinha: { flex: 1 },
  textoNaoIdentificado: { color: '#6D4AD9' },
  textoSemContexto: { color: CORES.textoSecundario, fontSize: 12, lineHeight: 18, marginTop: 10 },
  textoVinculo: { flex: 1 },
  titulo: { color: CORES.texto, flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  tituloAviso: { color: '#664D17', fontSize: 13, fontWeight: '700' },
  tituloFolha: { color: CORES.texto, fontSize: 20, fontWeight: '800' },
  tituloNaoIdentificado: { color: '#4E347F', fontSize: 16, fontWeight: '800', marginBottom: 5, marginTop: 10 },
  tituloSecao: { color: CORES.texto, fontSize: 14, fontWeight: '800' },
  valorFatura: { color: CORES.texto, fontSize: 13, fontWeight: '800' },
  valorLinha: { color: CORES.texto, fontSize: 13, lineHeight: 18, marginTop: 2 },
  vinculo: { backgroundColor: '#F8FAF9', borderColor: CORES.borda, borderRadius: 14, borderWidth: 1, marginTop: 11, padding: 12 },
  vinculoAtivo: { borderColor: '#BCE4CA' },
  voltar: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
});
