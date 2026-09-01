import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
} from '@xyflow/react';
import { useMemo, useState } from 'react';

import { NoFluxo } from './NoFluxo';
import {
  CATALOGO_NOS,
  CENARIOS_SIMULACAO_EDITOR,
  criarNo,
  serializarDefinicao,
  type CenarioSimulacaoEditor,
  type DefinicaoEditor,
  type NoEditor,
  type ReferenciaEditor,
  type ResultadoSimulacaoEditor,
  type TipoNo,
  type VariavelEditor,
} from './modelo-editor';

const TIPOS_NO_COMPONENTE = { noFluxo: NoFluxo };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface PropsEditorFluxo {
  readonly definicao: DefinicaoEditor;
  readonly estadoVersao: 'ARQUIVADA' | 'EM_TESTE' | 'PUBLICADA' | 'RASCUNHO';
  readonly fluxoNome: string;
  readonly numeroVersao: number;
  readonly versaoPublicadaNumero?: number | undefined;
  readonly ocupada: boolean;
  readonly aviso?: string | undefined;
  readonly aoSalvar: (definicao: Record<string, unknown>) => Promise<void>;
  readonly aoValidar: () => Promise<void>;
  readonly aoPublicar: () => Promise<void>;
  readonly aoCriarRascunho: (definicao: Record<string, unknown>) => Promise<void>;
  readonly aoSimular: (
    definicao: Record<string, unknown>,
    cenario: CenarioSimulacaoEditor,
  ) => Promise<ResultadoSimulacaoEditor>;
}

