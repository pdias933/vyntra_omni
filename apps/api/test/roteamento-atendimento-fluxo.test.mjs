import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ServicoAtribuicoesAtendimento } from '../dist/atribuicoes-atendimento/servico-atribuicoes-atendimento.js';

const agora = new Date('2026-09-01T19:00:00.000Z');
const ids = {
  atendimento: randomUUID(),
  conta: randomUUID(),
  conversa: randomUUID(),
  execucao: randomUUID(),
  fila: randomUUID(),
  fluxo: randomUUID(),
  usuario: randomUUID(),
  versao: randomUUID(),
};
const ator = {
  execucaoFluxoId: ids.execucao,
  fluxoId: ids.fluxo,
  versaoFluxoId: ids.versao,
};

function atendimentoBot(sobrescritas = {}) {
  return {
    atualizadoEm: new Date('2026-09-01T18:00:00.000Z'),
    contaWhatsAppOrigemId: ids.conta,
    conversaId: ids.conversa,
    estado: 'AGUARDANDO',
    id: ids.atendimento,
    iniciadoEm: new Date('2026-09-01T17:00:00.000Z'),
    modo: 'BOT',
    motivoEspera: 'PROCESSANDO_BOT',
    versaoAtribuicao: 3,
    versaoEstado: 5,
    ...sobrescritas,
  };
}

function criarCenario(atual = atendimentoBot(), filaAtiva = true) {
  const chamadas = {
    auditorias: [],
    encerramentos: [],
    eventos: [],
    historicos: [],
    transferencias: [],
  };
  const repositorio = {
    bloquearParaFluxo: async () => undefined,
    encaminharParaFilaPorFluxoCondicional: async (proximo) => {
      chamadas.transferencias.push(proximo);
      return true;
    },
    encerrarPorFluxoCondicional: async (proximo) => {
      chamadas.encerramentos.push(proximo);
      return true;
    },
    filaEstaAtiva: async () => filaAtiva,
    obterParaFluxo: async () => atual,
  };
  const servico = new ServicoAtribuicoesAtendimento(
    repositorio,
    {},
    {
      inicializar: async (...argumentos) =>
        chamadas.historicos.push(argumentos),
    },
    {
      acrescentar: async (entrada) => chamadas.eventos.push(entrada),
    },
    {
      registrar: async (entrada) => chamadas.auditorias.push(entrada),
    },
  );
  return { chamadas, servico };
}

test('fluxo encaminha BOT para fila ativa sem fabricar usuário', async () => {
  const cenario = criarCenario();
  assert.equal(
    await cenario.servico.encaminharParaFilaPorFluxo(
      ator,
      ids.atendimento,
      ids.fila,
      {},
      () => agora,
    ),
    true,
  );
  const proximo = cenario.chamadas.transferencias[0];
  assert.equal(proximo.estado, 'AGUARDANDO');
  assert.equal(proximo.modo, 'FILA_HUMANA');
  assert.equal(proximo.motivoEspera, 'AGUARDANDO_HUMANO');
  assert.equal(proximo.filaAtualId, ids.fila);
  assert.equal(proximo.usuarioResponsavelId, undefined);
  assert.equal(cenario.chamadas.historicos[0][1].tipo, 'ENTRADA_FILA');
  assert.equal(cenario.chamadas.historicos[0][1].executadoPorUsuarioId, undefined);
  assert.equal(cenario.chamadas.eventos[0].usuarioAtorId, undefined);
  assert.equal(cenario.chamadas.auditorias[0].origem, 'FLUXO');
  assert.equal(cenario.chamadas.auditorias[0].usuarioId, undefined);
  assert.equal(cenario.chamadas.auditorias[0].sessaoId, undefined);
});

test('fila inativa ou autoridade humana recusam o encaminhamento', async () => {
  const inativa = criarCenario(atendimentoBot(), false);
  assert.equal(
    await inativa.servico.encaminharParaFilaPorFluxo(
      ator,
      ids.atendimento,
      ids.fila,
      {},
    ),
    false,
  );
  const humano = criarCenario(
    atendimentoBot({
      estado: 'EM_ATENDIMENTO',
      filaAtualId: ids.fila,
      modo: 'HUMANO',
      motivoEspera: 'NENHUM',
      usuarioResponsavelId: ids.usuario,
    }),
  );
  assert.equal(
    await humano.servico.encaminharParaFilaPorFluxo(
      ator,
      ids.atendimento,
      ids.fila,
      {},
    ),
    false,
  );
  assert.equal(inativa.chamadas.transferencias.length, 0);
  assert.equal(humano.chamadas.transferencias.length, 0);
});

test('espera distingue fila pendente, humano e contexto inválido', async () => {
  const pendente = criarCenario(
    atendimentoBot({
      filaAtualId: ids.fila,
      modo: 'FILA_HUMANA',
      motivoEspera: 'AGUARDANDO_HUMANO',
    }),
  );
  assert.equal(
    await pendente.servico.consultarEsperaAtendentePorFluxo(
      ator,
      ids.atendimento,
      ids.fila,
      {},
    ),
    'AGUARDANDO',
  );
  const humano = criarCenario(
    atendimentoBot({
      estado: 'EM_ATENDIMENTO',
      filaAtualId: ids.fila,
      modo: 'HUMANO',
      motivoEspera: 'NENHUM',
      usuarioResponsavelId: ids.usuario,
    }),
  );
  assert.equal(
    await humano.servico.consultarEsperaAtendentePorFluxo(
      ator,
      ids.atendimento,
      ids.fila,
      {},
    ),
    'ATENDIDO',
  );
  assert.equal(
    await criarCenario().servico.consultarEsperaAtendentePorFluxo(
      ator,
      ids.atendimento,
      ids.fila,
      {},
    ),
    'INVALIDO',
  );
});

test('encerramento por fluxo congela fallback e não expõe o motivo', async () => {
  const cenario = criarCenario();
  assert.equal(
    await cenario.servico.encerrarPorFluxo(
      ator,
      ids.atendimento,
      ids.fila,
      'Fluxo concluído',
      {},
      () => agora,
    ),
    true,
  );
  const proximo = cenario.chamadas.encerramentos[0];
  assert.equal(proximo.estado, 'ENCERRADO_REABRIVEL');
  assert.equal(proximo.encerradoPorTipo, 'FLUXO');
  assert.equal(proximo.encerradoPorId, ids.fluxo);
  assert.equal(proximo.filaFallbackReaberturaId, ids.fila);
  assert.ok(!JSON.stringify(cenario.chamadas.eventos).includes('Fluxo concluído'));
  assert.ok(!JSON.stringify(cenario.chamadas.auditorias).includes('Fluxo concluído'));
  assert.equal(cenario.chamadas.auditorias[0].origem, 'FLUXO');
});
