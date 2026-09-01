import {
  entrarSessaoWeb,
  obterSessaoWeb,
  sairSessaoWeb,
  type SessaoWebDto,
} from '@vyntra/api-client';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { AplicacaoEditorFluxos } from '../Aplicacao';
import { ListaAtendimentosWeb } from './atendimentos/ListaAtendimentosWeb';

type RotaWeb =
  | '/administracao/fluxos'
  | '/administracao/operacao'
  | '/administracao/usuarios'
  | '/atendimentos'
  | '/saude';

const ROTAS = new Set<RotaWeb>([
  '/atendimentos',
  '/administracao/usuarios',
  '/administracao/operacao',
  '/administracao/fluxos',
  '/saude',
]);

function rotaAtual(): RotaWeb {
  return ROTAS.has(window.location.pathname as RotaWeb)
    ? (window.location.pathname as RotaWeb)
    : '/atendimentos';
}

function obterCsrf(): string {
  const nome = '__Host-vyntra_csrf=';
  const encontrados = document.cookie
    .split(';')
    .map((parte) => parte.trim())
    .filter((parte) => parte.startsWith(nome));
  return encontrados.length === 1
    ? (encontrados[0]?.slice(nome.length) ?? '')
    : '';
}

function codigoErro(erro: unknown): string | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined;
  const resposta = Reflect.get(erro, 'response');
  if (typeof resposta !== 'object' || resposta === null) return undefined;
  const dados = Reflect.get(resposta, 'data');
  if (typeof dados !== 'object' || dados === null) return undefined;
  const codigo = Reflect.get(dados, 'codigo');
  return typeof codigo === 'string' ? codigo : undefined;
}

function mensagemErro(erro: unknown): string {
  const codigo = codigoErro(erro);
  if (codigo === 'CREDENCIAIS_INVALIDAS') {
    return 'Usuário ou senha inválidos.';
  }
  if (codigo === 'MFA_NECESSARIO') {
    return 'Confirme o segundo fator para continuar.';
  }
  if (codigo === 'LIMITE_LOGIN_EXCEDIDO') {
    return 'Aguarde alguns minutos antes de tentar novamente.';
  }
  if (erro instanceof Error && erro.message.length > 0) return erro.message;
  return 'Não foi possível concluir. Tente novamente.';
}

function sessaoValida(valor: unknown): valor is SessaoWebDto {
  if (typeof valor !== 'object' || valor === null) return false;
  const expiraEm = Reflect.get(valor, 'expira_em');
  return (
    typeof Reflect.get(valor, 'sessao_id') === 'string' &&
    typeof Reflect.get(valor, 'usuario_id') === 'string' &&
    typeof Reflect.get(valor, 'nome_exibicao') === 'string' &&
    typeof expiraEm === 'string' &&
    Number.isFinite(new Date(expiraEm).getTime())
  );
}

