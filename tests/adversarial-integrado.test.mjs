import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

async function arquivosTsx(diretorio) {
  const entradas = await readdir(diretorio, { withFileTypes: true });
  const grupos = await Promise.all(entradas.map(async (entrada) => {
    const caminho = `${diretorio}/${entrada.name}`;
    if (entrada.isDirectory()) return arquivosTsx(caminho);
    return entrada.name.endsWith('.tsx') ? [caminho] : [];
  }));
  return grupos.flat();
}

test('fronteiras web não possuem injeção de HTML e documento fica em sandbox', async () => {
  const caminhos = await arquivosTsx('apps/web/src');
  for (const caminho of caminhos) {
    const codigo = await readFile(caminho, 'utf8');
    assert.doesNotMatch(codigo, /dangerouslySetInnerHTML|\.innerHTML\s*=/u, caminho);
  }
  const conversa = await readFile('apps/web/src/web/atendimentos/ConversaWeb.tsx', 'utf8');
  const controlador = await readFile('apps/api/src/console-web/controlador-console-web.ts', 'utf8');
  const borda = await readFile('infra/staging/Caddyfile.borda', 'utf8');
  assert.match(conversa, /<iframe sandbox=""/u);
  assert.match(controlador, /Content-Security-Policy.*default-src 'none'; sandbox/u);
  assert.match(controlador, /X-Content-Type-Options.*nosniff/u);
  assert.match(borda, /script-src 'self'/u);
  assert.doesNotMatch(borda.match(/script-src ([^;]+)/u)?.[1] ?? '', /'unsafe-inline'/u);
});

test('matriz adversarial referencia testes executáveis para cada ameaça aprovada', async () => {
  const pacote = JSON.parse(await readFile('package.json', 'utf8'));
  const comando = pacote.scripts['test:adversarial'];
  for (const arquivo of [
    'autorizacao.test.mjs',
    'entrada-meta-cloud.test.mjs',
    'midias.test.mjs',
    'mensagens-saida.test.mjs',
    'sse-sem-lacuna.test.mjs',
    'mobile-offline-reconciliacao.test.mjs',
    'adversarial-integrado.test.mjs',
  ]) assert.match(comando, new RegExp(arquivo.replaceAll('.', '\\.'), 'u'));
});

test('falhas recuperáveis permanecem ancoradas no PostgreSQL e não no Redis', async () => {
  const [execucoes, sincronizacao, saida] = await Promise.all([
    readFile('apps/api/src/execucoes-fluxo/repositorio-execucoes-fluxo-prisma.ts', 'utf8'),
    readFile('apps/api/src/sincronizacao/repositorio-sincronizacao-prisma.ts', 'utf8'),
    readFile('apps/api/src/mensagens/servico-mensagens-saida.ts', 'utf8'),
  ]);
  assert.doesNotMatch(`${execucoes}\n${sincronizacao}\n${saida}`, /from ['"].*redis|RedisClient|BullMQ/u);
  assert.match(saida, /ErroRevisaoPendenciaTextoNecessaria/u);
});

test('ensaio de falhas preserva as duas réplicas do worker', async () => {
  const ensaio = await readFile('scripts/aceitar-falhas-staging.mjs', 'utf8');
  assert.match(ensaio, /'--scale', 'worker_fluxos=2'/u);
});
