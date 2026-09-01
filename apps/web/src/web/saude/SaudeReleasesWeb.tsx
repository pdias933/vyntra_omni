import {
  atualizarControleRecurso,
  atualizarPoliticaVersaoMobile,
  listarAdministracaoReleases,
  listarSaudeAdministrativa,
  reprocessarOperacaoAgora,
  type AdministracaoReleasesDto,
  type ControleRecursoDto,
  type PainelSaudeAdministrativaDto,
  type PoliticaVersaoMobileDto,
} from '@vyntra/api-client';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { CabecalhoPagina } from '../ShellWeb';
import { obterCsrf } from '../seguranca-web';

interface ConfirmacaoSaude {
  readonly acao: () => Promise<void>;
  readonly descricao: string;
  readonly titulo: string;
}

export function SaudeReleasesWeb() {
  const [saude, definirSaude] = useState<PainelSaudeAdministrativaDto>();
  const [releases, definirReleases] = useState<AdministracaoReleasesDto>();
  const [erroSaude, definirErroSaude] = useState(false);
  const [erroReleases, definirErroReleases] = useState(false);
  const [ocupada, definirOcupada] = useState(false);
  const [mensagem, definirMensagem] = useState<string>();
  const [confirmacao, definirConfirmacao] = useState<ConfirmacaoSaude>();

  const carregarSaude = useCallback(async () => {
    try {
      const resposta = await listarSaudeAdministrativa({ throwOnError: true });
      definirSaude(resposta.data);
      definirErroSaude(false);
    } catch {
      definirErroSaude(true);
    }
  }, []);

  const carregarReleases = useCallback(async () => {
    try {
      const resposta = await listarAdministracaoReleases({ throwOnError: true });
      definirReleases(resposta.data);
      definirErroReleases(false);
    } catch {
      definirErroReleases(true);
    }
  }, []);

  useEffect(() => {
    const inicial = window.setTimeout(() => {
      void Promise.all([carregarSaude(), carregarReleases()]);
    }, 0);
    const atualizacao = window.setInterval(() => void carregarSaude(), 15_000);
    return () => {
      window.clearTimeout(inicial);
      window.clearInterval(atualizacao);
    };
  }, [carregarReleases, carregarSaude]);

  async function executar(
    acao: () => Promise<void>,
    sucesso: string,
  ): Promise<void> {
    definirOcupada(true);
    definirMensagem(undefined);
    try {
      await acao();
      definirMensagem(sucesso);
    } catch {
      definirMensagem('A ação não pôde ser concluída. O estado pode ter mudado.');
    } finally {
      definirOcupada(false);
    }
  }

  function confirmar(
    titulo: string,
    descricao: string,
    acao: () => Promise<void>,
  ): void {
    definirConfirmacao({ acao, descricao, titulo });
  }

  return (
    <main className="pagina-shell saude-releases">
      <CabecalhoPagina
        descricao="Componentes, recuperação conservadora e liberação controlada."
        titulo="Saúde e releases"
      />
      <div className="saude-releases__conteudo">
        <section className="painel-saude painel-saude--componentes">
          <header>
            <div>
              <span className="sobretitulo">Observação automática</span>
              <h2>Componentes</h2>
            </div>
            <span className="pulso-saude">Tempo real</span>
          </header>
          {saude === undefined && !erroSaude ? (
            <div className="skeleton-saude" />
          ) : erroSaude ? (
            <p className="erro-painel">Saúde indisponível ou acesso não autorizado.</p>
          ) : (
            <div className="grade-componentes-saude">
              {saude?.componentes.map((componente) => (
                <article key={componente.codigo}>
                  <i className={`estado-componente estado-componente--${componente.estado.toLocaleLowerCase('pt-BR')}`} />
                  <div>
                    <strong>{rotuloComponente(componente.codigo)}</strong>
                    <small>{rotuloEstadoComponente(componente.estado)}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {saude !== undefined && (
          <section className="resumo-recuperacao" aria-label="Resumo de recuperação">
            <article><span>↻</span><div><strong>{saude.resumo.aguardando_nova_tentativa}</strong><small>Aguardando nova tentativa</small></div></article>
            <article><span>?</span><div><strong>{saude.resumo.resultados_incertos}</strong><small>Exigem reconciliação</small></div></article>
            <article><span>!</span><div><strong>{saude.resumo.falhas_definitivas}</strong><small>Falhas definitivas</small></div></article>
            <article><span>⇢</span><div><strong>{saude.resumo.itens_caixa_saida_pendentes}</strong><small>Eventos pendentes</small></div></article>
          </section>
        )}

        <section className="painel-saude painel-saude--operacoes">
          <header>
            <div>
              <span className="sobretitulo">Operações recuperáveis</span>
              <h2>Falhas e reconciliação</h2>
            </div>
            <small>Nenhum efeito é repetido nesta tela</small>
          </header>
          {saude?.operacoes.length === 0 && (
            <div className="estado-operacional-vazio">Nenhuma operação com atenção pendente.</div>
          )}
          {saude !== undefined && saude.operacoes.length > 0 && (
            <div className="tabela-operacoes">
              {saude.operacoes.map((operacao) => (
                <article key={operacao.id}>
                  <div className="identidade-operacao">
                    <span>{operacao.tipo.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')}</span>
                    <small>#{operacao.id.slice(0, 8)} · {operacao.tentativas} tentativa(s)</small>
                  </div>
                  <span className={`selo-operacao selo-operacao--${operacao.estado.toLocaleLowerCase('pt-BR')}`}>
                    {rotuloEstadoOperacao(operacao.estado)}
                  </span>
                  <div className="erro-operacao">
                    <strong>{operacao.codigo_ultimo_erro ?? 'Sem código de falha'}</strong>
                    <small>{formatarData(operacao.proxima_acao_em ?? operacao.atualizado_em)}</small>
                  </div>
                  <button
                    disabled={ocupada || !operacao.pode_reprocessar}
                    onClick={() =>
                      confirmar(
                        operacao.estado === 'RESULTADO_INCERTO'
                          ? 'Antecipar reconciliação?'
                          : 'Reprocessar agora?',
                        operacao.estado === 'RESULTADO_INCERTO'
                          ? 'O worker verificará primeiro se o efeito já ocorreu. A ação externa não será repetida às cegas.'
                          : 'A operação será apenas disponibilizada ao worker; nenhuma integração será chamada por esta tela.',
                        async () => {
                          await reprocessarOperacaoAgora({
                            body: { versao_esperada: operacao.versao },
                            headers: { 'x-csrf-token': obterCsrf() },
                            path: { operacaoId: operacao.id },
                            throwOnError: true,
                          });
                          await carregarSaude();
                        },
                      )
                    }
                    type="button"
                  >
                    {operacao.pode_reprocessar ? 'Reprocessar agora' : 'Somente diagnóstico'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="painel-saude painel-saude--releases">
          <header>
            <div>
              <span className="sobretitulo">Liberação controlada</span>
              <h2>Controles de recurso</h2>
            </div>
            <small>Backend como autoridade</small>
          </header>
          {erroReleases && (
            <p className="erro-painel">Releases indisponíveis ou acesso não autorizado.</p>
          )}
          <div className="grade-controles-recurso">
            {releases?.controles.map((controle) => (
              <EditorControleRecurso
                aoSalvar={(entrada, descricao) =>
                  confirmar(
                    `Aplicar ${controle.codigo}?`,
                    descricao,
                    async () => {
                      await atualizarControleRecurso({
                        body: entrada,
                        headers: { 'x-csrf-token': obterCsrf() },
                        path: { codigo: controle.codigo },
                        throwOnError: true,
                      });
                      await carregarReleases();
                    },
                  )
                }
                controle={controle}
                key={`${controle.id}:${controle.versao}`}
                ocupada={ocupada}
              />
            ))}
            <NovoControleRecurso
              ocupado={ocupada}
              aoCriar={(codigo) =>
                confirmar(
                  `Criar ${codigo}?`,
                  'O novo controle será criado desativado e sem público alvo.',
                  async () => {
                    await atualizarControleRecurso({
                      body: {
                        desligado_emergencialmente: false,
                        estado: 'DESATIVADO',
                        filas_alvo: [],
                        liberar_administradores: false,
                        percentual_liberacao: 0,
                        usuarios_alvo: [],
                        versao_esperada: 0,
                      },
                      headers: { 'x-csrf-token': obterCsrf() },
                      path: { codigo },
                      throwOnError: true,
                    });
                    await carregarReleases();
                  },
                )
              }
            />
          </div>
        </section>

        <section className="painel-saude painel-saude--politicas">
          <header>
            <div>
              <span className="sobretitulo">Atualização obrigatória</span>
              <h2>Política mobile</h2>
            </div>
            <small>Versão mínima bloqueia acesso</small>
          </header>
          <div className="grade-politicas-mobile">
            {releases?.politicas_mobile.map((politica) => (
              <EditorPoliticaMobile
                key={`${politica.plataforma}:${politica.versao}`}
                ocupada={ocupada}
                politica={politica}
                aoSalvar={(entrada) =>
                  confirmar(
                    `Atualizar ${politica.plataforma}?`,
                    `Clientes abaixo de ${entrada.versao_minima} terão atualização obrigatória antes de continuar.`,
                    async () => {
                      await atualizarPoliticaVersaoMobile({
                        body: entrada,
                        headers: { 'x-csrf-token': obterCsrf() },
                        path: { plataforma: politica.plataforma },
                        throwOnError: true,
                      });
                      await carregarReleases();
                    },
                  )
                }
              />
            ))}
          </div>
        </section>
      </div>

      {mensagem !== undefined && <div className="mensagem-saude" role="status">{mensagem}</div>}
      {confirmacao !== undefined && (
        <div className="modal-publicacao" role="presentation">
          <section aria-labelledby="titulo-confirmacao-saude" aria-modal="true" role="dialog">
            <span className="modal-publicacao__icone modal-publicacao__icone--reversao" aria-hidden="true">✓</span>
            <h2 id="titulo-confirmacao-saude">{confirmacao.titulo}</h2>
            <p>{confirmacao.descricao}</p>
            <div className="modal-publicacao__acoes modal-publicacao__acoes--simples">
              <button className="botao botao--secundario" onClick={() => definirConfirmacao(undefined)} type="button">Cancelar</button>
              <button
                className="botao botao--primario"
                disabled={ocupada}
                onClick={() => {
                  const acao = confirmacao.acao;
                  definirConfirmacao(undefined);
                  void executar(acao, 'Alteração aplicada e registrada na auditoria.');
                }}
                type="button"
              >
                Confirmar
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function EditorControleRecurso({
  aoSalvar,
  controle,
  ocupada,
}: {
  readonly aoSalvar: (
    entrada: {
      readonly desligado_emergencialmente: boolean;
      readonly estado: 'ATIVADO' | 'DESATIVADO';
      readonly filas_alvo: string[];
      readonly liberar_administradores: boolean;
      readonly percentual_liberacao: number;
      readonly usuarios_alvo: string[];
      readonly versao_esperada: number;
    },
    descricao: string,
  ) => void;
  readonly controle: ControleRecursoDto;
  readonly ocupada: boolean;
}) {
  const [estado, definirEstado] = useState(controle.estado);
  const [emergencia, definirEmergencia] = useState(
    controle.desligado_emergencialmente,
  );
  const [administradores, definirAdministradores] = useState(
    controle.liberar_administradores,
  );
  const [percentual, definirPercentual] = useState(
    controle.percentual_liberacao,
  );
  return (
    <form
      className="controle-recurso"
      onSubmit={(evento) => {
        evento.preventDefault();
        aoSalvar(
          {
            desligado_emergencialmente: emergencia,
            estado,
            filas_alvo: [...controle.filas_alvo],
            liberar_administradores: administradores,
            percentual_liberacao: percentual,
            usuarios_alvo: [...controle.usuarios_alvo],
            versao_esperada: controle.versao,
          },
          emergencia
            ? 'O desligamento emergencial prevalecerá sobre estado, percentual e alvos.'
            : `O recurso ficará ${estado.toLocaleLowerCase('pt-BR')} para ${percentual}% da base elegível.`,
        );
      }}
    >
      <header><strong>{controle.codigo}</strong><span>v{controle.versao}</span></header>
      <label><span>Estado</span><select onChange={(evento) => definirEstado(evento.target.value as 'ATIVADO' | 'DESATIVADO')} value={estado}><option value="DESATIVADO">Desativado</option><option value="ATIVADO">Ativado</option></select></label>
      <label><span>Liberação gradual</span><div className="campo-percentual"><input max={100} min={0} onChange={(evento) => definirPercentual(Number(evento.target.value))} type="range" value={percentual} /><b>{percentual}%</b></div></label>
      <label className="opcao-controle"><input checked={administradores} onChange={(evento) => definirAdministradores(evento.target.checked)} type="checkbox" /> Liberar administradores</label>
      <label className="opcao-controle opcao-controle--perigo"><input checked={emergencia} onChange={(evento) => definirEmergencia(evento.target.checked)} type="checkbox" /> Desligamento emergencial</label>
      <button disabled={ocupada} type="submit">Revisar alteração</button>
    </form>
  );
}

function NovoControleRecurso({ aoCriar, ocupado }: { readonly aoCriar: (codigo: string) => void; readonly ocupado: boolean }) {
  const [codigo, definirCodigo] = useState('');
  function criar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    if (!/^[A-Z][A-Z0-9_]{2,99}$/u.test(codigo)) return;
    aoCriar(codigo);
  }
  return (
    <form className="controle-recurso controle-recurso--novo" onSubmit={criar}>
      <span aria-hidden="true">＋</span>
      <strong>Novo controle</strong>
      <p>Nasce desativado, sem liberar usuários por engano.</p>
      <input maxLength={100} onChange={(evento) => definirCodigo(evento.target.value.toLocaleUpperCase('pt-BR').replaceAll(/[^A-Z0-9_]/gu, '_'))} placeholder="CODIGO_RECURSO" value={codigo} />
      <button disabled={ocupado || !/^[A-Z][A-Z0-9_]{2,99}$/u.test(codigo)} type="submit">Criar desativado</button>
    </form>
  );
}

function EditorPoliticaMobile({ aoSalvar, ocupada, politica }: { readonly aoSalvar: (entrada: { readonly mensagem?: string; readonly url_loja?: string; readonly versao_esperada: number; readonly versao_minima: string; readonly versao_recomendada: string }) => void; readonly ocupada: boolean; readonly politica: PoliticaVersaoMobileDto }) {
  const [minima, definirMinima] = useState(politica.versao_minima);
  const [recomendada, definirRecomendada] = useState(politica.versao_recomendada);
  const [mensagem, definirMensagem] = useState(politica.mensagem ?? 'Atualize o aplicativo para continuar.');
  const [url, definirUrl] = useState(politica.url_loja ?? '');
  return (
    <form className="politica-mobile" onSubmit={(evento) => { evento.preventDefault(); aoSalvar({ mensagem, ...(url.trim() === '' ? {} : { url_loja: url.trim() }), versao_esperada: politica.versao, versao_minima: minima, versao_recomendada: recomendada }); }}>
      <header><span>{politica.plataforma === 'IOS' ? '' : '◆'}</span><div><strong>{politica.plataforma === 'IOS' ? 'iOS' : 'Android'}</strong><small>Política v{politica.versao}</small></div></header>
      <div className="linha-versoes-mobile"><label><span>Versão mínima</span><input onChange={(evento) => definirMinima(evento.target.value)} pattern="[0-9]+\.[0-9]+\.[0-9]+" value={minima} /></label><label><span>Recomendada</span><input onChange={(evento) => definirRecomendada(evento.target.value)} pattern="[0-9]+\.[0-9]+\.[0-9]+" value={recomendada} /></label></div>
      <label><span>Mensagem</span><input maxLength={240} onChange={(evento) => definirMensagem(evento.target.value)} value={mensagem} /></label>
      <label><span>Loja oficial (HTTPS)</span><input maxLength={500} onChange={(evento) => definirUrl(evento.target.value)} placeholder="https://" type="url" value={url} /></label>
      <button disabled={ocupada} type="submit">Revisar política</button>
    </form>
  );
}

function rotuloComponente(codigo: string): string {
  return ({ API: 'API', POSTGRESQL: 'PostgreSQL', REDIS: 'Redis', STORAGE: 'Object Storage' } as Record<string, string>)[codigo] ?? codigo;
}

function rotuloEstadoComponente(estado: string): string {
  return ({ INDISPONIVEL: 'Indisponível', NAO_CONFIGURADO: 'Não configurado', OPERACIONAL: 'Operacional' } as Record<string, string>)[estado] ?? estado;
}

function rotuloEstadoOperacao(estado: string): string {
  return ({ AGUARDANDO_NOVA_TENTATIVA: 'Aguardando', FALHA_DEFINITIVA: 'Falha definitiva', RESULTADO_INCERTO: 'Resultado incerto' } as Record<string, string>)[estado] ?? estado.replaceAll('_', ' ').toLocaleLowerCase('pt-BR');
}

function formatarData(valor: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
}
