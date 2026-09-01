import { criarFilaAdministracaoOperacional, definirOverrideCalendarioAdministracaoOperacional, inativarFilaAdministracaoOperacional, listarAdministracaoOperacional, type PainelAdministracaoOperacionalDto } from '@vyntra/api-client';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { CabecalhoPagina } from '../ShellWeb';
import { obterCsrf } from '../seguranca-web';

export function AdministracaoOperacionalWeb() {
  const [painel, definirPainel] = useState<PainelAdministracaoOperacionalDto>();
  const [estado, definirEstado] = useState<'CARREGANDO' | 'ERRO' | 'PRONTO'>('CARREGANDO');
  const [novaFila, definirNovaFila] = useState('');
  const [filaInativar, definirFilaInativar] = useState<string>();
  const [calendarioId, definirCalendarioId] = useState('');
  const [estadoOverride, definirEstadoOverride] = useState<'ABERTO' | 'FECHADO'>('FECHADO');
  const [motivo, definirMotivo] = useState('Ajuste operacional temporário');
  const [duracaoHoras, definirDuracaoHoras] = useState(4);
  const [mensagem, definirMensagem] = useState<string>();
  const [ocupado, definirOcupado] = useState(false);

  const carregar = useCallback(async () => { definirEstado('CARREGANDO'); try { const resposta = await listarAdministracaoOperacional({ throwOnError: true }); definirPainel(resposta.data); definirCalendarioId((atual) => atual || resposta.data.calendarios[0]?.id || ''); definirEstado('PRONTO'); } catch { definirEstado('ERRO'); } }, []);
  useEffect(() => { const temporizador = window.setTimeout(() => void carregar(), 0); return () => window.clearTimeout(temporizador); }, [carregar]);

  async function criarFila(evento: FormEvent<HTMLFormElement>) { evento.preventDefault(); if (novaFila.trim() === '') return; definirOcupado(true); try { const resposta = await criarFilaAdministracaoOperacional({ body: { nome: novaFila.trim() }, headers: { 'x-csrf-token': obterCsrf() }, throwOnError: true }); definirPainel(resposta.data); definirNovaFila(''); definirMensagem('Fila criada ativa e protegida pelo RBAC.'); } catch { definirMensagem('Não foi possível criar a fila. Confira nome e permissão.'); } finally { definirOcupado(false); } }
  async function inativarFila() { if (filaInativar === undefined) return; definirOcupado(true); try { await inativarFilaAdministracaoOperacional({ headers: { 'x-csrf-token': obterCsrf() }, path: { filaId: filaInativar }, throwOnError: true }); definirFilaInativar(undefined); definirMensagem('Fila inativada e acessos afetados invalidados.'); await carregar(); } catch { definirMensagem('A fila não pode ser inativada.'); } finally { definirOcupado(false); } }
  async function definirOverride(evento: FormEvent<HTMLFormElement>) { evento.preventDefault(); if (calendarioId === '') return; definirOcupado(true); const inicio = new Date(); const fim = new Date(inicio.getTime() + duracaoHoras * 3_600_000); try { const resposta = await definirOverrideCalendarioAdministracaoOperacional({ body: { estado: estadoOverride, motivo, vigente_ate: fim.toISOString(), vigente_de: inicio.toISOString() }, headers: { 'x-csrf-token': obterCsrf() }, path: { calendarioId }, throwOnError: true }); definirPainel(resposta.data); definirMensagem('Override aplicado e auditado.'); } catch { definirMensagem('O override conflita com outro período ou não foi autorizado.'); } finally { definirOcupado(false); } }

  return <main className="pagina-shell administracao-operacional">
    <CabecalhoPagina descricao="Contas, filas, calendários, SLA e integrações." titulo="Configuração operacional" />
    {estado === 'CARREGANDO' && <div className="skeleton-administracao" />}
    {estado === 'ERRO' && <section className="estado-vazio-shell"><strong>Acesso indisponível</strong><p>Nenhuma capacidade administrativa foi autorizada.</p></section>}
    {estado === 'PRONTO' && painel !== undefined && <div className="grade-operacional">
      <section className="painel-operacional painel-integracoes"><header><strong>Integrações</strong><small>Estado observado</small></header><div className="grade-integracoes">{painel.integracoes.map((integracao) => <article key={integracao.codigo}><i className={integracao.estado === 'ATIVA' ? 'integracao-ativa' : ''} /><div><strong>{rotuloIntegracao(integracao.codigo)}</strong><small>{integracao.detalhe}</small></div><span>{integracao.estado === 'ATIVA' ? 'Ativa' : 'Não configurada'}</span></article>)}</div></section>
      <section className="painel-operacional painel-contas"><header><strong>Contas WhatsApp</strong><small>{painel.contas.length} cadastradas</small></header>{painel.contas.length === 0 ? <p>Nenhuma conta cadastrada.</p> : painel.contas.map((conta) => <article key={conta.id}><div><strong>{conta.nome}</strong><small>{conta.telefone_mascarado ?? 'Telefone opcional'} · versão {conta.versao}</small></div><span className={conta.estado === 'ATIVA' ? 'selo-operacional-ativo' : ''}>{conta.estado}</span></article>)}</section>
      <section className="painel-operacional painel-filas"><header><strong>Filas e SLA</strong><small>{painel.filas.length} filas</small></header>{booleanoCampo(painel.capacidades, 'administrarFilas') && <form className="nova-fila" onSubmit={(evento) => void criarFila(evento)}><input maxLength={120} onChange={(evento) => definirNovaFila(evento.target.value)} placeholder="Nome da nova fila" value={novaFila} /><button disabled={ocupado} type="submit">Criar fila</button></form>}{painel.filas.map((fila) => <article key={fila.id}><div><strong>{fila.nome}</strong><small>{fila.usuarios_ativos} usuários · {fila.atendimentos_abertos} abertos · {fila.calendario ?? 'Sem calendário'}</small>{fila.sla !== undefined && <em>SLA {numeroCampo(fila.sla, 'atendenteMinutos')} / {numeroCampo(fila.sla, 'supervisorMinutos')} / {numeroCampo(fila.sla, 'administradorMinutos')} min</em>}</div><span className={fila.estado === 'ATIVA' ? 'selo-operacional-ativo' : ''}>{fila.estado}</span>{fila.estado === 'ATIVA' && booleanoCampo(painel.capacidades, 'administrarFilas') && <button onClick={() => definirFilaInativar(fila.id)} type="button">Inativar</button>}</article>)}</section>
      <section className="painel-operacional painel-calendarios"><header><strong>Calendários</strong><small>Fuso e override</small></header>{painel.calendarios.map((calendario) => <article key={calendario.id}><div><strong>{calendario.nome}</strong><small>{calendario.modo} · {calendario.fuso_horario}</small>{calendario.override_atual !== undefined && <em>Override {textoCampo(calendario.override_atual, 'estado')} ativo</em>}</div></article>)}{booleanoCampo(painel.capacidades, 'administrarCalendarios') && painel.calendarios.length > 0 && <form className="form-override" onSubmit={(evento) => void definirOverride(evento)}><strong>Override temporário</strong><select onChange={(evento) => definirCalendarioId(evento.target.value)} value={calendarioId}>{painel.calendarios.map((calendario) => <option key={calendario.id} value={calendario.id}>{calendario.nome}</option>)}</select><select onChange={(evento) => definirEstadoOverride(evento.target.value as 'ABERTO' | 'FECHADO')} value={estadoOverride}><option value="FECHADO">Fechar</option><option value="ABERTO">Abrir</option></select><input maxLength={500} onChange={(evento) => definirMotivo(evento.target.value)} value={motivo} /><label>Duração<input max={72} min={1} onChange={(evento) => definirDuracaoHoras(Number(evento.target.value))} type="number" value={duracaoHoras} /> horas</label><button disabled={ocupado} type="submit">Revisar e aplicar</button></form>}</section>
      {filaInativar !== undefined && <section className="confirmacao-operacional"><strong>Inativar esta fila?</strong><p>Novos atendimentos não serão roteados e os acessos afetados serão invalidados.</p><button onClick={() => definirFilaInativar(undefined)} type="button">Cancelar</button><button disabled={ocupado} onClick={() => void inativarFila()} type="button">Confirmar inativação</button></section>}
      {mensagem !== undefined && <p className="mensagem-operacional" role="status">{mensagem}</p>}
    </div>}
  </main>;
}

function booleanoCampo(valor: Readonly<Record<string, unknown>>, campo: string): boolean { return valor[campo] === true; }
function numeroCampo(valor: Readonly<Record<string, unknown>>, campo: string): number | undefined { const item = valor[campo]; return typeof item === 'number' ? item : undefined; }
function textoCampo(valor: Readonly<Record<string, unknown>>, campo: string): string | undefined { const item = valor[campo]; return typeof item === 'string' ? item : undefined; }
function rotuloIntegracao(codigo: string): string { return ({ CANAL_WHATSAPP: 'Canal WhatsApp', POSTGRESQL: 'PostgreSQL', SESSAO_ACESSO: 'Sessão de acesso', SISTEMA_GESTAO: 'Sistema de gestão' } as Record<string, string>)[codigo] ?? codigo; }
