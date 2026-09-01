import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroInvarianteAtendimento,
  ErroTransicaoAtendimentoInvalida,
} from '../dist/atendimentos/erros-atendimento.js';
import { MaquinaEstadoAtendimento } from '../dist/atendimentos/maquina-estado-atendimento.js';

const ids = {
  atendimento: randomUUID(),
  conta: randomUUID(),
  conversa: randomUUID(),
  fila: randomUUID(),
  filaB: randomUUID(),
  fluxo: randomUUID(),
  usuario: randomUUID(),
};
const inicio = new Date('2026-09-01T10:00:00.000Z');
const maquina = new MaquinaEstadoAtendimento();

function aguardandoBot(sobrescritas = {}) {
  return {
    atualizadoEm: inicio,
    contaWhatsAppOrigemId: ids.conta,
    conversaId: ids.conversa,
    estado: 'AGUARDANDO',
    id: ids.atendimento,
    iniciadoEm: inicio,
    modo: 'BOT',
    motivoEspera: 'PROCESSANDO_BOT',
    versaoAtribuicao: 1,
    versaoEstado: 1,
    ...sobrescritas,
  };
}

test('estado, modo e motivo são ortogonais mas combinações inválidas são recusadas', () => {
  maquina.validar(aguardandoBot());
  assert.throws(
    () => maquina.validar(aguardandoBot({ modo: 'HUMANO' })),
    ErroInvarianteAtendimento,
  );
  assert.throws(
    () => maquina.validar(aguardandoBot({ filaAtualId: ids.fila })),
    ErroInvarianteAtendimento,
  );
});

test('bot segue para fila e o resgate humano incrementa as duas versões necessárias', () => {
  const naFila = maquina.transitar(
    aguardandoBot(),
    { filaId: ids.fila, tipo: 'ENCAMINHAR_FILA' },
    new Date('2026-09-01T10:01:00.000Z'),
  );
  assert.equal(naFila.estado, 'AGUARDANDO');
  assert.equal(naFila.modo, 'FILA_HUMANA');
  assert.equal(naFila.motivoEspera, 'AGUARDANDO_HUMANO');
  assert.equal(naFila.versaoAtribuicao, 1);

  const humano = maquina.transitar(
    naFila,
    { filaId: ids.fila, tipo: 'ATRIBUIR_HUMANO', usuarioId: ids.usuario },
    new Date('2026-09-01T10:02:00.000Z'),
  );
  assert.equal(humano.estado, 'EM_ATENDIMENTO');
  assert.equal(humano.modo, 'HUMANO');
  assert.equal(humano.motivoEspera, 'NENHUM');
  assert.equal(humano.versaoEstado, 3);
  assert.equal(humano.versaoAtribuicao, 2);
});

test('transferência para fila limpa responsável sem fechar atendimento', () => {
  const humano = aguardandoBot({
    estado: 'EM_ATENDIMENTO',
    filaAtualId: ids.fila,
    modo: 'HUMANO',
    motivoEspera: 'NENHUM',
    usuarioResponsavelId: ids.usuario,
  });
  const naFila = maquina.transitar(
    humano,
    { filaId: ids.filaB, tipo: 'RETORNAR_FILA' },
    new Date('2026-09-01T10:10:00.000Z'),
  );
  assert.equal(naFila.estado, 'AGUARDANDO');
  assert.equal(naFila.filaAtualId, ids.filaB);
  assert.equal(naFila.usuarioResponsavelId, undefined);
  assert.equal(naFila.encerradoEm, undefined);
});

test('encerramento explícito abre tolerância exata de 30 minutos', () => {
  const encerradoEm = new Date('2026-09-01T10:05:00.000Z');
  const encerrado = maquina.transitar(
    aguardandoBot(),
    {
      atorId: ids.usuario,
      motivo: 'Solicitação concluída',
      origem: 'USUARIO',
      tipo: 'ENCERRAR',
    },
    encerradoEm,
  );
  assert.equal(encerrado.estado, 'ENCERRADO_REABRIVEL');
  assert.equal(encerrado.podeReabrirAte.toISOString(), '2026-09-01T10:35:00.000Z');
  assert.equal(encerrado.filaFallbackReaberturaId, undefined);
});

test('reabertura humana exige janela do canal aberta e tolerância vigente', () => {
  const encerrado = maquina.transitar(
    aguardandoBot(),
    { atorId: ids.usuario, motivo: 'Concluído', origem: 'USUARIO', tipo: 'ENCERRAR' },
    new Date('2026-09-01T10:05:00.000Z'),
  );
  assert.throws(
    () =>
      maquina.transitar(
        encerrado,
        { filaId: ids.fila, janelaCanalAberta: false, tipo: 'REABRIR_USUARIO', usuarioId: ids.usuario },
        new Date('2026-09-01T10:10:00.000Z'),
      ),
    ErroTransicaoAtendimentoInvalida,
  );
  const reaberto = maquina.transitar(
    encerrado,
    { filaId: ids.fila, janelaCanalAberta: true, tipo: 'REABRIR_USUARIO', usuarioId: ids.usuario },
    new Date('2026-09-01T10:10:00.000Z'),
  );
  assert.equal(reaberto.estado, 'EM_ATENDIMENTO');
  assert.equal(reaberto.encerradoEm, undefined);
});

test('entrada após fechamento por fluxo volta somente à fila fallback congelada', () => {
  const encerrado = maquina.transitar(
    aguardandoBot(),
    {
      atorId: ids.fluxo,
      filaFallbackReaberturaId: ids.fila,
      motivo: 'Fluxo concluído',
      origem: 'FLUXO',
      tipo: 'ENCERRAR',
    },
    new Date('2026-09-01T10:05:00.000Z'),
  );
  const reaberto = maquina.transitar(
    encerrado,
    { janelaCanalAberta: true, tipo: 'REABRIR_ENTRADA' },
    new Date('2026-09-01T10:20:00.000Z'),
  );
  assert.equal(reaberto.estado, 'AGUARDANDO');
  assert.equal(reaberto.filaAtualId, ids.fila);
  assert.equal(reaberto.usuarioResponsavelId, undefined);
});

test('fim da tolerância apenas finaliza fechamento já explícito', () => {
  const encerrado = maquina.transitar(
    aguardandoBot(),
    { atorId: ids.usuario, motivo: 'Concluído', origem: 'USUARIO', tipo: 'ENCERRAR' },
    new Date('2026-09-01T10:05:00.000Z'),
  );
  assert.throws(
    () =>
      maquina.transitar(
        encerrado,
        { tipo: 'FINALIZAR_TOLERANCIA' },
        new Date('2026-09-01T10:34:59.999Z'),
      ),
    ErroTransicaoAtendimentoInvalida,
  );
  const final = maquina.transitar(
    encerrado,
    { tipo: 'FINALIZAR_TOLERANCIA' },
    new Date('2026-09-01T10:35:00.000Z'),
  );
  assert.equal(final.estado, 'ENCERRADO');
  assert.throws(
    () =>
      maquina.transitar(
        final,
        { filaId: ids.fila, janelaCanalAberta: true, tipo: 'REABRIR_USUARIO', usuarioId: ids.usuario },
        new Date('2026-09-01T10:36:00.000Z'),
      ),
    ErroTransicaoAtendimentoInvalida,
  );
});

