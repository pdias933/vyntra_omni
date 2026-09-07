import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { ServicoAtendimentosMobile } from '../atendimentos/servico-atendimentos-mobile';
import { useTema } from '../aparencia/contexto-tema';
import { BotaoPrimario } from './BotaoPrimario';

// Recibos efêmeros, sem conteúdo do contato e sem fila de execução offline.
export function TentativasOperacionaisMobile({ servico, conectado }: { readonly servico: ServicoAtendimentosMobile; readonly conectado: boolean }) {
  const { cores } = useTema();
  const [pendentes, definirPendentes] = useState<Awaited<ReturnType<ServicoAtendimentosMobile['listarTentativasOperacionais']>>>([]);
  const [aviso, definirAviso] = useState('');
  const [ocupado, definirOcupado] = useState(false);
  const emVoo = useRef(false);
  useEffect(() => {
    let ativo = true;
    const carregar = () => void servico.listarTentativasOperacionais().then((itens) => { if (ativo) definirPendentes(itens); }).catch(() => { if (ativo) definirPendentes([]); });
    const inicial = setTimeout(carregar, 0);
    const remover = servico.observarMudancas(carregar);
    return () => { ativo = false; clearTimeout(inicial); remover(); };
  }, [conectado, servico]);
  async function repetir(item: (typeof pendentes)[number]) {
    if (!conectado || emVoo.current) return;
    emVoo.current = true; definirOcupado(true);
    try {
      const resultado = await servico.repetirTentativaOperacional(item.atendimentoId, item.tipo);
      definirAviso(resultado.situacao === 'CONFIRMADA' ? 'Operação confirmada.' : 'Sem confirmação. Tente novamente explicitamente.');
    } catch { definirAviso('Não foi possível confirmar. Confira sua conexão e seu acesso.'); }
    finally { emVoo.current = false; definirOcupado(false); }
  }
  if (pendentes.length === 0 && aviso === '') return null;
  return <View style={{ gap: 12 }}>
    {pendentes.map((item) => <BotaoPrimario key={item.tipo + item.atendimentoId} texto={item.tipo === 'RESGATE' ? 'Verificar resgate pendente' : 'Verificar transferência pendente'} variante="secundario" desabilitado={!conectado || ocupado} onPress={() => void repetir(item)} />)}
    {aviso !== '' && <Text accessibilityLiveRegion="polite" style={{ color: cores.textoSecundario }}>{aviso}</Text>}
  </View>;
}
