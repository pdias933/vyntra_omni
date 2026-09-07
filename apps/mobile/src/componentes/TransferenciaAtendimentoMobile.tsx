import type { ContextoOperacionalDto, DestinoTransferenciaDto, EntradaTransferenciaAtendimentoDto } from '@vyntra/api-client';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTema } from '../aparencia/contexto-tema';
import type { ServicoAtendimentosMobile } from '../atendimentos/servico-atendimentos-mobile';
import { ErroAtendimentoMobile } from '../atendimentos/adaptador-atendimentos-http';
import { BotaoPrimario } from './BotaoPrimario';

export function TransferenciaAtendimentoMobile({ atendimentoId, visivel, acessoOffline, servico, aoVoltar }: {
  readonly atendimentoId: string; readonly visivel: boolean; readonly acessoOffline: boolean; readonly servico: ServicoAtendimentosMobile; readonly aoVoltar: () => void;
}) {
  const { cores } = useTema();
  const [contexto, definirContexto] = useState<ContextoOperacionalDto>();
  const [destinos, definirDestinos] = useState<DestinoTransferenciaDto[]>([]);
  const [selecao, definirSelecao] = useState<DestinoTransferenciaDto>();
  const [tentativa, definirTentativa] = useState<EntradaTransferenciaAtendimentoDto>();
  const [aviso, definirAviso] = useState('');
  const [ocupado, definirOcupado] = useState(false);
  const emVoo = useRef(false);
  useEffect(() => {
    let ativo = true;
    const inicial = setTimeout(() => {
      if (!visivel || acessoOffline) return;
      void Promise.all([servico.consultarOperacao(atendimentoId), servico.destinosTransferencia(atendimentoId), servico.obterTentativaTransferencia(atendimentoId)])
        .then(([atual, lista, pendente]) => { if (ativo) { definirContexto(atual); definirDestinos(lista); definirTentativa(pendente); } })
        .catch(() => { if (ativo) { definirContexto(undefined); definirDestinos([]); definirAviso('Destinos indisponíveis.'); } });
    }, 0);
    return () => { ativo = false; clearTimeout(inicial); };
  }, [acessoOffline, atendimentoId, servico, visivel]);
  async function confirmar() {
    if (emVoo.current || acessoOffline || !contexto?.pode_transferir || (selecao === undefined && tentativa === undefined)) return;
    const entrada = tentativa ?? (selecao === undefined ? undefined : {
      chave_idempotencia: Crypto.randomUUID(), confirmacao_explicita: true as const,
      versao_atribuicao_esperada: contexto.versao_atribuicao, fila_destino_id: selecao.fila_id,
      ...(selecao.usuario_id === undefined ? {} : { usuario_destino_id: selecao.usuario_id }),
    });
    if (entrada === undefined) return;
    definirTentativa(entrada); emVoo.current = true; definirOcupado(true);
    try {
      const resposta = await servico.transferir(atendimentoId, entrada);
      if (resposta.situacao !== 'CONFIRMADA') throw new Error('SEM_CONFIRMACAO');
      definirTentativa(undefined); definirSelecao(undefined); definirAviso('Transferência confirmada.');
      try { definirContexto(await servico.consultarOperacao(atendimentoId)); }
      catch { definirContexto(undefined); definirDestinos([]); }
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile && erro.statusHttp === 409) {
        definirTentativa(undefined); definirSelecao(undefined); definirContexto(undefined); definirDestinos([]);
        definirAviso('O atendimento ou o destino mudou. Volte e selecione novamente.');
      } else if (erro instanceof ErroAtendimentoMobile && [401, 403].includes(erro.statusHttp ?? 0)) {
        definirTentativa(undefined); definirSelecao(undefined); definirContexto(undefined); definirDestinos([]); definirAviso('Acesso indisponível.');
      } else definirAviso('Sem confirmação. Tente novamente com a mesma seleção.');
    } finally { emVoo.current = false; definirOcupado(false); }
  }
  return <View style={{ display: visivel ? 'flex' : 'none', gap: 12, flexShrink: 1 }}>
    <Text accessibilityRole="header" style={{ color: cores.texto }}>Transferir atendimento</Text>
    <ScrollView>
      {destinos.map((destino) => <Pressable key={destino.fila_id + (destino.usuario_id ?? '')} disabled={ocupado || acessoOffline || tentativa !== undefined} accessibilityRole="radio" accessibilityState={{ selected: selecao === destino }} onPress={() => definirSelecao(destino)} style={{ padding: 14, borderWidth: 1, borderColor: selecao === destino ? cores.acao : cores.borda, borderRadius: 12, marginBottom: 8 }}>
        <Text style={{ color: cores.texto }}>{destino.fila_nome} · {destino.usuario_nome ?? 'Aguardar resgate'}</Text>
      </Pressable>)}
    </ScrollView>
    {selecao !== undefined && <Text style={{ color: cores.texto }}>Destino: {selecao.fila_nome} · {selecao.usuario_nome ?? 'Aguardar resgate'}. Confirme para transferir.</Text>}
    <BotaoPrimario texto={tentativa ? 'Tentar transferência novamente' : 'Confirmar transferência'} desabilitado={acessoOffline || !contexto?.pode_transferir || (selecao === undefined && tentativa === undefined)} carregando={ocupado} onPress={() => void confirmar()} />
    <BotaoPrimario texto="Voltar às ações" variante="secundario" onPress={aoVoltar} />
    {aviso !== '' && <Text accessibilityLiveRegion="polite" style={{ color: cores.textoSecundario }}>{aviso}</Text>}
  </View>;
}
