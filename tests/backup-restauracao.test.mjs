import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import {
  criptografarFluxo,
  descriptografarArquivo,
} from '../scripts/lib/backup-criptografia.mjs';

const backup = await readFile('scripts/backup-staging.mjs', 'utf8');
const restauracao = await readFile('scripts/restaurar-backup-staging.mjs', 'utf8');
const timer = await readFile('infra/systemd/vyntra-backup-staging.timer', 'utf8');

test('artefato é cifrado com autenticação e corrupção não é restaurada', async () => {
  const diretorio = await mkdtemp(join(tmpdir(), 'vyntra-backup-'));
  const cifrado = join(diretorio, 'artefato.vyntra');
  const claro = join(diretorio, 'artefato.txt');
  const chave = randomBytes(32);
  try {
    await criptografarFluxo({ entrada: Readable.from('conteudo sensivel'), destino: cifrado, chave });
    await descriptografarArquivo({ origem: cifrado, destino: claro, chave });
    assert.equal(await readFile(claro, 'utf8'), 'conteudo sensivel');
    const bytes = await readFile(cifrado);
    bytes[Math.floor(bytes.length / 2)] ^= 1;
    await writeFile(cifrado, bytes);
    await assert.rejects(
      descriptografarArquivo({ origem: cifrado, destino: join(diretorio, 'corrompido'), chave }),
    );
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
});

test('backup exige destino externo, snapshot de mídia e quatro classes recuperáveis', () => {
  assert.match(backup, /DESTINO_BACKUP_DEVE_SER_EXTERNO_E_ABSOLUTO/u);
  assert.match(backup, /VYNTRA_BACKUP_DESTINO_EXTERNO/u);
  assert.ok(backup.indexOf("'meta', 'snapshot'") < backup.indexOf("nome: 'midias-e-snapshot'"));
  for (const nome of ['postgresql', 'midias-e-snapshot', 'segredos', 'configuracao']) {
    assert.match(backup, new RegExp(`nome: '${nome}'`, 'u'));
  }
});

test('restauração é isolada, valida hashes e carrega banco limpo', () => {
  assert.match(restauracao, /ALVO_RESTAURACAO_NAO_ESTA_LIMPO/u);
  assert.match(restauracao, /HASH_BACKUP_DIVERGENTE/u);
  assert.match(restauracao, /'--network', 'none'/u);
  assert.match(restauracao, /pg_restore.*--exit-on-error/u);
  assert.match(restauracao, /_prisma_migrations/u);
});

test('timer persistente não deixa a distância nominal exceder quatro horas', () => {
  assert.match(timer, /OnCalendar=\*-\*-\* 00\/4:00:00/u);
  assert.match(timer, /Persistent=true/u);
});
