import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { CatalogoModelosMensagem } from '../dist/modelos-mensagem/catalogo-modelos-mensagem.js';
import { normalizarModeloMetaCloud } from '../dist/mensageria/adaptadores/meta-cloud/modelos-meta-cloud.js';

const conta = randomUUID();
const sincronizadoEm = new Date('2026-09-01T12:00:00Z');
const externo = {
  components: { body: { text: 'Olá {{1}}' } }, id: 'modelo-meta-1', language: 'pt_BR',
  name: 'boas_vindas', parameter_count: 1, status: 'APPROVED',
};

test('sincroniza catálogo normalizado e preserva versão quando não há mudança', () => {
  const catalogo = new CatalogoModelosMensagem();
  const primeira = catalogo.sincronizar(conta, [], [normalizarModeloMetaCloud(externo)], sincronizadoEm);
  const repetida = catalogo.sincronizar(conta, primeira, [normalizarModeloMetaCloud(externo)], new Date('2026-09-01T13:00:00Z'));
  assert.equal(primeira[0].estado, 'APROVADO');
  assert.equal(primeira[0].versao, 1);
  assert.equal(repetida[0].id, primeira[0].id);
  assert.equal(repetida[0].versao, 1);
});

test('seleção exige conta, idioma, aprovação e quantidade exata de parâmetros', () => {
  const catalogo = new CatalogoModelosMensagem();
  const modelos = catalogo.sincronizar(conta, [], [normalizarModeloMetaCloud(externo)], sincronizadoEm);
  assert.equal(catalogo.selecionarAprovado(modelos, conta, 'boas_vindas', 'pt_BR', ['João']).id, modelos[0].id);
  assert.throws(() => catalogo.selecionarAprovado(modelos, conta, 'boas_vindas', 'en_US', ['John']), /NAO_AUTORIZADO/u);
  assert.throws(() => catalogo.selecionarAprovado(modelos, conta, 'boas_vindas', 'pt_BR', []), /NAO_AUTORIZADO/u);
  const pausado = [{ ...modelos[0], estado: 'PAUSADO' }];
  assert.throws(() => catalogo.selecionarAprovado(pausado, conta, 'boas_vindas', 'pt_BR', ['João']), /NAO_AUTORIZADO/u);
});

test('estado externo desconhecido e duplicidade nome/idioma falham fechados', () => {
  assert.throws(() => normalizarModeloMetaCloud({ ...externo, status: 'UNKNOWN' }), /DESCONHECIDO/u);
  const observado = normalizarModeloMetaCloud(externo);
  assert.throws(
    () => new CatalogoModelosMensagem().sincronizar(conta, [], [observado, observado], sincronizadoEm),
    /DUPLICADO/u,
  );
});
