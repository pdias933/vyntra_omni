import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroConflitoExecucaoFluxo,
  ErroExecucaoFluxoTerminal,
  ErroInicioExecucaoFluxoNegado,
  ErroTransicaoExecucaoFluxoInvalida,
} from '../dist/execucoes-fluxo/erros-execucao-fluxo.js';
import { MaquinaEstadoExecucaoFluxo } from '../dist/execucoes-fluxo/maquina-estado-execucao-fluxo.js';
import { ServicoExecucoesFluxo } from '../dist/execucoes-fluxo/servico-execucoes-fluxo.js';

const inicio = new Date('2026-09-01T18:00:00.000Z');
const depois = (segundos) => new Date(inicio.getTime() + segundos * 1_000);
const ids = {
  atendimento: randomUUID(),
  execucao: randomUUID(),
  fluxo: randomUUID(),
  versao: randomUUID(),
};

function execucao(sobrescritas = {}) {
  return {
    atendimentoId: ids.atendimento,
    atualizadaEm: inicio,
    contextoProtegido: {},
    estado: 'EXECUTANDO',
    fluxoId: ids.fluxo,
    id: ids.execucao,
    iniciadaEm: inicio,
    noAtualId: 'inicio',
    revisao: 1,
    versaoFluxoId: ids.versao,
    ...sobrescritas,
  };
}

test('máquina percorre esperas e retoma sem trocar versão ou nó', () => {
  const maquina = new MaquinaEstadoExecucaoFluxo();
  const aguardandoResposta = maquina.transitar(
    execucao(),
    { tipo: 'AGUARDAR_RESPOSTA' },
    depois(1),
  );
  assert.equal(aguardandoResposta.estado, 'AGUARDANDO_RESPOSTA');
  const retomada = maquina.transitar(
    aguardandoResposta,
    { tipo: 'RETOMAR' },
    depois(2),
  );
  assert.equal(retomada.estado, 'EXECUTANDO');
  assert.equal(retomada.versaoFluxoId, ids.versao);
  assert.equal(retomada.noAtualId, 'inicio');
  assert.equal(retomada.revisao, 3);
});

test('conclusão, falha, cancelamento e suspensão materializam terminal', () => {
  const maquina = new MaquinaEstadoExecucaoFluxo();
  const comandos = [
    [{ tipo: 'CONCLUIR' }, 'CONCLUIDA', 'FIM_ALCANCADO'],
    [{ tipo: 'FALHAR', codigo: 'FALHA_CONFIGURACAO' }, 'FALHOU', 'FALHA_CONFIGURACAO'],
    [{ tipo: 'CANCELAR', codigo: 'CANCELAMENTO_ADMINISTRATIVO' }, 'CANCELADA', 'CANCELAMENTO_ADMINISTRATIVO'],
    [
      { tipo: 'SUSPENDER_POR_ATENDIMENTO_HUMANO' },
      'SUSPENSA_POR_ATENDIMENTO_HUMANO',
      'ATENDIMENTO_HUMANO_ASSUMIU',
    ],
  ];
  for (const [comando, estado, codigo] of comandos) {
    const terminal = maquina.transitar(execucao(), comando, depois(1));
    assert.equal(terminal.estado, estado);
    assert.equal(terminal.codigoFinalizacao, codigo);
    assert.deepEqual(terminal.finalizadaEm, depois(1));
  }
});

test('terminal nunca retoma e transição inválida falha fechada', () => {
  const maquina = new MaquinaEstadoExecucaoFluxo();
  const terminal = maquina.transitar(
    execucao(),
    { tipo: 'CONCLUIR' },
    depois(1),
  );
  assert.throws(
    () => maquina.transitar(terminal, { tipo: 'RETOMAR' }, depois(2)),
    ErroExecucaoFluxoTerminal,
  );
  assert.throws(
    () =>
      maquina.transitar(
        execucao({ estado: 'AGUARDANDO_ATENDENTE' }),
        { tipo: 'RETOMAR' },
        depois(1),
      ),
    ErroTransicaoExecucaoFluxoInvalida,
  );
  assert.throws(
    () => maquina.transitar(execucao(), { tipo: 'FALHAR', codigo: 'texto livre' }, depois(1)),
    ErroTransicaoExecucaoFluxoInvalida,
  );
  assert.throws(
    () => maquina.transitar(execucao(), { tipo: 'CONCLUIR', extra: true }, depois(1)),
    ErroTransicaoExecucaoFluxoInvalida,
  );
});

