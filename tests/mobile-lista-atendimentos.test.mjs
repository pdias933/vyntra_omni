import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('snapshot projeta a lista dentro da mesma leitura autorizada', async () => {
  const [modelo, repositorio] = await Promise.all([
    ler('apps/api/src/sincronizacao/modelo-sincronizacao.ts'),
    ler('apps/api/src/sincronizacao/repositorio-ressincronizacao-prisma.ts'),
  ]);
  for (const campo of [
    'nomeContato',
    'filaNome',
    'quantidadeNaoLida',
    'slaEm',
    'janelaExpiraEm',
    'ultimaMensagemResumo',
  ]) {
    assert.match(modelo, new RegExp(campo));
  }
  assert.match(repositorio, /marcador_leitura_conversa_usuario/);
  assert.match(repositorio, /relogio_sla_atendimento/);
  assert.match(repositorio, /janela_atendimento_canal/);
  assert.match(repositorio, /JOIN conversas_autorizadas/);
  assert.match(repositorio, /mascararTelefone/);
});

test('SQLite mantém projeção consultável e filtros parametrizados', async () => {
  const repositorio = await ler(
    'apps/mobile/src/offline/repositorio-replica-local.ts',
  );
  for (const filtro of [
    'MEUS',
    'PENDENTES',
    'NAO_LIDOS',
    'SLA',
    'EXPIRANDO',
    'EM_AUTOMACAO',
  ]) {
    assert.match(repositorio, new RegExp(filtro));
  }
  assert.match(repositorio, /CREATE TABLE resumo_atendimento/);
  assert.match(repositorio, /public async listarAtendimentos/);
  assert.match(repositorio, /public async contarFiltrosAtendimentos/);
  assert.match(repositorio, /LIMIT 60/);
  assert.match(repositorio, /UPDATE estado_replica SET precisa_ressincronizar = 1/);
  assert.ok(
    repositorio.indexOf('INSERT INTO atendimento') <
      repositorio.indexOf('INSERT INTO resumo_atendimento'),
  );
});

test('lista mobile usa somente os seis filtros e atualização automática', async () => {
  const [tela, navegacao, aplicacao] = await Promise.all([
    ler('apps/mobile/src/telas/TelaListaAtendimentos.tsx'),
    ler('apps/mobile/src/navegacao/NavegacaoPrincipal.tsx'),
    ler('apps/mobile/src/Aplicacao.tsx'),
  ]);
  for (const rotulo of [
    'Meus',
    'Pendentes',
    'Não lidos',
    'SLA',
    'Expirando',
    'Em automação',
  ]) {
    assert.match(tela, new RegExp(rotulo));
  }
  assert.match(tela, /observarMudancas/);
  assert.match(tela, /LinearTransition\.duration\(180\)/);
  assert.match(tela, /useReducedMotion/);
  assert.match(navegacao, /TelaListaAtendimentos/);
  assert.match(aplicacao, /estadoSincronizacao/);
  assert.ok(!tela.includes('RefreshControl'));
  assert.ok(!tela.includes('Última atualização'));
  assert.ok(!tela.includes('Puxe para atualizar'));
});

test('infraestrutura saudável fica invisível e falhas usam somente faixa transitória', async () => {
  const tela = await ler('apps/mobile/src/telas/TelaListaAtendimentos.tsx');
  assert.match(tela, /SEM_CONEXAO.*Sem conexão/s);
  assert.match(tela, /CONECTANDO.*Conectando\.\.\./s);
  assert.match(tela, /SINCRONIZANDO.*Sincronizando\.\.\./s);
  assert.ok(!/CONECTADO:.*texto/u.test(tela));
  assert.ok(!tela.includes('WebSocket'));
  assert.ok(!tela.includes('sequencia_evento'));
});

test('cartão mantém hierarquia de mensageria sem repetir painéis de CRM', async () => {
  const tela = await ler('apps/mobile/src/telas/TelaListaAtendimentos.tsx');
  assert.match(tela, /logo-whatsapp/);
  assert.match(tela, /ultimaMensagemResumo/);
  assert.match(tela, /quantidadeNaoLida/);
  assert.match(tela, /filaNome/);
  assert.ok(!tela.includes('Contrato'));
  assert.ok(!tela.includes('Cliente'));
  assert.ok(!tela.includes('cards de resumo'));
});
