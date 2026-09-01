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
import { ServicoRecuperacaoExecucoesFluxo } from '../dist/execucoes-fluxo/servico-recuperacao-execucoes-fluxo.js';
import { ServicoExecutorNosFluxo } from '../dist/execucoes-fluxo/servico-executor-nos-fluxo.js';
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

test('máquina avança somente entre nós distintos durante execução', () => {
  const maquina = new MaquinaEstadoExecucaoFluxo();
  const avancada = maquina.avancarNo(execucao(), 'mensagem', depois(1));
  assert.equal(avancada.noAtualId, 'mensagem');
  assert.equal(avancada.estado, 'EXECUTANDO');
  assert.equal(avancada.revisao, 2);
  assert.throws(
    () => maquina.avancarNo(execucao(), 'inicio', depois(1)),
    ErroTransicaoExecucaoFluxoInvalida,
  );
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
    listarRetomadasVencidas: async () => sobrescritas.vencidas ?? [],
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

test('agenda instante futuro no PostgreSQL e limpa agendamento ao retomar', async () => {
  const cenario = criarCenario({ atual: execucao() });
  const agendada = await cenario.servico.agendarRetomada(
    {
      execucaoFluxoId: ids.execucao,
      revisaoEsperada: 1,
      retomarEm: depois(60),
    },
    cenario.transacao,
    () => depois(1),
  );
  assert.equal(agendada.estado, 'AGUARDANDO_SISTEMA');
  assert.deepEqual(agendada.retomarEm, depois(60));
  assert.equal(agendada.revisao, 2);
  assert.equal(
    cenario.chamadas.auditoria[0][0].dadosNovos.retomarEm,
    depois(60).toISOString(),
  );

  const retomada = new MaquinaEstadoExecucaoFluxo().transitar(
    agendada,
    { tipo: 'RETOMAR' },
    depois(60),
  );
  assert.equal(retomada.estado, 'EXECUTANDO');
  assert.equal(retomada.retomarEm, undefined);
});

test('recusa agendamento vencido, inválido ou fora de EXECUTANDO', async () => {
  const maquina = new MaquinaEstadoExecucaoFluxo();
  assert.throws(
    () => maquina.agendarRetomada(execucao(), depois(1), depois(1)),
    ErroTransicaoExecucaoFluxoInvalida,
  );
  assert.throws(
    () =>
      maquina.agendarRetomada(
        execucao({ estado: 'AGUARDANDO_RESPOSTA' }),
        depois(2),
        depois(1),
      ),
    ErroTransicaoExecucaoFluxoInvalida,
  );
});

test('recuperação retoma somente lote vencido na mesma transação', async () => {
  const agendada = execucao({
    estado: 'AGUARDANDO_SISTEMA',
    retomarEm: depois(60),
    revisao: 2,
    atualizadaEm: depois(1),
  });
  const chamadas = { consultas: [], transicoes: [], transacoes: 0 };
  const transacao = { id: 'transacao-recuperacao' };
  const repositorio = {
    listarRetomadasVencidas: async (...argumentos) => {
      chamadas.consultas.push(argumentos);
      return [agendada];
    },
  };
  const execucoes = {
    transitar: async (...argumentos) => chamadas.transicoes.push(argumentos),
  };
  const prisma = {
    executarTransacao: async (operacao) => {
      chamadas.transacoes += 1;
      return operacao(transacao);
    },
  };
  const recuperacao = new ServicoRecuperacaoExecucoesFluxo(
    repositorio,
    execucoes,
    prisma,
  );
  assert.equal(await recuperacao.executarCiclo(25, () => depois(60)), 1);
  assert.equal(chamadas.transacoes, 1);
  assert.deepEqual(chamadas.consultas[0], [25, depois(60), transacao]);
  assert.deepEqual(chamadas.transicoes[0][0], {
    comando: { tipo: 'RETOMAR' },
    execucaoFluxoId: ids.execucao,
    revisaoEsperada: 2,
  });
  assert.equal(chamadas.transicoes[0][1], transacao);
  assert.deepEqual(chamadas.transicoes[0][2](), depois(60));
});

function criarExecutor({ no, resultadoMensagem }) {
  const chamadas = {
    avancos: [],
    catalogo: [],
    mensagens: [],
    passosFinalizados: [],
    passosIniciados: [],
    transicoes: [],
  };
  const atual = execucao({ noAtualId: no.id, revisao: 7 });
  const fim = { id: 'fim', parametros: {}, referencias: [], tipo: 'FIM', variaveisEntrada: [], variaveisSaida: [] };
  const saidas = {
    ENVIAR_BOTOES_OU_LISTA: ['SUCESSO', 'FALLBACK', 'FALHA_TEMPORARIA', 'FALHA_DEFINITIVA'],
    ENVIAR_MENSAGEM: ['SUCESSO', 'FALHA_TEMPORARIA', 'FALHA_DEFINITIVA'],
    INICIO: ['SUCESSO'],
  }[no.tipo] ?? [];
  const definicao = {
    conexoes: saidas.map((saida) => ({ destinoNoId: 'fim', origemNoId: no.id, saida })),
    inicioNoId: no.tipo === 'INICIO' ? no.id : 'inicio',
    nos: [no, fim],
    variaveis: [],
    versaoSchema: 1,
  };
  const repositorioExecucoes = {
    listarProntasParaExecutar: async () => [atual],
  };
  const repositorioPassos = {
    finalizar: async (passo) => {
      chamadas.passosFinalizados.push(passo);
      return true;
    },
    iniciar: async (passo) => {
      chamadas.passosIniciados.push(passo);
      return true;
    },
  };
  const catalogo = {
    obterVersaoFixaExecucao: async (...argumentos) => {
      chamadas.catalogo.push(argumentos);
      return { definicao };
    },
  };
  const mensagens = {
    criarAutomatica: async (...argumentos) => {
      chamadas.mensagens.push(argumentos);
      return resultadoMensagem;
    },
  };
  const execucoes = {
    avancarNo: async (...argumentos) => chamadas.avancos.push(argumentos),
    transitar: async (...argumentos) => chamadas.transicoes.push(argumentos),
  };
  const transacao = { id: 'transacao-executor' };
  const prisma = { executarTransacao: async (operacao) => operacao(transacao) };
  return {
    chamadas,
    executor: new ServicoExecutorNosFluxo(
      repositorioExecucoes,
      repositorioPassos,
      catalogo,
      mensagens,
      execucoes,
      prisma,
    ),
    transacao,
  };
}

test('executor usa versão fixa, serviço de domínio e avança pela saída de sucesso', async () => {
  const mensagemId = randomUUID();
  const no = {
    id: 'mensagem',
    parametros: { texto: 'Olá pelo fluxo' },
    referencias: [],
    tipo: 'ENVIAR_MENSAGEM',
    variaveisEntrada: [],
    variaveisSaida: [],
  };
  const cenario = criarExecutor({
    no,
    resultadoMensagem: { mensagem: { id: mensagemId }, resultado: 'SUCESSO' },
  });
  assert.equal(await cenario.executor.executarCiclo(10, () => depois(10)), 1);
  assert.equal(cenario.chamadas.catalogo[0][0], ids.versao);
  assert.equal(cenario.chamadas.mensagens[0][0].tipo, 'TEXTO');
  assert.equal(cenario.chamadas.mensagens[0][0].texto, 'Olá pelo fluxo');
  assert.equal(cenario.chamadas.mensagens[0][1], cenario.transacao);
  assert.deepEqual(cenario.chamadas.avancos[0][0], {
    execucaoFluxoId: ids.execucao,
    proximoNoId: 'fim',
    revisaoEsperada: 7,
  });
  assert.deepEqual(cenario.chamadas.passosFinalizados[0].saidaSanitizada, {
    mensagemId,
    resultado: 'SUCESSO',
  });
  assert.equal(
    JSON.stringify(cenario.chamadas.passosFinalizados).includes('Olá pelo fluxo'),
    false,
  );
});

test('lista e falhas seguem saídas nominais sem chamar adapter', async () => {
  const lista = criarExecutor({
    no: {
      id: 'lista',
      parametros: { opcoes: [{ id: 'um', titulo: 'Um' }], texto: 'Escolha' },
      referencias: [],
      tipo: 'ENVIAR_BOTOES_OU_LISTA',
      variaveisEntrada: [],
      variaveisSaida: [],
    },
    resultadoMensagem: {
      mensagem: { id: randomUUID() },
      resultado: 'FALLBACK',
    },
  });
  await lista.executor.executarCiclo(1, () => depois(10));
  assert.equal(lista.chamadas.mensagens[0][0].tipo, 'LISTA');
  assert.equal(
    lista.chamadas.passosFinalizados[0].saidaSanitizada.resultado,
    'FALLBACK',
  );

  const falha = criarExecutor({
    no: {
      id: 'mensagem',
      parametros: { texto: 'Olá' },
      referencias: [],
      tipo: 'ENVIAR_MENSAGEM',
      variaveisEntrada: [],
      variaveisSaida: [],
    },
    resultadoMensagem: {
      codigo: 'JANELA_CANAL_FECHADA',
      resultado: 'FALHA_DEFINITIVA',
    },
  });
  await falha.executor.executarCiclo(1, () => depois(10));
  assert.equal(falha.chamadas.passosFinalizados[0].estado, 'FALHOU');
  assert.equal(
    falha.chamadas.passosFinalizados[0].codigoErro,
    'JANELA_CANAL_FECHADA',
  );
  assert.equal(
    falha.chamadas.passosFinalizados[0].saidaSanitizada.resultado,
    'FALHA_DEFINITIVA',
  );
});
