import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('porta de sessão de acesso permanece separada do ERP', async () => {
  const [porta, portaErp] = await Promise.all([
    ler('apps/api/src/sessao-acesso/adaptador-sessao-acesso.ts'),
    ler('apps/api/src/erp/adaptador-erp.ts'),
  ]);
  assert.match(porta, /interface AdaptadorSessaoAcesso/);
  assert.match(porta, /listarSessoes/);
  assert.match(porta, /desconectarSessao/);
  assert.ok(!portaErp.includes('SessaoAcesso'));
  assert.ok(!portaErp.includes('desconectarSessao'));
});

test('modelo não infere ATIVA por conexão cadastrada', async () => {
  const [modelo, simulador] = await Promise.all([
    ler('apps/api/src/sessao-acesso/modelo-sessao-acesso.ts'),
    ler(
      'apps/api/src/sessao-acesso/simuladores/adaptador-sessao-acesso-simulado.ts',
    ),
  ]);
  assert.match(modelo, /'ATIVA' \| 'INATIVA' \| 'DESCONHECIDA'/);
  assert.match(modelo, /NAO_CONFIGURADO/);
  assert.match(modelo, /DESATIVADO/);
  assert.match(simulador, /estadoFonte: EstadoFonteSessaoAcesso = 'DESATIVADO'/);
  assert.match(simulador, /sessao\.estado === 'DESCONHECIDA'/);
  assert.ok(!simulador.includes("estado ?? 'ATIVA'"));
});

test('controle de recurso nasce desativado por migration aditiva', async () => {
  const [migration, persistencia] = await Promise.all([
    ler(
      'apps/api/prisma/migrations/20260831001000_criar_controle_sessao_acesso_desativado/migration.sql',
    ),
    ler('apps/api/src/persistencia/servico-prisma.ts'),
  ]);
  assert.match(migration, /'SESSAO_ACESSO'/);
  assert.match(migration, /'DESATIVADO'/);
  assert.match(migration, /FALSE,[\s\S]*FALSE,[\s\S]*0,[\s\S]*0/);
  assert.match(migration, /ON CONFLICT \("codigo"\) DO NOTHING/);
  assert.match(
    persistencia,
    /20260831001000_criar_controle_sessao_acesso_desativado/,
  );
});

test('simulador não é registrado como provedor real', async () => {
  const modulo = await ler('apps/api/src/modulo-aplicacao.ts');
  assert.ok(!modulo.includes('AdaptadorSessaoAcessoSimulado'));
  assert.ok(!modulo.includes('ADAPTADOR_SESSAO_ACESSO'));
});
