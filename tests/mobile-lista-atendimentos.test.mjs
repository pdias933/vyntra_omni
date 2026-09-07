import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

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

test('faixa de filtros não disputa altura com lista e preserva fonte dinâmica', async () => {
  const tela = await ler('apps/mobile/src/telas/TelaListaAtendimentos.tsx');
  const arvore = ts.createSourceFile('tela.tsx', tela, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let inicializador;
  function visitar(no) {
    if (ts.isVariableDeclaration(no) && no.name.getText(arvore) === 'criarEstilos') inicializador = no.initializer;
    ts.forEachChild(no, visitar);
  }
  visitar(arvore);
  assert.ok(inicializador);
  const compilado = ts.transpileModule(`module.exports = ${inicializador.getText(arvore)};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = { exports: undefined };
  new Function('module', 'StyleSheet', 'ESPACOS', 'RAIOS', compilado)(
    modulo, { create: (estilos) => estilos }, { grande: 24, pequeno: 12 }, { pílula: 999 },
  );
  const estilos = modulo.exports({});
  assert.deepEqual(estilos.faixaFiltros, { flexGrow: 0, flexShrink: 0 });
  assert.equal(estilos.filtros.alignItems, 'center');
  assert.equal(estilos.areaLista.flex, 1);
  assert.ok(estilos.filtro.minHeight >= 44);
  assert.ok(estilos.filtro.paddingVertical > 0);
  for (const estilo of [estilos.faixaFiltros, estilos.filtros, estilos.filtro]) {
    assert.equal(estilo.height, undefined);
    assert.equal(estilo.maxHeight, undefined);
  }
  assert.match(tela, /<ScrollView[\s\S]*?style=\{estilos\.faixaFiltros\}/);
  assert.match(tela, /<Animated\.FlatList\s+style=\{estilos\.areaLista\}/);
  assert.ok(!tela.includes('allowFontScaling={false}'));
  assert.ok(!tela.includes('maxFontSizeMultiplier'));
});
