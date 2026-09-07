import { transferirAtendimentoWeb, type EntradaTransferenciaAtendimentoDto } from '@vyntra/api-client';
import { useEffect, useRef, useState } from 'react';
import { obterCsrf } from '../seguranca-web';

// Não retém nome, timeline ou destino descritivo de um atendimento que saiu do escopo.
// A repetição é explícita e o servidor reautoriza antes de consultar o recibo.
export function TransferenciasSemConfirmacaoWeb({ tentativas }: { readonly tentativas: Map<string, EntradaTransferenciaAtendimentoDto> }) {
  const [pendentes, definirPendentes] = useState<readonly string[]>([]);
  const [aviso, definirAviso] = useState('');
  const [ocupado, definirOcupado] = useState(false);
  const emVoo = useRef(false);
  useEffect(() => {
    const atualizar = () => definirPendentes([...tentativas.keys()]);
    window.addEventListener('vyntra:transferencia-sem-confirmacao', atualizar);
    return () => window.removeEventListener('vyntra:transferencia-sem-confirmacao', atualizar);
  }, [tentativas]);
  async function repetir(atendimentoId: string) {
    const entrada = tentativas.get(atendimentoId);
    if (emVoo.current || entrada === undefined) return;
    if (!navigator.onLine) { definirAviso('Sem conexão. Tente novamente quando a conexão voltar.'); return; }
    emVoo.current = true; definirOcupado(true);
    try {
      const resposta = await transferirAtendimentoWeb({ path: { atendimentoId }, body: entrada, headers: { 'x-csrf-token': obterCsrf() } });
      const confirmou = resposta.data?.situacao === 'CONFIRMADA';
      const recusou = [400, 401, 403, 409].includes(resposta.response?.status ?? 0);
      if (confirmou || recusou) {
        tentativas.delete(atendimentoId);
        definirPendentes([...tentativas.keys()]);
        definirAviso(confirmou ? 'Transferência confirmada.' : 'Não foi possível confirmar. O acesso ou o atendimento mudou.');
        window.dispatchEvent(new Event('vyntra:evento'));
      } else definirAviso('Sem confirmação. A mesma tentativa foi preservada.');
    } catch { definirAviso('Sem confirmação. A mesma tentativa foi preservada.'); }
    finally { emVoo.current = false; definirOcupado(false); }
  }
  if (pendentes.length === 0 && aviso === '') return null;
  return <div className="estado-lista" aria-label="Transferências sem confirmação">
    {pendentes.map((id, indice) => <button key={id} type="button" disabled={ocupado} onClick={() => void repetir(id)}>Verificar transferência pendente{pendentes.length > 1 ? ` ${indice + 1}` : ''}</button>)}
    {aviso !== '' && <p role="status">{aviso}</p>}
  </div>;
}
