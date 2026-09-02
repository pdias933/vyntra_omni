import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('snapshot mobile é validado e aplicado com cursor na mesma transação', async () => {
  const [modelo, repositorio, verificador] = await Promise.all([
    ler('apps/mobile/src/sincronizacao/modelo-sincronizacao-mobile.ts'),
    ler('apps/mobile/src/offline/repositorio-replica-local.ts'),
    ler('apps/mobile/src/offline/verificador-autorizacao-offline.ts'),
  ]);
  assert.match(modelo, /chavesExatas/);
  assert.match(modelo, /LIMITE_SNAPSHOT_CARACTERES/);
  assert.match(repositorio, /public async aplicarSnapshot/);
  assert.match(repositorio, /withExclusiveTransactionAsync/);
  assert.ok(
    repositorio.indexOf('DELETE FROM evento_sincronizacao') <
      repositorio.indexOf('INSERT INTO estado_replica'),
  );
  assert.match(verificador, /avaliarInformada/);
});

test('lote e cursor são atômicos, idempotentes e deixam recuperação explícita', async () => {
  const repositorio = await ler(
    'apps/mobile/src/offline/repositorio-replica-local.ts',
  );
  assert.match(repositorio, /INSERT OR IGNORE INTO evento_sincronizacao/);
  assert.match(repositorio, /CURSOR_REPLICA_LOCAL_DIVERGENTE/);
  assert.match(repositorio, /precisa_ressincronizar/);
  assert.match(repositorio, /WHERE id = \? AND sequencia_evento = \?/);
  assert.ok(
    repositorio.indexOf('INSERT OR IGNORE INTO evento_sincronizacao') <
      repositorio.indexOf('UPDATE estado_replica SET'),
  );
});

test('motor recupera por REST e só abre WebSocket no cursor convergente', async () => {
  const motor = await ler(
    'apps/mobile/src/sincronizacao/motor-sincronizacao-mobile.ts',
  );
  assert.match(motor, /LIMITE_PAGINAS_INCREMENTAIS/);
  assert.match(motor, /RESSINCRONIZACAO_COMPLETA_NECESSARIA/);
  assert.match(motor, /obterEAplicarSnapshot/);
  assert.ok(
    motor.indexOf('await this.repositorio.aplicarSnapshot(snapshot)') <
      motor.indexOf('private async abrirTempoReal'),
  );
  assert.match(motor, /await this\.abrirTempoReal\(convergente\.sequenciaBase/);
});

test('evento ao vivo é validado, persistido e confirmado somente após convergir', async () => {
  const [motor, websocket] = await Promise.all([
    ler('apps/mobile/src/sincronizacao/motor-sincronizacao-mobile.ts'),
    ler('apps/mobile/src/sincronizacao/adaptador-eventos-websocket-mobile.ts'),
  ]);
  assert.match(websocket, /normalizarEventoMobile/);
  assert.match(websocket, /LIMITE_MENSAGEM_CARACTERES/);
  assert.ok(
    websocket.indexOf('await ouvinte.aoEvento(evento)') <
      websocket.indexOf("tipo: 'CONFIRMAR'"),
  );
  assert.ok(
    motor.indexOf('await this.repositorio.aplicarLote') <
      motor.indexOf('const snapshot = await this.obterEAplicarSnapshot'),
  );
});

test('autorização e escopo acompanham exatamente a réplica substituída', async () => {
  const [motor, repositorio] = await Promise.all([
    ler('apps/mobile/src/sincronizacao/motor-sincronizacao-mobile.ts'),
    ler('apps/mobile/src/offline/repositorio-replica-local.ts'),
  ]);
  assert.match(motor, /AUTORIZACAO_OFFLINE_RECEBIDA_INVALIDA/);
  assert.match(motor, /BigInt\(snapshot\.sequenciaBase\).*BigInt\(sequenciaMinima\)/s);
  assert.match(repositorio, /DELETE FROM permissao/);
  assert.match(repositorio, /DELETE FROM politica_versao/);
  assert.ok(!/DELETE FROM rascunho;[\s\S]*aplicarSnapshot/u.test(repositorio));
});

test('ciclo acompanha primeiro plano sem expor infraestrutura saudável', async () => {
  const [aplicacao, motor] = await Promise.all([
    ler('apps/mobile/src/Aplicacao.tsx'),
    ler('apps/mobile/src/sincronizacao/motor-sincronizacao-mobile.ts'),
  ]);
  assert.match(aplicacao, /sincronizacao\.iniciar\(\)/);
  assert.match(aplicacao, /sincronizacao\.pausar\(\)/);
  assert.match(motor, /ANTECEDENCIA_RENOVACAO_MS/);
  assert.match(motor, /ATRASO_MAXIMO_RECONEXAO_MS/);
  assert.ok(!aplicacao.includes('Última atualização'));
  assert.ok(!aplicacao.includes('WebSocket'));
});

test('snapshot limita atendimentos à mesma janela de conversas autorizadas', async () => {
  const repositorio = await ler(
    'apps/api/src/sincronizacao/repositorio-ressincronizacao-prisma.ts',
  );
  const listarAtendimentos = repositorio.slice(
    repositorio.indexOf('private async listarAtendimentos'),
    repositorio.indexOf('private async listarConversas'),
  );
  assert.match(listarAtendimentos, /JOIN filas_autorizadas/);
  assert.match(listarAtendimentos, /JOIN conversas_autorizadas/);
});
