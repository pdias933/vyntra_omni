import {
  client,
  criarFluxoEditor,
  criarVersaoFluxoEditor,
  listarFluxosEditor,
  prepararPublicacaoFluxoEditor,
  publicarVersaoFluxoEditor,
  salvarRascunhoFluxoEditor,
  simularFluxoEditor,
  type FluxoEditorDto,
  type ResultadoSimulacaoFluxoDto,
  type VersaoFluxoEditorDto,
} from '@vyntra/api-client';
import { useCallback, useEffect, useState } from 'react';

import { EditorFluxo } from './editor/EditorFluxo';
import {
  definicaoInicial,
  lerDefinicao,
  serializarDefinicao,
  type CenarioSimulacaoEditor,
  type ResultadoSimulacaoEditor,
} from './editor/modelo-editor';

client.setConfig({ credentials: 'include' });

type TipoFluxo =
  | 'ATENDIMENTO'
  | 'AUTENTICACAO'
  | 'COMERCIAL'
  | 'FINANCEIRO'
  | 'OUTRO'
  | 'SUPORTE';

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

function mensagemErro(erro: unknown): string {
  if (erro instanceof Error && erro.message.length > 0) return erro.message;
  return 'Não foi possível concluir a ação. Tente novamente.';
}

function escolherVersao(
  fluxo: FluxoEditorDto,
): VersaoFluxoEditorDto | undefined {
  return (
    fluxo.versoes.find(({ estado }) => estado === 'RASCUNHO') ??
    fluxo.versoes.find(({ estado }) => estado === 'EM_TESTE') ??
    fluxo.versoes.find(({ id }) => id === fluxo.versao_publicada_id) ??
    fluxo.versoes[0]
  );
}

function tentarLerDefinicao(versao: VersaoFluxoEditorDto | undefined) {
  if (versao === undefined) return undefined;
  try {
    return lerDefinicao(versao.definicao);
  } catch {
    return undefined;
  }
}

function mapearSimulacao(
  resultado: ResultadoSimulacaoFluxoDto,
): ResultadoSimulacaoEditor {
  return {
    cenario: resultado.cenario,
    codigoFinal: resultado.codigo_final,
    contextoFicticio: {
      contato: resultado.contexto_ficticio.contato,
      contrato: resultado.contexto_ficticio.contrato,
      documento: resultado.contexto_ficticio.documento,
      telefone: resultado.contexto_ficticio.telefone,
    },
    efeitosReaisExecutados: false,
    estado: resultado.estado,
    passos: resultado.passos.map((passo) => ({
      descricao: passo.descricao,
      estado: passo.estado,
      noId: passo.no_id,
      ordem: passo.ordem,
      ...(passo.saida === undefined ? {} : { saida: passo.saida }),
      tipoNo: passo.tipo_no,
    })),
    previa: resultado.previa.map((item) => ({
      conteudo: item.conteudo,
      ordemPasso: item.ordem_passo,
      origem: item.origem,
    })),
  };
}