export function ShellWeb() {
  const [sessao, definirSessao] = useState<SessaoWebDto>();
  const [estado, definirEstado] = useState<'AUTENTICANDO' | 'PRONTO' | 'SEM_SESSAO'>('AUTENTICANDO');
  const [rota, definirRota] = useState<RotaWeb>(rotaAtual);
  const [avisoEscopo, definirAvisoEscopo] = useState<string>();

  const autenticar = useCallback(async () => {
    try {
      const resposta = await obterSessaoWeb({ throwOnError: true });
      if (!sessaoValida(resposta.data)) throw new Error('SESSAO_WEB_INVALIDA');
      definirSessao(resposta.data);
      definirEstado('PRONTO');
    } catch {
      definirSessao(undefined);
      definirEstado('SEM_SESSAO');
    }
  }, []);

  useEffect(() => {
    const identificador = window.setTimeout(() => void autenticar(), 0);
    return () => window.clearTimeout(identificador);
  }, [autenticar]);

  useEffect(() => {
    const aoNavegarHistorico = () => definirRota(rotaAtual());
    window.addEventListener('popstate', aoNavegarHistorico);
    return () => window.removeEventListener('popstate', aoNavegarHistorico);
  }, []);

  useEffect(() => {
    if (estado !== 'PRONTO') return undefined;
    const eventos = new EventSource('/api/v1/sincronizacao/eventos', {
      withCredentials: true,
    });
    eventos.onmessage = (evento) => {
      try {
        const dados: unknown = JSON.parse(evento.data as string);
        if (
          typeof dados === 'object' &&
          dados !== null &&
          Reflect.get(dados, 'tipo') === 'PERMISSOES_ALTERADAS'
        ) {
          definirAvisoEscopo('Seu acesso foi atualizado. Revalidando áreas disponíveis…');
          void autenticar().finally(() => definirAvisoEscopo(undefined));
        }
        window.dispatchEvent(new CustomEvent('vyntra:evento', { detail: dados }));
      } catch {
        // Evento inválido é descartado; a recuperação ocorre pelo cursor do SSE.
      }
    };
    return () => eventos.close();
  }, [autenticar, estado]);

  useEffect(() => {
    if (sessao === undefined) return undefined;
    const expiraEm = new Date(sessao.expira_em).getTime();
    const demora = Math.max(1_000, Math.min(expiraEm - Date.now(), 60_000));
    const identificador = window.setTimeout(() => void autenticar(), demora);
    return () => window.clearTimeout(identificador);
  }, [autenticar, sessao]);

  function navegar(destino: RotaWeb) {
    if (destino === rota) return;
    window.history.pushState({}, '', destino);
    definirRota(destino);
  }

  if (estado === 'AUTENTICANDO') return <CarregamentoInicial />;
  if (estado === 'SEM_SESSAO' || sessao === undefined) {
    return <TelaLogin aoAutenticar={(novaSessao) => {
      definirSessao(novaSessao);
      definirEstado('PRONTO');
    }} />;
  }

  return (
    <div className="shell-web">
      <aside className="shell-web__lateral">
        <button
          aria-label="Ir para atendimentos"
          className="marca-shell"
          onClick={() => navegar('/atendimentos')}
          type="button"
        >
          <span aria-hidden="true">V</span>
          <strong>Vyntra</strong>
        </button>

        <nav aria-label="Navegação principal" className="navegacao-shell">
          <GrupoNavegacao rotulo="Operação">
            <ItemNavegacao ativo={rota === '/atendimentos'} icone="◫" rotulo="Atendimentos" aoSelecionar={() => navegar('/atendimentos')} />
          </GrupoNavegacao>
          <GrupoNavegacao rotulo="Administração">
            <ItemNavegacao ativo={rota === '/administracao/usuarios'} icone="♙" rotulo="Usuários e acessos" aoSelecionar={() => navegar('/administracao/usuarios')} />
            <ItemNavegacao ativo={rota === '/administracao/operacao'} icone="⌘" rotulo="Configuração" aoSelecionar={() => navegar('/administracao/operacao')} />
            <ItemNavegacao ativo={rota === '/administracao/fluxos'} icone="⌁" rotulo="Fluxos" aoSelecionar={() => navegar('/administracao/fluxos')} />
            <ItemNavegacao ativo={rota === '/saude'} icone="◎" rotulo="Saúde e releases" aoSelecionar={() => navegar('/saude')} />
          </GrupoNavegacao>
        </nav>

        <div className="perfil-shell">
          <span aria-hidden="true">{sessao.nome_exibicao.slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
          <div>
            <strong>{sessao.nome_exibicao}</strong>
            <small>Sessão protegida</small>
          </div>
          <button
            aria-label="Sair"
            onClick={() => {
              void sairSessaoWeb({
                headers: { 'x-csrf-token': obterCsrf() },
                throwOnError: true,
              }).finally(() => {
                definirSessao(undefined);
                definirEstado('SEM_SESSAO');
              });
            }}
            title="Sair"
            type="button"
          >
            ↗
          </button>
        </div>
      </aside>
      <div className="shell-web__conteudo">
        {avisoEscopo !== undefined && (
          <div className="faixa-escopo" role="status">{avisoEscopo}</div>
        )}
        <ConteudoRota rota={rota} />
      </div>
    </div>
  );
}

function ConteudoRota({ rota }: { readonly rota: RotaWeb }) {
  if (rota === '/administracao/fluxos') return <AplicacaoEditorFluxos />;
  if (rota === '/atendimentos') return <ListaAtendimentosWeb />;
  const titulos: Record<Exclude<RotaWeb, '/administracao/fluxos' | '/atendimentos'>, readonly [string, string]> = {
    '/administracao/operacao': ['Configuração operacional', 'Contas, filas, calendários, SLA e integrações.'],
    '/administracao/usuarios': ['Usuários e acessos', 'Perfis, permissões, filas e sessões.'],
    '/saude': ['Saúde e releases', 'Componentes, recuperação e liberação controlada.'],
  };
  const [titulo, descricao] = titulos[rota];
  return (
    <main className="pagina-shell pagina-shell--vazia">
      <CabecalhoPagina descricao={descricao} titulo={titulo} />
      <section className="estado-vazio-shell">
        <span aria-hidden="true">◇</span>
        <strong>Área preparada</strong>
        <p>O conteúdo desta área entra na próxima etapa do roadmap.</p>
      </section>
    </main>
  );
}

export function CabecalhoPagina({ descricao, titulo }: { readonly descricao: string; readonly titulo: string }) {
  return (
    <header className="cabecalho-pagina">
      <div>
        <h1>{titulo}</h1>
        <p>{descricao}</p>
      </div>
    </header>
  );
}

function GrupoNavegacao({ children, rotulo }: { readonly children: ReactNode; readonly rotulo: string }) {
  return <section><span>{rotulo}</span>{children}</section>;
}

function ItemNavegacao({ ativo, aoSelecionar, icone, rotulo }: { readonly ativo: boolean; readonly aoSelecionar: () => void; readonly icone: string; readonly rotulo: string }) {
  return (
    <button aria-current={ativo ? 'page' : undefined} className={ativo ? 'ativo' : ''} onClick={aoSelecionar} type="button">
      <span aria-hidden="true">{icone}</span>{rotulo}
    </button>
  );
}

function CarregamentoInicial() {
  return (
    <main aria-label="Carregando" className="carregamento-shell">
      <div className="marca-login"><span>V</span></div>
      <div className="skeleton-shell" />
    </main>
  );
}

function TelaLogin({ aoAutenticar }: { readonly aoAutenticar: (sessao: SessaoWebDto) => void }) {
  const [identificador, definirIdentificador] = useState('');
  const [senha, definirSenha] = useState('');
  const [ocupada, definirOcupada] = useState(false);
  const [erro, definirErro] = useState<string>();
  const [confirmarSubstituicao, definirConfirmarSubstituicao] = useState(false);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    definirOcupada(true);
    definirErro(undefined);
    try {
      const resposta = await entrarSessaoWeb({
        body: {
          confirmar_revogacao_sessao_mais_antiga: confirmarSubstituicao,
          identificador,
          senha,
        },
        throwOnError: true,
      });
      if (!sessaoValida(resposta.data)) throw new Error('SESSAO_WEB_INVALIDA');
      aoAutenticar(resposta.data);
    } catch (falha) {
      if (codigoErro(falha) === 'CONFIRMACAO_REVOGACAO_SESSAO_NECESSARIA') {
        definirConfirmarSubstituicao(true);
        definirErro('Você já possui duas sessões. Confirme para substituir a mais antiga.');
      } else {
        definirErro(mensagemErro(falha));
      }
    } finally {
      definirOcupada(false);
    }
  }

  return (
    <main className="tela-login">
      <section className="login-apresentacao">
        <div className="marca-login"><span>V</span><strong>Vyntra</strong></div>
        <div>
          <small>Omnichannel</small>
          <h1>Atendimento humano, contexto inteiro.</h1>
          <p>Converse, consulte e resolva sem perder o fio da história do cliente.</p>
        </div>
        <footer>Operação protegida e auditável</footer>
      </section>
      <section className="login-formulario">
        <form onSubmit={(evento) => void entrar(evento)}>
          <span className="login-formulario__selo">Acesso seguro</span>
          <h2>Boas-vindas</h2>
          <p>Entre com suas credenciais da empresa.</p>
          <label>Usuário ou e-mail<input autoComplete="username" autoFocus maxLength={120} onChange={(evento) => definirIdentificador(evento.target.value)} required value={identificador} /></label>
          <label>Senha<input autoComplete="current-password" maxLength={128} minLength={12} onChange={(evento) => definirSenha(evento.target.value)} required type="password" value={senha} /></label>
          {confirmarSubstituicao && (
            <label className="confirmacao-sessao"><input checked={confirmarSubstituicao} onChange={(evento) => definirConfirmarSubstituicao(evento.target.checked)} type="checkbox" />Substituir minha sessão mais antiga</label>
          )}
          {erro !== undefined && <div className="erro-login" role="alert">{erro}</div>}
          <button className="botao botao--primario botao-login" disabled={ocupada} type="submit">{ocupada ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </section>
    </main>
  );
}
