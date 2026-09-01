import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('shell web autentica pelo SDK e mantém credenciais fora do cliente', async () => {
  const shell = await ler('apps/web/src/web/ShellWeb.tsx');
  assert.match(shell, /obterSessaoWeb/);
  assert.match(shell, /entrarSessaoWeb/);
  assert.match(shell, /sairSessaoWeb/);
  assert.match(shell, /sessaoValida\(resposta\.data\)/);
  assert.doesNotMatch(shell, /localStorage|sessionStorage|document\.cookie\s*=/);
});

test('shell reage à invalidação de permissões pelo SSE e possui rotas desktop', async () => {
  const shell = await ler('apps/web/src/web/ShellWeb.tsx');
  assert.match(shell, /new EventSource\('\/api\/v1\/sincronizacao\/eventos'/);
  assert.match(shell, /PERMISSOES_ALTERADAS/);
  assert.match(shell, /window\.history\.pushState/);
  assert.match(shell, /\/administracao\/usuarios/);
  assert.match(shell, /\/administracao\/operacao/);
  assert.match(shell, /\/administracao\/fluxos/);
  assert.match(shell, /\/saude/);
});

test('login trata expiração e substituição explícita da sessão mais antiga', async () => {
  const shell = await ler('apps/web/src/web/ShellWeb.tsx');
  assert.match(shell, /expira_em/);
  assert.match(shell, /confirmar_revogacao_sessao_mais_antiga/);
  assert.match(shell, /Substituir minha sessão mais antiga/);
  assert.match(shell, /MFA_NECESSARIO/);
});
