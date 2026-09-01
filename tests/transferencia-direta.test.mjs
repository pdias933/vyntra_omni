import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);

test('transferência direta valida disponibilidade dentro da escrita atômica', async () => {
  const repositorio = await readFile(
    new URL('apps/api/src/atribuicoes-atendimento/repositorio-atribuicoes-atendimento-prisma.ts', raiz),
    'utf8',
  );
  const direta = repositorio.slice(repositorio.indexOf('transferirParaUsuarioCondicional'));
  assert.match(direta, /EXISTS/);
  assert.match(direta, /disponibilidade_usuario/);
  assert.match(direta, /'DISPONIVEL'/);
  assert.match(direta, /versao_atribuicao/);
  assert.match(direta, /fila_atual_id/);
});

test('RBAC central verifica destinatário e não existe etapa de aceite', async () => {
  const [autorizacao, servico] = await Promise.all([
    readFile(new URL('apps/api/src/autorizacao/servico-autorizacao.ts', raiz), 'utf8'),
    readFile(new URL('apps/api/src/atribuicoes-atendimento/servico-atribuicoes-atendimento.ts', raiz), 'utf8'),
  ]);
  assert.match(autorizacao, /autorizarUsuario/);
  assert.match(servico, /permissao: 'RECEBER_TRANSFERENCIA'/);
  assert.match(servico, /tipo: 'TRANSFERENCIA_USUARIO'/);
  assert.match(servico, /ATENDIMENTO_TRANSFERIDO_PARA_USUARIO/);
  assert.doesNotMatch(servico, /ACEITAR_TRANSFERENCIA|AGUARDANDO_ACEITE/);
});