export function AplicacaoEditorFluxos() {
  const [fluxos, definirFluxos] = useState<readonly FluxoEditorDto[]>([]);
  const [fluxoId, definirFluxoId] = useState<string>();
  const [versaoId, definirVersaoId] = useState<string>();
  const [carregando, definirCarregando] = useState(true);
  const [ocupada, definirOcupada] = useState(false);
  const [aviso, definirAviso] = useState<string>();
  const [confirmarPublicacao, definirConfirmarPublicacao] = useState(false);

  const carregar = useCallback(
    async (preferencia?: { fluxoId?: string; versaoId?: string }) => {
      definirCarregando(true);
      try {
        const resposta = await listarFluxosEditor({ throwOnError: true });
        const lista = resposta.data;
        definirFluxos(lista);
        const fluxo =
          lista.find(({ id }) => id === preferencia?.fluxoId) ??
          lista[0];
        const versao =
          fluxo?.versoes.find(({ id }) => id === preferencia?.versaoId) ??
          (fluxo === undefined ? undefined : escolherVersao(fluxo));
        definirFluxoId(fluxo?.id);
        definirVersaoId(versao?.id);
        definirAviso(undefined);
      } catch (erro) {
        definirAviso(mensagemErro(erro));
      } finally {
        definirCarregando(false);
      }
    },
    [],
  );

  useEffect(() => {
    const identificador = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(identificador);
  }, [carregar]);

  const fluxo = fluxos.find(({ id }) => id === fluxoId);
  const versao = fluxo?.versoes.find(({ id }) => id === versaoId);
  const definicao = tentarLerDefinicao(versao);
  const versaoPublicada = fluxo?.versoes.find(
    ({ id }) => id === fluxo.versao_publicada_id,
  );

  async function executar(operacao: () => Promise<void>): Promise<void> {
    definirOcupada(true);
    definirAviso(undefined);
    try {
      await operacao();
    } catch (erro) {
      definirAviso(mensagemErro(erro));
    } finally {
      definirOcupada(false);
    }
  }

  if (carregando) {
    return (
      <main className="estado-tela">
        <div className="skeleton-editor" />
        <span>Preparando o editor…</span>
      </main>
    );
  }

  if (fluxo === undefined || versao === undefined) {
    return (
      <TelaVazia
        aviso={aviso}
        ocupada={ocupada}
        aoCriar={(nome, tipo) =>
          executar(async () => {
            const resposta = await criarFluxoEditor({
              body: {
                definicao: serializarDefinicao(definicaoInicial()),
                nome,
                tipo,
              },
              headers: { 'x-csrf-token': obterCsrf() },
              throwOnError: true,
            });
            await carregar({
              fluxoId: resposta.data.fluxo.id,
              versaoId: resposta.data.versao.id,
            });
          })
        }
      />
    );
  }

  if (definicao === undefined) {
    return (
      <main className="estado-tela estado-tela--erro">
        <strong>Esta versão não pode ser aberta no editor.</strong>
        <p>A definição foi preservada. Nenhuma alteração foi enviada.</p>
      </main>
    );
  }

  return (
    <>
      <EditorFluxo
        aviso={aviso}
        definicao={definicao}
        estadoVersao={versao.estado}
        fluxoNome={fluxo.nome}
        key={`${fluxo.id}:${versao.id}:${versao.revisao}`}
        numeroVersao={versao.numero_versao}
        ocupada={ocupada}
        versaoPublicadaNumero={versaoPublicada?.numero_versao}
        aoCriarRascunho={(novaDefinicao) =>
          executar(async () => {
            const resposta = await criarVersaoFluxoEditor({
              body: {
                definicao: novaDefinicao,
                versao_schema_definicao: 1,
              },
              headers: { 'x-csrf-token': obterCsrf() },
              path: { fluxoId: fluxo.id },
              throwOnError: true,
            });
            await carregar({ fluxoId: fluxo.id, versaoId: resposta.data.id });
          })
        }
        aoPublicar={async () => definirConfirmarPublicacao(true)}
        aoSalvar={(novaDefinicao) =>
          executar(async () => {
            const resposta = await salvarRascunhoFluxoEditor({
              body: {
                definicao: novaDefinicao,
                revisao_esperada: versao.revisao,
                versao_schema_definicao: 1,
              },
              headers: { 'x-csrf-token': obterCsrf() },
              path: { fluxoId: fluxo.id, versaoFluxoId: versao.id },
              throwOnError: true,
            });
            await carregar({ fluxoId: fluxo.id, versaoId: resposta.data.id });
          })
        }
        aoSimular={async (
          definicaoSimulada: Record<string, unknown>,
          cenario: CenarioSimulacaoEditor,
        ) => {
          definirOcupada(true);
          definirAviso(undefined);
          try {
            const resposta = await simularFluxoEditor({
              body: { cenario, definicao: definicaoSimulada },
              headers: { 'x-csrf-token': obterCsrf() },
              throwOnError: true,
            });
            return mapearSimulacao(resposta.data);
          } catch (erro) {
            definirAviso(mensagemErro(erro));
            throw erro;
          } finally {
            definirOcupada(false);
          }
        }}
        aoValidar={() =>
          executar(async () => {
            await prepararPublicacaoFluxoEditor({
              body: { revisao_esperada: versao.revisao },
              headers: { 'x-csrf-token': obterCsrf() },
              path: { fluxoId: fluxo.id, versaoFluxoId: versao.id },
              throwOnError: true,
            });
            await carregar({ fluxoId: fluxo.id, versaoId: versao.id });
          })
        }
      />
      {confirmarPublicacao && (
        <div className="modal-publicacao" role="presentation">
          <section
            aria-labelledby="titulo-publicacao"
            aria-modal="true"
            role="dialog"
          >
            <span className="modal-publicacao__icone" aria-hidden="true">
              ↑
            </span>
            <h2 id="titulo-publicacao">
              Publicar versão {versao.numero_versao}?
            </h2>
            <p>
              A mudança vale somente para novos atendimentos. Execuções em
              curso continuam na versão original.
            </p>
            <div className="modal-publicacao__comparacao">
              <span>
                Produção atual
                <strong>
                  {versaoPublicada === undefined
                    ? 'Sem versão'
                    : `Versão ${versaoPublicada.numero_versao}`}
                </strong>
              </span>
              <b aria-hidden="true">→</b>
              <span>
                Após publicar<strong>Versão {versao.numero_versao}</strong>
              </span>
            </div>
            <div className="modal-publicacao__acoes">
              <button
                className="botao botao--secundario"
                onClick={() => definirConfirmarPublicacao(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="botao botao--primario"
                disabled={ocupada}
                onClick={() => {
                  definirConfirmarPublicacao(false);
                  void executar(async () => {
                    await publicarVersaoFluxoEditor({
                      body: { revisao_fluxo_esperada: fluxo.revisao },
                      headers: { 'x-csrf-token': obterCsrf() },
                      path: {
                        fluxoId: fluxo.id,
                        versaoFluxoId: versao.id,
                      },
                      throwOnError: true,
                    });
                    await carregar({
                      fluxoId: fluxo.id,
                      versaoId: versao.id,
                    });
                  });
                }}
                type="button"
              >
                Confirmar publicação
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function TelaVazia({
  aviso,
  ocupada,
  aoCriar,
}: {
  readonly aviso?: string | undefined;
  readonly ocupada: boolean;
  readonly aoCriar: (nome: string, tipo: TipoFluxo) => Promise<void>;
}) {
  const [nome, definirNome] = useState('Atendimento principal');
  const [tipo, definirTipo] = useState<TipoFluxo>('ATENDIMENTO');
  return (
    <main className="tela-vazia-editor">
      <div className="marca-produto">
        <span aria-hidden="true">V</span>
        <strong>Vyntra</strong>
      </div>
      <section>
        <span className="tela-vazia-editor__icone" aria-hidden="true">
          ◇
        </span>
        <p className="sobretitulo">Motor de Fluxos</p>
        <h1>Crie sua primeira automação</h1>
        <p>
          Comece com um rascunho seguro. Salvar nunca muda o atendimento em
          produção.
        </p>
        {aviso !== undefined && <div className="faixa-editor">{aviso}</div>}
        <label className="campo-editor">
          <span>Nome do fluxo</span>
          <input
            maxLength={120}
            onChange={(evento) => definirNome(evento.target.value)}
            value={nome}
          />
        </label>
        <label className="campo-editor">
          <span>Finalidade</span>
          <select
            onChange={(evento) => definirTipo(evento.target.value as TipoFluxo)}
            value={tipo}
          >
            <option value="ATENDIMENTO">Atendimento</option>
            <option value="AUTENTICACAO">Autenticação</option>
            <option value="FINANCEIRO">Financeiro</option>
            <option value="COMERCIAL">Comercial</option>
            <option value="SUPORTE">Suporte</option>
            <option value="OUTRO">Outro</option>
          </select>
        </label>
        <button
          className="botao botao--primario"
          disabled={ocupada || nome.trim().length === 0}
          onClick={() => void aoCriar(nome, tipo)}
          type="button"
        >
          Criar rascunho
        </button>
      </section>
    </main>
  );
}
