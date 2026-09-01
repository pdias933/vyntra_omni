import {
  listarAtendimentosWeb,
  type ResumoAtendimentoWebDto,
} from '@vyntra/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CabecalhoPagina } from '../ShellWeb';

type Filtro =
  | 'EM_AUTOMACAO'
  | 'EXPIRANDO'
  | 'MEUS'
  | 'NAO_LIDOS'
  | 'PENDENTES'
  | 'SLA';

const FILTROS: ReadonlyArray<{ readonly codigo: Filtro; readonly rotulo: string }> = [
  { codigo: 'MEUS', rotulo: 'Meus' },
  { codigo: 'PENDENTES', rotulo: 'Pendentes' },
  { codigo: 'NAO_LIDOS', rotulo: 'Não lidos' },
  { codigo: 'SLA', rotulo: 'SLA' },
  { codigo: 'EXPIRANDO', rotulo: 'Expirando' },
  { codigo: 'EM_AUTOMACAO', rotulo: 'Em automação' },
];

function hora(data: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(data));
}

function restante(data: string): { readonly classe: string; readonly texto: string } {
  const minutos = Math.max(0, Math.ceil((new Date(data).getTime() - Date.now()) / 60_000));
  if (minutos < 15) return { classe: 'critico', texto: `${minutos} min` };
  if (minutos < 60) return { classe: 'atencao', texto: `${minutos} min` };
  const horas = Math.floor(minutos / 60);
  return { classe: 'normal', texto: `${horas}h ${minutos % 60}min` };
}

function iniciais(nome: string): string {
  return nome
    .split(/\s+/u)
    .slice(0, 2)
    .map((parte) => parte.slice(0, 1))
    .join('')
    .toLocaleUpperCase('pt-BR');
}

export function ListaAtendimentosWeb() {
  const [filtro, definirFiltro] = useState<Filtro>('MEUS');
  const [itens, definirItens] = useState<readonly ResumoAtendimentoWebDto[]>([]);
  const [estado, definirEstado] = useState<'CARREGANDO' | 'ERRO' | 'PRONTO'>('CARREGANDO');
  const [selecionado, definirSelecionado] = useState<string>();
  const requisicaoAtual = useRef(0);

  const carregar = useCallback(async (filtroAtual: Filtro, silencioso = false) => {
    const requisicao = ++requisicaoAtual.current;
    if (!silencioso) definirEstado('CARREGANDO');
    try {
      const resposta = await listarAtendimentosWeb({
        query: { filtro: filtroAtual },
        throwOnError: true,
      });
      if (requisicao !== requisicaoAtual.current) return;
      definirItens(resposta.data.itens);
      definirEstado('PRONTO');
    } catch {
      if (requisicao === requisicaoAtual.current) definirEstado('ERRO');
    }
  }, []);

  useEffect(() => {
    const identificador = window.setTimeout(() => void carregar(filtro), 0);
    return () => window.clearTimeout(identificador);
  }, [carregar, filtro]);

  useEffect(() => {
    const aoReceberEvento = () => void carregar(filtro, true);
    window.addEventListener('vyntra:evento', aoReceberEvento);
    return () => window.removeEventListener('vyntra:evento', aoReceberEvento);
  }, [carregar, filtro]);

  return (
    <main className="pagina-atendimentos">
      <section className="lista-atendimentos">
        <CabecalhoPagina descricao="Prioridade, contexto e conversas em um só lugar." titulo="Atendimentos" />
        <div aria-label="Filtros de atendimentos" className="filtros-atendimentos" role="tablist">
          {FILTROS.map((item) => (
            <button
              aria-selected={filtro === item.codigo}
              className={filtro === item.codigo ? 'ativo' : ''}
              key={item.codigo}
              onClick={() => definirFiltro(item.codigo)}
              role="tab"
              type="button"
            >
              {item.rotulo}
            </button>
          ))}
        </div>

        <div className="lista-atendimentos__corpo" aria-live="polite">
          {estado === 'CARREGANDO' && <SkeletonLista />}
          {estado === 'ERRO' && (
            <div className="estado-lista estado-lista--erro">
              <strong>Não foi possível abrir os atendimentos.</strong>
              <p>A conexão será recuperada automaticamente.</p>
            </div>
          )}
          {estado === 'PRONTO' && itens.length === 0 && (
            <div className="estado-lista">
              <span aria-hidden="true">✓</span>
              <strong>Nada por aqui agora</strong>
              <p>Novas conversas aparecem automaticamente.</p>
            </div>
          )}
          {estado === 'PRONTO' && itens.map((item) => (
            <CartaoAtendimento
              ativo={selecionado === item.atendimento_id}
              item={item}
              key={item.conversa_id}
              aoSelecionar={() => definirSelecionado(item.atendimento_id)}
            />
          ))}
        </div>
      </section>
      <aside className="previa-atendimento">
        <div>
          <span aria-hidden="true">◌</span>
          <strong>{selecionado === undefined ? 'Selecione uma conversa' : 'Conversa selecionada'}</strong>
          <p>{selecionado === undefined ? 'O atendimento será aberto aqui sem tirar você da fila.' : 'A timeline entra na próxima etapa.'}</p>
        </div>
      </aside>
    </main>
  );
}

function CartaoAtendimento({ ativo, aoSelecionar, item }: { readonly ativo: boolean; readonly aoSelecionar: () => void; readonly item: ResumoAtendimentoWebDto }) {
  const marcadorTempo = item.sla_em === undefined
    ? (item.janela_expira_em === undefined ? undefined : restante(item.janela_expira_em))
    : restante(item.sla_em);
  return (
    <button
      className={`cartao-atendimento${ativo ? ' cartao-atendimento--ativo' : ''}`}
      data-conversa-id={item.conversa_id}
      onClick={aoSelecionar}
      type="button"
    >
      <span className="avatar-atendimento">{iniciais(item.nome_contato)}<i aria-label="WhatsApp">◉</i></span>
      <span className="cartao-atendimento__conteudo">
        <span className="cartao-atendimento__topo"><strong>{item.nome_contato}</strong><time>{hora(item.ultima_atividade_em)}</time></span>
        <span className="cartao-atendimento__mensagem">{item.ultima_mensagem_direcao === 'SAIDA' && <i>Você: </i>}{item.ultima_mensagem_resumo}</span>
        <span className="cartao-atendimento__metadados"><i>{item.fila_nome}</i>{item.identidade_secundaria !== undefined && <small>{item.identidade_secundaria}</small>}{item.modo === 'BOT' && <small>Em automação</small>}</span>
      </span>
      <span className="cartao-atendimento__estado">
        {marcadorTempo !== undefined && <small className={`tempo-atendimento tempo-atendimento--${marcadorTempo.classe}`}>◷ {marcadorTempo.texto}</small>}
        {item.quantidade_nao_lida > 0 && <b aria-label={`${item.quantidade_nao_lida} mensagens não lidas`}>{Math.min(item.quantidade_nao_lida, 99)}</b>}
      </span>
    </button>
  );
}

function SkeletonLista() {
  return <>{Array.from({ length: 7 }, (_, indice) => <div className="skeleton-atendimento" key={indice} />)}</>;
}
