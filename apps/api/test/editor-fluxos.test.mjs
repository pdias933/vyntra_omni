import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroPermissaoNegada } from '../dist/autorizacao/erros-autorizacao.js';
import { ErroFluxoInvalido } from '../dist/fluxos/erros-fluxo.js';
import { ServicoEditorFluxos } from '../dist/fluxos/servico-editor-fluxos.js';
import { SimuladorFluxos } from '../dist/fluxos/simulador-fluxos.js';
import { ValidadorPublicacaoFluxo } from '../dist/fluxos/validador-publicacao-fluxo.js';

const ids = {
  fluxo: randomUUID(),
  outroFluxo: randomUUID(),
  sessao: randomUUID(),
  usuario: randomUUID(),
  versao: randomUUID(),
};
const agora = new Date('2026-09-01T20:00:00.000Z');
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2099-01-01T00:00:00.000Z'),
  sessaoId: ids.sessao,
  usuarioId: ids.usuario,
};

function definicaoValida() {
  return {
    conexoes: [],
    inicioNoId: 'inicio',
    nos: [
      {
        id: 'inicio',
        parametros: {},
        posicao: { x: 40, y: 80 },
        referencias: [],
        tipo: 'INICIO',
        variaveisEntrada: [],
        variaveisSaida: [],
      },
      {
        id: 'fim',
        parametros: {},
        posicao: { x: 440, y: 80 },
        referencias: [],
        tipo: 'FIM',
        variaveisEntrada: [],
        variaveisSaida: [],
      },
    ],
    variaveis: [],
    versaoSchema: 1,
  };
}

function fluxo() {
  return {
    ativo: true,
    atualizadoEm: agora,
    criadoEm: agora,
    criadoPorUsuarioId: ids.usuario,
    id: ids.fluxo,
    nome: 'Atendimento principal',
    nomeNormalizado: 'atendimento-principal',
    revisao: 1,
    tipo: 'ATENDIMENTO',
  };
}

function versao(sobrescritas = {}) {
  return {
    atualizadaEm: agora,
    criadaEm: agora,
    criadaPorUsuarioId: ids.usuario,
    definicao: definicaoValida(),
    estado: 'RASCUNHO',
    fluxoId: ids.fluxo,
    id: ids.versao,
    numeroVersao: 1,
    revisao: 1,
    versaoSchemaDefinicao: 1,
    ...sobrescritas,
  };
}

