import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parse } from 'yaml';

const checklist = parse(await readFile('infra/producao/checklist.yaml', 'utf8'));
const validador = await readFile('scripts/checklist-producao.mjs', 'utf8');

test('checklist é fechado, versionado e default deny', () => {
  assert.equal(checklist.versao, 1);
  assert.equal(checklist.ambiente, 'producao');
  assert.equal(checklist.politica, 'default-deny');
  assert.equal(checklist.itens.length, 16);
  assert.equal(new Set(checklist.itens.map((item) => item.id)).size, 16);
  assert.match(validador, /ITEM_NAO_REVISADO/u);
  assert.match(validador, /APROVACAO_SEM_EVIDENCIA/u);
});

test('estrutura é válida mas promoção permanece bloqueada por dependências reais', () => {
  const estrutura = spawnSync(process.execPath, ['scripts/checklist-producao.mjs'], { encoding: 'utf8' });
  assert.equal(estrutura.status, 0);
  assert.match(estrutura.stdout, /ESTRUTURA_VALIDA_COM_PENDENCIAS/u);
  const liberar = spawnSync(process.execPath, ['scripts/checklist-producao.mjs', '--exigir-aprovado'], { encoding: 'utf8' });
  assert.equal(liberar.status, 2);
  const resultado = JSON.parse(liberar.stderr);
  assert.equal(resultado.estado, 'BLOQUEADO');
  for (const id of ['WAF_TLS_ORIGEM', 'MONITOR_EXTERNO_ALERTAS', 'BACKUP_EXTERNO_RESTAURACAO', 'LOJA_IOS_DISTRIBUICAO', 'LOJA_ANDROID_DISTRIBUICAO', 'APROVACAO_GO_NO_GO']) {
    assert.ok(resultado.pendentes.includes(id));
  }
});

test('nenhum item pendente finge instante de aprovação', () => {
  for (const item of checklist.itens.filter((item) => item.estado !== 'APROVADO')) {
    assert.equal(item.verificado_em, undefined);
  }
});
