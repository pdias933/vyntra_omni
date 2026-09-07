import { adicionarNotaInternaWeb, consultarOperacaoAtendimentoWeb } from '@vyntra/api-client';
import { useEffect, useRef, useState } from 'react';
import { obterCsrf } from '../seguranca-web';

export interface RascunhoNotaWeb { readonly texto: string; readonly filaId: string; readonly chave?: string }

export function NotaInternaWeb({ atendimentoId, visivel, rascunhos, aoFechar }: {
  readonly atendimentoId: string; readonly visivel: boolean; readonly rascunhos: Map<string, RascunhoNotaWeb>; readonly aoFechar: () => void;
}) {
  const [rascunho, atualizarRascunho] = useState<RascunhoNotaWeb>();
  const [permitido, definirPermitido] = useState(false);
  const [ocupado, definirOcupado] = useState(false);
  const [aviso, definirAviso] = useState('');
  const emVoo = useRef(false);
  function definirRascunho(valor: RascunhoNotaWeb | undefined) {
    if (valor === undefined) rascunhos.delete(atendimentoId); else rascunhos.set(atendimentoId, valor);
    atualizarRascunho(valor);
  }
  useEffect(() => {
    let ativo = true;
    let revisao = 0;
    const carregar = async () => {
      const atual = ++revisao;
      if (!visivel) return;
      try {
        const resposta = await consultarOperacaoAtendimentoWeb({ path: { atendimentoId } });
        if (!ativo || atual !== revisao) return;
        if ([401, 403].includes(resposta.response?.status ?? 0) || resposta.data?.pode_adicionar_nota === false) {
          rascunhos.delete(atendimentoId); atualizarRascunho(undefined); definirPermitido(false); return;
        }
        if (!resposta.data?.pode_adicionar_nota) { definirPermitido(false); return; }
        const anterior = rascunhos.get(atendimentoId);
        if (anterior !== undefined && anterior.filaId !== resposta.data.fila_id) rascunhos.delete(atendimentoId);
        if (!emVoo.current) atualizarRascunho(rascunhos.get(atendimentoId) ?? { texto: '', filaId: resposta.data.fila_id });
        definirPermitido(true);
      } catch { if (ativo && atual === revisao) definirPermitido(false); }
    };
    const inicial = window.setTimeout(() => void carregar(), 0);
    const evento = () => void carregar();
    window.addEventListener('vyntra:evento', evento); window.addEventListener('online', evento);
    return () => { ativo = false; window.clearTimeout(inicial); window.removeEventListener('vyntra:evento', evento); window.removeEventListener('online', evento); };
  }, [atendimentoId, rascunhos, visivel]);
  async function salvar() {
    if (emVoo.current || !navigator.onLine || !permitido || rascunho === undefined || rascunho.texto.trim().length === 0) return;
    emVoo.current = true; definirOcupado(true);
    const entrada = { ...rascunho, chave: rascunho.chave ?? crypto.randomUUID() };
    definirRascunho(entrada);
    try {
      const resposta = await adicionarNotaInternaWeb({ path: { atendimentoId }, body: { chave_idempotencia: entrada.chave, texto: entrada.texto }, headers: { 'x-csrf-token': obterCsrf() } });
      if (resposta.data?.situacao === 'CONFIRMADA') {
        definirRascunho({ texto: '', filaId: entrada.filaId }); definirAviso('Nota salva · Somente equipe');
        window.dispatchEvent(new Event('vyntra:evento'));
      } else if ([401, 403].includes(resposta.response?.status ?? 0)) {
        definirRascunho(undefined); definirPermitido(false); definirAviso('Acesso indisponível.');
        window.dispatchEvent(new Event('vyntra:evento'));
      } else if ([400, 409, 422].includes(resposta.response?.status ?? 0)) {
        definirRascunho({ texto: entrada.texto, filaId: entrada.filaId }); definirAviso('Nota não salva. Revise o texto antes de tentar novamente.');
      } else definirAviso('Sem confirmação. Seu rascunho foi mantido; tente novamente explicitamente.');
    } catch { definirAviso('Sem confirmação. Seu rascunho foi mantido; tente novamente explicitamente.'); }
    finally { emVoo.current = false; definirOcupado(false); }
  }
  if (!visivel) return null;
  return <aside className="painel-conversa" aria-label="Nota interna">
    <header><strong>Nota interna · Somente equipe</strong><button type="button" aria-label="Fechar nota interna" onClick={aoFechar}>×</button></header>
    <div className="painel-conversa__lista">
      <p>Este conteúdo nunca será enviado ao cliente.</p>
      <label>Texto da nota · Somente equipe
        <textarea rows={7} maxLength={4000} value={rascunho?.texto ?? ''} disabled={!permitido || ocupado || rascunho?.chave !== undefined}
          onChange={(evento) => { if (rascunho !== undefined) definirRascunho({ texto: evento.target.value, filaId: rascunho.filaId }); }} />
      </label>
      <small>{rascunho?.texto.length ?? 0}/4.000 · Somente equipe</small>
      <button type="button" disabled={!permitido || ocupado || !rascunho?.texto.trim()} onClick={() => void salvar()}>{rascunho?.chave === undefined ? 'Salvar nota' : 'Tentar salvar a mesma nota'}</button>
      {aviso !== '' && <p role="status">{aviso}</p>}
    </div>
  </aside>;
}