function criarCenario(sobrescritas = {}) {
  const chamadas = {
    autorizacao: [],
    criacoes: [],
    novasVersoes: [],
    preparacoes: [],
    publicacoes: [],
    salvamentos: [],
  };
  const fluxoAtual = sobrescritas.fluxo ?? fluxo();
  const versaoAtual = sobrescritas.versao ?? versao();
  const repositorio = {
    listarFluxos: async () => [{ ...fluxoAtual, versoes: [versaoAtual] }],
    obterFluxo: async (id) => (id === ids.fluxo ? fluxoAtual : undefined),
    obterFluxoComVersoes: async (id) =>
      id === ids.fluxo
        ? { ...fluxoAtual, versoes: [versaoAtual] }
        : undefined,
    obterVersao: async (id) => (id === ids.versao ? versaoAtual : undefined),
  };
  const autorizacao = {
    autorizar: async (entrada, verificar, transacao) => {
      chamadas.autorizacao.push([entrada, transacao]);
      const resultado = await verificar({}, transacao);
      if (!resultado.acessivel || !resultado.estadoPermiteAcao) {
        throw new ErroPermissaoNegada();
      }
      return resultado;
    },
  };
  const catalogo = {
    alterarDefinicaoRascunho: async (...argumentos) => {
      chamadas.salvamentos.push(argumentos);
      return versao({ revisao: 2 });
    },
    criarFluxo: async (...argumentos) => {
      chamadas.criacoes.push(argumentos);
      return { fluxo: fluxoAtual, versao: versaoAtual };
    },
    criarVersaoRascunho: async (...argumentos) => {
      chamadas.novasVersoes.push(argumentos);
      return versaoAtual;
    },
  };
  const validacao = {
    prepararParaPublicacao: async (...argumentos) => {
      chamadas.preparacoes.push(argumentos);
      return {
        estado: 'EM_TESTE',
        fluxoId: ids.fluxo,
        relatorio: {
          problemas: [],
          quantidadeConexoes: 1,
          quantidadeNos: 2,
          valido: true,
        },
        revisaoVersao: 2,
        versaoFluxoId: ids.versao,
      };
    },
  };
  const publicacao = {
    arquivarPublicacaoAtual: async () => undefined,
    publicar: async (...argumentos) => {
      chamadas.publicacoes.push(argumentos);
      return {
        fluxoId: ids.fluxo,
        revisaoFluxo: 2,
        tipo: 'PUBLICACAO',
        versaoPublicadaId: ids.versao,
      };
    },
    reverter: async () => undefined,
  };
  return {
    chamadas,
    servico: new ServicoEditorFluxos(
      repositorio,
      autorizacao,
      catalogo,
      validacao,
      publicacao,
      new ValidadorPublicacaoFluxo(),
      new SimuladorFluxos(),
    ),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('salva somente rascunho tipado com posição e revisão esperada', async () => {
  const cenario = criarCenario();
  const resultado = await cenario.servico.salvarRascunho(
    sessao,
    {
      definicao: definicaoValida(),
      fluxoId: ids.fluxo,
      revisaoEsperada: 1,
      versaoFluxoId: ids.versao,
      versaoSchemaDefinicao: 1,
    },
    cenario.transacao,
  );
  assert.equal(resultado.revisao, 2);
  assert.equal(cenario.chamadas.salvamentos.length, 1);
  assert.equal(cenario.chamadas.preparacoes.length, 0);
  assert.equal(cenario.chamadas.publicacoes.length, 0);
  assert.equal(
    cenario.chamadas.autorizacao[0][0].permissao,
    'EDITAR_FLUXO',
  );
});

test('rascunho incompleto pode salvar, mas JSON livre ou parâmetro proibido não', async () => {
  const cenario = criarCenario();
  const proibida = definicaoValida();
  proibida.nos[0].parametros = { url: 'https://nao-permitido.invalid' };
  await assert.rejects(
    cenario.servico.criar(
      sessao,
      {
        definicaoInicial: proibida,
        nome: 'Fluxo inseguro',
        tipo: 'OUTRO',
      },
      cenario.transacao,
    ),
    ErroFluxoInvalido,
  );
  await assert.rejects(
    cenario.servico.criar(
      sessao,
      {
        definicaoInicial: { nos: [] },
        nome: 'JSON livre',
        tipo: 'OUTRO',
      },
      cenario.transacao,
    ),
    ErroFluxoInvalido,
  );
  assert.equal(cenario.chamadas.criacoes.length, 0);
});

test('UUID de versão de outro fluxo falha fechado antes da alteração', async () => {
  const cenario = criarCenario({
    versao: versao({ fluxoId: ids.outroFluxo }),
  });
  await assert.rejects(
    cenario.servico.salvarRascunho(
      sessao,
      {
        definicao: definicaoValida(),
        fluxoId: ids.fluxo,
        revisaoEsperada: 1,
        versaoFluxoId: ids.versao,
      },
      cenario.transacao,
    ),
    ErroPermissaoNegada,
  );
  assert.equal(cenario.chamadas.salvamentos.length, 0);
});

test('listar exige VISUALIZAR e validar/publicar permanecem comandos separados', async () => {
  const cenario = criarCenario();
  const listados = await cenario.servico.listar(sessao, cenario.transacao);
  assert.equal(listados.length, 1);
  assert.equal(
    cenario.chamadas.autorizacao[0][0].permissao,
    'VISUALIZAR_FLUXO',
  );
  await cenario.servico.prepararParaPublicacao(
    sessao,
    ids.fluxo,
    { revisaoVersaoEsperada: 1, versaoFluxoId: ids.versao },
    cenario.transacao,
  );
  assert.equal(cenario.chamadas.preparacoes.length, 1);
  assert.equal(cenario.chamadas.publicacoes.length, 0);
  await cenario.servico.publicar(
    sessao,
    {
      fluxoId: ids.fluxo,
      revisaoFluxoEsperada: 1,
      versaoFluxoId: ids.versao,
    },
    cenario.transacao,
  );
  assert.equal(cenario.chamadas.publicacoes.length, 1);
});

test('simular exige TESTAR_FLUXO e não chama catálogo, validação ou publicação', async () => {
  const cenario = criarCenario();
  const definicao = definicaoValida();
  definicao.conexoes.push({
    destinoNoId: 'fim',
    origemNoId: 'inicio',
    saida: 'SUCESSO',
  });
  const resultado = await cenario.servico.simular(
    sessao,
    definicao,
    'CAMINHO_FELIZ',
    cenario.transacao,
  );
  assert.equal(resultado.estado, 'CONCLUIDA');
  assert.equal(resultado.efeitosReaisExecutados, false);
  assert.equal(
    cenario.chamadas.autorizacao.at(-1)[0].permissao,
    'TESTAR_FLUXO',
  );
  assert.equal(cenario.chamadas.salvamentos.length, 0);
  assert.equal(cenario.chamadas.preparacoes.length, 0);
  assert.equal(cenario.chamadas.publicacoes.length, 0);
});
