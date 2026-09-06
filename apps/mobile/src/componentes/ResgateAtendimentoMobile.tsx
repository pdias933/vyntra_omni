import type { ContextoOperacionalDto, EntradaResgateAtendimentoDto } from '@vyntra/api-client';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { useTema } from '../aparencia/contexto-tema';
import { ErroAtendimentoMobile } from '../atendimentos/adaptador-atendimentos-http';
import type { ServicoAtendimentosMobile } from '../atendimentos/servico-atendimentos-mobile';
import type { RepositorioReplicaLocal } from '../offline/repositorio-replica-local';
import { BotaoPrimario } from './BotaoPrimario';

export function ResgateAtendimentoMobile({ atendimentoId, acessoOffline, repositorio, servico, aoConfirmar }: {
  readonly atendimentoId: string;
  readonly acessoOffline: boolean;
  readonly repositorio: RepositorioReplicaLocal;
  readonly servico: ServicoAtendimentosMobile;
  readonly aoConfirmar: () => Promise<void>;
}) {
  const { cores } = useTema();
  const [contexto, definirContexto] = useState<ContextoOperacionalDto>();
  const [aviso, definirAviso] = useState('');
  const [ocupado, definirOcupado] = useState(false);
  const [repeticao, definirRepeticao] = useState(false);
  const tentativa = useRef<EntradaResgateAtendimentoDto | undefined>(undefined);
  const emVoo = useRef(false);
  useEffect(() => {
    let ativo = true;
    let revisao = 0;
    async function atualizar() {
      const atual = ++revisao;
      if (acessoOffline) { definirContexto(undefined); return; }
      try {
        const resultado = await servico.consultarOperacao(atendimentoId);
        if (ativo && atual === revisao) definirContexto(resultado);
      } catch {
        if (ativo && atual === revisao) definirContexto(undefined);
      }
    }
    const inicial = setTimeout(() => void atualizar(), 0);
    const remover = repositorio.observarMudancas(() => void atualizar());
    return () => { ativo = false; clearTimeout(inicial); remover(); };
  }, [acessoOffline, atendimentoId, repositorio, servico]);

  async function resgatar() {
    if (emVoo.current || acessoOffline || contexto === undefined) return;
    emVoo.current = true;
    definirOcupado(true);
    tentativa.current ??= { chave_idempotencia: Crypto.randomUUID(), versao_atribuicao_esperada: contexto.versao_atribuicao };
    definirRepeticao(true);
    try {
      const resultado = await servico.resgatar(atendimentoId, tentativa.current);
      if (resultado.situacao !== 'CONFIRMADA') throw new Error('OPERACAO_NAO_CONFIRMADA');
      tentativa.current = undefined;
      definirRepeticao(false);
      definirAviso('Atendimento resgatado.');
      definirContexto(await servico.consultarOperacao(atendimentoId));
      await aoConfirmar();
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile && erro.statusHttp === 409) {
        tentativa.current = undefined;
        definirRepeticao(false);
        definirAviso('O atendimento mudou. Confira o responsável antes de tentar novamente.');
        try { definirContexto(await servico.consultarOperacao(atendimentoId)); } catch { definirContexto(undefined); }
      } else if (erro instanceof ErroAtendimentoMobile && [401, 403].includes(erro.statusHttp ?? 0)) {
        definirContexto(undefined);
        definirAviso('Acesso indisponível.');
      } else {
        definirAviso('Sem confirmação. Tente novamente para consultar a mesma operação.');
      }
    } finally {
      emVoo.current = false;
      definirOcupado(false);
    }
  }
  return <View>
    {contexto?.responsavel_nome != null && <Text style={{ color: cores.textoSecundario }}>Responsável: {contexto.responsavel_nome}</Text>}
    {contexto !== undefined && (contexto.pode_resgatar || repeticao) && <BotaoPrimario carregando={ocupado} desabilitado={acessoOffline} onPress={() => void resgatar()} texto={repeticao ? 'Tentar resgate novamente' : 'Resgatar atendimento'} />}
    {aviso !== '' && <Text accessibilityLiveRegion="polite" style={{ color: cores.textoSecundario }}>{aviso}</Text>}
  </View>;
}
