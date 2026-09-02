import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const piloto = JSON.parse(await readFile('infra/staging/piloto.json', 'utf8'));
const validador = await readFile('scripts/piloto-controlado.mjs', 'utf8');
const deploy = await readFile('scripts/deploy-compativel.mjs', 'utf8');

test('piloto nasce integralmente desligado, sem usuário, conta ou plantão fictício', () => {
  assert.equal(piloto.estado, 'DESATIVADO');
  assert.equal(piloto.janela.inicio, null);
  assert.deepEqual(piloto.escopo.usuarios_id, []);
  assert.deepEqual(piloto.escopo.contas_whatsapp_id, []);
  assert.ok(piloto.recursos.every((recurso) => recurso.ativado === false));
  assert.deepEqual(piloto.plantao, { estado: 'PENDENTE', responsavel: null, canal_escalacao: null });
});

test('ativação exige escopo mínimo, plantão, janela e mantém limites máximos', () => {
  assert.match(validador, /usuarios\.length > 10/u);
  assert.match(validador, /contas\.length > 2/u);
  assert.match(validador, /ATIVACAO_INCOMPLETA/u);
  assert.equal(piloto.janela.duracao_minutos, 120);
  assert.equal(piloto.reversao.decisao_maxima_minutos, 10);
});

test('configuração é válida, mas comando de início falha enquanto desligada', () => {
  const estado = spawnSync(process.execPath, ['scripts/piloto-controlado.mjs'], { encoding: 'utf8' });
  assert.equal(estado.status, 0);
  assert.deepEqual(JSON.parse(estado.stdout), { estado: 'DESATIVADO', usuarios: 0, contas_whatsapp: 0, recursos_ativos: [] });
  const ativo = spawnSync(process.execPath, ['scripts/piloto-controlado.mjs', '--exigir-ativo'], { encoding: 'utf8' });
  assert.equal(ativo.status, 2);
  assert.match(ativo.stderr, /PILOTO_NAO_INICIADO/u);
  assert.match(deploy, /CONFIGURACAO_PILOTO_INVALIDA/u);
});

test('critérios e reversão são fechados e mensuráveis', () => {
  assert.deepEqual(piloto.criterios, {
    taxa_erro_5xx_percentual_maxima: 1,
    backlog_mensageria_maximo: 25,
    backlog_operacoes_incertas_maximo: 0,
    atraso_eventos_segundos_maximo: 30,
    disponibilidade_percentual_minima: 99,
  });
  assert.deepEqual(piloto.reversao, {
    desligar_recursos_primeiro: true,
    release_anterior_obrigatoria: true,
    decisao_maxima_minutos: 10,
  });
});
