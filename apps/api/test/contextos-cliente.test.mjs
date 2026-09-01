import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroAlvoContextoIndisponivel,
  ErroConflitoVersaoContexto,
  ErroContextoAtendimentoInvalido,
} from '../dist/contextos-cliente/erros-contexto-cliente.js';
import { RepositorioContextosClientePrisma } from '../dist/contextos-cliente/repositorio-contextos-cliente-prisma.js';
import { ServicoContextosCliente } from '../dist/contextos-cliente/servico-contextos-cliente.js';

const agora = new Date('2026-09-01T01:00:00.000Z');
const ids = {
  atendimento: randomUUID(),
  contaWhatsApp: randomUUID(),
  cliente: randomUUID(),
  contato: randomUUID(),
  contrato: randomUUID(),
  fila: randomUUID(),
};
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2026-09-01T02:00:00.000Z'),
  sessaoId: randomUUID(),
  usuarioId: randomUUID(),
};
const alvo = {
  clienteExternoId: 'cliente-externo-sintetico',
  contatoId: ids.contato,
  contratoExternoId: 'contrato-externo-sintetico',
  vinculoClienteId: ids.cliente,
  vinculoContratoId: ids.contrato,
};

function criarCenario(sobrescritas = {}) {
  const chamadas = { alteracoes: [], auditoria: [], autorizacao: [], criacoes: [], ordem: [] };
  const contextoAtual = Object.hasOwn(sobrescritas, 'contextoAtual')
    ? sobrescritas.contextoAtual
    : {
        ...alvo,
        alteradoEm: agora,
        atendimentoId: ids.atendimento,
        origem: 'IDENTIFICACAO',
        versao: 1,
      };
  const repositorio = {
    alterar: async (...argumentos) => {
      chamadas.ordem.push('ALTERAR');
      chamadas.alteracoes.push(argumentos);
      return sobrescritas.alterado ?? true;
    },
    criar: async (...argumentos) => {
      chamadas.ordem.push('CRIAR');
      chamadas.criacoes.push(argumentos);
      return sobrescritas.criado ?? true;
    },
    obterAlvoAutomatizavel: async () => {
      chamadas.ordem.push('OBTER_ALVO_AUTOMATIZAVEL');
      return sobrescritas.alvoAutomatizavel === null
        ? undefined
        : (sobrescritas.alvoAutomatizavel ?? alvo);
    },
    obterAlvoAtivo: async () => {
      chamadas.ordem.push('OBTER_ALVO');
      return sobrescritas.alvo === null ? undefined : alvo;
    },
    obterContexto: async () => contextoAtual,
    obterOrigemDoAtendimento: async () =>
      sobrescritas.origemAtendimento === null
        ? undefined
        : {
            contaWhatsAppId: ids.contaWhatsApp,
            contatoId:
              sobrescritas.contatoAtendimento ?? ids.contato,
          },
    obterContatoDoAtendimento: async () =>
      sobrescritas.contatoAtendimento === null
        ? undefined
        : (sobrescritas.contatoAtendimento ?? ids.contato),
  };
  const autorizacao = {
    autorizar: async (pedido, verificar, transacao) => {
      chamadas.ordem.push('AUTORIZAR');
      chamadas.autorizacao.push(pedido);
      if (sobrescritas.erroAutorizacao !== undefined) {
        throw sobrescritas.erroAutorizacao;
      }
      const resultado = await verificar({}, transacao);
      if (!resultado.acessivel || !resultado.estadoPermiteAcao) {
        throw new Error('NEGADO');
      }
    },
  };
  const auditoria = {
    registrar: async (...argumentos) => {
      chamadas.ordem.push('AUDITAR');
      chamadas.auditoria.push(argumentos);
    },
  };
  return {
    chamadas,
    servico: new ServicoContextosCliente(repositorio, autorizacao, auditoria),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('repositório projeta a conta de origem real do atendimento', async () => {
  let consulta;
  const repositorio = new RepositorioContextosClientePrisma();
  const resultado = await repositorio.obterOrigemDoAtendimento(
    ids.atendimento,
    {
      atendimento: {
        findUnique: async (entrada) => {
          consulta = entrada;
          return {
            contaWhatsAppOrigemId: ids.contaWhatsApp,
            conversa: { contatoId: ids.contato },
          };
        },
      },
    },
  );
  assert.deepEqual(resultado, {
    contaWhatsAppId: ids.contaWhatsApp,
    contatoId: ids.contato,
  });
  assert.deepEqual(consulta.select, {
    contaWhatsAppOrigemId: true,
    conversa: { select: { contatoId: true } },
  });
});

test('inicializa alvo explícito e audita sem identificadores externos', async () => {
  const cenario = criarCenario();
  const contexto = await cenario.servico.inicializar(
    {
      atendimentoId: ids.atendimento,
      contatoId: ids.contato,
      origem: 'IDENTIFICACAO',
      vinculoClienteId: ids.cliente,
      vinculoContratoId: ids.contrato,
    },
    cenario.transacao,
    () => agora,
  );
  assert.equal(contexto.versao, 1);
  assert.equal(contexto.clienteExternoId, alvo.clienteExternoId);
  assert.deepEqual(cenario.chamadas.ordem, ['OBTER_ALVO', 'CRIAR', 'AUDITAR']);
  assert.equal(cenario.chamadas.criacoes[0][1], cenario.transacao);
  assert.equal(cenario.chamadas.auditoria[0][1], cenario.transacao);
  const auditado = JSON.stringify(cenario.chamadas.auditoria[0][0]);
  assert.ok(!auditado.includes(alvo.clienteExternoId));
  assert.ok(!auditado.includes(alvo.contratoExternoId));
});

test('alteração autoriza antes da mutação, incrementa versão e audita', async () => {
  const cenario = criarCenario();
  const contexto = await cenario.servico.alterar(
    sessao,
    {
      atendimentoId: ids.atendimento,
      filaId: ids.fila,
      versaoEsperada: 1,
      vinculoClienteId: ids.cliente,
      vinculoContratoId: ids.contrato,
    },
    cenario.transacao,
    () => agora,
  );
  assert.equal(contexto.origem, 'USUARIO');
  assert.equal(contexto.versao, 2);
  assert.equal(contexto.alteradoPorUsuarioId, sessao.usuarioId);
  assert.ok(cenario.chamadas.ordem.indexOf('AUTORIZAR') < cenario.chamadas.ordem.indexOf('ALTERAR'));
  assert.equal(cenario.chamadas.autorizacao[0].permissao, 'ALTERAR_CONTEXTO_CLIENTE');
  assert.equal(cenario.chamadas.autorizacao[0].filaId, ids.fila);
  assert.equal(cenario.chamadas.alteracoes[0][1], 1);
  assert.equal(cenario.chamadas.auditoria[0][1], cenario.transacao);
});

test('alvo que não pertence ao contato é negado sem mutação', async () => {
  const cenario = criarCenario({ alvo: null });
  await assert.rejects(
    cenario.servico.alterar(
      sessao,
      {
        atendimentoId: ids.atendimento,
        filaId: ids.fila,
        versaoEsperada: 1,
        vinculoClienteId: ids.cliente,
      },
      cenario.transacao,
    ),
  );
  assert.equal(cenario.chamadas.alteracoes.length, 0);
  assert.equal(cenario.chamadas.auditoria.length, 0);
});

test('conflito otimista não audita alteração inexistente', async () => {
  const cenario = criarCenario({ alterado: false });
  await assert.rejects(
    cenario.servico.alterar(
      sessao,
      {
        atendimentoId: ids.atendimento,
        filaId: ids.fila,
        versaoEsperada: 1,
        vinculoClienteId: ids.cliente,
      },
      cenario.transacao,
    ),
    ErroConflitoVersaoContexto,
  );
  assert.equal(cenario.chamadas.auditoria.length, 0);
});

test('entrada inválida e alvo inicial ausente falham antes de persistir', async () => {
  const invalido = criarCenario();
  await assert.rejects(
    invalido.servico.inicializar(
      {
        atendimentoId: 'invalido',
        contatoId: ids.contato,
        origem: 'SISTEMA',
        vinculoClienteId: ids.cliente,
      },
      invalido.transacao,
    ),
    ErroContextoAtendimentoInvalido,
  );
  assert.equal(invalido.chamadas.criacoes.length, 0);

  const semAlvo = criarCenario({ alvo: null });
  await assert.rejects(
    semAlvo.servico.inicializar(
      {
        atendimentoId: ids.atendimento,
        contatoId: ids.contato,
        origem: 'SISTEMA',
        vinculoClienteId: ids.cliente,
      },
      semAlvo.transacao,
    ),
    ErroAlvoContextoIndisponivel,
  );
});

test('identificação do fluxo exige contexto explícito e vínculo automatizável exato', async () => {
  const identificado = criarCenario();
  assert.equal(
    await identificado.servico.identificarParaFluxo(
      ids.atendimento,
      identificado.transacao,
    ),
    true,
  );

  const semContexto = criarCenario({ contextoAtual: undefined });
  assert.equal(
    await semContexto.servico.identificarParaFluxo(
      ids.atendimento,
      semContexto.transacao,
    ),
    false,
  );
  const inseguro = criarCenario({ alvoAutomatizavel: null });
  assert.equal(
    await inseguro.servico.identificarParaFluxo(
      ids.atendimento,
      inseguro.transacao,
    ),
    false,
  );
});

test('contexto financeiro do fluxo exige contrato e vínculo automatizável exatos', async () => {
  const cenario = criarCenario();
  assert.deepEqual(
    await cenario.servico.obterContextoFinanceiroParaFluxo(
      ids.atendimento,
      cenario.transacao,
    ),
    {
      atendimentoId: ids.atendimento,
      contaWhatsAppId: ids.contaWhatsApp,
      contatoId: ids.contato,
      contratoExternoId: alvo.contratoExternoId,
      versao: 1,
    },
  );
  const semContrato = criarCenario({
    contextoAtual: {
      alteradoEm: agora,
      atendimentoId: ids.atendimento,
      clienteExternoId: alvo.clienteExternoId,
      contatoId: ids.contato,
      origem: 'FLUXO',
      versao: 1,
      vinculoClienteId: ids.cliente,
    },
  });
  assert.equal(
    await semContrato.servico.obterContextoFinanceiroParaFluxo(
      ids.atendimento,
      semContrato.transacao,
    ),
    undefined,
  );
});

test('fluxo seleciona cliente exato sem contrato e audita somente referências internas', async () => {
  const alvoCliente = {
    clienteExternoId: alvo.clienteExternoId,
    contatoId: alvo.contatoId,
    vinculoClienteId: alvo.vinculoClienteId,
  };
  const cenario = criarCenario({
    alvoAutomatizavel: alvoCliente,
    contextoAtual: undefined,
  });
  assert.equal(
    await cenario.servico.selecionarClientePorFluxo(
      {
        atendimentoId: ids.atendimento,
        fluxoId: randomUUID(),
        versaoFluxoId: randomUUID(),
        vinculoClienteId: ids.cliente,
      },
      cenario.transacao,
      () => agora,
    ),
    true,
  );
  assert.equal(cenario.chamadas.criacoes.length, 1);
  assert.equal(cenario.chamadas.criacoes[0][0].origem, 'FLUXO');
  assert.equal(cenario.chamadas.criacoes[0][0].vinculoContratoId, undefined);
  assert.equal(cenario.chamadas.auditoria[0][0].origem, 'FLUXO');
  const auditado = JSON.stringify(cenario.chamadas.auditoria[0][0]);
  assert.equal(auditado.includes(alvo.clienteExternoId), false);
  assert.equal(auditado.includes(alvo.contratoExternoId), false);
});

test('fluxo seleciona contrato do cliente atual e repetição é idempotente', async () => {
  const cenario = criarCenario({
    contextoAtual: {
      clienteExternoId: alvo.clienteExternoId,
      contatoId: alvo.contatoId,
      alteradoEm: agora,
      atendimentoId: ids.atendimento,
      origem: 'FLUXO',
      versao: 1,
      vinculoClienteId: alvo.vinculoClienteId,
    },
  });
  const entrada = {
    atendimentoId: ids.atendimento,
    fluxoId: randomUUID(),
    versaoFluxoId: randomUUID(),
    vinculoContratoId: ids.contrato,
  };
  assert.equal(
    await cenario.servico.selecionarContratoPorFluxo(
      entrada,
      cenario.transacao,
      () => agora,
    ),
    true,
  );
  assert.equal(cenario.chamadas.alteracoes.length, 1);
  assert.equal(cenario.chamadas.alteracoes[0][0].vinculoContratoId, ids.contrato);

  const repetido = criarCenario();
  assert.equal(
    await repetido.servico.selecionarContratoPorFluxo(
      entrada,
      repetido.transacao,
      () => agora,
    ),
    true,
  );
  assert.equal(repetido.chamadas.alteracoes.length, 0);
  assert.equal(repetido.chamadas.auditoria.length, 0);
});

test('fluxo não seleciona vínculo ausente, revogado ou sem prova automatizável', async () => {
  const cenario = criarCenario({
    alvoAutomatizavel: null,
    contextoAtual: undefined,
  });
  assert.equal(
    await cenario.servico.selecionarClientePorFluxo(
      {
        atendimentoId: ids.atendimento,
        fluxoId: randomUUID(),
        versaoFluxoId: randomUUID(),
        vinculoClienteId: ids.cliente,
      },
      cenario.transacao,
    ),
    false,
  );
  assert.equal(cenario.chamadas.criacoes.length, 0);
  assert.equal(cenario.chamadas.auditoria.length, 0);
});
