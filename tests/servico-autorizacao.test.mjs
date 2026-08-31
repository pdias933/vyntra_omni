import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const matriz = await readFile(
  'apps/api/src/autorizacao/matriz-permissoes.ts',
  'utf8',
);
const servico = await readFile(
  'apps/api/src/autorizacao/servico-autorizacao.ts',
  'utf8',
);
const repositorio = await readFile(
  'apps/api/src/autorizacao/repositorio-autorizacao-prisma.ts',
  'utf8',
);
const filtro = await readFile(
  'apps/api/src/http/filtro-excecao-http.ts',
  'utf8',
);

test('mantém dado sensível, exportação e transversais fora de todos os papéis base', () => {
  const blocoMatriz = matriz.slice(
    matriz.indexOf('MATRIZ_PERMISSOES_BASE'),
    matriz.indexOf('PERMISSOES_COM_ESCOPO_FILA'),
  );
  for (const permissao of [
    'VISUALIZAR_HISTORICO_TRANSVERSAL',
    'VISUALIZAR_NOTAS_TRANSVERSAIS',
    'VISUALIZAR_DADO_SENSIVEL',
    'EXPORTAR_HISTORICO',
  ]) {
    assert.ok(!blocoMatriz.includes(`'${permissao}'`), permissao);
  }
  assert.match(matriz, /PERMISSOES_SEMPRE_EXPLICITAS/);
});

test('ordena sessão, usuário, permissão e fila antes do recurso', () => {
  const indiceSessao = servico.indexOf('this.validarSessao(entrada)');
  const indiceContexto = servico.indexOf('this.repositorio.obterContexto');
  const indicePermissao = servico.indexOf('this.usuarioPodeExecutar');
  const indiceFila = servico.indexOf('this.escopoFilaPermitido');
  const indiceRecurso = servico.indexOf('await verificarRecurso');

  assert.ok(indiceSessao < indiceContexto);
  assert.ok(indiceContexto < indicePermissao);
  assert.ok(indicePermissao < indiceFila);
  assert.ok(indiceFila < indiceRecurso);
});

test('consulta somente usuário, perfil e a fila concreta solicitada', () => {
  assert.match(repositorio, /usuario\.findUnique/);
  assert.match(repositorio, /fila\.findUnique/);
  assert.match(repositorio, /acessoUsuarioFila\.findUnique/);
  assert.match(repositorio, /usuarioId_filaId/);
  assert.ok(!repositorio.includes('.findMany'));
  assert.ok(!repositorio.includes('Promise.allSettled'));
});

test('nega por erro único e o filtro publica somente 401 ou 403 canônicos', () => {
  assert.match(servico, /throw new ErroPermissaoNegada\(\)/);
  assert.ok(!servico.includes('RECURSO_NAO_ENCONTRADO'));
  assert.ok(!servico.includes('FILA_NAO_AUTORIZADA'));
  assert.match(filtro, /ErroNaoAutenticado/);
  assert.match(filtro, /ErroPermissaoNegada/);
  assert.match(filtro, /HttpStatus\.FORBIDDEN/);
});

test('permite autorização e consulta de recurso na mesma transação', () => {
  assert.match(servico, /transacao\?: TransacaoPrisma/);
  assert.match(servico, /verificarRecurso\(autorizacao, transacao\)/);
  assert.match(repositorio, /transacao \?\? \(await this\.prisma\.obterCliente\(\)\)/);
});
