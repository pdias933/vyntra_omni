import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroCalendarioAusente } from '../dist/calendarios/erros-calendario.js';
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

test('máquina avança e permite revisitar nó em ciclo controlado', () => {
  const maquina = new MaquinaEstadoExecucaoFluxo();
  const avancada = maquina.avancarNo(execucao(), 'mensagem', depois(1));
  assert.equal(avancada.noAtualId, 'mensagem');
  assert.equal(avancada.estado, 'EXECUTANDO');
  assert.equal(avancada.revisao, 2);
  const revisitada = maquina.avancarNo(execucao(), 'inicio', depois(1));
  assert.equal(revisitada.noAtualId, 'inicio');
  assert.equal(revisitada.revisao, 2);
  assert.throws(() => maquina.avancarNo(execucao(), 'id inválido', depois(1)),
    ErroTransicaoExecucaoFluxoInvalida);
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

test('espera de resposta agenda timeout e aceita retomada antecipada marcada', async () => {
  const contextoProtegido = {
    esperasFluxo: {
      aguardar: {
        respostaRecebida: false,
        retomarEm: depois(60).toISOString(),
        tipo: 'RESPOSTA',
      },
    },
  };
  const atual = execucao({
    atualizadaEm: depois(1),
    contextoProtegido,
    estado: 'AGUARDANDO_RESPOSTA',
    noAtualId: 'aguardar',
    retomarEm: depois(60),
    revisao: 2,
  });
  const cenario = criarCenario({ atual });
  const retomada = await cenario.servico.retomarPorResposta(
    { execucaoFluxoId: ids.execucao, revisaoEsperada: 2 },
    cenario.transacao,
    () => depois(10),
  );
  assert.equal(retomada.estado, 'EXECUTANDO');
  assert.equal(retomada.retomarEm, undefined);
  assert.equal(
    retomada.contextoProtegido.esperasFluxo.aguardar.respostaRecebida,
    true,
  );
  assert.equal(
    cenario.chamadas.auditoria[0][0].tipoEvento,
    'EXECUCAO_FLUXO_RESPOSTA_RECEBIDA',
  );
  assert.throws(
    () =>
      new MaquinaEstadoExecucaoFluxo().transitar(
        atual,
        { tipo: 'RETOMAR' },
        depois(10),
      ),
    ErroTransicaoExecucaoFluxoInvalida,
  );

  const semMarca = criarCenario({ atual: execucao() });
  await assert.rejects(
    semMarca.servico.agendarRetomada(
      {
        estadoEspera: 'AGUARDANDO_RESPOSTA',
        execucaoFluxoId: ids.execucao,
        retomarEm: depois(60),
        revisaoEsperada: 1,
      },
      semMarca.transacao,
      () => depois(1),
    ),
    /EXECUCAO_FLUXO_INVALIDA/u,
  );
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

function criarExecutor({
  contextoProtegido = {},
  erroCalendario,
  no,
  resultadoCalendario = { estado: 'ABERTO' },
  resultadoIdentificacao = true,
  resultadoMensagem,
  preparacaoFatura,
  preparacaoProtocoloOrdem,
  resultadoFatura = { resultado: 'ERP_INDISPONIVEL' },
  resultadoProtocoloOrdem = { resultado: 'INDISPONIVEL' },
  contextoFaturaValido = true,
  formularioAtivo = true,
  resultadoSelecaoCliente = true,
  resultadoSelecaoContrato = true,
  variaveis = [],
}) {
  const chamadas = {
    avancos: [],
    agendamentos: [],
    calendarios: [],
    catalogo: [],
    contextos: [],
    faturas: [],
    formularios: [],
    protocolosOrdens: [],
    mensagens: [],
    passosFinalizados: [],
    passosIniciados: [],
    transicoes: [],
  };
  const atual = execucao({ contextoProtegido, noAtualId: no.id, revisao: 7 });
  const fim = { id: 'fim', parametros: {}, referencias: [], tipo: 'FIM', variaveisEntrada: [], variaveisSaida: [] };
  const saidas = {
    CONDICAO: ['VERDADEIRO', 'FALSO', 'FALHA'],
    AGUARDAR: ['CONCLUIDO', 'TIMEOUT', 'FALHA'],
    DEFINIR_VARIAVEL: ['SUCESSO', 'FALHA'],
    ENVIAR_BOTOES_OU_LISTA: ['SUCESSO', 'FALLBACK', 'FALHA_TEMPORARIA', 'FALHA_DEFINITIVA'],
    ENVIAR_MENSAGEM: ['SUCESSO', 'FALHA_TEMPORARIA', 'FALHA_DEFINITIVA'],
    INICIO: ['SUCESSO'],
    HORARIO_ATENDIMENTO: ['DENTRO_HORARIO', 'FORA_HORARIO', 'FALHA'],
    IDENTIFICAR_CONTATO: ['IDENTIFICADO', 'NAO_IDENTIFICADO', 'FALHA'],
    SOLICITAR_DADOS_CONTATO: ['ENVIADO', 'FALLBACK', 'FALHA'],
    SOLICITAR_FORMULARIO_WHATSAPP: ['ENVIADO', 'FALLBACK', 'FALHA'],
    SELECIONAR_CLIENTE: ['SELECIONADO', 'NAO_SELECIONADO', 'FALHA'],
    SELECIONAR_CONTRATO: ['SELECIONADO', 'NAO_SELECIONADO', 'FALHA'],
    CONSULTAR_FATURAS: ['ENCONTRADA', 'NAO_ENCONTRADA', 'ERP_INDISPONIVEL', 'FALHA'],
    ENVIAR_FATURA: ['SUCESSO', 'DADOS_INCOMPLETOS', 'ERP_INDISPONIVEL', 'FALHA'],
    CRIAR_ATENDIMENTO: ['CRIADO', 'RESULTADO_INCERTO', 'INDISPONIVEL', 'FALHA'],
    CRIAR_ORDEM_SERVICO: ['CRIADA', 'RESULTADO_INCERTO', 'INDISPONIVEL', 'FALHA'],
  }[no.tipo] ?? [];
  const definicao = {
    conexoes: saidas.map((saida) => ({ destinoNoId: 'fim', origemNoId: no.id, saida })),
    inicioNoId: no.tipo === 'INICIO' ? no.id : 'inicio',
    nos: [no, fim],
    variaveis,
    versaoSchema: 1,
  };
  let entregue = false;
  const repositorioExecucoes = {
    listarProntasParaExecutar: async () => {
      if (entregue) return [];
      entregue = true;
      return [atual];
    },
    obterPorId: async () => atual,
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
  const contextosCliente = {
    identificarParaFluxo: async (...argumentos) => {
      chamadas.contextos.push(['IDENTIFICAR', ...argumentos]);
      return resultadoIdentificacao;
    },
    selecionarClientePorFluxo: async (...argumentos) => {
      chamadas.contextos.push(['CLIENTE', ...argumentos]);
      return resultadoSelecaoCliente;
    },
    selecionarContratoPorFluxo: async (...argumentos) => {
      chamadas.contextos.push(['CONTRATO', ...argumentos]);
      return resultadoSelecaoContrato;
    },
  };
  const calendarios = {
    avaliar: async (...argumentos) => {
      chamadas.calendarios.push(argumentos);
      if (erroCalendario !== undefined) throw erroCalendario;
      return resultadoCalendario;
    },
  };
  const execucoes = {
    avancarNo: async (...argumentos) => chamadas.avancos.push(argumentos),
    agendarRetomada: async (...argumentos) =>
      chamadas.agendamentos.push(argumentos),
    transitar: async (...argumentos) => chamadas.transicoes.push(argumentos),
  };
  const transacao = { id: 'transacao-executor' };
  let emTransacao = false;
  const prisma = {
    executarTransacao: async (operacao) => {
      emTransacao = true;
      try {
        return await operacao(transacao);
      } finally {
        emTransacao = false;
      }
    },
  };
  const faturas = {
    contextoPermaneceValido: async (...argumentos) => {
      chamadas.faturas.push(['VALIDAR', emTransacao, ...argumentos]);
      return contextoFaturaValido;
    },
    executar: async (...argumentos) => {
      chamadas.faturas.push(['EXECUTAR', emTransacao, ...argumentos]);
      return resultadoFatura;
    },
    preparar: async (...argumentos) => {
      chamadas.faturas.push(['PREPARAR', emTransacao, ...argumentos]);
      return preparacaoFatura;
    },
    registrarComposicao: async (...argumentos) =>
      chamadas.faturas.push(['REGISTRAR', emTransacao, ...argumentos]),
  };
  const formularios = {
    formularioAtivoNoAtendimento: async (...argumentos) => {
      chamadas.formularios.push(argumentos);
      return formularioAtivo;
    },
  };
  const protocolosOrdens = {
    executar: async (...argumentos) => {
      chamadas.protocolosOrdens.push(['EXECUTAR', emTransacao, ...argumentos]);
      return resultadoProtocoloOrdem;
    },
    preparar: async (...argumentos) => {
      chamadas.protocolosOrdens.push(['PREPARAR', emTransacao, ...argumentos]);
      return preparacaoProtocoloOrdem;
    },
  };
  return {
    chamadas,
    executor: new ServicoExecutorNosFluxo(
      repositorioExecucoes,
      repositorioPassos,
      catalogo,
      calendarios,
      contextosCliente,
      mensagens,
      execucoes,
      prisma,
      faturas,
      formularios,
      protocolosOrdens,
    ),
    transacao,
  };
}

test('operação ERP do fluxo é preparada em transação e executada fora dela', async () => {
  const no = {
    id: 'protocolo',
    parametros: {},
    referencias: [],
    tipo: 'CRIAR_ATENDIMENTO',
    variaveisEntrada: [],
    variaveisSaida: [],
  };
  const preparacao = {
    atendimentoId: ids.atendimento,
    assunto: 'Atendimento omnichannel',
    chaveIdempotencia: randomUUID(),
    iniciadoEm: inicio,
    resultado: 'PRONTA',
    tipo: 'CRIAR_ATENDIMENTO',
  };
  const cenario = criarExecutor({
    no,
    preparacaoProtocoloOrdem: preparacao,
    resultadoProtocoloOrdem: { resultado: 'CRIADO' },
  });
  assert.equal(await cenario.executor.executarCiclo(1, () => depois(10)), 1);
  assert.equal(cenario.chamadas.protocolosOrdens[0][0], 'PREPARAR');
  assert.equal(cenario.chamadas.protocolosOrdens[0][1], true);
  assert.equal(cenario.chamadas.protocolosOrdens[1][0], 'EXECUTAR');
  assert.equal(cenario.chamadas.protocolosOrdens[1][1], false);
  assert.deepEqual(cenario.chamadas.passosFinalizados[0].saidaSanitizada, {
    resultado: 'CRIADO',
  });
});

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

test('espera persiste agenda e depois percorre timeout sem dormir no worker', async () => {
  const no = {
    id: 'aguardar',
    parametros: { tempoLimiteSegundos: 30, tipo: 'RESPOSTA' },
    referencias: [],
    tipo: 'AGUARDAR',
    variaveisEntrada: [],
    variaveisSaida: [],
  };
  const agendamento = criarExecutor({ no });
  await agendamento.executor.executarCiclo(1, () => depois(10));
  assert.deepEqual(
    agendamento.chamadas.passosFinalizados[0].saidaSanitizada,
    { resultado: 'AGENDADO' },
  );
  assert.equal(agendamento.chamadas.avancos.length, 0);
  assert.equal(agendamento.chamadas.agendamentos.length, 1);
  const entrada = agendamento.chamadas.agendamentos[0][0];
  assert.equal(entrada.estadoEspera, 'AGUARDANDO_RESPOSTA');
  assert.deepEqual(entrada.retomarEm, depois(40));
  assert.equal(
    entrada.contextoProtegido.esperasFluxo.aguardar.respostaRecebida,
    false,
  );

  const retomada = criarExecutor({
    contextoProtegido: entrada.contextoProtegido,
    no,
  });
  await retomada.executor.executarCiclo(1, () => depois(40));
  assert.deepEqual(retomada.chamadas.passosFinalizados[0].saidaSanitizada, {
    resultado: 'TIMEOUT',
  });
  assert.equal(
    retomada.chamadas.avancos[0][0].contextoProtegido.esperasFluxo,
    undefined,
  );
});

test('resposta retomada conclui espera e instante vencido avança sem agenda', async () => {
  const noResposta = {
    id: 'aguardar',
    parametros: { tempoLimiteSegundos: 30, tipo: 'RESPOSTA' },
    referencias: [],
    tipo: 'AGUARDAR',
    variaveisEntrada: [],
    variaveisSaida: [],
  };
  const resposta = criarExecutor({
    contextoProtegido: {
      esperasFluxo: {
        aguardar: {
          respostaRecebida: true,
          retomarEm: depois(40).toISOString(),
          tipo: 'RESPOSTA',
        },
      },
    },
    no: noResposta,
  });
  await resposta.executor.executarCiclo(1, () => depois(20));
  assert.equal(
    resposta.chamadas.passosFinalizados[0].saidaSanitizada.resultado,
    'CONCLUIDO',
  );

  const instante = criarExecutor({
    no: {
      id: 'aguardar',
      parametros: {
        retomarEm: depois(5).toISOString(),
        tipo: 'ATE_INSTANTE',
      },
      referencias: [],
      tipo: 'AGUARDAR',
      variaveisEntrada: [],
      variaveisSaida: [],
    },
  });
  await instante.executor.executarCiclo(1, () => depois(10));
  assert.equal(instante.chamadas.agendamentos.length, 0);
  assert.equal(
    instante.chamadas.passosFinalizados[0].saidaSanitizada.resultado,
    'CONCLUIDO',
  );
});

test('calendário real escolhe dentro, fora e falha nominal sanitizada', async () => {
  const calendarioId = randomUUID();
  const no = {
    id: 'horario',
    parametros: {},
    referencias: [{ recursoId: calendarioId, tipo: 'CALENDARIO' }],
    tipo: 'HORARIO_ATENDIMENTO',
    variaveisEntrada: [],
    variaveisSaida: [],
  };
  const aberto = criarExecutor({ no });
  await aberto.executor.executarCiclo(1, () => depois(10));
  assert.equal(
    aberto.chamadas.passosFinalizados[0].saidaSanitizada.resultado,
    'DENTRO_HORARIO',
  );
  assert.equal(aberto.chamadas.calendarios[0][0], calendarioId);

  const fechado = criarExecutor({
    no,
    resultadoCalendario: { estado: 'FECHADO' },
  });
  await fechado.executor.executarCiclo(1, () => depois(10));
  assert.equal(
    fechado.chamadas.passosFinalizados[0].saidaSanitizada.resultado,
    'FORA_HORARIO',
  );

  const ausente = criarExecutor({ erroCalendario: new ErroCalendarioAusente(), no });
  await ausente.executor.executarCiclo(1, () => depois(10));
  assert.equal(ausente.chamadas.passosFinalizados[0].codigoErro, 'CALENDARIO_INDISPONIVEL');
  assert.equal(ausente.chamadas.passosFinalizados[0].saidaSanitizada.resultado, 'FALHA');
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

test('identidade usa somente contexto explícito e não expõe seleção no passo', async () => {
  const identificado = criarExecutor({
    no: {
      id: 'identificar',
      parametros: {},
      referencias: [],
      tipo: 'IDENTIFICAR_CONTATO',
      variaveisEntrada: [],
      variaveisSaida: [],
    },
  });
  await identificado.executor.executarCiclo(1, () => depois(10));
  assert.equal(identificado.chamadas.contextos[0][0], 'IDENTIFICAR');
  assert.equal(identificado.chamadas.contextos[0][1], ids.atendimento);
  assert.equal(
    identificado.chamadas.passosFinalizados[0].saidaSanitizada.resultado,
    'IDENTIFICADO',
  );

  const ausente = criarExecutor({
    no: {
      id: 'identificar',
      parametros: {},
      referencias: [],
      tipo: 'IDENTIFICAR_CONTATO',
      variaveisEntrada: [],
      variaveisSaida: [],
    },
    resultadoIdentificacao: false,
  });
  await ausente.executor.executarCiclo(1, () => depois(10));
  assert.equal(
    ausente.chamadas.passosFinalizados[0].saidaSanitizada.resultado,
    'NAO_IDENTIFICADO',
  );
});

test('seleção de cliente e contrato exige UUID sensível recebido na entrada', async () => {
  const vinculoId = randomUUID();
  for (const [tipo, chamada] of [
    ['SELECIONAR_CLIENTE', 'CLIENTE'],
    ['SELECIONAR_CONTRATO', 'CONTRATO'],
  ]) {
    const cenario = criarExecutor({
      contextoProtegido: { variaveisFluxo: { selecao: vinculoId } },
      no: {
        id: 'selecionar',
        parametros: { variavel: 'selecao' },
        referencias: [],
        tipo,
        variaveisEntrada: ['selecao'],
        variaveisSaida: [],
      },
      variaveis: [
        {
          disponivelNaEntrada: true,
          nome: 'selecao',
          sensivel: true,
          tipo: 'UUID',
        },
      ],
    });
    await cenario.executor.executarCiclo(1, () => depois(10));
    assert.equal(cenario.chamadas.contextos[0][0], chamada);
    assert.equal(
      cenario.chamadas.passosFinalizados[0].saidaSanitizada.resultado,
      'SELECIONADO',
    );
    assert.equal(
      JSON.stringify(cenario.chamadas.passosFinalizados).includes(vinculoId),
      false,
    );
  }
});

test('seleção ausente não escolhe primeiro vínculo e pedido usa fallback oficial seguro', async () => {
  const selecao = criarExecutor({
    no: {
      id: 'selecionar',
      parametros: { variavel: 'selecao' },
      referencias: [],
      tipo: 'SELECIONAR_CLIENTE',
      variaveisEntrada: ['selecao'],
      variaveisSaida: [],
    },
    variaveis: [
      {
        disponivelNaEntrada: true,
        nome: 'selecao',
        sensivel: true,
        tipo: 'UUID',
      },
    ],
  });
  await selecao.executor.executarCiclo(1, () => depois(10));
  assert.equal(selecao.chamadas.contextos.length, 0);
  assert.equal(
    selecao.chamadas.passosFinalizados[0].saidaSanitizada.resultado,
    'NAO_SELECIONADO',
  );

  const mensagemId = randomUUID();
  const pedido = criarExecutor({
    no: {
      id: 'solicitar',
      parametros: { textoFallback: 'Compartilhe seus dados pelo canal seguro.' },
      referencias: [],
      tipo: 'SOLICITAR_DADOS_CONTATO',
      variaveisEntrada: [],
      variaveisSaida: [],
    },
    resultadoMensagem: {
      mensagem: { id: mensagemId },
      resultado: 'SUCESSO',
    },
  });
  await pedido.executor.executarCiclo(1, () => depois(10));
  assert.equal(pedido.chamadas.mensagens[0][0].tipo, 'TEXTO');
  assert.deepEqual(pedido.chamadas.passosFinalizados[0].saidaSanitizada, {
    mensagemId,
    resultado: 'FALLBACK',
  });
});

test('formulário ativo usa fallback oficial sem expor referência no passo', async () => {
  const formularioId = randomUUID();
  const mensagemId = randomUUID();
  const cenario = criarExecutor({
    no: {
      id: 'solicitarFormulario',
      parametros: { textoFallback: 'Vamos continuar pelo atendimento seguro.' },
      referencias: [
        { recursoId: formularioId, tipo: 'FORMULARIO_WHATSAPP' },
      ],
      tipo: 'SOLICITAR_FORMULARIO_WHATSAPP',
      variaveisEntrada: [],
      variaveisSaida: [],
    },
    resultadoMensagem: {
      mensagem: { id: mensagemId },
      resultado: 'SUCESSO',
    },
  });
  await cenario.executor.executarCiclo(1, () => depois(10));
  assert.deepEqual(cenario.chamadas.formularios[0].slice(0, 2), [
    formularioId,
    ids.atendimento,
  ]);
  assert.equal(cenario.chamadas.mensagens.length, 1);
  assert.deepEqual(cenario.chamadas.passosFinalizados[0].saidaSanitizada, {
    mensagemId,
    resultado: 'FALLBACK',
  });
  assert.equal(
    JSON.stringify(cenario.chamadas.passosFinalizados).includes(formularioId),
    false,
  );
});

test('formulário inativo ou de outra conta falha fechado sem enviar', async () => {
  const cenario = criarExecutor({
    formularioAtivo: false,
    no: {
      id: 'solicitarFormulario',
      parametros: { textoFallback: 'Fallback seguro.' },
      referencias: [
        { recursoId: randomUUID(), tipo: 'FORMULARIO_WHATSAPP' },
      ],
      tipo: 'SOLICITAR_FORMULARIO_WHATSAPP',
      variaveisEntrada: [],
      variaveisSaida: [],
    },
  });
  await cenario.executor.executarCiclo(1, () => depois(10));
  assert.equal(cenario.chamadas.mensagens.length, 0);
  assert.deepEqual(cenario.chamadas.passosFinalizados[0].saidaSanitizada, {
    resultado: 'FALHA',
  });
  assert.equal(
    cenario.chamadas.passosFinalizados[0].codigoErro,
    'FORMULARIO_INDISPONIVEL',
  );
});

test('consulta de fatura chama ERP fora da transação e guarda seleção somente no contexto', async () => {
  const contextoFinanceiro = {
    atendimentoId: ids.atendimento,
    contaWhatsAppId: randomUUID(),
    contatoId: randomUUID(),
    contratoExternoId: 'contrato-sintetico-078',
    versao: 3,
  };
  const selecao = {
    contextoAtendimentoVersao: 3,
    contratoExternoId: contextoFinanceiro.contratoExternoId,
    faturaExternaId: 'fatura-sintetica-078',
    situacao: 'ABERTA',
    valorCentavos: 12345,
    vencimento: '2026-09-10',
  };
  const preparacaoFatura = {
    contexto: contextoFinanceiro,
    resultado: 'PRONTA',
    tipo: 'CONSULTAR_FATURAS',
  };
  const cenario = criarExecutor({
    no: {
      id: 'consultarFatura',
      parametros: {},
      referencias: [],
      tipo: 'CONSULTAR_FATURAS',
      variaveisEntrada: [],
      variaveisSaida: [],
    },
    preparacaoFatura,
    resultadoFatura: { resultado: 'ENCONTRADA', selecao },
  });
  await cenario.executor.executarCiclo(1, () => depois(10));
  assert.equal(cenario.chamadas.faturas.find(([tipo]) => tipo === 'PREPARAR')[1], true);
  assert.equal(cenario.chamadas.faturas.find(([tipo]) => tipo === 'EXECUTAR')[1], false);
  assert.equal(cenario.chamadas.faturas.find(([tipo]) => tipo === 'VALIDAR')[1], true);
  assert.deepEqual(
    cenario.chamadas.avancos[0][0].contextoProtegido.faturaFluxo,
    selecao,
  );
  assert.deepEqual(cenario.chamadas.passosFinalizados[0].saidaSanitizada, {
    resultado: 'ENCONTRADA',
  });
  assert.equal(
    JSON.stringify(cenario.chamadas.passosFinalizados).includes(
      selecao.faturaExternaId,
    ),
    false,
  );
});

test('envio revalida seleção, registra composição e não expõe Pix no passo', async () => {
  const mensagemId = randomUUID();
  const contaWhatsAppId = randomUUID();
  const contatoId = randomUUID();
  const selecao = {
    contextoAtendimentoVersao: 4,
    contratoExternoId: 'contrato-sintetico-078',
    faturaExternaId: 'fatura-sintetica-078',
    situacao: 'VENCIDA',
    valorCentavos: 23456,
    vencimento: '2026-08-31',
  };
  const preparacaoFatura = {
    contexto: {
      atendimentoId: ids.atendimento,
      contaWhatsAppId,
      contatoId,
      contratoExternoId: selecao.contratoExternoId,
      versao: 4,
    },
    resultado: 'PRONTA',
    selecao,
    tipo: 'ENVIAR_FATURA',
  };
  const pix = '00020101021226880014BR.GOV.BCB.PIX';
  const composicao = {
    contaWhatsAppId,
    contatoId,
    criadaEm: depois(10),
    id: randomUUID(),
    incluiLinhaDigitavel: false,
    incluiLinkSeguro: false,
    incluiPdf: false,
    incluiPix: true,
    opcoesHash: 'a'.repeat(64),
    opcoesProtegidas: { pixCopiaCola: pix },
    referenciaFatura: selecao.faturaExternaId,
    textoProtegido: `Segunda via segura.\n\nPix copia e cola:\n${pix}`,
    valorCentavos: selecao.valorCentavos,
    vencimento: new Date('2026-08-31T00:00:00.000Z'),
  };
  const cenario = criarExecutor({
    contextoProtegido: { faturaFluxo: selecao },
    no: {
      id: 'enviarFatura',
      parametros: {},
      referencias: [],
      tipo: 'ENVIAR_FATURA',
      variaveisEntrada: [],
      variaveisSaida: [],
    },
    preparacaoFatura,
    resultadoFatura: { composicao, resultado: 'DADOS_INCOMPLETOS' },
    resultadoMensagem: { mensagem: { id: mensagemId }, resultado: 'SUCESSO' },
  });
  await cenario.executor.executarCiclo(1, () => depois(10));
  assert.equal(cenario.chamadas.faturas.find(([tipo]) => tipo === 'EXECUTAR')[1], false);
  assert.equal(cenario.chamadas.faturas.find(([tipo]) => tipo === 'REGISTRAR')[1], true);
  assert.equal(cenario.chamadas.mensagens[0][0].texto.includes(pix), true);
  assert.deepEqual(cenario.chamadas.passosFinalizados[0].saidaSanitizada, {
    mensagemId,
    resultado: 'DADOS_INCOMPLETOS',
  });
  assert.equal(JSON.stringify(cenario.chamadas.passosFinalizados).includes(pix), false);
  assert.equal(
    cenario.chamadas.avancos[0][0].contextoProtegido.faturaFluxo,
    undefined,
  );
});

test('definição de variável grava literal tipado somente no contexto protegido', async () => {
  const cenario = criarExecutor({
    no: {
      id: 'definir',
      parametros: { valor: '125.50', variavel: 'total' },
      referencias: [],
      tipo: 'DEFINIR_VARIAVEL',
      variaveisEntrada: [],
      variaveisSaida: ['total'],
    },
    variaveis: [
      {
        disponivelNaEntrada: false,
        nome: 'total',
        sensivel: false,
        tipo: 'DECIMAL',
      },
    ],
  });
  await cenario.executor.executarCiclo(1, () => depois(10));
  assert.deepEqual(cenario.chamadas.avancos[0][0].contextoProtegido, {
    variaveisFluxo: { total: '125.50' },
  });
  assert.deepEqual(cenario.chamadas.passosFinalizados[0].saidaSanitizada, {
    resultado: 'SUCESSO',
  });
  assert.equal(
    JSON.stringify(cenario.chamadas.passosFinalizados).includes('125.50'),
    false,
  );
  assert.equal(cenario.chamadas.mensagens.length, 0);
});

test('condição tipada escolhe verdadeiro sem expor valores no passo', async () => {
  const cenario = criarExecutor({
    contextoProtegido: { variaveisFluxo: { idade: 21 } },
    no: {
      id: 'condicao',
      parametros: { operador: 'MAIOR_OU_IGUAL', valor: 18, variavel: 'idade' },
      referencias: [],
      tipo: 'CONDICAO',
      variaveisEntrada: ['idade'],
      variaveisSaida: [],
    },
    variaveis: [
      {
        disponivelNaEntrada: true,
        nome: 'idade',
        sensivel: false,
        tipo: 'INTEIRO',
      },
    ],
  });
  await cenario.executor.executarCiclo(1, () => depois(10));
  assert.equal(cenario.chamadas.avancos[0][0].proximoNoId, 'fim');
  assert.deepEqual(cenario.chamadas.passosFinalizados[0].saidaSanitizada, {
    resultado: 'VERDADEIRO',
  });
  assert.equal(
    JSON.stringify(cenario.chamadas.passosFinalizados).includes('idade'),
    false,
  );
  assert.equal(
    JSON.stringify(cenario.chamadas.passosFinalizados).includes('"valor":18'),
    false,
  );
});

test('variável ausente percorre FALHA e limite encerra ciclo determinístico', async () => {
  const ausente = criarExecutor({
    no: {
      id: 'condicao',
      parametros: { operador: 'IGUAL', valor: true, variavel: 'ativo' },
      referencias: [],
      tipo: 'CONDICAO',
      variaveisEntrada: ['ativo'],
      variaveisSaida: [],
    },
    variaveis: [
      {
        disponivelNaEntrada: true,
        nome: 'ativo',
        sensivel: false,
        tipo: 'BOOLEANO',
      },
    ],
  });
  await ausente.executor.executarCiclo(1, () => depois(10));
  assert.equal(ausente.chamadas.passosFinalizados[0].estado, 'FALHOU');
  assert.equal(
    ausente.chamadas.passosFinalizados[0].codigoErro,
    'VARIAVEL_INDISPONIVEL',
  );
  assert.equal(
    ausente.chamadas.passosFinalizados[0].saidaSanitizada.resultado,
    'FALHA',
  );

  const limite = criarExecutor({
    contextoProtegido: {
      iteracoesFluxo: { condicao: 2 },
      variaveisFluxo: { ativo: true },
    },
    no: {
      id: 'condicao',
      limiteIteracoes: 2,
      parametros: { operador: 'IGUAL', valor: true, variavel: 'ativo' },
      referencias: [],
      tipo: 'CONDICAO',
      variaveisEntrada: ['ativo'],
      variaveisSaida: [],
    },
    variaveis: [
      {
        disponivelNaEntrada: true,
        nome: 'ativo',
        sensivel: false,
        tipo: 'BOOLEANO',
      },
    ],
  });
  await limite.executor.executarCiclo(1, () => depois(10));
  assert.equal(
    limite.chamadas.passosFinalizados[0].codigoErro,
    'LIMITE_ITERACOES_EXCEDIDO',
  );
  assert.equal(
    limite.chamadas.avancos[0][0].contextoProtegido.iteracoesFluxo.condicao,
    3,
  );

  const contadorInvalido = criarExecutor({
    contextoProtegido: {
      iteracoesFluxo: { condicao: 'reiniciar' },
      variaveisFluxo: { ativo: true },
    },
    no: {
      id: 'condicao',
      limiteIteracoes: 2,
      parametros: { operador: 'IGUAL', valor: true, variavel: 'ativo' },
      referencias: [],
      tipo: 'CONDICAO',
      variaveisEntrada: ['ativo'],
      variaveisSaida: [],
    },
    variaveis: [
      {
        disponivelNaEntrada: true,
        nome: 'ativo',
        sensivel: false,
        tipo: 'BOOLEANO',
      },
    ],
  });
  await contadorInvalido.executor.executarCiclo(1, () => depois(10));
  assert.equal(
    contadorInvalido.chamadas.passosFinalizados[0].codigoErro,
    'CONTEXTO_ITERACOES_INVALIDO',
  );
  assert.equal(
    contadorInvalido.chamadas.avancos[0][0].contextoProtegido,
    undefined,
  );
});

test('definição inválida falha isolada e não envenena a próxima execução', async () => {
  const invalida = execucao({ id: randomUUID(), noAtualId: 'ausente' });
  const valida = execucao({ id: randomUUID(), noAtualId: 'fim' });
  const fila = [invalida, valida];
  const falhas = [];
  const conclusoes = [];
  const repositorioExecucoes = {
    listarProntasParaExecutar: async (limite) => fila.splice(0, limite),
    obterPorId: async (id) => [invalida, valida].find((item) => item.id === id),
  };
  const repositorioPassos = {
    finalizar: async () => true,
    iniciar: async () => true,
  };
  const catalogo = {
    obterVersaoFixaExecucao: async () => ({
      definicao: {
        conexoes: [],
        inicioNoId: 'fim',
        nos: [
          {
            id: 'fim',
            parametros: {},
            referencias: [],
            tipo: 'FIM',
            variaveisEntrada: [],
            variaveisSaida: [],
          },
        ],
        variaveis: [],
        versaoSchema: 1,
      },
    }),
  };
  const execucoes = {
    avancarNo: async () => undefined,
    transitar: async (entrada) => {
      if (entrada.comando.tipo === 'FALHAR') falhas.push(entrada);
      if (entrada.comando.tipo === 'CONCLUIR') conclusoes.push(entrada);
    },
  };
  const prisma = {
    executarTransacao: async (operacao) => operacao({ id: randomUUID() }),
  };
  const executor = new ServicoExecutorNosFluxo(
    repositorioExecucoes,
    repositorioPassos,
    catalogo,
    { avaliar: async () => assert.fail('calendário inesperado') },
    {
      identificarParaFluxo: async () => assert.fail('contexto inesperado'),
      selecionarClientePorFluxo: async () => assert.fail('contexto inesperado'),
      selecionarContratoPorFluxo: async () => assert.fail('contexto inesperado'),
    },
    { criarAutomatica: async () => assert.fail('mensagem inesperada') },
    execucoes,
    prisma,
  );

  assert.equal(await executor.executarCiclo(10, () => depois(10)), 2);
  assert.equal(falhas.length, 1);
  assert.deepEqual(falhas[0].comando, {
    codigo: 'DEFINICAO_FLUXO_INVALIDA',
    tipo: 'FALHAR',
  });
  assert.equal(conclusoes.length, 1);
});
