/* global document, window, requestAnimationFrame, getComputedStyle */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { definicaoInicial, serializarDefinicao } from '../apps/web/src/editor/modelo-editor.ts';
import { TEMAS } from '../packages/tema/src/index.ts';
const motores = await import(process.env.VYNTRA_PLAYWRIGHT_MODULO ?? 'playwright');
const motor = process.env.VYNTRA_NAVEGADOR_TESTE ?? 'chromium';
assert.ok(['chromium', 'webkit'].includes(motor));
const endereco = new URL(process.env.VYNTRA_WEB_TESTE ?? 'http://127.0.0.1:4173');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(endereco.hostname), 'Fixtures somente em servidor local');
const origem = endereco.origin;

const destino = new URL(`../outputs/temas-validacao/${motor}/`, import.meta.url).pathname;
await mkdir(destino, { recursive: true });
await writeFile(destino+'resultado.json',JSON.stringify({motor,passou:false,estado:'EM_EXECUCAO'}));
const navegador = await motores[motor].launch({ ...(motor === 'chromium' ? { executablePath: process.env.VYNTRA_CHROME_EXECUTAVEL } : {}), headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
let autenticado = false;
const erros = [];
let chamadas = 0;
let leituras = 0;
let consultasTimeline = 0;
const agora = Date.now();
const iso = (minutos) => new Date(agora + minutos * 60_000).toISOString();
const id = (n) => '00000000-0000-4000-8000-'+String(n).padStart(12,'0');
let mensagemLida = id(17);
const atendimento = { atendimento_id: id(1), conversa_id: id(2), contato_id: id(3), conta_whatsapp_id: id(4), fila_id: id(5), fila_nome: 'Suporte', nome_contato: 'Contato de Teste', modo: 'HUMANO', estado: 'EM_ATENDIMENTO', ultima_atividade_em: iso(-1), ultima_mensagem_resumo: 'Obrigado pela ajuda!', ultima_mensagem_direcao: 'ENTRADA', quantidade_nao_lida: 2, janela_expira_em: iso(115), sla_em: iso(20) };
const itens = [
  ...Array.from({length:18},(_,i)=>({id:id(100+i),tipo:'MENSAGEM',direcao:'ENTRADA',texto:`Mensagem anterior de teste ${i+1}.`,ocorrido_em:iso(-50+i)})),
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
  if(u.pathname.endsWith('/timeline')) { consultasTimeline++; return resposta({itens,marcador:{versao:1,marcada_nao_lida:false,ultima_mensagem_lida_id:mensagemLida}}); }
  if(u.pathname.endsWith('/leitura')) { leituras++; mensagemLida = route.request().postDataJSON().mensagem_id; return resposta({versao:2}); }
  if(u.pathname.endsWith('/contato')) return resposta({atendimento_id:id(1),conversa_id:id(2),contato_id:id(3),fila_id:id(5),nome_exibicao:'Contato de Teste',estado_contato:'IDENTIFICADO',identidades:[{nome_perfil:'Contato de Teste',nome_usuario:'contato.teste',telefone_mascarado:'+55 XX XXXXX-1234'}],contagens:{atendimentos:5,midias:3,notas:1},permissoes:{consultarFinanceiro:false},vinculos:[],protocolo:'Protocolo de teste'});
  return resposta({codigo:'INDISPONIVEL_TESTE'},503);
});
const pagina=await contexto.newPage();
async function capturar(nome, modo) {
  await pagina.waitForFunction(modo => document.documentElement.dataset.tema === modo, modo);
  await pagina.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const observado=await pagina.evaluate(() => ({modo:document.documentElement.dataset.tema, fundo:getComputedStyle(document.documentElement).getPropertyValue('--cor-fundo').trim(), tela:getComputedStyle(document.querySelector('.tela-login,.timeline-web')).backgroundColor}));
  assert.equal(observado.fundo, TEMAS[modo].fundo);
  const rgb = hexadecimal => `rgb(${hexadecimal.slice(1).match(/../g).map(par => parseInt(par,16)).join(', ')})`;
  await pagina.waitForFunction(cores => {
    const el = document.querySelector('.tela-login,.timeline-web');
    return getComputedStyle(el).backgroundColor === (el.classList.contains('tela-login') ? cores.superficie : cores.fundo);
  }, {superficie:rgb(TEMAS[modo].superficie),fundo:rgb(TEMAS[modo].fundo)}, { timeout: 1500 });
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
await timeline.evaluate(el=>el.scrollTop=el.scrollHeight-el.clientHeight-50);
const antes=await timeline.evaluate(el=>el.scrollTop);
assert.ok(antes>0,'A fixture deve exigir rolagem real, não apenas preservar zero');
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

// PR124A: layout observado, sem confundir conteúdo cortado com responsividade.
const dimensoes = [];
for (const modo of ['escuro', 'claro']) {
  await pagina.getByRole('combobox',{name:'Aparência'}).selectOption(modo);
  for (const width of [2000, 1600, 1440, 1280, 1024, 861, 860, 768, 540, 390, 320]) {
    const height = width === 2000 ? 1945 : width <= 540 ? 740 : 900;
    await pagina.setViewportSize({width, height});
    await pagina.waitForFunction(altura => Math.abs(document.querySelector('.shell-web').getBoundingClientRect().height-altura)<1, height);
    await pagina.evaluate(() => new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const medidas = await pagina.evaluate(() => {
      const retangulo = seletor => { const el=document.querySelector(seletor); const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}; };
      return {raiz:retangulo('html'),shell:retangulo('.shell-web'),conversa:retangulo('.conversa-web'),cabecalho:retangulo('.conversa-web__cabecalho'),composer:retangulo('.composer-web'),timeline:retangulo('.timeline-web'),campo:retangulo('.campo-composer'),lista:retangulo('.lista-atendimentos')};
    });
    if (medidas.timeline.scrollWidth > medidas.timeline.clientWidth+1) {
      await pagina.screenshot({path:destino+`falha-largura-${width}.png`});
      console.log(await pagina.locator('.timeline-web *').evaluateAll(elementos => elementos.map(el => ({classe:el.className, texto:el.textContent?.slice(0,60), direita:el.getBoundingClientRect().right})).filter(el=>el.direita>window.innerWidth)));
    }
    for (const nome of ['raiz','shell','conversa','cabecalho','composer','timeline']) {
      assert.ok(medidas[nome].scrollWidth <= medidas[nome].clientWidth+1, `${motor}/${modo}/${width}: ${nome} transborda ${JSON.stringify(medidas[nome])}`);
    }
    assert.ok(medidas.composer.bottom <= height+1 && medidas.composer.y >= medidas.cabecalho.bottom, `${width}: composer visível ${JSON.stringify(medidas)}`);
    assert.ok(medidas.campo.width >= 100, `${width}: campo precisa continuar utilizável`);
    assert.ok(medidas.timeline.height >= 200, `${width}: timeline utilizável`);
    if (width > 860) assert.ok(medidas.lista.width >= 320 && medidas.lista.width <= 421);
    await pagina.locator('.conversa-web__contato').click();
    await pagina.locator('.painel-contato .identidade-detalhes').waitFor();
    const painel = await pagina.locator('.painel-contato').boundingBox();
    assert.ok(painel.x >= medidas.conversa.x && painel.x + painel.width <= width+1);
    if (width >= 1440) {
      const historico = await timeline.boundingBox();
      assert.ok(historico.x+historico.width <= painel.x+1, 'Detalhes lado a lado em desktop amplo');
    }
    if ([1600,390].includes(width)) await pagina.screenshot({path:destino+`responsivo-detalhes-${modo}-${width}.png`});
    await pagina.getByRole('button',{name:'Fechar detalhes'}).click();
    if (width <= 860) {
      await timeline.evaluate(el=>el.scrollTop=100);
      const posicao = await timeline.evaluate(el=>el.scrollTop);
      const consultasAntesVoltar = consultasTimeline;
      await pagina.getByRole('button',{name:'Voltar aos atendimentos'}).click();
      assert.equal(await pagina.locator('.lista-atendimentos').isVisible(),true);
      assert.equal(await pagina.locator('.conversa-web').isVisible(),false);
      if (width===390) await pagina.screenshot({path:destino+`responsivo-lista-${modo}-${width}.png`});
      await pagina.locator('.cartao-atendimento').first().click();
      assert.equal(await pagina.getByLabel('Mensagem',{exact:true}).inputValue(),'Rascunho preservado ao trocar aparência.');
      assert.equal(await timeline.evaluate(el=>el.scrollTop),posicao,'Voltar preserva posição real');
      assert.equal(consultasTimeline,consultasAntesVoltar,'Voltar não recarrega a conversa');
    }
    if ([2000,1280,860,390,320].includes(width)) await pagina.screenshot({path:destino+`responsivo-conversa-${modo}-${width}.png`});
    dimensoes.push({modo,width,height,passou:true});
  }
}
await pagina.locator('.menu-conversa > summary').click();
await pagina.getByRole('button',{name:'Buscar na conversa',exact:true}).waitFor();
await pagina.keyboard.press('Escape');
assert.equal(await pagina.locator('.menu-conversa').getAttribute('open'),null);
assert.equal(await pagina.locator('.menu-conversa > summary').evaluate(el=>el===document.activeElement),true);

// Mensagens novas podem sincronizar recolhidas, mas não tornam-se lidas.
await pagina.getByRole('button',{name:'Voltar aos atendimentos'}).click();
const leiturasAntes = leituras;
itens.push({...itens.at(-1),id:id(999),texto:'Mensagem recebida com conversa recolhida'});
await pagina.evaluate(()=>window.dispatchEvent(new CustomEvent('vyntra:evento')));
await pagina.getByText('Mensagem recebida com conversa recolhida',{exact:true}).waitFor({state:'attached'});
assert.equal(leituras,leiturasAntes,'Conversa recolhida não pode confirmar leitura');
await Promise.all([
  pagina.waitForResponse(resposta=>resposta.url().endsWith('/leitura') && resposta.status()===200),
  pagina.locator('.cartao-atendimento').first().click(),
]);
assert.equal(leituras,leiturasAntes+1);
await pagina.setViewportSize({width:800,height:740});
const fonteAmpliada = await pagina.addStyleTag({content:'html { font-size: 200%; }'});
await pagina.waitForFunction(()=>getComputedStyle(document.documentElement).fontSize==='32px');
await pagina.evaluate(() => new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const zoom = await pagina.evaluate(()=>({raiz:document.documentElement.scrollWidth, largura:window.innerWidth, composer:document.querySelector('.composer-web').getBoundingClientRect().bottom}));
assert.ok(zoom.raiz<=zoom.largura && zoom.composer<=740,'Texto ampliado deve preservar composer e viewport');
assert.equal(await pagina.locator('.abrir-modelos').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'Texto do botão não pode transbordar em 200%');
await pagina.screenshot({path:destino+'responsivo-texto-200.png'});
await fonteAmpliada.evaluate(el=>el.remove());
await pagina.setViewportSize({width:1600,height:1000});
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
await writeFile(destino+'resultado.json',JSON.stringify({motor,navegador:await navegador.version(),passou:true,dimensoes,escopos:['login','conversa','detalhes','rascunho','posicao','foco','sistema','persistencia','outras_abas','sem_requisicao_na_troca','reduzir_movimento','editor_claro_escuro','posicao_no','qr_optico','responsivo','texto_200','menu_teclado','leitura_apenas_visivel'],erros},null,2));
console.log(JSON.stringify({passou:true,destino,erros}));
await navegador.close();
