import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroSnapshotClienteInvalido } from '../dist/snapshots-cliente/erros-snapshot-cliente.js';
import { ServicoSincronizacaoSnapshotsCliente } from '../dist/snapshots-cliente/servico-sincronizacao-snapshots-cliente.js';

const agora = new Date('2026-09-01T05:00:00.000Z');
const transacao = { id: 'transacao-sintetica-062' };

function criarCenario() {
  const chamadas = { atualizacoes: [], obsolescencias: [] };
  const snapshots = {
    async atualizar(entrada) {
      chamadas.atualizacoes.push(entrada);
      return { situacao: 'ATUALIZADO', snapshot: {} };
    },
    async marcarObsolescencia(entrada) {
      chamadas.obsolescencias.push(entrada);
      return { situacao: 'ATUALIZADO', snapshot: {} };
    },
  };
  return {
    chamadas,
    servico: new ServicoSincronizacaoSnapshotsCliente(snapshots),
  };
}

test('incremental aplica atualização e tombstone explícito', async () => {
  const primeiro = randomUUID();
  const segundo = randomUUID();
  const cenario = criarCenario();
  const resultado = await cenario.servico.aplicarIncremental(
    [
      {
        snapshot: {
          capturadoEm: agora,
          dados: { nomeExibicao: 'Cliente sintético' },
          vinculoClienteId: primeiro,
        },
        tipo: 'ATUALIZAR',
      },
      {
        evidenciadaEm: agora,
        evidencia: 'TOMBSTONE_ERP',
        tipo: 'EXCLUIR',
        vinculoClienteId: segundo,
      },
    ],
    transacao,
    () => agora,
  );
  assert.deepEqual(resultado, {
    atualizados: 1,
    ignorados: 0,
    obsoletos: 1,
    repetidos: 0,
  });
  assert.equal(cenario.chamadas.obsolescencias[0].motivo, 'TOMBSTONE_ERP');
});

test('reconciliação completa exige confirmação e marca somente ausência explícita', async () => {
  const presente = randomUUID();
  const ausente = randomUUID();
  const cenario = criarCenario();
  const resultado = await cenario.servico.aplicarReconciliacaoCompleta(
    {
      ausenciasConfirmadas: [
        { evidenciadaEm: agora, vinculoClienteId: ausente },
      ],
      confirmadaCompleta: true,
      snapshots: [
        {
          capturadoEm: agora,
          dados: { nomeExibicao: 'Cliente presente' },
          vinculoClienteId: presente,
        },
      ],
    },
    transacao,
    () => agora,
  );
  assert.equal(resultado.atualizados, 1);
  assert.equal(resultado.obsoletos, 1);
  assert.equal(
    cenario.chamadas.obsolescencias[0].motivo,
    'AUSENTE_RECONCILIACAO_COMPLETA',
  );

  await assert.rejects(
    cenario.servico.aplicarReconciliacaoCompleta(
      {
        ausenciasConfirmadas: [{ evidenciadaEm: agora, vinculoClienteId: ausente }],
        confirmadaCompleta: false,
        snapshots: [],
      },
      transacao,
      () => agora,
    ),
    ErroSnapshotClienteInvalido,
  );
});

test('mesmo vínculo não aparece duas vezes no lote', async () => {
  const vinculoClienteId = randomUUID();
  const cenario = criarCenario();
  await assert.rejects(
    cenario.servico.aplicarIncremental(
      [
        {
          snapshot: {
            capturadoEm: agora,
            dados: { nomeExibicao: 'Cliente sintético' },
            vinculoClienteId,
          },
          tipo: 'ATUALIZAR',
        },
        {
          evidenciadaEm: agora,
          evidencia: 'TOMBSTONE_ERP',
          tipo: 'EXCLUIR',
          vinculoClienteId,
        },
      ],
      transacao,
      () => agora,
    ),
    ErroSnapshotClienteInvalido,
  );
  assert.equal(cenario.chamadas.atualizacoes.length, 0);
});
