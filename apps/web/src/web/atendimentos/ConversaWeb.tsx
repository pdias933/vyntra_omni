import {
  confirmarLeituraTimelineWeb,
  marcarTimelineWebNaoLida,
  obterTimelineWeb,
  type ItemTimelineWebDto,
  type ResumoAtendimentoWebDto,
} from '@vyntra/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { obterCsrf } from '../seguranca-web';

interface Marcador { readonly marcadaNaoLida: boolean; readonly ultimaMensagemLidaId?: string; readonly versao: number }

function marcadorSeguro(valor: Readonly<Record<string, unknown>>): Marcador {
  const versao = Reflect.get(valor, 'versao');
  const marcada = Reflect.get(valor, 'marcada_nao_lida');
  const ultima = Reflect.get(valor, 'ultima_mensagem_lida_id');
  return {
    marcadaNaoLida: marcada === true,
    ...(typeof ultima === 'string' ? { ultimaMensagemLidaId: ultima } : {}),
    versao: typeof versao === 'number' && Number.isInteger(versao) ? versao : 0,
  };
}

function hora(data: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(data));
}

function dataSeparador(data: string): string {
  const valor = new Date(data);
  const hoje = new Date();
  if (valor.toDateString() === hoje.toDateString()) return 'Hoje';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(valor);
}

export function ConversaWeb({ atendimento }: { readonly atendimento: ResumoAtendimentoWebDto }) {
  const [itens, definirItens] = useState<readonly ItemTimelineWebDto[]>([]);
  const [cursor, definirCursor] = useState<string>();
  const [marcador, definirMarcador] = useState<Marcador>({ marcadaNaoLida: false, versao: 0 });
  const [estado, definirEstado] = useState<'CARREGANDO' | 'ERRO' | 'PRONTO'>('CARREGANDO');
  const leituraEmVoo = useRef<string | undefined>(undefined);
  const finalTimeline = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) definirEstado('CARREGANDO');
    try {
      const resposta = await obterTimelineWeb({ path: { atendimentoId: atendimento.atendimento_id }, throwOnError: true });
      definirItens(resposta.data.itens);
      definirCursor(resposta.data.proximo_cursor);
      definirMarcador(marcadorSeguro(resposta.data.marcador));
      definirEstado('PRONTO');
      window.requestAnimationFrame(() => finalTimeline.current?.scrollIntoView({ block: 'end' }));
    } catch {
      definirEstado('ERRO');
    }
  }, [atendimento.atendimento_id]);

  useEffect(() => {
    const identificador = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(identificador);
  }, [carregar]);

  useEffect(() => {
    const aoEvento = () => void carregar(true);
    window.addEventListener('vyntra:evento', aoEvento);
    return () => window.removeEventListener('vyntra:evento', aoEvento);
  }, [carregar]);

  useEffect(() => {
    if (estado !== 'PRONTO') return;
    const ultima = [...itens].reverse().find((item) => item.tipo === 'MENSAGEM' || item.tipo === 'FORMULARIO');
    if (ultima === undefined || ultima.id === marcador.ultimaMensagemLidaId || leituraEmVoo.current === ultima.id) return;
    leituraEmVoo.current = ultima.id;
    void confirmarLeituraTimelineWeb({
      body: { mensagem_id: ultima.id, versao_esperada: marcador.versao },
      headers: { 'x-csrf-token': obterCsrf() },
      path: { atendimentoId: atendimento.atendimento_id },
      throwOnError: true,
    }).then((resposta) => definirMarcador({ marcadaNaoLida: false, ultimaMensagemLidaId: ultima.id, versao: resposta.data.versao }))
      .finally(() => { leituraEmVoo.current = undefined; });
  }, [atendimento.atendimento_id, estado, itens, marcador]);

  async function carregarAnteriores() {
    if (cursor === undefined) return;
    const resposta = await obterTimelineWeb({
      path: { atendimentoId: atendimento.atendimento_id },
      query: { cursor },
      throwOnError: true,
    });
    definirItens((atuais) => [...resposta.data.itens, ...atuais]);
    definirCursor(resposta.data.proximo_cursor);
  }

  async function marcarNaoLida() {
    const resposta = await marcarTimelineWebNaoLida({
      body: { versao_esperada: marcador.versao },
      headers: { 'x-csrf-token': obterCsrf() },
      path: { atendimentoId: atendimento.atendimento_id },
      throwOnError: true,
    });
    definirMarcador({ ...marcador, marcadaNaoLida: true, versao: resposta.data.versao });
  }

  return (
    <section className="conversa-web">
      <header className="conversa-web__cabecalho">
        <span className="conversa-web__avatar">{atendimento.nome_contato.slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
        <button className="conversa-web__contato" type="button">
          <strong>{atendimento.nome_contato}</strong>
          <small>{atendimento.identidade_secundaria ?? atendimento.fila_nome}</small>
        </button>
        {atendimento.janela_expira_em !== undefined && <span className="janela-meta">Janela Meta ativa</span>}
        <button className="acao-cabecalho" onClick={() => void marcarNaoLida()} type="button">{marcador.marcadaNaoLida ? 'Não lida' : 'Marcar não lida'}</button>
      </header>
      <div className="timeline-web" aria-live="polite">
        {cursor !== undefined && <button className="carregar-anteriores" onClick={() => void carregarAnteriores()} type="button">Carregar mensagens anteriores</button>}
        {estado === 'CARREGANDO' && <div className="skeleton-timeline" />}
        {estado === 'ERRO' && <div className="timeline-erro"><strong>Conversa indisponível</strong><small>A recuperação acontece automaticamente.</small></div>}
        {estado === 'PRONTO' && itens.map((item, indice) => (
          <ItemTimeline item={item} key={item.id} mostrarData={indice === 0 || dataSeparador(itens[indice - 1]?.ocorrido_em ?? '') !== dataSeparador(item.ocorrido_em)} />
        ))}
        <div ref={finalTimeline} />
      </div>
      <footer className="composer-web composer-web--preparado">
        <button aria-label="Anexar" type="button">＋</button>
        <div><span>Digite uma mensagem…</span><kbd>/</kbd></div>
        <button aria-label="Ações do sistema" type="button">⌘</button>
      </footer>
    </section>
  );
}

