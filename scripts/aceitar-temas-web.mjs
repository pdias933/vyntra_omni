/* global document, requestAnimationFrame, getComputedStyle */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { definicaoInicial, serializarDefinicao } from '../apps/web/src/editor/modelo-editor.ts';
import { TEMAS } from '../packages/tema/src/index.ts';
const { chromium } = await import(process.env.VYNTRA_PLAYWRIGHT_MODULO ?? 'playwright');
const endereco = new URL(process.env.VYNTRA_WEB_TESTE ?? 'http://127.0.0.1:4173');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(endereco.hostname), 'Fixtures somente em servidor local');
const origem = endereco.origin;

const destino = new URL('../outputs/temas-validacao/', import.meta.url).pathname;
await mkdir(destino, { recursive: true });
const navegador = await chromium.launch({ executablePath: process.env.VYNTRA_CHROME_EXECUTAVEL, headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
let autenticado = false;
const erros = [];
let chamadas = 0;
const agora = Date.now();
const iso = (minutos) => new Date(agora + minutos * 60_000).toISOString();
const id = (n) => '00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const atendimento = { atendimento_id: id(1), conversa_id: id(2), contato_id: id(3), conta_whatsapp_id: id(4), fila_id: id(5), fila_nome: 'Suporte', nome_contato: 'Contato de Teste', modo: 'HUMANO', estado: 'EM_ATENDIMENTO', ultima_atividade_em: iso(-1), ultima_mensagem_resumo: 'Obrigado pela ajuda!', ultima_mensagem_direcao: 'ENTRADA', quantidade_nao_lida: 2, janela_expira_em: iso(115), sla_em: iso(20) };
const itens = [
  { id:id(10), tipo:'SEPARADOR_ATENDIMENTO', rotulo:'Atendimento de teste · Protocolo demonstrativo', ocorrido_em:iso(-20) },
  { id:id(11), tipo:'MENSAGEM', direcao:'ENTRADA', texto:'Bom dia! Preciso de ajuda com meu contrato.', ocorrido_em:iso(-15) },
  { id:id(12), tipo:'MENSAGEM', direcao:'SAIDA', texto:'Bom dia! Vou conferir as informações para você.', estado_mensagem:'LIDA', ocorrido_em:iso(-14) },
  { id:id(13), tipo:'EVENTO_OPERACIONAL', rotulo:'Atendimento transferido para Suporte', somente_equipe:true, ocorrido_em:iso(-13) },
  { id:id(14), tipo:'NOTA_INTERNA', texto:'Contexto interno de teste, visível somente para a equipe.', somente_equipe:true, ocorrido_em:iso(-12) },
  { id:id(15), tipo:'FORMULARIO', direcao:'ENTRADA', rotulo:'Informações de atendimento', campos_formulario:[{rotulo:'Documento',valor:'11X.XXX.XXX.84'},{rotulo:'Assunto',valor:'Suporte'}], ocorrido_em:iso(-11) },
  { id:id(16), tipo:'MENSAGEM', direcao:'SAIDA', texto:'As informações foram conferidas. Como posso ajudar?', estado_mensagem:'ENTREGUE', ocorrido_em:iso(-5) },
  { id:id(17), tipo:'MENSAGEM', direcao:'ENTRADA', texto:'Obrigado pela ajuda!', ocorrido_em:iso(-1) },
].map(item=>({ atendimento_id:id(1), conta_whatsapp_nome:'WhatsApp Suporte', mensagem_tipo:'TEXTO', ...item }));
await contexto.route('**/api/v1/**', async route => {
  chamadas++;
  const u=new URL(route.request().url());
  const resposta=(dados,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(dados)});
  if(u.pathname==='/api/v1/autenticacao/web/sessao') return resposta(autenticado?{sessao_id:id(90),usuario_id:id(91),nome_exibicao:'Operador de Teste',expira_em:iso(600)}:{codigo:'NAO_AUTENTICADO'},autenticado?200:401);
  if(u.pathname.endsWith('/sincronizacao/eventos')) return route.fulfill({status:200,contentType:'text/event-stream',body:': conectado\n\n'});
  if(u.pathname==='/api/v1/web/atendimentos') return resposta({filtro:'MEUS',itens:[atendimento,...['Marina Teste','Rafael Teste','Fernanda Teste','Lucas Teste'].map((nome,i)=>({...atendimento,nome_contato:nome,atendimento_id:id(30+i),conversa_id:id(40+i),ultima_atividade_em:iso(-4-i),sla_em:iso(60+i*35),quantidade_nao_lida:i}))]});
  if(u.pathname==='/api/v1/administracao/fluxos') return resposta([{id:id(60),nome:'Fluxo demonstrativo',tipo:'ATENDIMENTO',ativo:true,revisao:1,atualizado_em:iso(-30),versoes:[{id:id(61),fluxo_id:id(60),numero_versao:1,estado:'RASCUNHO',revisao:1,versao_schema_definicao:1,definicao:serializarDefinicao(definicaoInicial()),atualizada_em:iso(-30)}]}]);
  if(u.pathname==='/api/v1/autenticacao/web/pareamentos-qr') return resposta({pareamento_id:id(70),token_qr:'EXEMPLO_VISUAL_SEM_VALIDADE',expira_em:iso(1)},201);
  if(u.pathname.startsWith('/api/v1/autenticacao/web/pareamentos-qr/')) return resposta({pareamento_id:id(70),estado:'AGUARDANDO_LEITURA',expira_em:iso(1)});
  if(u.pathname.endsWith('/timeline')) return resposta({itens,marcador:{versao:1,marcada_nao_lida:false,ultima_mensagem_lida_id:id(17)}});
  if(u.pathname.endsWith('/leitura')) return resposta({versao:2});
  if(u.pathname.endsWith('/contato')) return resposta({atendimento_id:id(1),conversa_id:id(2),contato_id:id(3),fila_id:id(5),nome_exibicao:'Contato de Teste',estado_contato:'IDENTIFICADO',identidades:[{nome_perfil:'Contato de Teste',nome_usuario:'contato.teste',telefone_mascarado:'+55 XX XXXXX-1234'}],contagens:{atendimentos:5,midias:3,notas:1},permissoes:{consultarFinanceiro:false},vinculos:[],protocolo:'Protocolo de teste'});
  return resposta({codigo:'INDISPONIVEL_TESTE'},503);
});
const pagina=await contexto.newPage();
async function capturar(nome, modo) {
  await pagina.waitForFunction(modo => document.documentElement.dataset.tema === modo, modo);
  await pagina.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const observado=await pagina.evaluate(() => ({modo:document.documentElement.dataset.tema, fundo:getComputedStyle(document.documentElement).getPropertyValue('--cor-fundo').trim(), tela:getComputedStyle(document.querySelector('.tela-login,.timeline-web')).backgroundColor}));
  assert.equal(observado.fundo, modo==='escuro'?'#0B0F0D':'#F6F8F7');
  await pagina.waitForFunction(modo => {
    const el = document.querySelector('.tela-login,.timeline-web');
    return getComputedStyle(el).backgroundColor === (modo === 'escuro' ? (el.classList.contains('tela-login') ? 'rgb(18, 24, 21)' : 'rgb(11, 15, 13)') : (el.classList.contains('tela-login') ? 'rgb(255, 255, 255)' : 'rgb(246, 248, 247)'));
  }, modo, { timeout: 1500 });
  console.log(nome,observado);
  await pagina.screenshot({path:destino+nome+'.png'});
}
pagina.on('pageerror',e=>erros.push(e.message));
await pagina.goto(origem);
await pagina.getByRole('heading',{name:'Boas-vindas'}).waitFor();
assert.equal(await pagina.locator('html').getAttribute('data-tema'),'escuro');
await capturar('web-login-escuro','escuro');
await pagina.getByLabel('Usuário ou e-mail').fill('operador.teste');
await pagina.getByRole('combobox',{name:'Aparência'}).selectOption('claro');
assert.equal(await pagina.getByLabel('Usuário ou e-mail').inputValue(),'operador.teste');
await capturar('web-login-claro','claro');
await pagina.reload();
await pagina.getByRole('heading',{name:'Boas-vindas'}).waitFor();
assert.equal(await pagina.locator('html').getAttribute('data-tema'),'claro');
await pagina.emulateMedia({colorScheme:'light'});
await pagina.getByRole('combobox',{name:'Aparência'}).selectOption('sistema');
await pagina.emulateMedia({colorScheme:'dark'});
await pagina.waitForFunction(()=>document.documentElement.dataset.tema==='escuro');
autenticado=true;
await pagina.reload();
await pagina.locator('.cartao-atendimento').first().click();
await pagina.locator('.bloco-nota-interna').waitFor();
await pagina.getByLabel('Mensagem',{exact:true}).fill('Rascunho preservado ao trocar aparência.');
const timeline=pagina.locator('.timeline-web');
await timeline.evaluate(el=>el.scrollTop=70);
const antes=await timeline.evaluate(el=>el.scrollTop);
const chamadasAntes=chamadas;
await pagina.getByRole('combobox',{name:'Aparência'}).selectOption('claro');
await capturar('web-conversa-claro','claro');
assert.equal(await pagina.getByLabel('Mensagem',{exact:true}).inputValue(),'Rascunho preservado ao trocar aparência.');
assert.equal(await timeline.evaluate(el=>el.scrollTop),antes);
assert.equal(chamadas,chamadasAntes);
await pagina.getByRole('combobox',{name:'Aparência'}).selectOption('escuro');
await capturar('web-conversa-escuro','escuro');
await pagina.locator('.conversa-web__contato').click();
await pagina.locator('.painel-contato .identidade-detalhes').waitFor();
await capturar('web-detalhes-escuro','escuro');
const outra=await contexto.newPage();
await outra.goto(origem);
await outra.getByRole('combobox',{name:'Aparência'}).selectOption('claro');
await pagina.waitForFunction(()=>document.documentElement.dataset.tema==='claro');
assert.equal(await pagina.getByLabel('Mensagem',{exact:true}).inputValue(),'Rascunho preservado ao trocar aparência.');
await outra.close();
await pagina.getByRole('button',{name:'Fechar detalhes'}).click();
await pagina.getByRole('combobox',{name:'Aparência'}).selectOption('escuro');
await pagina.getByLabel('Mensagem',{exact:true}).focus();
const focoAntes=await pagina.evaluate(()=>document.activeElement?.getAttribute('aria-label'));
await contexto.newPage().then(async p=>{await p.goto(origem);await p.getByRole('combobox',{name:'Aparência'}).selectOption('claro');await p.close()});
await pagina.waitForFunction(()=>document.documentElement.dataset.tema==='claro');
assert.equal(await pagina.evaluate(()=>document.activeElement?.getAttribute('aria-label')),focoAntes);
await pagina.getByRole('button',{name:'Fluxos',exact:true}).click();
await pagina.locator('.react-flow__node').first().waitFor();
const no=pagina.locator('.react-flow__node').first();
const posicaoNo=await no.getAttribute('style');
await pagina.getByRole('combobox',{name:'Aparência'}).selectOption('escuro');
await pagina.locator('.react-flow.dark').waitFor();
assert.equal(await no.getAttribute('style'),posicaoNo);
await pagina.screenshot({path:destino+'web-editor-escuro.png'});
await pagina.getByRole('combobox',{name:'Aparência'}).selectOption('claro');
await pagina.locator('.react-flow.light').waitFor();
assert.equal(await no.getAttribute('style'),posicaoNo);
await pagina.screenshot({path:destino+'web-editor-claro.png'});
await pagina.getByRole('combobox',{name:'Aparência'}).selectOption('escuro');
await pagina.getByRole('button',{name:'Conectar celular',exact:true}).click();
await pagina.locator('.quadro-qr svg').waitFor();
const preenchimentos = await pagina.locator('.quadro-qr svg path').evaluateAll(nos=>nos.map(no=>no.getAttribute('fill')));
assert.ok(preenchimentos.includes('#FFFFFF'));
assert.ok(preenchimentos.includes(TEMAS.claro.qrTexto));
await pagina.screenshot({path:destino+'web-qr-escuro.png'});
assert.equal(erros.length,0,erros.join('\n'));
await writeFile(destino+'resultado.json',JSON.stringify({navegador:await navegador.version(),passou:true,escopos:['login','conversa','detalhes','rascunho','posicao','foco','sistema','persistencia','outras_abas','sem_requisicao_na_troca','reduzir_movimento','editor_claro_escuro','posicao_no','qr_optico'],erros},null,2));
console.log(JSON.stringify({passou:true,destino,erros}));
await navegador.close();
