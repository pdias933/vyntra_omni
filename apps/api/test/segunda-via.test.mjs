import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { CompositorSegundaVia } from '../dist/composicoes/segunda-via.js';

const base = {
  contaWhatsAppId: randomUUID(), contatoId: randomUUID(), referenciaFatura: 'FAT-2026-09',
  valorCentavos: 12345, vencimento: new Date('2026-09-10T00:00:00Z'),
};

test('compõe PDF, valor, vencimento, Pix, linha e link sem processar pagamento', () => {
  const composicao = new CompositorSegundaVia().compor({
    ...base, documentoMidiaMensagemId: randomUUID(), linhaDigitavel: '12345678901234567890123456789012345678901234',
    linkSeguro: 'https://faturas.example.test/acesso', pixCopiaCola: '00020101021226880014BR.GOV.BCB.PIX',
  }, () => new Date('2026-09-01T12:00:00Z'));
  assert.equal(composicao.incluiPdf, true);
  assert.equal(composicao.incluiPix, true);
  assert.match(composicao.textoProtegido, /R\$ 123,45.*2026-09-10.*PDF.*Pix.*linha digitável.*link seguro/u);
  assert.equal(Object.keys(composicao).some((chave) => /pagar|pagamento|cobrar/iu.test(chave)), false);
});

test('fallback sem meios ainda informa valor e vencimento sem inventar pagamento', () => {
  const composicao = new CompositorSegundaVia().compor(base);
  assert.equal(composicao.incluiPdf, false);
  assert.deepEqual(composicao.opcoesProtegidas, {});
  assert.match(composicao.textoProtegido, /Solicite uma nova forma/u);
});

test('recusa link não HTTPS, valor inválido, Pix e linha malformados', () => {
  const compositor = new CompositorSegundaVia();
  assert.throws(() => compositor.compor({ ...base, linkSeguro: 'http://inseguro.test' }), /INVALIDA/u);
  assert.throws(() => compositor.compor({ ...base, valorCentavos: 0 }), /INVALIDA/u);
  assert.throws(() => compositor.compor({ ...base, pixCopiaCola: 'curto' }), /INVALIDA/u);
  assert.throws(() => compositor.compor({ ...base, linhaDigitavel: 'abc' }), /INVALIDA/u);
});
