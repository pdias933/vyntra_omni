import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('schema admite vários vínculos e fixa um contexto explícito versionado', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260831001400_criar_vinculo_contexto_atendimento/migration.sql',
    ),
  ]);
  assert.match(schema, /model VinculoCliente/);
  assert.match(schema, /model VinculoContrato/);
  assert.match(schema, /model ContextoAtendimento/);
  assert.match(migration, /vinculo_cliente_ativo_key/);
  assert.match(migration, /vinculo_cliente_preferencial_key/);
  assert.match(migration, /contexto_atendimento_versao_check/);
  assert.match(migration, /FOREIGN KEY \("vinculo_contrato_id", "vinculo_cliente_id"\)/);
});

test('contexto usa alvo exato, autorização central e concorrência otimista', async () => {
  const [servico, repositorio] = await Promise.all([
    ler('apps/api/src/contextos-cliente/servico-contextos-cliente.ts'),
    ler('apps/api/src/contextos-cliente/repositorio-contextos-cliente-prisma.ts'),
  ]);
  assert.match(servico, /ALTERAR_CONTEXTO_CLIENTE/);
  assert.match(servico, /ServicoAutorizacao/);
  assert.match(repositorio, /contatoId, id: vinculoClienteId, revogadoEm: null/);
  assert.match(repositorio, /versao: versaoEsperada/);
  assert.ok(!/findFirst\(\{[\s\S]{0,160}preferencial: true/.test(repositorio));
});

test('módulo não publica rota de vínculo ou troca de contexto', async () => {
  const arquivos = await Promise.all([
    ler('apps/api/src/contextos-cliente/modulo-contextos-cliente.ts'),
    ler('apps/api/src/modulo-aplicacao.ts'),
  ]);
  assert.match(arquivos[1], /ModuloContextosCliente/);
  assert.ok(!arquivos.join('\n').includes('Controller'));
});

test('prontidão exige a migration de contexto mais recente', async () => {
  const persistencia = await ler('apps/api/src/persistencia/servico-prisma.ts');
  assert.match(persistencia, /20260831001400_criar_vinculo_contexto_atendimento/);
});
