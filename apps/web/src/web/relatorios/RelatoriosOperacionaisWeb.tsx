import { obterRelatorioOperacional, type RelatorioOperacionalDto } from '@vyntra/api-client';
import { useCallback, useEffect, useState } from 'react';

import { CabecalhoPagina } from '../ShellWeb';

type Periodo = RelatorioOperacionalDto['periodo'];

export function RelatoriosOperacionaisWeb() {
  const [periodo, definirPeriodo] = useState<Periodo>('24H');
  const [relatorio, definirRelatorio] = useState<RelatorioOperacionalDto>();
  const [falhou, definirFalhou] = useState(false);
  const carregar = useCallback(async () => {
    try {
      const resposta = await obterRelatorioOperacional({ query: { periodo }, throwOnError: true });
      definirRelatorio(resposta.data); definirFalhou(false);
    } catch { definirFalhou(true); }
  }, [periodo]);

  useEffect(() => { const id = window.setTimeout(() => void carregar(), 0); return () => window.clearTimeout(id); }, [carregar]);

  return (
    <main className="pagina-shell relatorios-operacionais">
      <CabecalhoPagina descricao="Indicadores objetivos das filas que você pode visualizar." titulo="Relatórios operacionais" />
      <nav aria-label="Período do relatório" className="periodos-relatorio">
        {(['24H', '7D', '30D'] as const).map((item) => (
          <button aria-pressed={periodo === item} className={periodo === item ? 'ativo' : ''} key={item} onClick={() => definirPeriodo(item)} type="button">{item === '24H' ? '24 horas' : item === '7D' ? '7 dias' : '30 dias'}</button>
        ))}
      </nav>
      {falhou && <p className="erro-painel" role="alert">Relatório indisponível ou nenhuma fila autorizada.</p>}
      {!falhou && relatorio === undefined && <div className="skeleton-saude" aria-label="Carregando relatório" />}
      {relatorio !== undefined && (
        <div className="conteudo-relatorio">
          <section className="grade-indicadores-relatorio" aria-label="Indicadores principais">
            <Indicador destaque="verde" rotulo="Mensagens recebidas" valor={relatorio.mensagens.recebidas} />
            <Indicador destaque="azul" rotulo="Mensagens entregues" valor={relatorio.mensagens.entregues} />
            <Indicador destaque="amarelo" rotulo="Alertas de SLA" valor={relatorio.sla.atendente + relatorio.sla.supervisor + relatorio.sla.administrador} />
            <Indicador destaque="vermelho" rotulo="Falhas operacionais" valor={relatorio.mensagens.falhas + relatorio.fluxos.falhas + relatorio.erp.falhas_definitivas} />
          </section>
          <section className="painel-relatorio">
            <header><div><span>Filas autorizadas</span><h2>Atendimentos por estado</h2></div><small>{formatarIntervalo(relatorio.inicio, relatorio.fim)}</small></header>
            <div className="tabela-relatorio">
              <b>Fila</b><b>Aguardando</b><b>Em atendimento</b><b>Encerrados</b>
              {relatorio.filas.map((fila) => <LinhaFila fila={fila} key={fila.fila_id} />)}
              {relatorio.filas.length === 0 && <p>Nenhuma fila disponível neste escopo.</p>}
            </div>
          </section>
          <section className="grade-detalhes-relatorio">
            <Bloco titulo="Mensageria" itens={[['Enviadas', relatorio.mensagens.enviadas], ['Entregues', relatorio.mensagens.entregues], ['Lidas', relatorio.mensagens.lidas], ['Falhas', relatorio.mensagens.falhas], ['Taxa de entrega', `${(relatorio.mensagens.taxa_entrega * 100).toFixed(1)}%`]]} />
            <Bloco titulo="Motor de Fluxos" itens={[['Ativos', relatorio.fluxos.ativos], ['Concluídos', relatorio.fluxos.concluidos], ['Falhas', relatorio.fluxos.falhas]]} />
            <Bloco titulo="ERP" itens={[['Pendentes', relatorio.erp.pendentes], ['Concluídas', relatorio.erp.concluidas], ['Resultado incerto', relatorio.erp.resultados_incertos], ['Falhas definitivas', relatorio.erp.falhas_definitivas]]} />
          </section>
          <p className="nota-formulas">Fórmulas v{relatorio.formulas_versao}: estados atuais agregados no período; entregue inclui entregue ou lida; taxa = entregues ÷ enviadas aceitas.</p>
        </div>
      )}
    </main>
  );
}

function Indicador({ destaque, rotulo, valor }: { readonly destaque: string; readonly rotulo: string; readonly valor: number }) { return <article className={`indicador-relatorio indicador-relatorio--${destaque}`}><strong>{valor.toLocaleString('pt-BR')}</strong><span>{rotulo}</span></article>; }
function LinhaFila({ fila }: { readonly fila: RelatorioOperacionalDto['filas'][number] }) { return <><span>{fila.nome}</span><span>{fila.aguardando}</span><span>{fila.em_atendimento}</span><span>{fila.encerrados}</span></>; }
function Bloco({ itens, titulo }: { readonly itens: readonly (readonly [string, number | string])[]; readonly titulo: string }) { return <article className="bloco-relatorio"><h2>{titulo}</h2>{itens.map(([rotulo, valor]) => <div key={rotulo}><span>{rotulo}</span><strong>{typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor}</strong></div>)}</article>; }
function formatarIntervalo(inicio: string, fim: string) { const formato = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); return `${formato.format(new Date(inicio))} — ${formato.format(new Date(fim))}`; }
