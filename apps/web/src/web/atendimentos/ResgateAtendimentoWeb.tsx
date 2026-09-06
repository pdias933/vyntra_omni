import { consultarOperacaoAtendimentoWeb, resgatarAtendimentoWeb, type ContextoOperacionalDto, type EntradaResgateAtendimentoDto } from '@vyntra/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { obterCsrf } from '../seguranca-web';

export function ResgateAtendimentoWeb({ atendimentoId, aoResgatar, tentativas }: { readonly atendimentoId: string; readonly aoResgatar: () => void; readonly tentativas: Map<string, EntradaResgateAtendimentoDto> }) {
  const [contexto, definirContexto] = useState<ContextoOperacionalDto>();
  const [aviso, definirAviso] = useState('');
  const [ocupado, definirOcupado] = useState(false);
  const [repeticao, definirRepeticao] = useState(() => tentativas.has(atendimentoId));
  const [conectado, definirConectado] = useState(navigator.onLine);
  const emVoo = useRef(false);
  const revisao = useRef(0);
  const atualizar = useCallback(async () => {
    const versao = ++revisao.current;
    try {
      const resposta = await consultarOperacaoAtendimentoWeb({ path: { atendimentoId } });
      if (versao !== revisao.current) return;
      definirContexto(resposta.data);
    } catch {
      if (versao === revisao.current) definirContexto(undefined);
    }
  }, [atendimentoId]);
  useEffect(() => {
    const inicial = window.setTimeout(() => void atualizar(), 0);
    const evento = () => void atualizar();
    const rede = () => { definirConectado(navigator.onLine); if (navigator.onLine) void atualizar(); };
    window.addEventListener('vyntra:evento', evento);
    window.addEventListener('online', rede);
    window.addEventListener('offline', rede);
    return () => {
      window.clearTimeout(inicial);
      window.removeEventListener('vyntra:evento', evento);
      window.removeEventListener('online', rede);
      window.removeEventListener('offline', rede);
    };
  }, [atualizar]);

  async function resgatar() {
    if (emVoo.current || !navigator.onLine || contexto === undefined) return;
    emVoo.current = true;
    definirOcupado(true);
    const tentativa = tentativas.get(atendimentoId) ?? { chave_idempotencia: crypto.randomUUID(), versao_atribuicao_esperada: contexto.versao_atribuicao };
    tentativas.set(atendimentoId, tentativa);
    definirRepeticao(true);
    try {
      const resposta = await resgatarAtendimentoWeb({ path: { atendimentoId }, body: tentativa, headers: { 'x-csrf-token': obterCsrf() } });
      if (resposta.data?.situacao === 'CONFIRMADA') {
        tentativas.delete(atendimentoId);
        definirRepeticao(false);
        definirAviso('Atendimento resgatado.');
        await atualizar();
        aoResgatar();
      } else if (resposta.response?.status === 409) {
        tentativas.delete(atendimentoId);
        definirRepeticao(false);
        definirAviso('O atendimento mudou. Confira o responsável antes de tentar novamente.');
        await atualizar();
      } else if ([401, 403].includes(resposta.response?.status ?? 0)) {
        definirContexto(undefined);
        definirAviso('Acesso indisponível. Atualize sua sessão.');
        window.dispatchEvent(new Event('vyntra:evento'));
      } else {
        definirAviso('Sem confirmação. Tente novamente para consultar a mesma operação.');
      }
    } catch {
      definirAviso('Sem confirmação. Tente novamente para consultar a mesma operação.');
    } finally {
      emVoo.current = false;
      definirOcupado(false);
    }
  }
  return <div className="operacao-atendimento">
    {contexto?.responsavel_nome != null && <small>Responsável: {contexto.responsavel_nome}</small>}
    {contexto !== undefined && (contexto.pode_resgatar || repeticao) && <button disabled={ocupado || !conectado} onClick={() => void resgatar()} type="button">{ocupado ? 'Confirmando…' : repeticao ? 'Tentar resgate novamente' : 'Resgatar atendimento'}</button>}
    {aviso !== '' && <small role="status">{aviso}</small>}
  </div>;
}
