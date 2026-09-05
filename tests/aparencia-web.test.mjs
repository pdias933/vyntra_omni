import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { criarControladorAparencia } from '../apps/web/src/aparencia/controlador-aparencia.ts';

function ambiente({ escuro = false, salva = null, bloqueado = false } = {}) {
  const eventos = new Map();
  const mudancasSistema = new Set();
  const sistema = {
    matches: escuro,
    addEventListener: (_tipo, ouvir) => mudancasSistema.add(ouvir),
    removeEventListener: (_tipo, ouvir) => mudancasSistema.delete(ouvir),
  };
  const janela = {
    document: { documentElement: { dataset: {} } },
    matchMedia: () => sistema,
    localStorage: {
      getItem: () => { if (bloqueado) throw new Error('BLOQUEADO'); return salva; },
      setItem: (_chave, valor) => { if (bloqueado) throw new Error('BLOQUEADO'); salva = valor; },
    },
    addEventListener: (tipo, ouvir) => eventos.set(tipo, ouvir),
    removeEventListener: (tipo) => eventos.delete(tipo),
  };
  return {
    janela, eventos, mudancasSistema,
    alterarSistema(escuro) { sistema.matches = escuro; for (const ouvir of mudancasSistema) ouvir(); },
    ler: () => salva,
  };
}
const inicial = await readFile(new URL('../apps/web/public/aparencia-inicial.js', import.meta.url), 'utf8');

test('primeiro carregamento aplica preferência antes do React inclusive com armazenamento bloqueado', () => {
  for (const [salva, sistema, esperado] of [['escuro', false, 'escuro'], ['claro', true, 'claro'], ['invalida', true, 'escuro'], [null, false, 'claro']]) {
    const { janela } = ambiente({ salva, escuro: sistema });
    runInNewContext(inicial, janela);
    assert.equal(janela.document.documentElement.dataset.tema, esperado);
    assert.equal(criarControladorAparencia(janela).obter().modo, esperado);
  }
  const { janela } = ambiente({ escuro: true, bloqueado: true });
  runInNewContext(inicial, janela);
  assert.equal(janela.document.documentElement.dataset.tema, 'escuro');
});

test('preferência manual ignora mudanças do sistema e Sistema volta a acompanhá-las', () => {
  const a = ambiente();
  runInNewContext(inicial, a.janela);
  const controlador = criarControladorAparencia(a.janela);
  let notificacoes = 0;
  const cancelar = controlador.observar(() => notificacoes++);
  controlador.escolher('escuro');
  const estadoManual = controlador.obter();
  a.alterarSistema(true);
  a.alterarSistema(false);
  assert.equal(controlador.obter(), estadoManual);
  assert.equal(a.ler(), 'escuro');
  assert.equal(notificacoes, 1);
  controlador.escolher('sistema');
  assert.equal(controlador.obter().modo, 'claro');
  a.alterarSistema(true);
  assert.equal(controlador.obter().modo, 'escuro');
  cancelar();
  assert.equal(a.eventos.size, 0);
  assert.equal(a.mudancasSistema.size, 0);
});

test('outra aba e limpeza da preferência convergem sem nova escrita', () => {
  const a = ambiente({ escuro: true });
  runInNewContext(inicial, a.janela);
  const controlador = criarControladorAparencia(a.janela);
  const cancelar = controlador.observar(() => {});
  a.eventos.get('storage')({ key: 'vyntra.aparencia.v1', newValue: 'claro' });
  assert.equal(controlador.obter().modo, 'claro');
  assert.equal(a.ler(), null);
  a.eventos.get('storage')({ key: 'outra', newValue: 'escuro' });
  assert.equal(controlador.obter().modo, 'claro');
  a.eventos.get('storage')({ key: null, newValue: null });
  assert.equal(controlador.obter().preferencia, 'sistema');
  assert.equal(controlador.obter().modo, 'escuro');
  cancelar();
});

test('falha de persistência conserva a escolha em memória e comunica a limitação', () => {
  const a = ambiente({ bloqueado: true });
  runInNewContext(inicial, a.janela);
  const controlador = criarControladorAparencia(a.janela);
  controlador.escolher('escuro');
  assert.equal(controlador.obter().modo, 'escuro');
  assert.equal(controlador.obter().erroPersistencia, true);
  assert.equal(a.janela.document.documentElement.dataset.tema, 'escuro');
});
