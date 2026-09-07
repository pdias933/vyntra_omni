import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const motores = await import(process.env.VYNTRA_PLAYWRIGHT_MODULO ?? 'playwright');
assert.equal(process.env.VYNTRA_ACEITE_STAGING, 'SOMENTE_SESSOES_SINTETICAS');
const caminho = process.env.VYNTRA_CENARIO_UI_FILE;
assert.ok(caminho?.startsWith('/tmp/vyntra-aceite-ui-'));
const cenario = JSON.parse(await readFile(caminho, 'utf8'));
assert.ok(new Date(cenario.expiraEm).getTime() > Date.now());
const origem = 'https://omni.up100.com.br';
const motor = process.env.VYNTRA_NAVEGADOR_TESTE ?? 'chromium';
assert.ok(['chromium', 'webkit'].includes(motor));
const navegador = await motores[motor].launch({ ...(motor === 'chromium' ? { executablePath: process.env.VYNTRA_CHROME_EXECUTAVEL } : {}), headless: true });
const contextos = [];
try {
  for (const usuario of cenario.usuarios) {
    const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await contexto.addCookies([
      { name: '__Host-vyntra_sessao', value: usuario.tokenWeb, url: origem, secure: true, httpOnly: true, sameSite: 'Strict' },
      { name: '__Host-vyntra_csrf', value: usuario.csrf, url: origem, secure: true, httpOnly: false, sameSite: 'Strict' },
    ]);
    contextos.push(contexto);
  }
  const [ca, cb] = contextos;
  const a = await ca.newPage(), b = await cb.newPage();
  await Promise.all([a.goto(origem), b.goto(origem)]);
  await b.getByLabel('Minha disponibilidade', { exact: true }).click();
  await b.getByRole('button', { name: 'Ficar disponível', exact: true }).click();
  await b.getByText('Disponibilidade confirmada.', { exact: true }).waitFor();
  await a.getByRole('tab', { name: 'Pendentes', exact: true }).click();
  await a.locator('.cartao-atendimento').filter({ hasText: 'Contato HTTP sintético PR128' }).click();
  await a.getByRole('button', { name: 'Resgatar atendimento', exact: true }).click();
  async function acoes(pagina) {
    await pagina.getByLabel('Mais ações da conversa', { exact: true }).click();
    await pagina.locator('.menu-conversa').getByRole('button', { name: 'Ações do sistema', exact: true }).click();
  }
  await acoes(a);
  await a.getByRole('button', { name: 'Adicionar nota interna · Somente equipe', exact: true }).click();
  const texto = 'Aceite web publicado — Somente equipe — ' + cenario.ids.atendimento;
  await a.getByLabel('Texto da nota · Somente equipe').fill(texto);
  let perdeu = false;
  const chaves = [];
  await ca.route('**/notas-internas', async (route) => {
    chaves.push(route.request().postDataJSON().chave_idempotencia);
    const resposta = await route.fetch();
    assert.ok(resposta.ok(), 'Backend deve confirmar antes de simular resposta perdida');
    if (!perdeu) { perdeu = true; await route.abort('failed'); }
    else await route.fulfill({ response: resposta });
  });
  await a.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await a.getByText('Sem confirmação. Seu rascunho foi mantido; tente novamente explicitamente.').waitFor();
  await a.getByRole('button', { name: 'Tentar salvar a mesma nota' }).click();
  await a.getByText('Nota salva · Somente equipe', { exact: true }).waitFor();
  assert.equal(chaves.length, 2); assert.equal(chaves[0], chaves[1]);
  await a.getByRole('button', { name: 'Fechar nota interna' }).click();
  await acoes(a);
  await a.getByRole('button', { name: 'Transferir atendimento', exact: true }).click();
  await a.getByLabel('Fila ou atendente').selectOption(cenario.ids.fila + ':' + cenario.usuarios[1].id);
  await a.getByRole('button', { name: 'Confirmar transferência', exact: true }).click();
  // Realtime real: o segundo cliente deve receber sem reload ou evento artificial.
  await b.locator('.cartao-atendimento').filter({ hasText: 'Contato HTTP sintético PR128' }).waitFor({ timeout: 20000 });
  await b.locator('.cartao-atendimento').filter({ hasText: 'Contato HTTP sintético PR128' }).click();
  await b.locator('.bloco-nota-interna').filter({ hasText: texto }).waitFor();
  assert.equal(await b.locator('.bloco-nota-interna').filter({ hasText: texto }).count(), 1);
  const rota = origem + '/api/v1/mobile/atendimentos/' + cenario.ids.atendimento;
  const u = cenario.usuarios[1];
  const headers = { authorization: 'Bearer ' + u.tokenMobile, 'x-dispositivo-id': u.dispositivoId, 'x-segredo-dispositivo': u.vinculo };
  const operacao = await cb.request.get(rota + '/operacao', { headers });
  assert.equal((await operacao.json()).responsavel_id, u.id);
  const timeline = await cb.request.get(rota + '/timeline', { headers });
  assert.equal((await timeline.json()).itens.filter((item) => item.tipo === 'NOTA_INTERNA' && item.texto === texto).length, 1);
  console.log(JSON.stringify({ aceite: 'PR128_WEB_STAGING_REAL', motor, aprovado: true, respostaPerdidaNota: true, segundoOperadorViaSse: true, convergenciaApiMobile: true, atendimentoId: cenario.ids.atendimento }));
} finally {
  // Sessões sintéticas duram dez minutos; logout web revoga imediatamente quando disponível.
  for (const [indice, contexto] of contextos.entries()) {
    const u = cenario.usuarios[indice];
    await contexto.request.post(origem + '/api/v1/autenticacao/web/sair', { headers: { origin: origem, 'x-csrf-token': u.csrf } }).catch(() => undefined);
  }
  await navegador.close();
}
