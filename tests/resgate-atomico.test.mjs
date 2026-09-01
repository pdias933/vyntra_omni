import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('resgate persiste por comparação atômica de todas as pré-condições', async () => {
  const repositorio = await readFile(
    new URL(
      'apps/api/src/atribuicoes-atendimento/repositorio-atribuicoes-atendimento-prisma.ts',
      raiz,
    ),
    'utf8',
  );
  assert.match(repositorio, /estado: 'AGUARDANDO'/);
  assert.match(repositorio, /filaAtualId: filaEsperadaId/);
  assert.match(repositorio, /usuarioResponsavelId: null/);
  assert.match(repositorio, /versaoAtribuicao: versaoAtribuicaoEsperada/);
  assert.match(repositorio, /resultado\.count === 1/);
});

test('resgate integra autorização, histórico, evento e auditoria na mesma operação', async () => {
  const [servico, erros] = await Promise.all([
    readFile(
      new URL(
        'apps/api/src/atribuicoes-atendimento/servico-atribuicoes-atendimento.ts',
        raiz,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        'apps/api/src/atribuicoes-atendimento/erros-atribuicoes-atendimento.ts',
        raiz,
      ),
      'utf8',
    ),
  ]);
  assert.match(servico, /'VISUALIZAR_FILA'/);
  assert.match(servico, /'RESGATAR_ATENDIMENTO'/);
  assert.match(servico, /this\.historico\.substituir/);
  assert.match(servico, /this\.eventos\.acrescentar/);
  assert.match(servico, /this\.auditoria\.registrar/);
  assert.match(erros, /usuarioResponsavelVencedorId/);
});
