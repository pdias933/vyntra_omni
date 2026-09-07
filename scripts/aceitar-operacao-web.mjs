/* global window */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const motores = await import(process.env.VYNTRA_PLAYWRIGHT_MODULO ?? 'playwright');
const motor = process.env.VYNTRA_NAVEGADOR_TESTE ?? 'chromium';
assert.ok(['chromium', 'webkit'].includes(motor));
const endereco = new URL(process.env.VYNTRA_WEB_TESTE ?? 'http://127.0.0.1:4173');
assert.ok(['127.0.0.1', 'localhost'].includes(endereco.hostname), 'Fixtures somente locais');
const navegador = await motores[motor].launch({ ...(motor === 'chromium' ? { executablePath: process.env.VYNTRA_CHROME_EXECUTAVEL } : {}), headless: true });
try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  const id = randomUUID(), fila = randomUUID(), operador = randomUUID(), outro = randomUUID();
  let responsavel = null, versao = 1, nota, perdasNota = 0, perdasTransferencia = 0;
  const chavesNotas = [], chavesTransferencia = [];
  const item = { atendimento_id: id, conversa_id: randomUUID(), contato_id: randomUUID(), conta_whatsapp_id: randomUUID(), fila_id: fila, fila_nome: 'Suporte sintético', nome_contato: 'Contato operacional sintético', ultima_atividade_em: new Date().toISOString(), ultima_mensagem_resumo: 'Contexto sintético', quantidade_nao_lida: 1, modo: 'HUMANO', janela_expira_em: new Date(Date.now() + 7200000).toISOString() };
  await contexto.route('**/api/v1/**', async (route) => {
    const u = new URL(route.request().url()), path = u.pathname;
    const resposta = (dados, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(dados) });
    if (path.endsWith('/autenticacao/web/sessao')) return resposta({ sessao_id: randomUUID(), usuario_id: operador, nome_exibicao: 'Operador sintético', expira_em: '2099-01-01' });
    if (path.endsWith('/sincronizacao/eventos')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: evento\nid: 1\ndata: {"tipo":"ATENDIMENTO_RESGATADO","sequenciaEvento":"1"}\n\n' });
    if (path.endsWith('/web/atendimentos')) return resposta({ itens: (u.searchParams.get('filtro') === 'MEUS' && responsavel !== operador) ? [] : [{ ...item, estado: responsavel ? 'EM_ATENDIMENTO' : 'AGUARDANDO' }] });
    if (path.endsWith('/operacao')) return resposta({ atendimento_id: id, estado: responsavel ? 'EM_ATENDIMENTO' : 'AGUARDANDO', fila_id: fila, responsavel_id: responsavel, responsavel_nome: responsavel === null ? null : 'Operador sintético', versao_atribuicao: versao, pode_resgatar: responsavel === null, pode_transferir: true, pode_adicionar_nota: true });
    if (path.endsWith('/resgatar')) { responsavel = operador; versao = 2; return resposta({ situacao: 'CONFIRMADA' }); }
    if (path.endsWith('/timeline')) return resposta({ itens: nota === undefined ? [] : [{ id: randomUUID(), atendimento_id: id, ocorrido_em: new Date().toISOString(), tipo: 'NOTA_INTERNA', texto: nota, somente_equipe: true }], marcador: { versao: 0, marcada_nao_lida: false } });
    if (path.endsWith('/notas-internas')) {
      const corpo = route.request().postDataJSON();
      chavesNotas.push(corpo.chave_idempotencia); nota = corpo.texto;
      if (perdasNota++ === 0) return route.abort('failed');
      return resposta({ situacao: 'CONFIRMADA' });
    }
    if (path.endsWith('/destinos-transferencia')) return resposta([{ fila_id: fila, fila_nome: 'Suporte sintético', usuario_id: outro, usuario_nome: 'Outro operador' }]);
    if (path.endsWith('/transferir')) {
      const corpo = route.request().postDataJSON();
      chavesTransferencia.push(corpo.chave_idempotencia); responsavel = outro; versao = 3;
      if (perdasTransferencia++ === 0) return route.abort('failed');
      return resposta({ situacao: 'CONFIRMADA' });
    }
    if (path.endsWith('/contato')) return resposta({ atendimento_id: id, nome_exibicao: item.nome_contato, identidades: [], contagens: {}, permissoes: {}, vinculos: [] });
    return resposta({ codigo: 'INDISPONIVEL_TESTE' }, 503);
  });
  const pagina = await contexto.newPage(), erros = [];
  await pagina.addInitScript(() => {
    window.eventosOperacionaisRecebidos = 0;
    window.addEventListener('vyntra:evento', () => { window.eventosOperacionaisRecebidos += 1; });
  });
  async function abrirAcoes() {
    await pagina.getByLabel('Mais ações da conversa', { exact: true }).click();
    await pagina.locator('.menu-conversa').getByRole('button', { name: 'Ações do sistema', exact: true }).click();
  }
  pagina.on('pageerror', (erro) => erros.push(erro.message));
  await pagina.goto(endereco.origin);
  // Usa EventSource do navegador e o formato nomeado publicado pelo servidor.
  await pagina.waitForFunction(() => window.eventosOperacionaisRecebidos > 0);
  await pagina.getByRole('tab', { name: 'Pendentes', exact: true }).click();
  await pagina.locator('.cartao-atendimento').click();
  await pagina.getByRole('button', { name: 'Resgatar atendimento', exact: true }).click();
  await pagina.getByRole('tab', { name: 'Meus', exact: true }).waitFor();
  await pagina.getByLabel('Mensagem', { exact: true }).fill('Rascunho de mensagem separado');
  await abrirAcoes();
  await pagina.getByRole('button', { name: 'Adicionar nota interna · Somente equipe', exact: true }).click();
  await pagina.getByLabel('Texto da nota · Somente equipe').fill('Nota privada sintética');
  await pagina.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await pagina.getByText('Sem confirmação. Seu rascunho foi mantido; tente novamente explicitamente.').waitFor();
  assert.equal(await pagina.getByLabel('Texto da nota · Somente equipe').inputValue(), 'Nota privada sintética');
  await pagina.getByRole('button', { name: 'Fechar nota interna' }).click();
  await abrirAcoes();
  await pagina.getByRole('button', { name: 'Adicionar nota interna · Somente equipe', exact: true }).click();
  await pagina.getByRole('button', { name: 'Tentar salvar a mesma nota' }).click();
  await pagina.getByText('Nota salva · Somente equipe', { exact: true }).waitFor();
  assert.equal(chavesNotas.length, 2); assert.equal(chavesNotas[0], chavesNotas[1]);
  assert.equal(await pagina.getByLabel('Mensagem', { exact: true }).inputValue(), 'Rascunho de mensagem separado');
  await pagina.getByRole('button', { name: 'Fechar nota interna' }).click();
  await abrirAcoes();
  await pagina.getByRole('button', { name: 'Transferir atendimento', exact: true }).click();
  await pagina.getByLabel('Fila ou atendente').selectOption(fila + ':' + outro);
  await pagina.getByRole('button', { name: 'Confirmar transferência' }).click();
  await pagina.getByText('Sem confirmação. Tente novamente com a mesma seleção.').waitFor();
  await pagina.evaluate(() => window.dispatchEvent(new Event('vyntra:evento')));
  await pagina.locator('.cartao-atendimento').waitFor({ state: 'hidden' });
  await pagina.getByRole('button', { name: 'Verificar transferência pendente', exact: true }).click();
  await pagina.getByText('Transferência confirmada.', { exact: true }).waitFor();
  await pagina.getByRole('complementary', { name: 'Transferir atendimento' }).waitFor({ state: 'hidden' });
  assert.equal(chavesTransferencia.length, 2); assert.equal(chavesTransferencia[0], chavesTransferencia[1]);
  assert.deepEqual(erros, []);
  console.log(JSON.stringify({ aceite: 'PR128_UI_WEB_FIXTURES', motor, aprovado: true, respostaPerdida: true, rascunhosSeparados: true, transferenciaDesmontada: true }));
} finally { await navegador.close(); }
