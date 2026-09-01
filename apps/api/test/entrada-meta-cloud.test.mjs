import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { AdaptadorEntradaMetaCloud } from '../dist/mensageria/adaptadores/meta-cloud/entrada-meta-cloud.js';

const segredo = Buffer.from('s'.repeat(32));
const corpo = Buffer.from(
  await readFile(new URL('./fixtures/meta-cloud/mensagem-bsuid-sem-telefone.json', import.meta.url)),
);
const assinatura = `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;
const ids = {
  atendimento: randomUUID(),
  conta: randomUUID(),
  contato: randomUUID(),
  conversa: randomUUID(),
  identidade: randomUUID(),
};

function criarCenario(registrada = true) {
  const ordem = [];
  const repositorio = {
    acrescentarMensagem: async (mensagem) => {
      ordem.push('mensagem');
      assert.equal(mensagem.contatoRemetenteId, ids.contato);
    },
    marcarPersistida: async () => ordem.push('recepcao-persistida'),
    obterContaAtiva: async () => ({ id: ids.conta }),
    obterOuCriarAtendimento: async () => ({ criado: true, id: ids.atendimento }),
    registrarRecepcaoSeNova: async () => {
      ordem.push('recepcao');
      return registrada;
    },
  };
  const identidades = {
    resolver: async (entrada) => {
      ordem.push('identidade');
      assert.equal(entrada.identificadorExternoEstavel, 'US.BSUID_SANITIZADO');
      assert.equal(entrada.telefoneE164, undefined);
      return {
        contato: { id: ids.contato },
        criada: false,
        identidade: { id: ids.identidade },
      };
    },
  };
  const conversas = {
    obterOuCriar: async () => {
      ordem.push('conversa');
      return { conversa: { id: ids.conversa } };
    },
  };
  const protocolos = {
    inicializarPendente: async () => ordem.push('protocolo'),
  };
  const eventos = {
    acrescentar: async () => ordem.push('evento'),
  };
  return {
    adaptador: new AdaptadorEntradaMetaCloud(
      repositorio,
      identidades,
      conversas,
      protocolos,
      eventos,
    ),
    ordem,
  };
}

test('assinatura válida persiste recepção, identidade, conversa, atendimento e mensagem antes do evento', async () => {
  const { adaptador, ordem } = criarCenario();
  const resultado = await adaptador.receber(
    corpo,
    assinatura,
    segredo,
    {},
    () => new Date('2026-09-01T00:01:00Z'),
  );
  assert.equal(resultado.resultado, 'PERSISTIDA');
  assert.deepEqual(ordem, [
    'recepcao',
    'identidade',
    'conversa',
    'protocolo',
    'mensagem',
    'recepcao-persistida',
    'evento',
  ]);
});

test('repetição confirmada termina na deduplicação sem novo efeito', async () => {
  const { adaptador, ordem } = criarCenario(false);
  const resultado = await adaptador.receber(
    corpo,
    assinatura,
    segredo,
    {},
    () => new Date('2026-09-01T00:01:00Z'),
  );
  assert.deepEqual(resultado, { mensagemId: undefined, resultado: 'DUPLICADA' });
  assert.deepEqual(ordem, ['recepcao']);
});

test('assinatura ausente ou inválida falha antes de consultar conta ou banco', async () => {
  const { adaptador, ordem } = criarCenario();
  await assert.rejects(
    adaptador.receber(corpo, `sha256=${'0'.repeat(64)}`, segredo, {}),
    /ASSINATURA_META_CLOUD_INVALIDA/u,
  );
  assert.deepEqual(ordem, []);
});

test('corpo assinado mas estruturalmente inválido não é persistido', async () => {
  const { adaptador, ordem } = criarCenario();
  const invalido = Buffer.from('{}');
  const assinaturaInvalida = `sha256=${createHmac('sha256', segredo).update(invalido).digest('hex')}`;
  await assert.rejects(
    adaptador.receber(invalido, assinaturaInvalida, segredo, {}),
    /WEBHOOK_META_CLOUD_INVALIDO/u,
  );
  assert.deepEqual(ordem, []);
});
