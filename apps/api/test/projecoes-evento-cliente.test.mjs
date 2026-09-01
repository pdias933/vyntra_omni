import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ProjetorEventoCliente } from '../dist/sincronizacao/projetor-evento-cliente.js';

const usuarioId = randomUUID();
const evento = {
  atendimentoId: randomUUID(),
  classificacaoDados: 'DADO_PESSOAL',
  conversaId: randomUUID(),
  criadoEm: new Date('2026-09-01T13:00:00Z'),
  dadosProtegidosMinimizados: { contadorNaoLidas: 2, estado: 'AGUARDANDO', formulario: '[PROTEGIDO]', mensagem: 'não pode sair', objeto: { bruto: true } },
  entidadeId: randomUUID(), entidadeTipo: 'MENSAGEM', id: randomUUID(), sequenciaEvento: 52n,
  tipo: 'MENSAGEM_RECEBIDA', usuarioAtorId: undefined,
};
const autorizado = { podeReceberPush: true, podeVerDadoPessoal: true, podeVerDadoSensivel: false, recursoAcessivel: true, sessaoValida: true, usuarioId };

test('nega por padrão sessão ou recurso sem autorização atual', () => {
  const projetor = new ProjetorEventoCliente();
  assert.equal(projetor.projetar(evento, 'WEB', { ...autorizado, sessaoValida: false }), undefined);
  assert.equal(projetor.projetar(evento, 'MOBILE', { ...autorizado, recursoAcessivel: false }), undefined);
});

test('web e mobile recebem projeções mínimas distintas sem objeto interno', () => {
  const projetor = new ProjetorEventoCliente();
  const web = projetor.projetar(evento, 'WEB', autorizado);
  const mobile = projetor.projetar(evento, 'MOBILE', autorizado);
  assert.equal(web.audiencia, 'WEB');
  assert.deepEqual(web.dados, { contadorNaoLidas: 2, estado: 'AGUARDANDO' });
  assert.equal(mobile.audiencia, 'MOBILE');
  assert.equal(mobile.politicaCache, 'PROTEGIDO');
  assert.equal(JSON.stringify([web, mobile]).includes('não pode sair'), false);
  assert.equal(JSON.stringify([web, mobile]).includes('dadosProtegidosMinimizados'), false);
});

test('classificação sem permissão remove dados e push carrega só navegação mínima', () => {
  const projetor = new ProjetorEventoCliente();
  const web = projetor.projetar(evento, 'WEB', { ...autorizado, podeVerDadoPessoal: false });
  assert.deepEqual(web.dados, {});
  const push = projetor.projetar(evento, 'PUSH', autorizado);
  assert.deepEqual(push, { audiencia: 'PUSH', atendimentoId: evento.atendimentoId, chaveAgrupamento: evento.conversaId, conversaId: evento.conversaId, sequenciaEvento: '52', tipoNotificacao: 'NOVA_MENSAGEM' });
  assert.equal('dados' in push, false);
});

test('evento de permissão alcança somente o próprio usuário e nunca gera push', () => {
  const projetor = new ProjetorEventoCliente();
  const permissao = { ...evento, classificacaoDados: 'OPERACIONAL', entidadeId: usuarioId, entidadeTipo: 'USUARIO', tipo: 'PERMISSOES_ALTERADAS' };
  assert.equal(projetor.projetar(permissao, 'WEB', { ...autorizado, recursoAcessivel: false }).tipo, 'PERMISSOES_ALTERADAS');
  assert.equal(projetor.projetar({ ...permissao, entidadeId: randomUUID() }, 'WEB', autorizado), undefined);
  assert.equal(projetor.projetar(permissao, 'PUSH', autorizado), undefined);
});