function criarCenario(sobrescritas = {}) {
  const chamadas = {
    alteracoes: [],
    auditoria: [],
    catalogo: [],
    criacoes: [],
  };
  let ativa = sobrescritas.ativa;
  let atual = sobrescritas.atual;
  const repositorio = {
    alterarCondicional: async (...argumentos) => {
      chamadas.alteracoes.push(argumentos);
      return sobrescritas.alterada ?? true;
    },
    criarSeAtendimentoAutomatizavel: async (...argumentos) => {
      chamadas.criacoes.push(argumentos);
      if (sobrescritas.criada === false) return false;
      ativa = argumentos[0];
      atual = argumentos[0];
      return true;
    },
    obterAtivaPorAtendimento: async () => ativa,
    obterPorId: async () => atual,
  };
  const versaoPublicada = {
    definicao: {
      conexoes: [],
      inicioNoId: 'inicio',
      nos: [],
      variaveis: [],
      versaoSchema: 1,
    },
    fluxoId: ids.fluxo,
    id: ids.versao,
  };
  const catalogo = {
    obterVersaoPublicadaParaNovaExecucao: async (...argumentos) => {
      chamadas.catalogo.push(argumentos);
      return sobrescritas.versaoPublicada ?? versaoPublicada;
    },
  };
  const auditoria = {
    registrar: async (...argumentos) => chamadas.auditoria.push(argumentos),
  };
  return {
    chamadas,
    repositorio,
    servico: new ServicoExecucoesFluxo(repositorio, catalogo, auditoria),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('serviço inicia em versão publicada fixa e audita sem contexto', async () => {
  const cenario = criarCenario();
  const iniciada = await cenario.servico.iniciar(
    { atendimentoId: ids.atendimento, fluxoId: ids.fluxo },
    cenario.transacao,
    () => inicio,
  );
  assert.equal(iniciada.estado, 'EXECUTANDO');
  assert.equal(iniciada.versaoFluxoId, ids.versao);
  assert.equal(iniciada.noAtualId, 'inicio');
  assert.equal(cenario.chamadas.criacoes[0][1], cenario.transacao);
  assert.equal(cenario.chamadas.auditoria[0][1], cenario.transacao);
  assert.equal(
    cenario.chamadas.auditoria[0][0].dadosNovos.contextoProtegido,
    undefined,
  );
});

test('replay conserva execução ativa mesmo depois de nova publicação', async () => {
  const ativa = execucao();
  const cenario = criarCenario({
    ativa,
    versaoPublicada: { definicao: { inicioNoId: 'outro' }, id: randomUUID() },
  });
  const repetida = await cenario.servico.iniciar(
    { atendimentoId: ids.atendimento, fluxoId: ids.fluxo },
    cenario.transacao,
  );
  assert.equal(repetida, ativa);
  assert.equal(cenario.chamadas.catalogo.length, 0);
  assert.equal(cenario.chamadas.criacoes.length, 0);
  assert.equal(cenario.chamadas.auditoria.length, 0);
});

test('outra automação ativa e conflito condicional não são contornados', async () => {
  const outra = criarCenario({
    ativa: execucao({ fluxoId: randomUUID(), versaoFluxoId: randomUUID() }),
  });
  await assert.rejects(
    outra.servico.iniciar(
      { atendimentoId: ids.atendimento, fluxoId: ids.fluxo },
      outra.transacao,
    ),
    ErroInicioExecucaoFluxoNegado,
  );
  const conflito = criarCenario({ alterada: false, atual: execucao() });
  await assert.rejects(
    conflito.servico.transitar(
      {
        comando: { tipo: 'AGUARDAR_SISTEMA' },
        execucaoFluxoId: ids.execucao,
        revisaoEsperada: 1,
      },
      conflito.transacao,
      () => depois(1),
    ),
    ErroConflitoExecucaoFluxo,
  );
  assert.equal(conflito.chamadas.auditoria.length, 0);
});

test('novo processo não retoma registro terminal persistido', async () => {
  const terminal = new MaquinaEstadoExecucaoFluxo().transitar(
    execucao(),
    { tipo: 'CONCLUIR' },
    depois(1),
  );
  const reiniciado = criarCenario({ atual: terminal });
  await assert.rejects(
    reiniciado.servico.transitar(
      {
        comando: { tipo: 'RETOMAR' },
        execucaoFluxoId: ids.execucao,
        revisaoEsperada: 2,
      },
      reiniciado.transacao,
      () => depois(2),
    ),
    ErroExecucaoFluxoTerminal,
  );
  assert.equal(reiniciado.chamadas.alteracoes.length, 0);
  assert.equal(reiniciado.chamadas.auditoria.length, 0);
});