function ItemTimeline({ item, mostrarData }: { readonly item: ItemTimelineWebDto; readonly mostrarData: boolean }) {
  if (item.tipo === 'SEPARADOR_ATENDIMENTO') {
    return <div className="separador-atendimento"><span>{item.rotulo}</span><small>{item.conta_whatsapp_nome} · {dataSeparador(item.ocorrido_em)}</small></div>;
  }
  if (item.tipo === 'EVENTO_OPERACIONAL') {
    return <div className="evento-operacional"><strong>{item.rotulo}</strong><small>Somente equipe · {hora(item.ocorrido_em)}</small></div>;
  }
  if (item.tipo === 'NOTA_INTERNA') {
    return <div className="bloco-nota-interna"><span>Nota interna · Somente equipe</span><p>{item.texto}</p><time>{hora(item.ocorrido_em)}</time></div>;
  }
  return <>
    {mostrarData && <div className="separador-data">{dataSeparador(item.ocorrido_em)}</div>}
    <article className={`bolha-mensagem bolha-mensagem--${item.direcao === 'SAIDA' ? 'saida' : 'entrada'}`}>
      {item.tipo === 'FORMULARIO' && <strong className="formulario-recebido">Informações recebidas</strong>}
      <p>{item.texto ?? (item.tipo === 'FORMULARIO' ? item.rotulo : rotuloMidia(item.mensagem_tipo))}</p>
      {item.tipo === 'FORMULARIO' && <button type="button">Ver formulário</button>}
      <small>{item.conta_whatsapp_nome} · {hora(item.ocorrido_em)} {item.direcao === 'SAIDA' && `· ${estadoMensagem(item.estado_mensagem)}`}</small>
    </article>
  </>;
}

function rotuloMidia(tipo?: string): string {
  return ({ AUDIO: 'Áudio', DOCUMENTO: 'Documento', IMAGEM: 'Imagem', REACAO: 'Reação', VIDEO: 'Vídeo' } as Record<string, string>)[tipo ?? ''] ?? 'Mensagem';
}

function estadoMensagem(estado?: string): string {
  return ({ ACEITA_CANAL: 'Enviada', ENTREGUE: 'Entregue', FALHOU: 'Falhou', LIDA: 'Lida' } as Record<string, string>)[estado ?? ''] ?? 'Enviando';
}
