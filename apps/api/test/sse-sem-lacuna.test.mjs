import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as aguardar } from 'node:timers/promises';
import { test } from 'node:test';

import { CoordenadorSseSemLacuna } from '../dist/sincronizacao/coordenador-sse-sem-lacuna.js';

const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date(Date.now() + 60_000),
  sessaoId: randomUUID(),
  usuarioId: randomUUID(),
};

function evento(sequencia) {
  return {
    audiencia: 'WEB',
    dados: { estado: 'AGUARDANDO' },
    entidadeId: randomUUID(),
    entidadeTipo: 'ATENDIMENTO',
    ocorridoEm: '2026-09-01T12:00:00.000Z',
    sequenciaEvento: String(sequencia),
    tipo: 'ATENDIMENTO_CRIADO',
  };
}

function lote(eventos, apos, limite) {
  const posteriores = eventos.filter(
    (item) => BigInt(item.sequenciaEvento) > BigInt(apos),
  );
  const pagina = posteriores.slice(0, Number(limite));
  return {
    eventos: pagina,
    sequenciaFinal: pagina.at(-1)?.sequenciaEvento ?? String(apos),
    temMais: posteriores.length > pagina.length,
  };
}

test('assina antes da marca d’água e entrega backlog, buffer e vivo sem duplicar', async () => {
  const eventos = [evento(1), evento(2)];
  let marcaCapturada = false;
  const sincronizacao = {
    obterMarcaDagua: async () => {
      marcaCapturada = true;
      eventos.push(evento(3));
      return '2';
    },
    sincronizar: async (_sessao, _audiencia, apos, limite) =>
      lote(eventos.slice(0, marcaCapturada ? eventos.length : 2), apos, limite),
  };
  const recebidos = [];
  const falhas = [];
  const fechar = new CoordenadorSseSemLacuna(sincronizacao).abrir(
    sessao,
    '0',
    {
      enviar: (item) => recebidos.push(item.sequenciaEvento),
      falhar: (erro) => falhas.push(erro),
      heartbeat: () => undefined,
    },
    { intervaloConsultaMs: 5, intervaloHeartbeatMs: 50 },
  );
  await aguardar(30);
  fechar();
  assert.deepEqual(recebidos, ['1', '2', '3']);
  assert.deepEqual(falhas, []);
});

test('Last-Event-ID retoma somente depois do último aplicado', async () => {
  const eventos = [evento(1), evento(2), evento(3)];
  const recebidos = [];
  const coordenador = new CoordenadorSseSemLacuna({
    obterMarcaDagua: async () => '3',
    sincronizar: async (_sessao, _audiencia, apos, limite) =>
      lote(eventos, apos, limite),
  });
  const fechar = coordenador.abrir(
    sessao,
    '1',
    {
      enviar: (item) => recebidos.push(item.sequenciaEvento),
      falhar: assert.fail,
      heartbeat: () => undefined,
    },
    { intervaloConsultaMs: 5, intervaloHeartbeatMs: 50 },
  );
  await aguardar(20);
  fechar();
  assert.deepEqual(recebidos, ['2', '3']);
});

test('falha do distribuidor encerra o stream para recuperação pelo cursor', async () => {
  let consultas = 0;
  const falhas = [];
  const coordenador = new CoordenadorSseSemLacuna({
    obterMarcaDagua: async () => '0',
    sincronizar: async () => {
      consultas += 1;
      if (consultas > 1) throw new Error('DISTRIBUIDOR_INDISPONIVEL');
      return { eventos: [], sequenciaFinal: '0', temMais: false };
    },
  });
  coordenador.abrir(
    sessao,
    '0',
    {
      enviar: assert.fail,
      falhar: (erro) => falhas.push(erro),
      heartbeat: () => undefined,
    },
    { intervaloConsultaMs: 5, intervaloHeartbeatMs: 50 },
  );
  await aguardar(20);
  assert.equal(falhas.length, 1);
  assert.match(falhas[0].message, /DISTRIBUIDOR_INDISPONIVEL/u);
});
