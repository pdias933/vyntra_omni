import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroConflitoHistoricoAtribuicao,
  ErroHistoricoAtribuicaoInvalido,
} from '../dist/historico-atribuicao/erros-historico-atribuicao.js';
import { ServicoHistoricoAtribuicao } from '../dist/historico-atribuicao/servico-historico-atribuicao.js';

const ids = {
  atendimento: randomUUID(),
  executor: randomUUID(),
  fila: randomUUID(),
  responsavel: randomUUID(),
};
const inicio = new Date('2026-09-01T12:00:00.000Z');
const troca = new Date('2026-09-01T12:05:00.000Z');

function cenario(opcoes = {}) {
  let aberto = opcoes.aberto;
  const criados = [];
  const finalizados = [];
  const repositorio = {
    bloquearAtendimento: async () => {},
    criar: async (valor) => {
      if (opcoes.criacaoFalha) return false;
      aberto = valor;
      criados.push(valor);
      return true;
    },
    finalizar: async (id, data) => {
      if (opcoes.finalizacaoFalha) return false;
      finalizados.push({ data, id });
      aberto = undefined;
      return true;
    },
    obterAberto: async () => aberto,
    obterAtribuicaoAtendimento: async () =>
      opcoes.atribuicao ?? {
        filaId: ids.fila,
        usuarioResponsavelId: opcoes.responsavel ? ids.responsavel : undefined,
      },
  };
  return {
    criados,
    finalizados,
    servico: new ServicoHistoricoAtribuicao(repositorio),
  };
}

test('inicializa exatamente um intervalo de entrada em fila', async () => {
  const x = cenario();
  const historico = await x.servico.inicializar(
    ids.atendimento,
    { filaId: ids.fila, tipo: 'ENTRADA_FILA' },
    {},
    () => inicio,
  );
  assert.equal(historico.iniciadoEm, inicio);
  assert.equal(historico.tipo, 'ENTRADA_FILA');
  assert.equal(x.criados.length, 1);
});

test('substituição fecha intervalo anterior e abre responsabilidade humana no mesmo instante', async () => {
  const anterior = {
    atendimentoId: ids.atendimento,
    filaId: ids.fila,
    id: randomUUID(),
    iniciadoEm: inicio,
    tipo: 'ENTRADA_FILA',
  };
  const x = cenario({ aberto: anterior, responsavel: true });
  const atual = await x.servico.substituir(
    ids.atendimento,
    {
      executadoPorUsuarioId: ids.executor,
      filaId: ids.fila,
      tipo: 'RESGATE',
      usuarioResponsavelId: ids.responsavel,
    },
    {},
    () => troca,
  );
  assert.deepEqual(x.finalizados, [{ data: troca, id: anterior.id }]);
  assert.equal(atual.iniciadoEm, troca);
  assert.equal(atual.usuarioResponsavelId, ids.responsavel);
});

test('não permite segundo intervalo aberto nem histórico divergente do atendimento', async () => {
  const aberto = {
    atendimentoId: ids.atendimento,
    filaId: ids.fila,
    id: randomUUID(),
    iniciadoEm: inicio,
    tipo: 'ENTRADA_FILA',
  };
  await assert.rejects(
    cenario({ aberto }).servico.inicializar(
      ids.atendimento,
      { filaId: ids.fila, tipo: 'ENTRADA_FILA' },
      {},
    ),
    ErroConflitoHistoricoAtribuicao,
  );
  await assert.rejects(
    cenario({ atribuicao: { filaId: randomUUID() } }).servico.inicializar(
      ids.atendimento,
      { filaId: ids.fila, tipo: 'ENTRADA_FILA' },
      {},
    ),
    ErroConflitoHistoricoAtribuicao,
  );
});

test('recusa combinação de tipo, responsável e relógio inválidos', async () => {
  await assert.rejects(
    cenario().servico.inicializar(
      ids.atendimento,
      {
        filaId: ids.fila,
        tipo: 'ENTRADA_FILA',
        usuarioResponsavelId: ids.responsavel,
      },
      {},
    ),
    ErroHistoricoAtribuicaoInvalido,
  );
  const aberto = {
    atendimentoId: ids.atendimento,
    filaId: ids.fila,
    id: randomUUID(),
    iniciadoEm: troca,
    tipo: 'ENTRADA_FILA',
  };
  await assert.rejects(
    cenario({ aberto, responsavel: true }).servico.substituir(
      ids.atendimento,
      {
        filaId: ids.fila,
        tipo: 'RESGATE',
        usuarioResponsavelId: ids.responsavel,
      },
      {},
      () => inicio,
    ),
    ErroHistoricoAtribuicaoInvalido,
  );
});
