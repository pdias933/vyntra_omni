import { consultarDisponibilidadePropriaWeb, definirDisponibilidadePropriaWeb, type DisponibilidadePropriaDto, type EntradaDisponibilidadePropriaDto } from '@vyntra/api-client';
import { useEffect, useRef, useState } from 'react';
import { obterCsrf } from './seguranca-web';

export function DisponibilidadePropriaWeb() {
  const [atual, definirAtual] = useState<DisponibilidadePropriaDto>();
  const [aviso, definirAviso] = useState('');
  const [ocupado, definirOcupado] = useState(false);
  const [pendente, definirPendente] = useState<EntradaDisponibilidadePropriaDto>();
  const emVoo = useRef(false);
  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      try { const resposta = await consultarDisponibilidadePropriaWeb(); if (ativo) definirAtual(resposta.data); }
      catch { if (ativo) definirAtual(undefined); }
    };
    const inicial = window.setTimeout(() => void carregar(), 0);
    const evento = () => void carregar();
    window.addEventListener('focus', evento);
    window.addEventListener('vyntra:evento', evento);
    return () => { ativo = false; window.clearTimeout(inicial); window.removeEventListener('focus', evento); window.removeEventListener('vyntra:evento', evento); };
  }, []);
  async function alterar() {
    if (atual === undefined || emVoo.current || !navigator.onLine) return;
    emVoo.current = true; definirOcupado(true);
    const entrada: EntradaDisponibilidadePropriaDto = pendente ?? { chave_idempotencia: crypto.randomUUID(), estado: atual.estado === 'DISPONIVEL' ? 'INDISPONIVEL' : 'DISPONIVEL', versao_esperada: atual.versao };
    definirPendente(entrada);
    try {
      const resposta = await definirDisponibilidadePropriaWeb({ body: entrada, headers: { 'x-csrf-token': obterCsrf() } });
      if (resposta.data?.situacao === 'CONFIRMADA') {
        definirPendente(undefined); definirAviso('Disponibilidade confirmada.');
        try { definirAtual((await consultarDisponibilidadePropriaWeb()).data); }
        catch { definirAtual(undefined); }
      } else if (resposta.response?.status === 409) {
        definirPendente(undefined); definirAviso('A disponibilidade mudou. Confira antes de alterar.');
        definirAtual((await consultarDisponibilidadePropriaWeb()).data);
      } else if ([401, 403].includes(resposta.response?.status ?? 0)) { definirAtual(undefined); definirPendente(undefined); }
      else definirAviso('Sem confirmação. Tente novamente.');
    } catch { definirAviso('Sem confirmação. Tente novamente.'); }
    finally { emVoo.current = false; definirOcupado(false); }
  }
  if (atual === undefined) return null;
  return <details className="disponibilidade-propria">
    <summary aria-label="Minha disponibilidade" title="Minha disponibilidade">◉</summary>
    <div><strong>Minha disponibilidade</strong><p>{atual.estado === 'DISPONIVEL' ? 'Disponível para transferências' : 'Indisponível para transferências'}</p>
      <button disabled={ocupado} onClick={() => void alterar()} type="button">{pendente ? 'Tentar novamente' : atual.estado === 'DISPONIVEL' ? 'Ficar indisponível' : 'Ficar disponível'}</button>
      <small role="status">{aviso}</small>
    </div>
  </details>;
}
