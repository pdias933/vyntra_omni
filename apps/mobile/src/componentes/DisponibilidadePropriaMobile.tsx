import type { DisponibilidadePropriaDto, EntradaDisponibilidadePropriaDto } from '@vyntra/api-client';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { useTema } from '../aparencia/contexto-tema';
import type { ServicoAtendimentosMobile } from '../atendimentos/servico-atendimentos-mobile';
import { ErroAtendimentoMobile } from '../atendimentos/adaptador-atendimentos-http';
import { BotaoPrimario } from './BotaoPrimario';

export function DisponibilidadePropriaMobile({ servico, conectado }: { readonly servico: ServicoAtendimentosMobile; readonly conectado: boolean }) {
  const { cores } = useTema();
  const [atual, definirAtual] = useState<DisponibilidadePropriaDto>();
  const [pendente, definirPendente] = useState<EntradaDisponibilidadePropriaDto>();
  const [aviso, definirAviso] = useState('');
  const [ocupado, definirOcupado] = useState(false);
  const emVoo = useRef(false);
  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      if (!conectado) return;
      try { const resposta = await servico.consultarDisponibilidade(); if (ativo) definirAtual(resposta); }
      catch { if (ativo) definirAtual(undefined); }
    };
    const inicial = setTimeout(() => void carregar(), 0);
    const remover = servico.observarMudancas(() => void carregar());
    const assinatura = AppState.addEventListener('change', (estado) => { if (estado === 'active') void carregar(); });
    return () => { ativo = false; clearTimeout(inicial); assinatura.remove(); remover(); };
  }, [conectado, servico]);
  async function alterar() {
    if (!conectado || emVoo.current || atual === undefined) return;
    emVoo.current = true; definirOcupado(true);
    const entrada: EntradaDisponibilidadePropriaDto = pendente ?? { chave_idempotencia: Crypto.randomUUID(), estado: atual.estado === 'DISPONIVEL' ? 'INDISPONIVEL' : 'DISPONIVEL', versao_esperada: atual.versao };
    definirPendente(entrada);
    try {
      const resposta = await servico.definirDisponibilidade(entrada);
      if (resposta.situacao !== 'CONFIRMADA') throw new Error('SEM_CONFIRMACAO');
      definirPendente(undefined); definirAviso('Disponibilidade confirmada.');
      try { definirAtual(await servico.consultarDisponibilidade()); } catch { definirAtual(undefined); }
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile && erro.statusHttp === 409) {
        definirPendente(undefined); definirAviso('Sua disponibilidade mudou. Confira o estado atual.');
        try { definirAtual(await servico.consultarDisponibilidade()); } catch { definirAtual(undefined); }
      } else if (erro instanceof ErroAtendimentoMobile && [401, 403].includes(erro.statusHttp ?? 0)) { definirAtual(undefined); definirPendente(undefined); }
      else definirAviso('Sem confirmação. Tente novamente.');
    } finally { emVoo.current = false; definirOcupado(false); }
  }
  if (atual === undefined) return null;
  return <View style={{ gap: 8 }}>
    <Text style={{ color: cores.texto }}>Minha disponibilidade</Text>
    <Text style={{ color: cores.textoSecundario }}>{atual.estado === 'DISPONIVEL' ? 'Disponível para transferências' : 'Indisponível para transferências'}</Text>
    <BotaoPrimario carregando={ocupado} desabilitado={!conectado} onPress={() => void alterar()} texto={pendente ? 'Tentar novamente' : atual.estado === 'DISPONIVEL' ? 'Ficar indisponível' : 'Ficar disponível'} variante="secundario" />
    {aviso !== '' && <Text accessibilityLiveRegion="polite" style={{ color: cores.textoSecundario }}>{aviso}</Text>}
  </View>;
}
