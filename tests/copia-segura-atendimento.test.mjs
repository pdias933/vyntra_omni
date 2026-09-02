import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('cópia autenticada não cria link público e protege token contra URL e reuso', async () => {
  const [controlador, servico, politicaPublica] = await Promise.all([
    ler('apps/api/src/copias-atendimento/controlador-copias-atendimento-web.ts'),
    ler('apps/api/src/copias-atendimento/servico-copias-atendimento.ts'),
    ler('apps/api/src/acoes-atendimento-erp/politica-link-transcricao.ts'),
  ]);
  assert.match(controlador, /@Controller\('web'\)/u);
  assert.match(controlador, /@Post\('copias\/baixar'\)/u);
  assert.doesNotMatch(controlador, /@Get|Controller\('public/u);
  assert.match(servico, /randomBytes\(32\)/u);
  assert.match(servico, /createHash\('sha256'\)/u);
  assert.match(servico, /sessaoWebId !== sessao\.sessaoId/u);
  assert.match(servico, /estado: 'CONSUMIDA'/u);
  assert.match(politicaPublica, /DESATIVADO/u);
});

test('projeção exclui notas, formulários, reações e bytes de mídia', async () => {
  const servico = await ler('apps/api/src/copias-atendimento/servico-copias-atendimento.ts');
  assert.match(servico, /submissaoFormulario: \{ is: null \}/u);
  assert.match(servico, /tipo: \{ not: 'REACAO' \}/u);
  assert.match(servico, /\[\$\{this\.rotuloTipo\(mensagem\.tipo\)\} não incluído\]/u);
  assert.doesNotMatch(servico, /notaInterna\.find|eventoDominio\.find|midia\.find/u);
  assert.match(servico, /LIMITE_MENSAGENS = 10_000/u);
  assert.match(servico, /LIMITE_BYTES = 5 \* 1024 \* 1024/u);
});

test('migration conserva vínculo imutável e impede remoção do registro', async () => {
  const migration = await ler('apps/api/prisma/migrations/20260902000500_copia_segura_atendimento/migration.sql');
  assert.match(migration, /COPIA_ATENDIMENTO_TERMINAL_IMUTAVEL/u);
  assert.match(migration, /COPIA_ATENDIMENTO_VINCULO_IMUTAVEL/u);
  assert.match(migration, /BEFORE DELETE OR TRUNCATE/u);
  assert.match(migration, /token_hash.*CHAR\(64\)/u);
});
