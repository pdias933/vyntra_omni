import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroConflitoSnapshotCliente,
  ErroSnapshotClienteInvalido,
  ErroVinculoSnapshotIndisponivel,
} from '../dist/snapshots-cliente/erros-snapshot-cliente.js';
import { ServicoSnapshotsCliente } from '../dist/snapshots-cliente/servico-snapshots-cliente.js';

const vinculoClienteId = randomUUID();
const vinculoContratoId = randomUUID();
const capturadoEm = new Date('2026-09-01T00:00:00.000Z');
const agora = new Date('2026-09-01T01:00:00.000Z');

function entrada(sobrescritas = {}) {
  return {
    capturadoEm,
    dados: {
      contratosConhecidos: [
        {
          situacao: 'ATIVO',
          servico: 'Fibra sintética',
          vinculoContratoId,
        },
      ],
      documentoMascarado: '***.456.***-**',
      nomeExibicao: 'Cliente Sintético',
    },
    vinculoClienteId,
    ...sobrescritas,
  };
}

function criarCenario(sobrescritas = {}) {
  const chamadas = { atualizacoes: [], bloqueios: [], criacoes: [], ordem: [] };
  const repositorio = {
    atualizar: async (...argumentos) => {
      chamadas.ordem.push('ATUALIZAR');
      chamadas.atualizacoes.push(argumentos);
      return sobrescritas.atualizado ?? true;
    },
    bloquearVinculo: async (...argumentos) => {
      chamadas.ordem.push('BLOQUEAR');
      chamadas.bloqueios.push(argumentos);
    },
    criar: async (...argumentos) => {
      chamadas.ordem.push('CRIAR');
      chamadas.criacoes.push(argumentos);
    },
    obterPorVinculo: async () => sobrescritas.existente,
    vinculoEstaAtivo: async () => sobrescritas.ativo ?? true,
  };
  return {
    chamadas,
    servico: new ServicoSnapshotsCliente(repositorio),
    transacao: { id: 'transacao-sintetica' },
  };
}

function snapshotExistente(sobrescritas = {}) {
  return {
    atualizadoEm: agora,
    capturadoEm,
    conteudoHash: 'a'.repeat(64),
    dadosProtegidos: { nomeExibicao: 'Cliente anterior' },
    estado: 'ATUAL',
    id: randomUUID(),
    origem: 'INTEGRACAO_ERP',
    persistidoEm: agora,
    versao: 1,
    vinculoClienteId,
    ...sobrescritas,
  };
}

