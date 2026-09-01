import {
  alterarAcessoUsuarioAdministracao,
  listarAdministracaoUsuarios,
  revogarDispositivosMobileAdministrativamente,
  revogarSessoesWebAdministrativamente,
  type PainelAdministracaoUsuariosDto,
  type ResumoAdministracaoUsuarioDto,
} from '@vyntra/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CabecalhoPagina } from '../ShellWeb';
import { obterCsrf } from '../seguranca-web';

type Revogacao = 'DISPOSITIVOS' | 'SESSOES';

export function AdministracaoUsuariosWeb() {
  const [painel, definirPainel] = useState<PainelAdministracaoUsuariosDto>();
  const [selecionadoId, definirSelecionadoId] = useState<string>();
  const [perfilId, definirPerfilId] = useState('');
  const [filasIds, definirFilasIds] = useState<readonly string[]>([]);
  const [revogacao, definirRevogacao] = useState<Revogacao>();
  const [estado, definirEstado] = useState<'CARREGANDO' | 'ERRO' | 'PRONTO'>('CARREGANDO');
  const [mensagem, definirMensagem] = useState<string>();
  const [ocupado, definirOcupado] = useState(false);
  const selecionadoRef = useRef<string | undefined>(undefined);
  const selecionado = painel?.usuarios.find((usuario) => usuario.id === selecionadoId);

  const carregar = useCallback(async () => {
    definirEstado('CARREGANDO');
    try {
      const resposta = await listarAdministracaoUsuarios({ throwOnError: true });
      definirPainel(resposta.data); definirEstado('PRONTO');
      const escolhido = resposta.data.usuarios.find((usuario) => usuario.id === selecionadoRef.current) ?? resposta.data.usuarios[0];
      if (escolhido !== undefined) selecionar(escolhido);
    } catch { definirEstado('ERRO'); }
  }, []);

  useEffect(() => { const temporizador = window.setTimeout(() => void carregar(), 0); return () => window.clearTimeout(temporizador); }, [carregar]);

  async function salvar() {
    if (selecionado === undefined || perfilId === '') return;
    definirOcupado(true); definirMensagem(undefined);
    try {
      await alterarAcessoUsuarioAdministracao({ body: { fila_ids: [...filasIds], perfil_id: perfilId, versao_esperada: selecionado.versao_permissoes }, headers: { 'x-csrf-token': obterCsrf() }, path: { usuarioId: selecionado.id }, throwOnError: true });
      definirMensagem('Acesso atualizado e invalidado em todas as sessões conectadas.'); await carregar();
    } catch { definirMensagem('O acesso mudou enquanto você editava ou não pode ser alterado. Recarregue os dados.'); }
    finally { definirOcupado(false); }
  }

  async function confirmarRevogacao() {
    if (selecionado === undefined || revogacao === undefined) return;
    definirOcupado(true);
    try {
      const entrada = { headers: { 'x-csrf-token': obterCsrf() }, path: { usuarioId: selecionado.id }, throwOnError: true } as const;
      if (revogacao === 'SESSOES') await revogarSessoesWebAdministrativamente(entrada);
      else await revogarDispositivosMobileAdministrativamente(entrada);
      definirMensagem(revogacao === 'SESSOES' ? 'Sessões web revogadas.' : 'Dispositivos mobile revogados.'); definirRevogacao(undefined); await carregar();
    } catch { definirMensagem('A revogação não foi concluída.'); }
    finally { definirOcupado(false); }
  }

  function selecionar(usuario: ResumoAdministracaoUsuarioDto) { selecionadoRef.current = usuario.id; definirSelecionadoId(usuario.id); definirPerfilId(usuario.perfil?.id ?? ''); definirFilasIds(usuario.filas.map((fila) => fila.id)); definirMensagem(undefined); definirRevogacao(undefined); }
  function alternarFila(filaId: string) { definirFilasIds((atuais) => atuais.includes(filaId) ? atuais.filter((id) => id !== filaId) : [...atuais, filaId]); }

  return <main className="pagina-shell administracao-usuarios">
    <CabecalhoPagina descricao="Perfis, permissões, filas, sessões e auditoria." titulo="Usuários e acessos" />
    {estado === 'CARREGANDO' && <div className="skeleton-administracao" />}
    {estado === 'ERRO' && <section className="estado-vazio-shell"><strong>Acesso indisponível</strong><p>Confirme sua permissão administrativa.</p></section>}
    {estado === 'PRONTO' && painel !== undefined && <div className="grade-administracao-usuarios">
      <section className="lista-usuarios-admin"><header><strong>Equipe</strong><small>{painel.usuarios.length} usuários</small></header>{painel.usuarios.map((usuario) => <button aria-pressed={usuario.id === selecionadoId} key={usuario.id} onClick={() => selecionar(usuario)} type="button"><span>{usuario.nome_exibicao.slice(0, 1).toLocaleUpperCase('pt-BR')}</span><div><strong>{usuario.nome_exibicao}</strong><small>{usuario.perfil?.nome ?? 'Sem perfil'} · {usuario.filas.length} filas</small></div><i className={usuario.estado === 'ATIVO' ? 'estado-ativo' : ''}>{usuario.estado}</i></button>)}</section>
      <section className="editor-acesso-admin">
        {selecionado === undefined ? <p>Selecione um usuário.</p> : <>
          <header><div><strong>{selecionado.nome_exibicao}</strong><small>Versão de permissões {selecionado.versao_permissoes}</small></div><span>{selecionado.sessoes_web_ativas} web · {selecionado.dispositivos_mobile_ativos} mobile</span></header>
          <label>Perfil de acesso<select onChange={(evento) => definirPerfilId(evento.target.value)} value={perfilId}><option value="">Selecione</option>{painel.perfis.map((perfil) => <option key={perfil.id} value={perfil.id}>{perfil.nome} · {perfil.papel_base}</option>)}</select></label>
          <fieldset><legend>Filas autorizadas</legend>{painel.filas.map((fila) => <label key={fila.id}><input checked={filasIds.includes(fila.id)} onChange={() => alternarFila(fila.id)} type="checkbox" />{fila.nome}</label>)}</fieldset>
          <div className="permissoes-perfil"><strong>Permissões do perfil</strong><div>{painel.perfis.find((perfil) => perfil.id === perfilId)?.permissoes.map((permissao) => <span className={permissao.efeito === 'NEGAR' ? 'permissao-negada' : ''} key={permissao.codigo}>{permissao.efeito === 'NEGAR' ? '−' : '+'} {permissao.codigo.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')}</span>)}</div></div>
          <button className="salvar-acesso" disabled={ocupado || perfilId === ''} onClick={() => void salvar()} type="button">Salvar perfil e filas</button>
          <div className="acoes-sessao-admin"><button disabled={selecionado.sessoes_web_ativas === 0} onClick={() => definirRevogacao('SESSOES')} type="button">Revogar sessões web</button><button disabled={selecionado.dispositivos_mobile_ativos === 0} onClick={() => definirRevogacao('DISPOSITIVOS')} type="button">Revogar dispositivos mobile</button></div>
          {revogacao !== undefined && <div className="confirmacao-admin"><strong>Confirmar revogação?</strong><p>O usuário perderá acesso nos {revogacao === 'SESSOES' ? 'navegadores' : 'dispositivos'} ativos.</p><button onClick={() => definirRevogacao(undefined)} type="button">Cancelar</button><button disabled={ocupado} onClick={() => void confirmarRevogacao()} type="button">Confirmar</button></div>}
          {mensagem !== undefined && <p className="mensagem-admin" role="status">{mensagem}</p>}
        </>}
      </section>
      <section className="auditoria-admin"><header><strong>Auditoria recente</strong><small>Somente metadados sanitizados</small></header>{painel.auditoria_recente.map((registro) => <div key={registro.id}><span>{registro.acao.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')}</span><time>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(registro.criado_em))}</time></div>)}</section>
    </div>}
  </main>;
}
