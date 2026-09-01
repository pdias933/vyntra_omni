import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroTextoLivreForaJanela } from '../dist/janela-canal/erros-janela-canal.js';
import { ServicoJanelaCanal } from '../dist/janela-canal/servico-janela-canal.js';

const ids = { conta: randomUUID(), contato: randomUUID() };

function criarCenario() {
  const estado = { alertas: new Set(), eventos: [], janela: undefined };
  const repositorio = {
    alvosValidos: async () => true,
    atualizarSeEntradaMaisNova: async (janela, anterior, versao) => {
      if (
        estado.janela === undefined ||
        estado.janela.ultimaEntradaContatoEm.getTime() !== anterior.getTime() ||
        estado.janela.versao !== versao
      ) return false;
      estado.janela = { ...janela };
      return true;
    },
    bloquear: async () => {},
    criar: async (janela) => { estado.janela = { ...janela }; },
    obter: async () => estado.janela,
    registrarAlerta: async (alerta) => {
      const chave = `${alerta.versaoJanela}:${alerta.marco}`;
      if (estado.alertas.has(chave)) return false;
      estado.alertas.add(chave);
      return true;
    },
  };
  const eventos = { acrescentar: async (evento) => estado.eventos.push(evento) };
  return { estado, servico: new ServicoJanelaCanal(repositorio, eventos) };
}

test('entrada do contato abre janela exata por contato e conta durante 24 horas', async () => {
  const { estado, servico } = criarCenario();
  const entrada = new Date('2026-09-01T10:00:00Z');
  const janela = await servico.registrarEntradaContato(
    ids.contato,
    ids.conta,
    entrada,
    {},
    () => new Date('2026-09-01T10:00:01Z'),
  );
  assert.equal(janela.expiraEm.toISOString(), '2026-09-02T10:00:00.000Z');
  assert.equal(janela.versao, 1);
  assert.equal(estado.eventos[0].tipo, 'JANELA_CANAL_ATUALIZADA_POR_ENTRADA');
  assert.deepEqual(
    await servico.obterEstado(
      ids.contato,
      ids.conta,
      {},
      () => new Date('2026-09-02T09:59:59Z'),
    ),
    { estado: 'ABERTA', expiraEm: janela.expiraEm, versao: 1 },
  );
});

test('entrada mais nova amplia e evento atrasado ou repetido nunca regride', async () => {
  const { estado, servico } = criarCenario();
  await servico.registrarEntradaContato(
    ids.contato,
    ids.conta,
    new Date('2026-09-01T10:00:00Z'),
    {},
  );
  const ampliada = await servico.registrarEntradaContato(
    ids.contato,
    ids.conta,
    new Date('2026-09-01T11:00:00Z'),
    {},
  );
  const atrasada = await servico.registrarEntradaContato(
    ids.contato,
    ids.conta,
    new Date('2026-09-01T10:30:00Z'),
    {},
  );
  assert.equal(ampliada.versao, 2);
  assert.equal(atrasada.expiraEm.toISOString(), '2026-09-02T11:00:00.000Z');
  assert.equal(estado.eventos.length, 2);
});

test('alertas de 1 hora, 30 e 10 minutos são ordenados e idempotentes', async () => {
  const { estado, servico } = criarCenario();
  await servico.registrarEntradaContato(
    ids.contato,
    ids.conta,
    new Date('2026-09-01T10:00:00Z'),
    {},
  );
  const umaHora = await servico.avaliarAlertas(
    ids.contato,
    ids.conta,
    {},
    () => new Date('2026-09-02T09:05:00Z'),
  );
  const restantes = await servico.avaliarAlertas(
    ids.contato,
    ids.conta,
    {},
    () => new Date('2026-09-02T09:51:00Z'),
  );
  const replay = await servico.avaliarAlertas(
    ids.contato,
    ids.conta,
    {},
    () => new Date('2026-09-02T09:55:00Z'),
  );
  assert.deepEqual(umaHora.map(({ marco }) => marco), ['UMA_HORA']);
  assert.deepEqual(restantes.map(({ marco }) => marco), ['TRINTA_MINUTOS', 'DEZ_MINUTOS']);
  assert.deepEqual(replay, []);
  assert.equal(estado.alertas.size, 3);
});

test('texto livre fecha no limite exato; modelo aprovado não reabre a janela', async () => {
  const { estado, servico } = criarCenario();
  await servico.registrarEntradaContato(
    ids.contato,
    ids.conta,
    new Date('2026-09-01T10:00:00Z'),
    {},
  );
  await assert.rejects(
    servico.autorizarSaida(
      ids.contato,
      ids.conta,
      'TEXTO_LIVRE',
      {},
      () => new Date('2026-09-02T10:00:00Z'),
    ),
    ErroTextoLivreForaJanela,
  );
  const antes = { ...estado.janela };
  const modelo = await servico.autorizarSaida(
    ids.contato,
    ids.conta,
    'MODELO_APROVADO',
    {},
    () => new Date('2026-09-02T10:00:00Z'),
  );
  assert.equal(modelo.estado, 'EXPIRADA');
  assert.deepEqual(estado.janela, antes);
});
