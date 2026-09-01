import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ServicoDesbloqueiosFluxo } from '../dist/execucoes-fluxo/servico-desbloqueios-fluxo.js';

const ids = {
  atendimento: randomUUID(),
  execucao: randomUUID(),
  fluxo: randomUUID(),
  versao: randomUUID(),
};
const execucao = {
  atendimentoId: ids.atendimento,
  atualizadaEm: new Date('2026-09-01T18:00:00.000Z'),
  contextoProtegido: {},
  estado: 'EXECUTANDO',
  fluxoId: ids.fluxo,
  id: ids.execucao,
  iniciadaEm: new Date('2026-09-01T18:00:00.000Z'),
  noAtualId: 'desbloqueio',
  revisao: 2,
  versaoFluxoId: ids.versao,
};

function no(tipo, parametros = {}) {
  return {
    id: 'desbloqueio',
    parametros,
    referencias: [],
    tipo,
    variaveisEntrada: [],
    variaveisSaida: [],
  };
}

function transacao(sobrescritas = {}) {
  return {
    atendimento: {
      findUnique: async () => ({
        contexto: { contratoExternoAtivoId: 'contrato-erp-1' },
        estado: 'AGUARDANDO',
        filaAtualId: null,
        modo: 'BOT',
        usuarioResponsavelId: null,
        ...sobrescritas,
      }),
    },
  };
}

test('provider ausente mantém verificação e execução sem efeito', async () => {
  const chamadas = [];
  const servico = new ServicoDesbloqueiosFluxo(
    { verificarParaFluxo: async () => chamadas.push('VERIFICAR') },
    { executar: async () => chamadas.push('EXECUTAR') },
  );
  const verificacao = await servico.preparar(
    no('VERIFICAR_DESBLOQUEIO_CONFIANCA'),
    execucao,
    transacao(),
  );
  const execucaoConfirmada = await servico.preparar(
    no('EXECUTAR_DESBLOQUEIO_CONFIANCA', {
      confirmacaoExplicita: true,
    }),
    execucao,
    transacao(),
  );
  assert.deepEqual(await servico.executar(verificacao), {
    resultado: 'INDISPONIVEL',
  });
  assert.deepEqual(await servico.executar(execucaoConfirmada), {
    codigo: 'INTEGRACAO_ERP_INDISPONIVEL',
    resultado: 'FALHA',
  });
  assert.deepEqual(chamadas, []);
});

test('verificação usa tempo real sem executar o desbloqueio', async () => {
  const chamadas = [];
  const adaptador = {};
  const servico = new ServicoDesbloqueiosFluxo(
    {
      verificarParaFluxo: async (...argumentos) => {
        chamadas.push(argumentos);
        return {
          consultadoEm: new Date(),
          elegivel: true,
          motivos: [],
          origem: 'TEMPO_REAL',
          resultado: 'SUCESSO',
        };
      },
    },
    { executar: async () => assert.fail('efeito inesperado') },
    adaptador,
  );
  const preparacao = await servico.preparar(
    no('VERIFICAR_DESBLOQUEIO_CONFIANCA'),
    execucao,
    transacao(),
  );
  assert.deepEqual(await servico.executar(preparacao), {
    resultado: 'ELEGIVEL',
  });
  assert.deepEqual(chamadas[0][0], {
    fluxoId: ids.fluxo,
    versaoFluxoId: ids.versao,
  });
  assert.equal(chamadas[0][1].filaId, undefined);
  assert.equal(chamadas[0][2], adaptador);
});

test('execução confirmada deriva contrato e chave estável sem fila', async () => {
  const chamadas = [];
  const adaptador = {};
  const servico = new ServicoDesbloqueiosFluxo(
    { verificarParaFluxo: async () => assert.fail('verificação isolada') },
    {
      executar: async (...argumentos) => {
        chamadas.push(argumentos);
        return { operacaoId: randomUUID(), situacao: 'CONCLUIDO' };
      },
    },
    adaptador,
  );
  const definicao = no('EXECUTAR_DESBLOQUEIO_CONFIANCA', {
    confirmacaoExplicita: true,
  });
  const primeira = await servico.preparar(
    definicao,
    execucao,
    transacao(),
  );
  const repetida = await servico.preparar(
    definicao,
    { ...execucao, revisao: 3 },
    transacao(),
  );
  assert.equal(primeira.chaveIdempotencia, repetida.chaveIdempotencia);
  assert.deepEqual(await servico.executar(primeira), {
    resultado: 'CONCLUIDO',
  });
  assert.equal(chamadas[0][1].confirmacaoExplicita, true);
  assert.equal(chamadas[0][1].contratoExternoId, 'contrato-erp-1');
  assert.equal(chamadas[0][1].filaId, undefined);
  assert.equal(chamadas[0][2], adaptador);
});

test('contexto humano ou configuração livre falham antes do adapter', async () => {
  const servico = new ServicoDesbloqueiosFluxo(
    { verificarParaFluxo: async () => assert.fail('consulta inesperada') },
    { executar: async () => assert.fail('efeito inesperado') },
    {},
  );
  const contextoHumano = await servico.preparar(
    no('VERIFICAR_DESBLOQUEIO_CONFIANCA'),
    execucao,
    transacao({ filaAtualId: randomUUID(), modo: 'HUMANO' }),
  );
  assert.deepEqual(contextoHumano, {
    codigo: 'CONTEXTO_DESBLOQUEIO_INDISPONIVEL',
    resultado: 'FALHA',
    tipo: 'VERIFICAR_DESBLOQUEIO_CONFIANCA',
  });
  const payloadLivre = await servico.preparar(
    no('EXECUTAR_DESBLOQUEIO_CONFIANCA', {
      confirmacaoExplicita: true,
      contratoExternoId: 'nao-aceitar',
    }),
    execucao,
    transacao(),
  );
  assert.equal(payloadLivre.resultado, 'FALHA');
});
