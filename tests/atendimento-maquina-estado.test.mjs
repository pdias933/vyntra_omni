import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('Atendimento materializa estado, modo e motivo sem gatilho de inatividade', async () => {
  const [schema, migration, maquina] = await Promise.all([
    readFile(new URL('apps/api/prisma/schema.prisma', raiz), 'utf8'),
    readFile(
      new URL(
        'apps/api/prisma/migrations/20260831001700_criar_atendimento_maquina_estado/migration.sql',
        raiz,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        'apps/api/src/atendimentos/maquina-estado-atendimento.ts',
        raiz,
      ),
      'utf8',
    ),
  ]);

  assert.match(schema, /model Atendimento/);
  assert.match(schema, /estado\s+EstadoAtendimento/);
  assert.match(schema, /modo\s+ModoAtendimento/);
  assert.match(schema, /motivoEspera\s+MotivoEsperaAtendimento/);
  assert.match(migration, /atendimento_participacao_origem_fkey/);
  assert.match(migration, /contexto_atendimento_atendimento_fkey/);
  assert.match(migration, /INTERVAL '30 minutes'/);
  assert.doesNotMatch(maquina, /INATIVIDADE|ENCERRAR_POR_INATIVIDADE/);
});

test('origem empresarial pertence à mesma conversa e contexto aponta para atendimento real', async () => {
  const migration = await readFile(
    new URL(
      'apps/api/prisma/migrations/20260831001700_criar_atendimento_maquina_estado/migration.sql',
      raiz,
    ),
    'utf8',
  );
  assert.match(
    migration,
    /FOREIGN KEY \("conversa_id", "conta_whatsapp_origem_id"\) REFERENCES "participacao_conta_conversa"/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("atendimento_id"\) REFERENCES "atendimento"\("id"\)/,
  );
});