function lista(valor: string): readonly string[] {
  return valor
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function Campo({
  label,
  onChange,
  value,
  type = 'text',
  min,
  max,
}: {
  readonly label: string;
  readonly onChange: (valor: string) => void;
  readonly value: string | number;
  readonly type?: 'number' | 'text';
  readonly min?: number;
  readonly max?: number;
}) {
  return (
    <label className="campo-editor">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(evento) => onChange(evento.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

export function EditorFluxo({
  definicao,
  estadoVersao,
  fluxoNome,
  numeroVersao,
  versaoPublicadaNumero,
  ocupada,
  aviso,
  aoSalvar,
  aoValidar,
  aoPublicar,
  aoCriarRascunho,
  aoSimular,
}: PropsEditorFluxo) {
  const [nos, definirNos, aoMudarNos] = useNodesState<NoEditor>([...definicao.nos]);
  const [conexoes, definirConexoes, aoMudarConexoes] = useEdgesState([
    ...definicao.conexoes,
  ]);
  const [variaveis, definirVariaveis] = useState([...definicao.variaveis]);
  const [selecionadoId, definirSelecionadoId] = useState<string>();
  const [alterado, definirAlterado] = useState(false);
  const [busca, definirBusca] = useState('');
  const [simuladorAberto, definirSimuladorAberto] = useState(false);
  const [simulando, definirSimulando] = useState(false);
  const [cenarioSimulacao, definirCenarioSimulacao] =
    useState<CenarioSimulacaoEditor>('CAMINHO_FELIZ');
  const [resultadoSimulacao, definirResultadoSimulacao] =
    useState<ResultadoSimulacaoEditor>();
  const [erroSimulacao, definirErroSimulacao] = useState<string>();
  const editavel = estadoVersao === 'RASCUNHO';
  const selecionado = nos.find(({ id }) => id === selecionadoId);
  const itensCatalogo = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return CATALOGO_NOS.filter(
      ({ descricao, tipo, titulo }) =>
        tipo !== 'INICIO' &&
        (termo.length === 0 ||
          `${titulo} ${descricao}`.toLocaleLowerCase('pt-BR').includes(termo)),
    );
  }, [busca]);

  function definicaoAtual(): Record<string, unknown> {
    return serializarDefinicao({
      conexoes,
      inicioNoId: definicao.inicioNoId,
      nos,
      variaveis,
      versaoSchema: 1,
    });
  }

  function adicionarNo(tipo: TipoNo): void {
    if (!editavel) return;
    const indice = nos.filter((no) => no.data.tipo === tipo).length + 1;
    definirNos((atuais) => [
      ...atuais,
      criarNo(
        tipo,
        { x: 180 + (atuais.length % 3) * 300, y: 120 + atuais.length * 44 },
        indice,
      ),
    ]);
    definirAlterado(true);
  }

  function conectar(conexao: Connection): void {
    if (!editavel || conexao.sourceHandle === null) return;
    const saida = conexao.sourceHandle;
    definirConexoes((atuais) =>
      addEdge(
        {
          ...conexao,
          animated: false,
          id: `conexao_${conexao.source}_${saida}`,
          label: saida
            .replaceAll('_', ' ')
            .toLocaleLowerCase('pt-BR'),
          type: 'smoothstep',
        },
        atuais.filter(
          (item) =>
            !(
              item.source === conexao.source &&
              item.sourceHandle === saida
            ),
        ),
      ),
    );
    definirAlterado(true);
  }

  function atualizarNo(
    transformacao: (no: NoEditor) => NoEditor,
  ): void {
    if (!editavel || selecionado === undefined) return;
    definirNos((atuais) =>
      atuais.map((no) => (no.id === selecionado.id ? transformacao(no) : no)),
    );
    definirAlterado(true);
  }

  function atualizarParametros(chave: string, valor: unknown): void {
    atualizarNo((no) => ({
      ...no,
      data: {
        ...no.data,
        parametros: { ...no.data.parametros, [chave]: valor },
      },
    }));
  }

  function atualizarReferencia(valor: string): void {
    if (selecionado === undefined) return;
    const tipoReferencia = CATALOGO_NOS.find(
      ({ tipo }) => tipo === selecionado.data.tipo,
    )?.tipoReferencia;
    const referencias: readonly ReferenciaEditor[] =
      tipoReferencia !== undefined && UUID.test(valor)
        ? [{ recursoId: valor, tipo: tipoReferencia }]
        : [];
    atualizarNo((no) => ({ ...no, data: { ...no.data, referencias } }));
  }

  function excluirSelecionado(): void {
    if (!editavel || selecionado === undefined || selecionado.data.tipo === 'INICIO') {
      return;
    }
    definirNos((atuais) => atuais.filter(({ id }) => id !== selecionado.id));
    definirConexoes((atuais) =>
      atuais.filter(
        ({ source, target }) => source !== selecionado.id && target !== selecionado.id,
      ),
    );
    definirSelecionadoId(undefined);
    definirAlterado(true);
  }

  async function salvar(): Promise<void> {
    await aoSalvar(definicaoAtual());
    definirAlterado(false);
  }

  async function simular(): Promise<void> {
    definirSimuladorAberto(true);
    definirSimulando(true);
    definirErroSimulacao(undefined);
    try {
      definirResultadoSimulacao(
        await aoSimular(definicaoAtual(), cenarioSimulacao),
      );
    } catch {
      definirResultadoSimulacao(undefined);
      definirErroSimulacao('Não foi possível concluir a simulação fictícia.');
    } finally {
      definirSimulando(false);
    }
  }

  return (
    <main className="editor-fluxo">
      <header className="editor-fluxo__topo">
        <div className="marca-produto" aria-label="Vyntra">
          <span aria-hidden="true">V</span>
          <strong>Vyntra</strong>
        </div>
        <div className="identidade-fluxo">
          <div>
            <div className="identidade-fluxo__linha">
              <h1>{fluxoNome}</h1>
              <span className={`selo-estado selo-estado--${estadoVersao.toLocaleLowerCase('pt-BR')}`}>
                {estadoVersao.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')}
              </span>
            </div>
            <p>
              Versão {numeroVersao}
              {versaoPublicadaNumero === undefined
                ? ' · nenhuma versão publicada'
                : ` · produção na versão ${versaoPublicadaNumero}`}
            </p>
          </div>
        </div>
        <div className="acoes-editor">
          <button
            className="botao botao--teste"
            disabled={ocupada || simulando}
            onClick={() => void simular()}
            type="button"
          >
            <span aria-hidden="true">▷</span> Testar
          </button>
          {editavel ? (
            <>
              <span className={`estado-edicao ${alterado ? 'estado-edicao--alterado' : ''}`}>
                {alterado ? 'Alterações não salvas' : 'Rascunho salvo'}
              </span>
              <button
                className="botao botao--secundario"
                disabled={ocupada || !alterado}
                onClick={() => void salvar()}
                type="button"
              >
                Salvar rascunho
              </button>
              <button
                className="botao botao--primario"
                disabled={ocupada || alterado}
                onClick={() => void aoValidar()}
                type="button"
              >
                Validar versão
              </button>
            </>
          ) : estadoVersao === 'EM_TESTE' ? (
            <button
              className="botao botao--primario"
              disabled={ocupada}
              onClick={() => void aoPublicar()}
              type="button"
            >
              Publicar versão
            </button>
          ) : (
            <button
              className="botao botao--primario"
              disabled={ocupada}
              onClick={() => void aoCriarRascunho(definicaoAtual())}
              type="button"
            >
              Criar novo rascunho
            </button>
          )}
        </div>
      </header>

      {aviso !== undefined && (
        <div className="faixa-editor" role="status">
          <span>!</span>
          {aviso}
        </div>
      )}

      <section className="editor-fluxo__corpo">
        <aside className="biblioteca-nos">
          <div className="painel-cabecalho">
            <span>Biblioteca</span>
            <small>{CATALOGO_NOS.length} ações</small>
          </div>
          <label className="busca-nos">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Buscar ações"
              onChange={(evento) => definirBusca(evento.target.value)}
              placeholder="Buscar ações"
              value={busca}
            />
          </label>
          <div className="biblioteca-nos__lista">
            {(['CONVERSA', 'DECISAO', 'DADOS', 'ERP', 'ROTEAMENTO'] as const).map(
              (categoria) => {
                const itens = itensCatalogo.filter((item) => item.categoria === categoria);
                if (itens.length === 0) return null;
                return (
                  <section className="grupo-nos" key={categoria}>
                    <h2>{categoria.toLocaleLowerCase('pt-BR')}</h2>
                    {itens.map((item) => (
                      <button
                        className="item-no"
                        disabled={!editavel}
                        key={item.tipo}
                        onClick={() => adicionarNo(item.tipo)}
                        title={item.descricao}
                        type="button"
                      >
                        <span className={`item-no__icone item-no__icone--${item.categoria.toLocaleLowerCase('pt-BR')}`}>+</span>
                        <span><strong>{item.titulo}</strong><small>{item.descricao}</small></span>
                      </button>
                    ))}
                  </section>
                );
              },
            )}
          </div>
        </aside>

        <section className="canvas-fluxo" aria-label="Canvas do fluxo">
          <div className="canvas-fluxo__contexto">
            <span>Fluxo principal</span>
            <span>{nos.length} nós · {conexoes.length} conexões</span>
          </div>
          <ReactFlow<NoEditor>
            colorMode="light"
            defaultEdgeOptions={{ type: 'smoothstep' }}
            deleteKeyCode={null}
            edges={conexoes}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.24 }}
            maxZoom={1.5}
            minZoom={0.35}
            nodeTypes={TIPOS_NO_COMPONENTE}
            nodes={nos}
            nodesConnectable={editavel}
            nodesDraggable={editavel}
            onConnect={conectar}
            onEdgesChange={(mudancas) => {
              aoMudarConexoes(mudancas);
              if (editavel && mudancas.some(({ type }) => type === 'remove')) definirAlterado(true);
            }}
            onNodeClick={(_evento, no) => definirSelecionadoId(no.id)}
            onNodesChange={(mudancas) => {
              aoMudarNos(mudancas);
              if (editavel && mudancas.some(({ type }) => type === 'position')) definirAlterado(true);
            }}
            onPaneClick={() => definirSelecionadoId(undefined)}
          >
            <Background color="#d9dfdc" gap={22} size={1} variant={BackgroundVariant.Dots} />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              maskColor="rgba(245, 247, 246, 0.82)"
              nodeColor="#b8d9c3"
              pannable
              position="bottom-right"
              zoomable
            />
          </ReactFlow>
        </section>

        <aside className="inspetor-no">
          <div className="painel-cabecalho">
            <span>Configuração</span>
            {selecionado !== undefined && <small>{selecionado.id}</small>}
          </div>
          {selecionado === undefined ? (
            <EditorVariaveis
              editavel={editavel}
              variaveis={variaveis}
              aoAlterar={(proximas) => {
                definirVariaveis([...proximas]);
                definirAlterado(true);
              }}
            />
          ) : (
            <div className="inspetor-conteudo">
              <div className="inspetor-titulo">
                <span>{selecionado.data.categoria.toLocaleLowerCase('pt-BR')}</span>
                <h2>{selecionado.data.titulo}</h2>
              </div>
              <ParametrosNo
                no={selecionado}
                substituir={(parametros) =>
                  atualizarNo((no) => ({
                    ...no,
                    data: { ...no.data, parametros },
                  }))
                }
                atualizar={atualizarParametros}
                atualizarReferencia={atualizarReferencia}
              />
              <Campo
                label="Variáveis de entrada"
                onChange={(valor) =>
                  atualizarNo((no) => ({
                    ...no,
                    data: { ...no.data, variaveisEntrada: lista(valor) },
                  }))
                }
                value={selecionado.data.variaveisEntrada.join(', ')}
              />
              <Campo
                label="Variáveis de saída"
                onChange={(valor) =>
                  atualizarNo((no) => ({
                    ...no,
                    data: { ...no.data, variaveisSaida: lista(valor) },
                  }))
                }
                value={selecionado.data.variaveisSaida.join(', ')}
              />
              {['AGUARDAR', 'CONDICAO', 'DEFINIR_VARIAVEL', 'HORARIO_ATENDIMENTO'].includes(selecionado.data.tipo) && (
                <Campo
                  label="Limite de iterações (opcional)"
                  max={100}
                  min={1}
                  onChange={(valor) =>
                  atualizarNo((no) => {
                    const dados = { ...no.data };
                    if (valor.length === 0) {
                      Reflect.deleteProperty(dados, 'limiteIteracoes');
                    } else {
                      dados.limiteIteracoes = Number(valor);
                    }
                    return { ...no, data: dados };
                  })
                  }
                  type="number"
                  value={selecionado.data.limiteIteracoes ?? ''}
                />
              )}
              <div className="saidas-resumo">
                <span>Saídas obrigatórias</span>
                <div>{selecionado.data.saidas.map((saida) => <code key={saida}>{saida}</code>)}</div>
              </div>
              {selecionado.data.tipo !== 'INICIO' && (
                <button className="botao-excluir" disabled={!editavel} onClick={excluirSelecionado} type="button">
                  Remover nó
                </button>
              )}
            </div>
          )}
        </aside>
      </section>
      {simuladorAberto && (
        <PainelSimulacao
          cenario={cenarioSimulacao}
          erro={erroSimulacao}
          resultado={resultadoSimulacao}
          simulando={simulando}
          aoAlterarCenario={definirCenarioSimulacao}
          aoFechar={() => definirSimuladorAberto(false)}
          aoSimular={() => void simular()}
        />
      )}
    </main>
  );
}

const ROTULOS_CENARIO: Readonly<Record<CenarioSimulacaoEditor, string>> = {
  CAMINHO_ALTERNATIVO: 'Caminho alternativo',
  CAMINHO_FELIZ: 'Caminho feliz',
  CANAL_LIMITADO: 'Canal sem capacidade',
  CONTATO_NAO_IDENTIFICADO: 'Contato não identificado',
  ERP_INDISPONIVEL: 'ERP indisponível',
  FORA_DO_HORARIO: 'Fora do horário',
  TIMEOUT: 'Tempo esgotado',
};

function PainelSimulacao({
  aoAlterarCenario,
  aoFechar,
  aoSimular,
  cenario,
  erro,
  resultado,
  simulando,
}: {
  readonly aoAlterarCenario: (cenario: CenarioSimulacaoEditor) => void;
  readonly aoFechar: () => void;
  readonly aoSimular: () => void;
  readonly cenario: CenarioSimulacaoEditor;
  readonly erro?: string | undefined;
  readonly resultado?: ResultadoSimulacaoEditor | undefined;
  readonly simulando: boolean;
}) {
  return (
    <aside aria-label="Simulador do fluxo" className="simulador-fluxo">
      <header className="simulador-fluxo__topo">
        <div>
          <span>Ambiente seguro</span>
          <h2>Simular fluxo</h2>
        </div>
        <button aria-label="Fechar simulador" onClick={aoFechar} type="button">×</button>
      </header>
      <div className="simulador-fluxo__aviso" role="note">
        <span aria-hidden="true">◇</span>
        <p>
          <strong>Somente dados fictícios</strong>
          Nenhuma mensagem ou ação ERP será executada.
        </p>
      </div>
      <div className="simulador-fluxo__controles">
        <label className="campo-editor">
          <span>Cenário</span>
          <select
            disabled={simulando}
            onChange={(evento) =>
              aoAlterarCenario(evento.target.value as CenarioSimulacaoEditor)
            }
            value={cenario}
          >
            {CENARIOS_SIMULACAO_EDITOR.map((item) => (
              <option key={item} value={item}>{ROTULOS_CENARIO[item]}</option>
            ))}
          </select>
        </label>
        <button
          className="botao botao--primario"
          disabled={simulando}
          onClick={aoSimular}
          type="button"
        >
          {simulando ? 'Simulando…' : 'Executar cenário'}
        </button>
      </div>
      {simulando ? (
        <div className="simulador-carregando" role="status">
          <span />
          <span />
          <span />
          <p>Percorrendo o fluxo em memória…</p>
        </div>
      ) : erro !== undefined ? (
        <div className="simulador-erro" role="alert">{erro}</div>
      ) : resultado !== undefined ? (
        <div className="simulador-fluxo__resultado">
          <section className="contexto-simulacao">
            <div className="avatar-ficticio" aria-hidden="true">CF</div>
            <div>
              <strong>{resultado.contextoFicticio.contato}</strong>
              <span>{resultado.contextoFicticio.telefone}</span>
            </div>
            <small>SIMULAÇÃO</small>
          </section>
          <section className="previa-simulacao" aria-label="Prévia fictícia da conversa">
            {resultado.previa.length === 0 ? (
              <p>Nenhuma mensagem neste caminho.</p>
            ) : resultado.previa.map((item, indice) => (
              <div
                className={`previa-simulacao__item previa-simulacao__item--${item.origem.toLocaleLowerCase('pt-BR')}`}
                key={`${item.ordemPasso}:${indice}`}
              >
                {item.conteudo}
              </div>
            ))}
          </section>
          <section className="passos-simulacao">
            <div className="passos-simulacao__cabecalho">
              <strong>Passos percorridos</strong>
              <span className={`resultado-simulacao resultado-simulacao--${resultado.estado.toLocaleLowerCase('pt-BR')}`}>
                {resultado.estado.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')}
              </span>
            </div>
            <ol>
              {resultado.passos.map((passo) => (
                <li
                  className={passo.estado === 'INTERROMPIDO' ? 'passo--interrompido' : ''}
                  key={`${passo.ordem}:${passo.noId}`}
                >
                  <span>{passo.ordem}</span>
                  <div>
                    <strong>
                      {passo.tipoNo.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')}
                    </strong>
                    <small>{passo.descricao}</small>
                  </div>
                  {passo.saida !== undefined && <code>{passo.saida}</code>}
                </li>
              ))}
            </ol>
          </section>
          <footer className="simulador-fluxo__rodape">
            <span>✓</span>
            Zero efeitos reais executados
          </footer>
        </div>
      ) : null}
    </aside>
  );
}

const TIPOS_VARIAVEL: readonly VariavelEditor['tipo'][] = [
  'TEXTO',
  'INTEIRO',
  'DECIMAL',
  'BOOLEANO',
  'DATA_HORA',
  'UUID',
];

function EditorVariaveis({
  aoAlterar,
  editavel,
  variaveis,
}: {
  readonly aoAlterar: (variaveis: readonly VariavelEditor[]) => void;
  readonly editavel: boolean;
  readonly variaveis: readonly VariavelEditor[];
}) {
  function atualizar(indice: number, mudanca: Partial<VariavelEditor>): void {
    aoAlterar(
      variaveis.map((variavel, indiceAtual) =>
        indiceAtual === indice ? { ...variavel, ...mudanca } : variavel,
      ),
    );
  }

  return (
    <div className="variaveis-fluxo">
      <div className="inspetor-vazio inspetor-vazio--compacto">
        <span aria-hidden="true">◇</span>
        <strong>Selecione um nó</strong>
        <p>Ou configure abaixo os dados tipados disponíveis em todo o fluxo.</p>
      </div>
      <div className="variaveis-fluxo__titulo">
        <div>
          <strong>Variáveis do fluxo</strong>
          <small>{variaveis.length} declaradas</small>
        </div>
        <button
          aria-label="Adicionar variável"
          disabled={!editavel || variaveis.length >= 200}
          onClick={() =>
            aoAlterar([
              ...variaveis,
              {
                disponivelNaEntrada: false,
                nome: `variavel_${variaveis.length + 1}`,
                sensivel: false,
                tipo: 'TEXTO',
              },
            ])
          }
          type="button"
        >
          + Adicionar
        </button>
      </div>
      <div className="variaveis-fluxo__lista">
        {variaveis.length === 0 ? (
          <p className="variaveis-fluxo__vazio">Nenhuma variável declarada.</p>
        ) : (
          variaveis.map((variavel, indice) => (
            <section className="variavel-fluxo" key={`${indice}:${variavel.nome}`}>
              <Campo
                label="Nome"
                onChange={(nome) => atualizar(indice, { nome })}
                value={variavel.nome}
              />
              <label className="campo-editor">
                <span>Tipo</span>
                <select
                  disabled={!editavel}
                  onChange={(evento) =>
                    atualizar(indice, {
                      tipo: evento.target.value as VariavelEditor['tipo'],
                    })
                  }
                  value={variavel.tipo}
                >
                  {TIPOS_VARIAVEL.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="opcao-booleana">
                <input
                  checked={variavel.disponivelNaEntrada}
                  disabled={!editavel}
                  onChange={(evento) =>
                    atualizar(indice, { disponivelNaEntrada: evento.target.checked })
                  }
                  type="checkbox"
                />
                Disponível na entrada
              </label>
              <label className="opcao-booleana">
                <input
                  checked={variavel.sensivel}
                  disabled={!editavel}
                  onChange={(evento) =>
                    atualizar(indice, { sensivel: evento.target.checked })
                  }
                  type="checkbox"
                />
                Dado sensível
              </label>
              <button
                className="variavel-fluxo__remover"
                disabled={!editavel}
                onClick={() =>
                  aoAlterar(variaveis.filter((_item, itemIndice) => itemIndice !== indice))
                }
                type="button"
              >
                Remover variável
              </button>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function ParametrosNo({
  no,
  atualizar,
  atualizarReferencia,
  substituir,
}: {
  readonly no: NoEditor;
  readonly atualizar: (chave: string, valor: unknown) => void;
  readonly atualizarReferencia: (valor: string) => void;
  readonly substituir: (parametros: Readonly<Record<string, unknown>>) => void;
}) {
  const parametros = no.data.parametros;
  const referencia = no.data.referencias[0]?.recursoId ?? '';
  if (no.data.tipo === 'ENVIAR_MENSAGEM') {
    return (
      <label className="campo-editor">
        <span>Mensagem</span>
        <textarea maxLength={4096} onChange={(e) => atualizar('texto', e.target.value)} value={String(parametros.texto ?? '')} />
        <small>Variáveis permitidas são verificadas antes da publicação.</small>
      </label>
    );
  }
  if (no.data.tipo === 'ENVIAR_BOTOES_OU_LISTA') {
    const opcoes = Array.isArray(parametros.opcoes) ? parametros.opcoes : [];
    const primeira = opcoes[0];
    const titulo = typeof primeira === 'object' && primeira !== null && 'titulo' in primeira ? String(primeira.titulo) : '';
    return (
      <>
        <Campo label="Texto" onChange={(valor) => atualizar('texto', valor)} value={String(parametros.texto ?? '')} />
        <Campo
          label="Primeira opção"
          onChange={(valor) => atualizar('opcoes', [{ id: 'opcao_1', titulo: valor }])}
          value={titulo}
        />
        <p className="ajuda-campo">Até dez opções tipadas; o fallback textual é automático.</p>
      </>
    );
  }
  if (no.data.tipo === 'CONDICAO' || no.data.tipo === 'DEFINIR_VARIAVEL') {
    return (
      <>
        <Campo label="Variável" onChange={(valor) => atualizar('variavel', valor)} value={String(parametros.variavel ?? '')} />
        {no.data.tipo === 'CONDICAO' && (
          <label className="campo-editor"><span>Operador</span><select onChange={(e) => atualizar('operador', e.target.value)} value={String(parametros.operador ?? 'IGUAL')}><option value="IGUAL">Igual</option><option value="DIFERENTE">Diferente</option><option value="MAIOR_QUE">Maior que</option><option value="MENOR_QUE">Menor que</option></select></label>
        )}
        <Campo label="Valor" onChange={(valor) => atualizar('valor', valor)} value={String(parametros.valor ?? '')} />
      </>
    );
  }
  if (no.data.tipo === 'AGUARDAR') {
    return (
      <>
        <label className="campo-editor"><span>Tipo de espera</span><select onChange={(e) => e.target.value === 'ATE_INSTANTE' ? substituir({ retomarEm: new Date(Date.now() + 3_600_000).toISOString(), tipo: 'ATE_INSTANTE' }) : substituir({ tempoLimiteSegundos: 300, tipo: 'RESPOSTA' })} value={String(parametros.tipo ?? 'RESPOSTA')}><option value="RESPOSTA">Resposta do contato</option><option value="ATE_INSTANTE">Até um instante</option></select></label>
        {parametros.tipo === 'ATE_INSTANTE' ? (
          <Campo label="Instante UTC" onChange={(valor) => atualizar('retomarEm', valor)} value={String(parametros.retomarEm ?? '')} />
        ) : (
          <Campo label="Tempo limite (segundos)" min={1} max={86400} onChange={(valor) => atualizar('tempoLimiteSegundos', Number(valor))} type="number" value={Number(parametros.tempoLimiteSegundos ?? 300)} />
        )}
      </>
    );
  }
  if (no.data.tipo === 'CRIAR_ORDEM_SERVICO') {
    return (
      <>
        <Campo label="Assunto" onChange={(valor) => atualizar('assunto', valor)} value={String(parametros.assunto ?? '')} />
        <label className="campo-editor"><span>Descrição</span><textarea maxLength={4000} onChange={(e) => atualizar('descricao', e.target.value)} value={String(parametros.descricao ?? '')} /></label>
        <p className="aviso-confirmacao">A confirmação explícita permanece obrigatória e não pode ser desligada.</p>
      </>
    );
  }
  if (no.data.tipo === 'AGUARDAR_ATENDENTE') {
    return <Campo label="Tempo limite (segundos)" min={1} max={86400} onChange={(valor) => atualizar('tempoLimiteSegundos', Number(valor))} type="number" value={Number(parametros.tempoLimiteSegundos ?? 1800)} />;
  }
  if (no.data.tipo === 'ENCERRAR_ATENDIMENTO') {
    return <Campo label="Motivo" onChange={(valor) => atualizar('motivo', valor)} value={String(parametros.motivo ?? '')} />;
  }
  if (no.data.tipo === 'SOLICITAR_DADOS_CONTATO' || no.data.tipo === 'SOLICITAR_FORMULARIO_WHATSAPP') {
    return <Campo label="Texto de fallback" onChange={(valor) => atualizar('textoFallback', valor)} value={String(parametros.textoFallback ?? '')} />;
  }
  if (no.data.tipo === 'SELECIONAR_CLIENTE' || no.data.tipo === 'SELECIONAR_CONTRATO') {
    return <Campo label="Variável da escolha" onChange={(valor) => atualizar('variavel', valor)} value={String(parametros.variavel ?? '')} />;
  }
  const referenciaTipo = CATALOGO_NOS.find(({ tipo }) => tipo === no.data.tipo)?.tipoReferencia;
  if (referenciaTipo !== undefined) {
    return (
      <>
        <Campo label={`${referenciaTipo.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')} (UUID interno)`} onChange={atualizarReferencia} value={referencia} />
        <p className="ajuda-campo">A existência e o estado ativo são confirmados pelo backend.</p>
      </>
    );
  }
  if (no.data.tipo === 'EXECUTAR_DESBLOQUEIO_CONFIANCA') {
    return <p className="aviso-confirmacao">Confirmação explícita obrigatória. O ERP é revalidado no momento da execução.</p>;
  }
  return <p className="ajuda-campo">Este nó não aceita parâmetros livres.</p>;
}
