import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('transferência para fila compara origem e versão e limpa responsável', async () => {
  const repositorio = await readFile(
    new URL('apps/api/src/atribuicoes-atendimento/repositorio-atribuicoes-atendimento-prisma.ts', raiz),
    'utf8',
  );
  const transferencia = repositorio.slice(repositorio.indexOf('transferirParaFilaCondicional'));
  assert.match(transferencia, /filaAtualId: filaOrigemEsperadaId/);
  assert.match(transferencia, /versaoAtribuicao: versaoAtribuicaoEsperada/);
  assert.match(transferencia, /usuarioResponsavelId: null/);
  assert.match(transferencia, /estado: 'AGUARDANDO'/);
  assert.doesNotMatch(transferencia, /conversaId:|contaWhatsAppOrigemId:|protocoloErp:|contexto:/);
});

test('comando preserva domínio e produz histórico, evento e auditoria', async () => {
  const [maquina, servico] = await Promise.all([
    readFile(new URL('apps/api/src/atendimentos/maquina-estado-atendimento.ts', raiz), 'utf8'),
    readFile(new URL('apps/api/src/atribuicoes-atendimento/servico-atribuicoes-atendimento.ts', raiz), 'utf8'),
  ]);
  assert.match(maquina, /case 'TRANSFERIR_FILA'/);
  assert.match(servico, /tipo: 'TRANSFERENCIA_FILA'/);
  assert.match(servico, /ATENDIMENTO_TRANSFERIDO_PARA_FILA/);
  assert.match(servico, /filaOrigemId/);
  assert.match(servico, /filaDestinoId/);
});