test('cria snapshot protegido sob lock do vínculo ativo', async () => {
  const cenario = criarCenario();
  const resultado = await cenario.servico.atualizar(
    entrada(),
    cenario.transacao,
    () => agora,
  );
  assert.equal(resultado.situacao, 'ATUALIZADO');
  assert.equal(resultado.snapshot.origem, 'INTEGRACAO_ERP');
  assert.equal(resultado.snapshot.versao, 1);
  assert.match(resultado.snapshot.conteudoHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(cenario.chamadas.ordem, ['BLOQUEAR', 'CRIAR']);
  assert.equal(cenario.chamadas.criacoes[0][1], cenario.transacao);
  assert.equal(
    resultado.snapshot.dadosProtegidos.documentoMascarado,
    '***.456.***-**',
  );
});

test('snapshot mais novo avança versão por atualização condicional', async () => {
  const existente = snapshotExistente();
  const cenario = criarCenario({ existente });
  const resultado = await cenario.servico.atualizar(
    entrada({ capturadoEm: new Date('2026-09-01T00:30:00.000Z') }),
    cenario.transacao,
    () => agora,
  );
  assert.equal(resultado.snapshot.versao, 2);
  assert.equal(cenario.chamadas.atualizacoes[0][1], 1);
  assert.equal(cenario.chamadas.atualizacoes[0][2], cenario.transacao);
});

test('evento antigo é ignorado e repetição idêntica é idempotente', async () => {
  const inicial = criarCenario();
  const criado = await inicial.servico.atualizar(
    entrada(),
    inicial.transacao,
    () => agora,
  );
  const repetido = criarCenario({ existente: criado.snapshot });
  const repeticao = await repetido.servico.atualizar(
    entrada(),
    repetido.transacao,
    () => agora,
  );
  assert.equal(repeticao.situacao, 'REPETIDO');
  const antigo = criarCenario({ existente: criado.snapshot });
  const ignorado = await antigo.servico.atualizar(
    entrada({ capturadoEm: new Date('2026-08-31T23:59:00.000Z') }),
    antigo.transacao,
    () => agora,
  );
  assert.equal(ignorado.situacao, 'IGNORADO_MAIS_ANTIGO');
  assert.equal(antigo.chamadas.atualizacoes.length, 0);
});

test('mesmo instante com conteúdo divergente falha fechado', async () => {
  const cenario = criarCenario({ existente: snapshotExistente() });
  await assert.rejects(
    cenario.servico.atualizar(entrada(), cenario.transacao, () => agora),
    ErroConflitoSnapshotCliente,
  );
  assert.equal(cenario.chamadas.atualizacoes.length, 0);
});

test('vínculo revogado e documento bruto nunca são persistidos', async () => {
  const revogado = criarCenario({ ativo: false });
  await assert.rejects(
    revogado.servico.atualizar(entrada(), revogado.transacao, () => agora),
    ErroVinculoSnapshotIndisponivel,
  );
  assert.equal(revogado.chamadas.criacoes.length, 0);

  const bruto = criarCenario();
  await assert.rejects(
    bruto.servico.atualizar(
      entrada({ dados: { cpf: '12345678900', nomeExibicao: 'Cliente' } }),
      bruto.transacao,
      () => agora,
    ),
    ErroSnapshotClienteInvalido,
  );
  assert.equal(bruto.chamadas.bloqueios.length, 0);
});

test('leitura declara SNAPSHOT e calcula idade sem consultar Redis', async () => {
  const cenario = criarCenario({ existente: snapshotExistente() });
  const leitura = await cenario.servico.consultar(
    vinculoClienteId,
    cenario.transacao,
    () => agora,
  );
  assert.equal(leitura.origem, 'SNAPSHOT');
  assert.equal(leitura.origemAtualizacao, 'INTEGRACAO_ERP');
  assert.equal(leitura.estado, 'ATUAL');
  assert.equal(leitura.idadeSegundos, 3_600);
  assert.equal(cenario.chamadas.atualizacoes.length, 0);
});

test('tombstone preserva dados e torna exclusão visível', async () => {
  const existente = snapshotExistente();
  const cenario = criarCenario({ existente });
  const resultado = await cenario.servico.marcarObsolescencia(
    {
      evidenciadaEm: new Date('2026-09-01T00:30:00.000Z'),
      motivo: 'TOMBSTONE_ERP',
      vinculoClienteId,
    },
    cenario.transacao,
    () => agora,
  );
  assert.equal(resultado.situacao, 'ATUALIZADO');
  assert.equal(resultado.snapshot.estado, 'EXCLUIDO');
  assert.equal(resultado.snapshot.motivoObsolescencia, 'TOMBSTONE_ERP');
  assert.deepEqual(resultado.snapshot.dadosProtegidos, existente.dadosProtegidos);
  assert.equal(resultado.snapshot.versao, 2);
});

test('ausência completa fica obsoleta e observação posterior reativa', async () => {
  const existente = snapshotExistente();
  const obsoleto = criarCenario({ existente });
  const resultadoObsoleto = await obsoleto.servico.marcarObsolescencia(
    {
      evidenciadaEm: new Date('2026-09-01T00:30:00.000Z'),
      motivo: 'AUSENTE_RECONCILIACAO_COMPLETA',
      vinculoClienteId,
    },
    obsoleto.transacao,
    () => agora,
  );
  assert.equal(resultadoObsoleto.snapshot.estado, 'OBSOLETO');

  const reativacao = criarCenario({ existente: resultadoObsoleto.snapshot });
  const resultadoAtual = await reativacao.servico.atualizar(
    entrada({ capturadoEm: new Date('2026-09-01T00:45:00.000Z') }),
    reativacao.transacao,
    () => agora,
  );
  assert.equal(resultadoAtual.snapshot.estado, 'ATUAL');
  assert.equal(resultadoAtual.snapshot.motivoObsolescencia, undefined);
  assert.equal(resultadoAtual.snapshot.obsoletoEm, undefined);
  assert.equal(resultadoAtual.snapshot.versao, 3);
});
