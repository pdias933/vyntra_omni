import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useTema } from '../aparencia/contexto-tema';
import type { ServicoAtendimentosMobile } from '../atendimentos/servico-atendimentos-mobile';
import { ErroAtendimentoMobile } from '../atendimentos/adaptador-atendimentos-http';
import type { RepositorioReplicaLocal } from '../offline/repositorio-replica-local';
import { BotaoPrimario } from './BotaoPrimario';

export function NotaInternaMobile({ atendimentoId, visivel, acessoOffline, servico, repositorio, aoVoltar }: {
  readonly atendimentoId: string; readonly visivel: boolean; readonly acessoOffline: boolean;
  readonly servico: ServicoAtendimentosMobile; readonly repositorio: RepositorioReplicaLocal; readonly aoVoltar: () => void;
}) {
  const { cores } = useTema();
  const [texto, definirTexto] = useState('');
  const [chave, definirChave] = useState<string | null>(null);
  const [permitido, definirPermitido] = useState(false);
  const [ocupado, definirOcupado] = useState(false);
  const [aviso, definirAviso] = useState('');
  const emVoo = useRef(false);
  const persistencia = useRef(Promise.resolve());
  function persistir(valor: string, recibo: string | null) {
    const escrita = persistencia.current.then(() => repositorio.salvarRascunhoNota(atendimentoId, valor, recibo));
    persistencia.current = escrita.catch(() => { definirAviso('Não foi possível proteger o rascunho neste aparelho.'); });
    return escrita;
  }
  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      if (!visivel || acessoOffline) { if (ativo) definirPermitido(false); return; }
      try {
        const contexto = await servico.consultarOperacao(atendimentoId);
        if (!contexto.pode_adicionar_nota) {
          if (ativo) { definirPermitido(false); definirTexto(''); definirChave(null); }
          await repositorio.salvarRascunhoNota(atendimentoId, '');
          return;
        }
        await persistencia.current;
        const rascunho = await repositorio.obterRascunhoNota(atendimentoId);
        if (ativo && !emVoo.current) { definirPermitido(true); definirTexto(rascunho.texto); definirChave(rascunho.chave); }
      } catch (erro) {
        if (ativo) definirPermitido(false);
        if (erro instanceof ErroAtendimentoMobile && [401, 403].includes(erro.statusHttp ?? 0)) {
          if (ativo) { definirTexto(''); definirChave(null); }
          await repositorio.salvarRascunhoNota(atendimentoId, '');
        }
      }
    };
    const inicial = setTimeout(() => void carregar(), 0);
    const remover = repositorio.observarMudancas(() => void carregar());
    return () => { ativo = false; clearTimeout(inicial); remover(); };
  }, [acessoOffline, atendimentoId, repositorio, servico, visivel]);
  async function salvar() {
    if (emVoo.current || acessoOffline || !permitido || texto.trim().length === 0) return;
    emVoo.current = true; definirOcupado(true);
    const recibo = chave ?? Crypto.randomUUID();
    definirChave(recibo);
    try {
      await persistir(texto, recibo);
      const resposta = await servico.adicionarNota(atendimentoId, { chave_idempotencia: recibo, texto });
      if (resposta.situacao !== 'CONFIRMADA') throw new Error('SEM_CONFIRMACAO');
      definirTexto(''); definirChave(null); definirAviso('Nota salva · Somente equipe');
      try { await persistir('', null); } catch { definirPermitido(false); definirAviso('Nota salva. Reabra após recuperar o armazenamento local.'); }
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile && [401, 403].includes(erro.statusHttp ?? 0)) {
        definirPermitido(false); definirTexto(''); definirChave(null); definirAviso('Acesso indisponível.');
        await persistir('', null).catch(() => undefined);
      } else if (erro instanceof ErroAtendimentoMobile && [400, 409, 422].includes(erro.statusHttp ?? 0)) {
        definirChave(null); await persistir(texto, null).catch(() => undefined); definirAviso('Nota não salva. Revise o texto antes de tentar novamente.');
      } else definirAviso('Sem confirmação. Seu rascunho foi mantido; tente novamente explicitamente.');
    } finally { emVoo.current = false; definirOcupado(false); }
  }
  return <View style={{ display: visivel ? 'flex' : 'none', gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: cores.texto }}>Nota interna · Somente equipe</Text>
    <Text style={{ color: cores.textoSecundario }}>Este conteúdo nunca será enviado ao cliente.</Text>
    <TextInput accessibilityLabel="Texto da nota interna — Somente equipe" multiline maxLength={4000}
      editable={permitido && !ocupado && chave === null} value={texto}
      onChangeText={(valor) => { definirTexto(valor); void persistir(valor, null).catch(() => undefined); }}
      style={{ minHeight: 140, maxHeight: 260, padding: 12, borderWidth: 1, borderColor: cores.borda, borderRadius: 12, color: cores.texto, textAlignVertical: 'top' }} />
    <Text style={{ color: cores.textoSecundario }}>{texto.length}/4.000 · Somente equipe</Text>
    <BotaoPrimario texto={chave === null ? 'Salvar nota' : 'Tentar salvar a mesma nota'} carregando={ocupado} desabilitado={!permitido || acessoOffline || texto.trim().length === 0} onPress={() => void salvar()} />
    <BotaoPrimario texto="Voltar às ações" variante="secundario" onPress={aoVoltar} />
    {aviso !== '' && <Text accessibilityLiveRegion="polite" style={{ color: cores.textoSecundario }}>{aviso}</Text>}
  </View>;
}
