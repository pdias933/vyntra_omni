import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ModuloConsoleMobile } from '../dist/console-mobile/modulo-console-mobile.js';
import { ServicoPrisma } from '../dist/persistencia/servico-prisma.js';
import { ServicoHistoricoAtribuicao } from '../dist/historico-atribuicao/servico-historico-atribuicao.js';
import { FiltroExcecaoHttp } from '../dist/http/filtro-excecao-http.js';
import { loggerSilencioso } from '../dist/observabilidade/logger-estruturado.js';

if (process.env.AMBIENTE_APLICACAO !== 'staging' || process.env.DADOS_PERMITIDOS !== 'sinteticos_ou_sanitizados' || process.env.VYNTRA_ACEITE_OPERACAO !== 'SOMENTE_DADOS_SINTETICOS') throw new Error('ACEITE_HTTP_NAO_AUTORIZADO');
const hash = (valor) => createHash('sha256').update(valor).digest('hex');
const segredo = () => randomBytes(32).toString('base64url');
const app = await NestFactory.create(ModuloConsoleMobile, { logger: false });
app.setGlobalPrefix('api/v1');
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: false }));
app.useGlobalFilters(new FiltroExcecaoHttp(app.get(HttpAdapterHost), loggerSilencioso));
const prisma = app.get(ServicoPrisma);
const cliente = await prisma.obterCliente();
const usuarios = [];
const prepararUi = process.env.VYNTRA_PREPARAR_UI === 'CRIAR_SESSOES_SINTETICAS_EFEMERAS';
let etapa = 'CENARIO';
try {
  const ids = Object.fromEntries(['perfil', 'fila', 'contato', 'conversa', 'conta', 'atendimento'].map((chave) => [chave, randomUUID()]));
  const agora = new Date(), expira = new Date(Date.now() + 600_000);
  for (let indice = 0; indice < 2; indice++) usuarios.push({ id: randomUUID(), webId: randomUUID(), mobileId: randomUUID(), dispositivoId: randomUUID(), tokenWeb: segredo(), csrf: segredo(), tokenMobile: segredo(), vinculo: segredo() });
  await prisma.executarTransacao(async (tx) => {
    await tx.perfilAcesso.create({ data: { id: ids.perfil, nome: 'Aceite HTTP PR128', nomeNormalizado: 'http-' + ids.perfil, papelBase: 'ATENDENTE' } });
    await tx.fila.create({ data: { id: ids.fila, nome: 'Fila HTTP PR128', nomeNormalizado: 'http-' + ids.fila } });
    for (const u of usuarios) {
      await tx.usuario.create({ data: { id: u.id, perfilId: ids.perfil, nomeExibicao: 'Operador HTTP sintético PR128' } });
      await tx.acessoUsuarioFila.create({ data: { usuarioId: u.id, filaId: ids.fila } });
      await tx.sessaoWeb.create({ data: { id: u.webId, usuarioId: u.id, tokenHash: hash(u.tokenWeb), csrfHash: hash(u.csrf), enderecoIp: '127.0.0.1', agenteUsuarioHash: hash('aceite-pr128'), expiraEm: expira } });
      await tx.dispositivoMobile.create({ data: { id: u.dispositivoId, usuarioId: u.id, identificadorInstalacaoHash: hash(segredo()), segredoVinculoHash: hash(u.vinculo), plataforma: 'ANDROID', versaoAplicativo: '999.0.0' } });
      await tx.sessaoMobile.create({ data: { id: u.mobileId, usuarioId: u.id, dispositivoId: u.dispositivoId, tokenAcessoHash: hash(u.tokenMobile), tokenRefreshHash: hash(segredo()), acessoExpiraEm: expira, refreshExpiraEm: new Date(expira.getTime() + 600_000) } });
    }
    await tx.contaWhatsApp.create({ data: { id: ids.conta, nomeExibicao: 'Origem HTTP sintética inativa', portfolioEmpresarialExternoId: ids.conta, identificadorCanalExterno: ids.conta } });
    await tx.contato.create({ data: { id: ids.contato, nomeExibicao: 'Contato HTTP sintético PR128' } });
    await tx.conversa.create({ data: { id: ids.conversa, contatoId: ids.contato, ultimaAtividadeEm: agora } });
    await tx.participacaoContaConversa.create({ data: { conversaId: ids.conversa, contaWhatsAppId: ids.conta, primeiraInteracaoEm: agora, ultimaInteracaoEm: agora } });
    await tx.atendimento.create({ data: { id: ids.atendimento, conversaId: ids.conversa, contaWhatsAppOrigemId: ids.conta, filaAtualId: ids.fila, modo: 'FILA_HUMANA', motivoEspera: 'AGUARDANDO_HUMANO', iniciadoEm: agora, atualizadoEm: agora } });
    await app.get(ServicoHistoricoAtribuicao).inicializar(ids.atendimento, { filaId: ids.fila, tipo: 'ENTRADA_FILA' }, tx);
  });
  if (prepararUi) {
    await writeFile('/evidencia/aceite-ui.json', JSON.stringify({ ids, usuarios, expiraEm: expira.toISOString() }), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ aceite: 'PR128_UI_PREPARADA', atendimentoId: ids.atendimento, expiraEm: expira.toISOString() }));
  } else {
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  async function requisitar(canal, u, rota, corpo, alterar = {}) {
    const headers = canal === 'web' ? {
      cookie: `__Host-vyntra_sessao=${u.tokenWeb}; __Host-vyntra_csrf=${u.csrf}`,
      origin: 'https://omni.up100.com.br', 'x-csrf-token': u.csrf,
    } : { authorization: 'Bearer ' + u.tokenMobile, 'x-dispositivo-id': u.dispositivoId, 'x-segredo-dispositivo': u.vinculo };
    const resposta = await fetch(base + '/api/v1/' + canal + rota, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: { ...headers, 'content-type': 'application/json', ...alterar },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
    const corpoResposta = await resposta.json();
    if (resposta.status >= 400) console.log(JSON.stringify({ etapa, canal, status: resposta.status, codigo: corpoResposta.codigo }));
    return { status: resposta.status, corpo: corpoResposta };
  }
  const rota = '/atendimentos/' + ids.atendimento;
  const [a, b] = usuarios;
  etapa = 'AUTENTICACAO_HTTP';
  assert.equal((await requisitar('web', a, rota + '/operacao')).status, 200);
  assert.equal((await requisitar('mobile', a, rota + '/operacao')).status, 200);
  assert.equal((await requisitar('mobile', a, rota + '/operacao', undefined, { 'x-segredo-dispositivo': segredo() })).status, 401);
  const resgate = { chave_idempotencia: randomUUID(), versao_atribuicao_esperada: 1 };
  assert.equal((await requisitar('web', a, rota + '/resgatar', resgate, { 'x-csrf-token': segredo() })).status, 403);
  assert.equal((await requisitar('web', a, rota + '/resgatar', resgate, { origin: 'https://origem-invalida.test' })).status, 403);
  assert.equal((await requisitar('web', a, rota + '/resgatar', { ...resgate, usuario_id: b.id })).status, 400);
  etapa = 'RESGATE_HTTP';
  assert.equal((await requisitar('web', a, rota + '/resgatar', resgate)).corpo.situacao, 'CONFIRMADA');
  assert.equal((await requisitar('web', a, rota + '/resgatar', resgate)).corpo.situacao, 'CONFIRMADA');
  const contextoMobile = await requisitar('mobile', b, rota + '/operacao');
  assert.equal(contextoMobile.corpo.responsavel_id, a.id);
  assert.equal(contextoMobile.corpo.versao_atribuicao, 2);
  etapa = 'NOTA_HTTP';
  const nota = { chave_idempotencia: randomUUID(), texto: 'Nota privada do aceite HTTP PR128' };
  assert.equal((await requisitar('mobile', a, rota + '/notas-internas', nota)).corpo.situacao, 'CONFIRMADA');
  assert.equal((await requisitar('mobile', a, rota + '/notas-internas', nota)).corpo.situacao, 'CONFIRMADA');
  assert.equal((await requisitar('web', a, rota + '/notas-internas', { chave_idempotencia: randomUUID(), texto: 'a'.repeat(4001) })).status, 400);
  assert.equal((await requisitar('web', a, rota + '/notas-internas', { chave_idempotencia: randomUUID(), texto: '   ' })).status, 400);
  etapa = 'TRANSFERENCIA_HTTP';
  assert.equal((await requisitar('mobile', b, '/perfil/disponibilidade', { chave_idempotencia: randomUUID(), estado: 'DISPONIVEL', versao_esperada: 0 })).corpo.situacao, 'CONFIRMADA');
  const destinos = await requisitar('web', a, rota + '/destinos-transferencia');
  assert.ok(destinos.corpo.some((destino) => destino.usuario_id === b.id));
  const transferir = { chave_idempotencia: randomUUID(), versao_atribuicao_esperada: 2, fila_destino_id: ids.fila, usuario_destino_id: b.id, confirmacao_explicita: true };
  assert.equal((await requisitar('web', a, rota + '/transferir', { ...transferir, confirmacao_explicita: false })).status, 400);
  assert.equal((await requisitar('web', a, rota + '/transferir', transferir)).corpo.situacao, 'CONFIRMADA');
  assert.equal((await requisitar('web', a, rota + '/transferir', transferir)).corpo.situacao, 'CONFIRMADA');
  for (const canal of ['web', 'mobile']) {
    assert.equal((await requisitar(canal, b, rota + '/operacao')).corpo.responsavel_id, b.id);
    const pagina = await requisitar(canal, b, rota + '/timeline');
    assert.equal(pagina.status, 200);
    assert.ok(JSON.stringify(pagina.corpo).includes(nota.texto));
  }
  assert.equal(await cliente.notaInterna.count({ where: { atendimentoId: ids.atendimento } }), 1);
  assert.equal(await cliente.mensagem.count({ where: { atendimentoId: ids.atendimento } }), 0);
  etapa = 'REVOGACAO_HTTP';
  await cliente.sessaoMobile.update({ where: { id: a.mobileId }, data: { estado: 'REVOGADA', revogadaEm: new Date(), motivoRevogacao: 'ACEITE_SINTETICO' } });
  assert.equal((await requisitar('mobile', a, rota + '/notas-internas', nota)).status, 401);
  console.log(JSON.stringify({ aceite: 'PR128_HTTP_POSTGRESQL', aprovado: true, csrf: true, origem: true, dispositivo: true, resgate: true, nota: true, transferencia: true, revogacao: true, atendimentoId: ids.atendimento }));
  }
} catch (erro) {
  console.error(JSON.stringify({ aceite: 'PR128_HTTP_POSTGRESQL', aprovado: false, etapa, codigo: erro.code ?? erro.name, mensagem: erro instanceof assert.AssertionError ? erro.message : 'ACEITE_FALHOU' }));
  process.exitCode = 1;
} finally {
  if (!prepararUi || process.exitCode === 1) {
  const agora = new Date();
  await cliente.sessaoWeb.updateMany({ where: { id: { in: usuarios.map((u) => u.webId) }, estado: 'ATIVA' }, data: { estado: 'REVOGADA', revogadaEm: agora, motivoRevogacao: 'FIM_ACEITE_SINTETICO' } });
  await cliente.sessaoMobile.updateMany({ where: { id: { in: usuarios.map((u) => u.mobileId) }, estado: 'ATIVA' }, data: { estado: 'REVOGADA', revogadaEm: agora, motivoRevogacao: 'FIM_ACEITE_SINTETICO' } });
  }
  await app.close();
}
