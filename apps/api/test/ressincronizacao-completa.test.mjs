import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { PlanejadorAplicacaoSnapshot } from '../dist/sincronizacao/planejador-aplicacao-snapshot.js';
import { ServicoRessincronizacaoCompleta } from '../dist/sincronizacao/servico-ressincronizacao-completa.js';
import { ServicoSincronizacaoIncremental } from '../dist/sincronizacao/servico-sincronizacao-incremental.js';

const agora = new Date('2026-09-01T12:00:00Z');
const usuarioId = randomUUID();
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2026-09-02T00:00:00Z'),
  sessaoId: randomUUID(),
  usuarioId,
};

function snapshot(sobrescritas = {}) {
  return {
    atendimentos: [],
    controlesRecurso: {},
    conversas: [],
    filas: [],
    geradoEm: agora.toISOString(),
    mensagensRecentes: [],
    notasInternasRecentes: [],
    permissoes: ['VISUALIZAR_FILA'],
    politicasVersao: [],
    sequenciaBase: '10',
    versaoPermissoes: 1,
    ...sobrescritas,
  };
}

test('snapshot autorizado conserva a sequência capturada no mesmo ponto lógico', async () => {
  const esperado = snapshot({
    atendimentos: [{ id: randomUUID(), estado: 'AGUARDANDO' }],
  });
  const chamadas = [];
  const repositorio = {
    criarSnapshotAutorizado: async (id, instante) => {
      chamadas.push({ id, instante });
      return esperado;
    },
  };
  const resultado = await new ServicoRessincronizacaoCompleta(
    repositorio,
  ).reconstruir(sessao, () => agora);
  assert.equal(resultado, esperado);
  assert.deepEqual(chamadas, [{ id: usuarioId, instante: agora }]);
});

test('alteração concorrente fica fora do snapshot e inteira no incremental posterior', async () => {
  const atendimentoId = randomUUID();
  const conversaId = randomUUID();
  const completo = new ServicoRessincronizacaoCompleta({
    criarSnapshotAutorizado: async () => snapshot({
      atendimentos: [{ estado: 'AGUARDANDO', id: atendimentoId }],
    }),
  });
  const base = await completo.reconstruir(sessao, () => agora);
  const evento = {
    autorizado: true,
    evento: {
      atendimentoId,
      classificacaoDados: 'OPERACIONAL',
      conversaId,
      criadoEm: new Date('2026-09-01T12:00:01Z'),
      dadosProtegidosMinimizados: { estado: 'EM_ATENDIMENTO' },
      entidadeId: atendimentoId,
      entidadeTipo: 'ATENDIMENTO',
      id: randomUUID(),
      sequenciaEvento: 11n,
      tipo: 'ATENDIMENTO_RESGATADO',
      usuarioAtorId: usuarioId,
    },
    podeVerDadoSensivel: false,
  };
  const incremental = new ServicoSincronizacaoIncremental({
    listarEventos: async () => [evento],
    obterLimitesRetencao: async () => ({
      maiorSequencia: 11n,
      menorSequenciaRetida: 1n,
    }),
  });
  const lote = await incremental.sincronizar(
    sessao,
    'MOBILE',
    base.sequenciaBase,
    undefined,
    () => new Date('2026-09-01T12:00:02Z'),
  );
  assert.equal(base.atendimentos[0].estado, 'AGUARDANDO');
  assert.equal(lote.eventos[0].dados.estado, 'EM_ATENDIMENTO');
  assert.equal(lote.eventos[0].sequenciaEvento, '11');
});

test('aplicação local substitui réplica e cursor atomicamente sem apagar pendências', () => {
  const estadoLocal = {
    comandosPendentes: [{ chave: randomUUID(), tipo: 'ENVIAR_MENSAGEM' }],
    rascunhos: [{ conversaId: randomUUID(), texto: 'rascunho local' }],
  };
  const plano = new PlanejadorAplicacaoSnapshot().planejar(
    snapshot(),
    estadoLocal,
  );
  assert.deepEqual(plano.operacoesAtomicas, [
    'SUBSTITUIR_REPLICA_AUTORIZADA',
    'PERSISTIR_SEQUENCIA_BASE',
  ]);
  assert.equal(plano.sequenciaBase, '10');
  assert.equal(plano.versaoPermissoes, 1);
  assert.deepEqual(plano.preservar, estadoLocal);
  assert.throws(
    () => new PlanejadorAplicacaoSnapshot().planejar(
      snapshot({ sequenciaBase: '-1' }),
      estadoLocal,
    ),
    /SNAPSHOT_SINCRONIZACAO_INVALIDO/u,
  );
  assert.throws(
    () => new PlanejadorAplicacaoSnapshot().planejar(
      snapshot({ versaoPermissoes: 0 }),
      estadoLocal,
    ),
    /SNAPSHOT_SINCRONIZACAO_INVALIDO/u,
  );
});
