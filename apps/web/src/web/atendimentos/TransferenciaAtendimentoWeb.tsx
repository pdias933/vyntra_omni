import { consultarOperacaoAtendimentoWeb, listarDestinosTransferenciaWeb, transferirAtendimentoWeb, type ContextoOperacionalDto, type DestinoTransferenciaDto, type EntradaTransferenciaAtendimentoDto } from '@vyntra/api-client';
import { useEffect, useRef, useState } from 'react';
import { obterCsrf } from '../seguranca-web';

export function TransferenciaAtendimentoWeb({ atendimentoId, visivel, aoFechar, tentativas }: { readonly atendimentoId: string; readonly visivel: boolean; readonly aoFechar: () => void; readonly tentativas: Map<string, EntradaTransferenciaAtendimentoDto> }) {
  const [contexto, definirContexto] = useState<ContextoOperacionalDto>();
  const [destinos, definirDestinos] = useState<DestinoTransferenciaDto[]>([]);
  const [selecao, definirSelecao] = useState('');
  const [tentativa, atualizarTentativa] = useState(() => tentativas.get(atendimentoId));
  function definirTentativa(entrada: EntradaTransferenciaAtendimentoDto | undefined) {
    if (entrada === undefined) tentativas.delete(atendimentoId);
    else tentativas.set(atendimentoId, entrada);
    atualizarTentativa(entrada);
  }
  const [aviso, definirAviso] = useState('');
  const [ocupado, definirOcupado] = useState(false);
  const emVoo = useRef(false);
  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      if (!visivel) return;
      try {
        const [atual, lista] = await Promise.all([consultarOperacaoAtendimentoWeb({ path: { atendimentoId } }), listarDestinosTransferenciaWeb({ path: { atendimentoId } })]);
        if (ativo) { definirContexto(atual.data); definirDestinos(lista.data ?? []); }
      } catch { if (ativo) { definirContexto(undefined); definirDestinos([]); definirAviso('Não foi possível consultar os destinos.'); } }
    };
    const inicial = window.setTimeout(() => void carregar(), 0);
    const evento = () => void carregar();
    window.addEventListener('vyntra:evento', evento);
    window.addEventListener('online', evento);
    return () => { ativo = false; window.clearTimeout(inicial); window.removeEventListener('vyntra:evento', evento); window.removeEventListener('online', evento); };
  }, [atendimentoId, visivel]);
  const destino = destinos.find((item) => item.fila_id + ':' + (item.usuario_id ?? '') === selecao);
  async function confirmar() {
    if (emVoo.current || !navigator.onLine || contexto?.pode_transferir !== true || (destino === undefined && tentativa === undefined)) return;
    const entrada = tentativa ?? (destino === undefined ? undefined : {
      chave_idempotencia: crypto.randomUUID(), confirmacao_explicita: true as const,
      versao_atribuicao_esperada: contexto.versao_atribuicao, fila_destino_id: destino.fila_id,
      ...(destino.usuario_id === undefined ? {} : { usuario_destino_id: destino.usuario_id }),
    });
    if (entrada === undefined) return;
    definirTentativa(entrada); definirOcupado(true); emVoo.current = true;
    try {
      const resposta = await transferirAtendimentoWeb({ path: { atendimentoId }, body: entrada, headers: { 'x-csrf-token': obterCsrf() } });
      if (resposta.data?.situacao === 'CONFIRMADA') {
        definirTentativa(undefined); definirSelecao(''); definirAviso('Transferência confirmada.');
        window.dispatchEvent(new Event('vyntra:evento'));
        aoFechar();
      } else if (resposta.response?.status === 409) {
        definirTentativa(undefined); definirSelecao(''); definirContexto(undefined); definirDestinos([]);
        definirAviso('O atendimento ou o destino mudou. Feche e selecione novamente.');
      } else if ([401, 403].includes(resposta.response?.status ?? 0)) {
        definirContexto(undefined); definirDestinos([]); definirSelecao(''); definirTentativa(undefined); definirAviso('Acesso indisponível.');
        window.dispatchEvent(new Event('vyntra:evento'));
      } else definirAviso('Sem confirmação. Tente novamente com a mesma seleção.');
    } catch { definirAviso('Sem confirmação. Tente novamente com a mesma seleção.'); }
    finally {
      definirOcupado(false); emVoo.current = false;
      window.dispatchEvent(new Event('vyntra:transferencia-sem-confirmacao'));
    }
  }
  if (!visivel) return null;
  return <aside className="painel-conversa" aria-label="Transferir atendimento">
    <header><strong>Transferir atendimento</strong><button type="button" aria-label="Fechar transferência" onClick={aoFechar}>×</button></header>
    <div className="painel-conversa__lista">
      <label>Fila ou atendente
        <select disabled={ocupado || tentativa !== undefined || !contexto?.pode_transferir} value={selecao} onChange={(evento) => definirSelecao(evento.target.value)}>
          <option value="">Selecione o destino</option>
          {destinos.map((item) => <option key={item.fila_id + ':' + (item.usuario_id ?? '')} value={item.fila_id + ':' + (item.usuario_id ?? '')}>{item.fila_nome}{item.usuario_nome === undefined ? ' · Aguardar resgate' : ' · ' + item.usuario_nome}</option>)}
        </select>
      </label>
      {destino !== undefined && <p>Destino: <strong>{destino.fila_nome}{destino.usuario_nome === undefined ? ' · Aguardar resgate' : ' · ' + destino.usuario_nome}</strong>. O histórico permitido será preservado.</p>}
      <button disabled={ocupado || !contexto?.pode_transferir || (destino === undefined && tentativa === undefined)} onClick={() => void confirmar()} type="button">{tentativa ? 'Tentar transferência novamente' : 'Confirmar transferência'}</button>
      {aviso !== '' && <p role="status">{aviso}</p>}
    </div>
  </aside>;
}
