import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('assunção compara responsável anterior, fila e versão atomicamente', async () => {
  const repositorio = await readFile(
    new URL('apps/api/src/atribuicoes-atendimento/repositorio-atribuicoes-atendimento-prisma.ts', raiz),
    'utf8',
  );
  const assumir = repositorio.slice(repositorio.indexOf('assumirCondicional'));
  assert.match(assumir, /filaAtualId: filaEsperadaId/);
  assert.match(assumir, /usuarioResponsavelId: responsavelAnteriorEsperadoId/);
  assert.match(assumir, /versaoAtribuicao: versaoAtribuicaoEsperada/);
  assert.match(repositorio, /usuarioTemAutoridadeAtual/);
});

test('somente supervisão/administração assume e o evento canônico é emitido', async () => {
  const [matriz, servico] = await Promise.all([
    readFile(new URL('apps/api/src/autorizacao/matriz-permissoes.ts', raiz), 'utf8'),
    readFile(new URL('apps/api/src/atribuicoes-atendimento/servico-atribuicoes-atendimento.ts', raiz), 'utf8'),
  ]);
  assert.match(matriz, /ADMINISTRADOR:[\s\S]*'ASSUMIR_ATENDIMENTO'/);
  assert.match(matriz, /SUPERVISOR:[\s\S]*'ASSUMIR_ATENDIMENTO'/);
  assert.match(servico, /\['SUPERVISOR', 'ADMINISTRADOR'\]/);
  assert.match(servico, /tipo: 'ASSUNCAO_SUPERVISOR'/);
  assert.match(servico, /ATENDIMENTO_ASSUMIDO_POR_SUPERVISOR/);
});
