import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { AvaliadorCalendario } from '../dist/calendarios/avaliador-calendario.js';
import { ErroCalendarioInvalido, ErroConflitoOverrideCalendario } from '../dist/calendarios/erros-calendario.js';
import { ServicoCalendarios } from '../dist/calendarios/servico-calendarios.js';

const ids = { calendario: randomUUID(), fila: randomUUID(), sessao: randomUUID(), usuario: randomUUID() };
const base = {
  excecoes: [],
  feriados: [],
  filaId: ids.fila,
  fusoHorario: 'America/Sao_Paulo',
  id: ids.calendario,
  modo: 'PERIODOS',
  nome: 'Comercial',
  overrides: [],
  periodosSemanais: [
    { diaSemana: 2, minutoFim: 720, minutoInicio: 540 },
    { diaSemana: 2, minutoFim: 1080, minutoInicio: 840 },
  ],
  versao: 3,
};

test('avalia múltiplos períodos no fuso do calendário', () => {
  const avaliador = new AvaliadorCalendario();
  assert.deepEqual(avaliador.avaliar(base, new Date('2026-09-01T13:30:00Z')), {
    calendarioId: ids.calendario,
    estado: 'ABERTO',
    origem: 'PERIODO_SEMANAL',
    versao: 3,
  });
  assert.equal(
    avaliador.avaliar(base, new Date('2026-09-01T16:00:00Z')).estado,
    'FECHADO',
  );
});

test('exceção prevalece sobre feriado e feriado prevalece sobre 24x7', () => {
  const avaliador = new AvaliadorCalendario();
  const feriado = { ...base, feriados: ['2026-09-01'], modo: 'VINTE_QUATRO_SETE' };
  assert.equal(avaliador.avaliar(feriado, new Date('2026-09-01T13:30:00Z')).origem, 'FERIADO');
  const excecao = {
    ...feriado,
    excecoes: [{ dataLocal: '2026-09-01', diaInteiro: true, estado: 'ABERTO', periodos: [] }],
  };
  assert.deepEqual(
    avaliador.avaliar(excecao, new Date('2026-09-01T13:30:00Z')).estado,
    'ABERTO',
  );
});

test('override manual vigente tem precedência máxima', () => {
  const calendario = {
    ...base,
    overrides: [{
      calendarioId: ids.calendario,
      criadoEm: new Date('2026-09-01T12:00:00Z'),
      estado: 'FECHADO',
      executadoPorUsuarioId: ids.usuario,
      id: randomUUID(),
      motivo: 'Emergência',
      vigenteAte: new Date('2026-09-01T15:00:00Z'),
      vigenteDe: new Date('2026-09-01T13:00:00Z'),
    }],
  };
  const resultado = new AvaliadorCalendario().avaliar(calendario, new Date('2026-09-01T13:30:00Z'));
  assert.equal(resultado.estado, 'FECHADO');
  assert.equal(resultado.origem, 'OVERRIDE_MANUAL');
});

test('fuso inválido falha fechado', () => {
  assert.throws(
    () => new AvaliadorCalendario().avaliar({ ...base, fusoHorario: 'Fuso/Inventado' }, new Date()),
    ErroCalendarioInvalido,
  );
});

test('override exige administração, não sobrepõe outro e audita na transação', async () => {
  const chamadas = { auditoria: [], autorizacao: [], criados: [] };
  const repositorio = {
    bloquear: async () => {},
    criarOverride: async (valor) => chamadas.criados.push(valor),
    existeOverrideSobreposto: async () => false,
    obter: async () => base,
  };
  const autorizacao = { autorizar: async (entrada) => chamadas.autorizacao.push(entrada) };
  const auditoria = { registrar: async (...args) => chamadas.auditoria.push(args) };
  const servico = new ServicoCalendarios(repositorio, autorizacao, auditoria);
  const transacao = {};
  await servico.definirOverride(
    { estado: 'ATIVA', expiraEm: new Date('2099-01-01'), sessaoId: ids.sessao, usuarioId: ids.usuario },
    ids.calendario,
    'FECHADO',
    'Manutenção elétrica',
    new Date('2026-09-01T17:00:00Z'),
    new Date('2026-09-01T18:00:00Z'),
    transacao,
    () => new Date('2026-09-01T16:00:00Z'),
  );
  assert.equal(chamadas.autorizacao[0].permissao, 'ADMINISTRAR_CALENDARIOS');
  assert.equal(chamadas.criados.length, 1);
  assert.equal(chamadas.auditoria[0][1], transacao);

  const conflito = new ServicoCalendarios(
    { ...repositorio, existeOverrideSobreposto: async () => true },
    autorizacao,
    auditoria,
  );
  await assert.rejects(
    conflito.definirOverride(
      { estado: 'ATIVA', expiraEm: new Date('2099-01-01'), sessaoId: ids.sessao, usuarioId: ids.usuario },
      ids.calendario,
      'ABERTO',
      'Plantão',
      new Date('2026-09-01T17:30:00Z'),
      new Date('2026-09-01T18:30:00Z'),
      {},
    ),
    ErroConflitoOverrideCalendario,
  );
});
