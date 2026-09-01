import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { AdaptadorErpSimulado } from '../dist/erp/simuladores/adaptador-erp-simulado.js';
import {
  ErroAtendimentoProtocoloAusente,
  ErroConflitoProtocoloErp,
  ErroProtocoloErpInvalido,
} from '../dist/protocolos-erp/erros-protocolo-erp.js';
import { ServicoProtocolosErp } from '../dist/protocolos-erp/servico-protocolos-erp.js';

const atendimentoId = randomUUID();
const criadoEm = new Date('2026-09-01T12:00:00.000Z');
const confirmadoEm = new Date('2026-09-01T12:01:00.000Z');
const aplicadoEm = new Date('2026-09-01T12:02:00.000Z');

function criarCenario(sobrescritas = {}) {
  let armazenado = sobrescritas.armazenado;
  const chamadas = { confirmacoes: [], criacoes: [] };
  const repositorio = {
    atendimentoExiste: async () => sobrescritas.atendimentoExiste ?? true,
    confirmar: async (protocolo, versao, transacao) => {
      chamadas.confirmacoes.push([protocolo, versao, transacao]);
      if (sobrescritas.confirmado === false) return false;
      armazenado = protocolo;
      return true;
    },
    criarPendente: async (protocolo, transacao) => {
      chamadas.criacoes.push([protocolo, transacao]);
      if (sobrescritas.criado === false) return false;
      armazenado = protocolo;
      return true;
    },
    obter: async () => armazenado,
  };
  return {
    chamadas,
    obterArmazenado: () => armazenado,
    servico: new ServicoProtocolosErp(repositorio),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('atendimento nasce com protocolo pendente sem número alternativo', async () => {
  const cenario = criarCenario();
  const protocolo = await cenario.servico.inicializarPendente(
    atendimentoId,
    cenario.transacao,
    () => criadoEm,
  );
  assert.deepEqual(protocolo, {
    atendimentoId,
    atualizadoEm: criadoEm,
    criadoEm,
    estado: 'PENDENTE',
    versao: 1,
  });
  assert.equal(protocolo.protocoloOficial, undefined);
  assert.equal(cenario.chamadas.criacoes[0][1], cenario.transacao);
});

test('resultado incerto mantém pendência sem inventar protocolo', async () => {
  const pendente = {
    atendimentoId,
    atualizadoEm: criadoEm,
    criadoEm,
    estado: 'PENDENTE',
    versao: 1,
  };
  const cenario = criarCenario({ armazenado: pendente });
  const resultado = await cenario.servico.aplicarResultado(
    atendimentoId,
    { codigo: 'RESPOSTA_PERDIDA', requerReconciliacao: true, resultado: 'RESULTADO_INCERTO' },
    cenario.transacao,
    () => aplicadoEm,
  );
  assert.equal(resultado, pendente);
  assert.equal(cenario.chamadas.confirmacoes.length, 0);
});

test('confirmação do simulador atribui um único protocolo oficial', async () => {
  const pendente = {
    atendimentoId,
    atualizadoEm: criadoEm,
    criadoEm,
    estado: 'PENDENTE',
    versao: 1,
  };
  const cenario = criarCenario({ armazenado: pendente });
  const adaptador = new AdaptadorErpSimulado({}, () => confirmadoEm);
  const comando = {
    assunto: 'Atendimento sintético',
    atendimentoId,
    chaveIdempotencia: 'chave_protocolo_pendente_0001',
    iniciadoEm: criadoEm,
  };
  const confirmado = await adaptador.criarAtendimento(comando);
  const oficial = await cenario.servico.aplicarResultado(
    atendimentoId,
    confirmado,
    cenario.transacao,
    () => aplicadoEm,
  );
  assert.equal(oficial.estado, 'OFICIAL');
  assert.match(oficial.protocoloOficial, /^SIM-[A-F0-9]{16}$/);
  assert.equal(oficial.versao, 2);
  assert.equal(cenario.chamadas.confirmacoes.length, 1);

  const repetido = await cenario.servico.aplicarResultado(
    atendimentoId,
    confirmado,
    cenario.transacao,
    () => aplicadoEm,
  );
  assert.equal(repetido.protocoloOficial, oficial.protocoloOficial);
  assert.equal(cenario.chamadas.confirmacoes.length, 1);
});

test('protocolo oficial divergente nunca substitui o primeiro', async () => {
  const oficial = {
    atendimentoId,
    atualizadoEm: aplicadoEm,
    confirmadoEm,
    criadoEm,
    estado: 'OFICIAL',
    protocoloOficial: 'ERP-OFICIAL-001',
    versao: 2,
  };
  const cenario = criarCenario({ armazenado: oficial });
  await assert.rejects(
    cenario.servico.aplicarResultado(
      atendimentoId,
      { confirmadoEm, protocoloOficial: 'ERP-OFICIAL-002', resultado: 'CONFIRMADO' },
      cenario.transacao,
      () => aplicadoEm,
    ),
    ErroConflitoProtocoloErp,
  );
  assert.equal(cenario.chamadas.confirmacoes.length, 0);
});

test('UUID interno e marcador pendente não são aceitos como protocolo oficial', async () => {
  const pendente = {
    atendimentoId,
    atualizadoEm: criadoEm,
    criadoEm,
    estado: 'PENDENTE',
    versao: 1,
  };
  for (const protocoloOficial of [atendimentoId, 'PENDENTE']) {
    const cenario = criarCenario({ armazenado: pendente });
    await assert.rejects(
      cenario.servico.aplicarResultado(
        atendimentoId,
        { confirmadoEm, protocoloOficial, resultado: 'CONFIRMADO' },
        cenario.transacao,
        () => aplicadoEm,
      ),
      ErroProtocoloErpInvalido,
    );
  }
});

test('atendimento ausente não recebe protocolo pendente', async () => {
  const cenario = criarCenario({ atendimentoExiste: false });
  await assert.rejects(
    cenario.servico.inicializarPendente(
      atendimentoId,
      cenario.transacao,
      () => criadoEm,
    ),
    ErroAtendimentoProtocoloAusente,
  );
  assert.equal(cenario.chamadas.criacoes.length, 0);
});

