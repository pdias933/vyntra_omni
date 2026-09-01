import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroAtendimentoSemObrigacaoHumana,
  ErroPoliticaSlaAusente,
} from '../dist/sla/erros-sla.js';
import { ServicoSla } from '../dist/sla/servico-sla.js';

const ids = {
  atendimento: randomUUID(),
  conversa: randomUUID(),
  fila: randomUUID(),
  politica: randomUUID(),
};
const politica = {
  alertaAdministradorAposMinutos: 20,
  alertaAtendenteAposMinutos: 5,
  alertaSupervisorAposMinutos: 10,
  filaId: ids.fila,
  id: ids.politica,
  versao: 3,
};
const contexto = {
  atendimentoId: ids.atendimento,
  conversaId: ids.conversa,
  estado: 'AGUARDANDO',
  filaId: ids.fila,
  modo: 'FILA_HUMANA',
  politica,
};

function criarCenario(contextoAtual = contexto) {
  const estado = { alertas: new Set(), ciclos: [], eventos: [], contexto: contextoAtual };
  const repositorio = {
    alertaJaEmitido: async (relogioId, nivel) => estado.alertas.has(`${relogioId}:${nivel}`),
    bloquearAtendimento: async () => {},
    concluirRelogio: async (id, finalizadoEm, versao) => {
      const ativo = estado.ciclos.find((item) => item.id === id && item.finalizadoEm === undefined);
      if (ativo === undefined || ativo.versao !== versao) return false;
      ativo.finalizadoEm = finalizadoEm;
      ativo.versao += 1;
      return true;
    },
    criarRelogio: async (valor) => estado.ciclos.push({ ...valor }),
    obterContextoObrigacaoHumana: async () =>
      estado.contexto === false ? undefined : estado.contexto,
    obterRelogioAtivo: async () => estado.ciclos.find((item) => item.finalizadoEm === undefined),
    proximoNumeroCiclo: async () => estado.ciclos.length + 1,
    registrarAlerta: async (alerta) => {
      const chave = `${alerta.relogioSlaId}:${alerta.nivel}`;
      if (estado.alertas.has(chave)) return false;
      estado.alertas.add(chave);
      return true;
    },
  };
  const eventos = { acrescentar: async (evento) => estado.eventos.push(evento) };
  return { estado, servico: new ServicoSla(repositorio, eventos) };
}

test('relógio nasce na obrigação humana e congela os três vencimentos', async () => {
  const { estado, servico } = criarCenario();
  const inicio = new Date('2026-09-01T12:00:00Z');
  const primeiro = await servico.iniciarObrigacaoHumana(ids.atendimento, {}, () => inicio);
  const repetido = await servico.iniciarObrigacaoHumana(
    ids.atendimento,
    {},
    () => new Date('2026-09-01T13:00:00Z'),
  );
  assert.equal(primeiro.id, repetido.id);
  assert.equal(primeiro.alertaAtendenteEm.toISOString(), '2026-09-01T12:05:00.000Z');
  assert.equal(primeiro.alertaSupervisorEm.toISOString(), '2026-09-01T12:10:00.000Z');
  assert.equal(primeiro.alertaAdministradorEm.toISOString(), '2026-09-01T12:20:00.000Z');
  assert.equal(estado.ciclos.length, 1);
  assert.equal(estado.eventos[0].tipo, 'SLA_OBRIGACAO_HUMANA_INICIADA');
});

test('automação e fila sem política não iniciam obrigação humana', async () => {
  const semObrigacao = criarCenario(false);
  await assert.rejects(
    semObrigacao.servico.iniciarObrigacaoHumana(ids.atendimento, {}),
    ErroAtendimentoSemObrigacaoHumana,
  );
  const semPolitica = criarCenario('SEM_POLITICA');
  await assert.rejects(
    semPolitica.servico.iniciarObrigacaoHumana(ids.atendimento, {}),
    ErroPoliticaSlaAusente,
  );
});

test('alertas escalam atendente, supervisor e administrador uma única vez', async () => {
  const { estado, servico } = criarCenario();
  await servico.iniciarObrigacaoHumana(
    ids.atendimento,
    {},
    () => new Date('2026-09-01T12:00:00Z'),
  );
  const primeiro = await servico.avaliarEscalonamento(
    ids.atendimento,
    {},
    () => new Date('2026-09-01T12:06:00Z'),
  );
  const atrasado = await servico.avaliarEscalonamento(
    ids.atendimento,
    {},
    () => new Date('2026-09-01T12:25:00Z'),
  );
  const replay = await servico.avaliarEscalonamento(
    ids.atendimento,
    {},
    () => new Date('2026-09-01T12:30:00Z'),
  );
  assert.deepEqual(primeiro.map(({ nivel }) => nivel), ['ATENDENTE']);
  assert.deepEqual(atrasado.map(({ nivel }) => nivel), ['SUPERVISOR', 'ADMINISTRADOR']);
  assert.deepEqual(replay, []);
  assert.equal(estado.alertas.size, 3);
  assert.deepEqual(
    estado.eventos.slice(1).map(({ tipo }) => tipo),
    [
      'SLA_ALERTA_ATENDENTE_EMITIDO',
      'SLA_ALERTA_SUPERVISOR_EMITIDO',
      'SLA_ALERTA_ADMINISTRADOR_EMITIDO',
    ],
  );
});

test('conclusão encerra o ciclo e nova obrigação abre ciclo seguinte', async () => {
  const { estado, servico } = criarCenario();
  await servico.iniciarObrigacaoHumana(
    ids.atendimento,
    {},
    () => new Date('2026-09-01T12:00:00Z'),
  );
  assert.equal(
    await servico.concluirObrigacaoHumana(
      ids.atendimento,
      {},
      () => new Date('2026-09-01T12:04:00Z'),
    ),
    true,
  );
  const segundo = await servico.iniciarObrigacaoHumana(
    ids.atendimento,
    {},
    () => new Date('2026-09-01T13:00:00Z'),
  );
  assert.equal(segundo.numeroCiclo, 2);
  assert.equal(estado.ciclos.filter(({ finalizadoEm }) => finalizadoEm === undefined).length, 1);
});
