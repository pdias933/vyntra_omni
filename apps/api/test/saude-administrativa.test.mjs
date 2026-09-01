import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ServicoSaudeAdministrativa } from '../dist/saude/servico-saude-administrativa.js';

const ids = {
  operacao: randomUUID(),
  sessao: randomUUID(),
  usuario: randomUUID(),
};
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2099-01-01T00:00:00.000Z'),
  sessaoId: ids.sessao,
  usuarioId: ids.usuario,
};
const agora = new Date('2026-09-01T20:00:00.000Z');

function criarCenario(estado = 'AGUARDANDO_NOVA_TENTATIVA') {
  const chamadas = { auditoria: [], ordem: [], atualizacoes: [] };
  const operacao = {
    atualizadoEm: new Date('2026-09-01T19:00:00.000Z'),
    codigoUltimoErro: 'INDISPONIBILIDADE_TEMPORARIA',
    estado,
    id: ids.operacao,
    proximaAcaoEm: new Date('2026-09-01T21:00:00.000Z'),
    tentativas: 2,
    tipo: 'CRIAR_ORDEM_SERVICO',
    versao: 3,
  };
  const transacao = {
    itemCaixaSaida: {
      count: async () => 4,
    },
    operacaoRecuperavel: {
      findMany: async () => [operacao],
      findUnique: async () => operacao,
      groupBy: async () => {
        chamadas.ordem.push('DADOS');
        return [
          { _count: { _all: 2 }, estado: 'AGUARDANDO_NOVA_TENTATIVA' },
          { _count: { _all: 1 }, estado: 'RESULTADO_INCERTO' },
        ];
      },
      updateMany: async (entrada) => {
        chamadas.atualizacoes.push(entrada);
        return { count: 1 };
      },
    },
  };
  const servico = new ServicoSaudeAdministrativa(
    {
      autorizar: async (_entrada, verificar) => {
        chamadas.ordem.push('AUTORIZAR');
        return verificar();
      },
    },
    {
      registrar: async (entrada) => chamadas.auditoria.push(entrada),
    },
    {
      executarLeituraConsistente: async (executar) => {
        chamadas.ordem.push('TRANSACAO');
        return executar(transacao);
      },
    },
    {
      verificar: async () => {
        chamadas.ordem.push('VERIFICAR');
        return { falhas: [], pronto: true };
      },
    },
  );
  return { chamadas, operacao, servico, transacao };
}

test('painel autoriza antes de observar componentes e falhas', async () => {
  const cenario = criarCenario();
  const painel = await cenario.servico.listar(sessao);
  assert.ok(
    cenario.chamadas.ordem.indexOf('AUTORIZAR') <
      cenario.chamadas.ordem.indexOf('DADOS'),
  );
  assert.ok(
    cenario.chamadas.ordem.indexOf('AUTORIZAR') <
      cenario.chamadas.ordem.indexOf('VERIFICAR'),
  );
  assert.equal(painel.componentes[0].codigo, 'API');
  assert.equal(painel.resumo.aguardandoNovaTentativa, 2);
  assert.equal(painel.resumo.resultadosIncertos, 1);
  assert.equal(painel.resumo.itensCaixaSaidaPendentes, 4);
  assert.equal(painel.operacoes[0].podeReprocessar, true);
});

test('reprocessar agora antecipa mantendo execução e reconciliação separadas', async () => {
  const cenario = criarCenario('RESULTADO_INCERTO');
  const resultado = await cenario.servico.reprocessarAgora(
    sessao,
    ids.operacao,
    3,
    cenario.transacao,
    agora,
  );
  assert.equal(resultado.estado, 'RESULTADO_INCERTO');
  assert.equal(resultado.versao, 4);
  assert.deepEqual(cenario.chamadas.atualizacoes[0].where.estado, {
    in: ['AGUARDANDO_NOVA_TENTATIVA', 'RESULTADO_INCERTO'],
  });
  assert.equal(cenario.chamadas.atualizacoes[0].data.proximaAcaoEm, agora);
  assert.equal(cenario.chamadas.auditoria.length, 1);
  assert.equal(
    cenario.chamadas.auditoria[0].tipoEvento,
    'OPERACAO_REPROCESSAMENTO_ANTECIPADO',
  );
});

test('estado terminal não é reaberto nem auditado', async () => {
  const cenario = criarCenario('FALHA_DEFINITIVA');
  const resultado = await cenario.servico.reprocessarAgora(
    sessao,
    ids.operacao,
    3,
    cenario.transacao,
    agora,
  );
  assert.equal(resultado, undefined);
  assert.equal(cenario.chamadas.atualizacoes.length, 0);
  assert.equal(cenario.chamadas.auditoria.length, 0);
});
