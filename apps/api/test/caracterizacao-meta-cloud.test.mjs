import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { ValidadorCaracterizacaoMetaCloud } from '../dist/mensageria/adaptadores/meta-cloud/caracterizacao-meta-cloud.js';
import { caracterizarIdentidadeWebhookMetaCloud } from '../dist/mensageria/adaptadores/meta-cloud/identidade-webhook-meta-cloud.js';

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/meta-cloud/caracterizacao-sanitizada.json', import.meta.url), 'utf8'),
);
const webhook = JSON.parse(
  await readFile(new URL('./fixtures/meta-cloud/mensagem-bsuid-sem-telefone.json', import.meta.url), 'utf8'),
);

test('fixture sanitizada documenta versão, BSUID e capacidades sem fingir observação da conta', () => {
  const validador = new ValidadorCaracterizacaoMetaCloud();
  assert.deepEqual(validador.validar(fixture), fixture);
  assert.equal(validador.podeAtivarIntegracao(fixture), false);
  assert.equal(JSON.stringify(fixture).includes('NAO_OBSERVADA'), true);
});

test('conta real só ativa com versão, BSUID, limites e capacidades observados', () => {
  const real = {
    ...fixture,
    origemEvidencia: 'CONTA_REAL',
    capacidades: Object.fromEntries(
      Object.keys(fixture.capacidades).map((chave) => [chave, 'HABILITADA']),
    ),
    limites: { throughputMensagensPorSegundo: 80 },
  };
  const validador = new ValidadorCaracterizacaoMetaCloud();
  assert.equal(validador.podeAtivarIntegracao(real), true);
  assert.throws(
    () => validador.validar({ ...real, graphApiVersion: 'latest' }),
    /CARACTERIZACAO_META_CLOUD_INVALIDA/u,
  );
});

test('BSUID é estável e telefone e username permanecem opcionais', () => {
  const contato = webhook.entry[0].changes[0].value.contacts[0];
  assert.deepEqual(caracterizarIdentidadeWebhookMetaCloud(contato), {
    identificadorExternoEstavel: 'US.BSUID_SANITIZADO',
    nomePerfil: 'Pessoa Exemplo',
    nomeUsuario: 'pessoa.exemplo',
    telefoneE164: undefined,
  });
  assert.deepEqual(
    caracterizarIdentidadeWebhookMetaCloud({ user_id: 'US.1234567890' }),
    {
      identificadorExternoEstavel: 'US.1234567890',
      nomePerfil: undefined,
      nomeUsuario: undefined,
      telefoneE164: undefined,
    },
  );
});
