import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function cenario() {
  const fonte = await readFile(new URL('../apps/mobile/src/atendimentos/servico-atendimentos-mobile.ts', import.meta.url), 'utf8');
  const compilado = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  class ErroAtendimentoMobile extends Error { constructor(statusHttp) { super('RECUSADO'); this.statusHttp = statusHttp; } }
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', compilado)(() => ({ ErroAtendimentoMobile }), modulo, modulo.exports);
  let sessaoId = 'sessao-a', recusar = false;
  const chamadas = [];
  const operar = async (_credenciais, id, entrada) => {
    chamadas.push({ id, entrada });
    if (recusar) throw new ErroAtendimentoMobile(403);
    if (chamadas.length === 1) throw new Error('RESPOSTA_PERDIDA');
    return { situacao: 'CONFIRMADA' };
  };
  const servico = new modulo.exports.ServicoAtendimentosMobile({
    obterCredenciaisSincronizacao: async () => ({ credencial: { sessaoId } }),
    replica: { observarMudancas: () => () => undefined },
  }, { resgatar: operar, transferir: operar });
  return { servico, chamadas, trocarSessao: () => { sessaoId = 'sessao-b'; }, revogar: () => { recusar = true; } };
}

for (const [metodo, tipo] of [['resgatar', 'RESGATE'], ['transferir', 'TRANSFERENCIA']]) {
  test(`${tipo}: resposta perdida preserva chave fora da conversa, sem repetição automática`, async () => {
    const x = await cenario();
    const entrada = { chave_idempotencia: 'chave-original', versao_atribuicao_esperada: 1 };
    await assert.rejects(x.servico[metodo]('atendimento', entrada));
    assert.deepEqual(await x.servico.listarTentativasOperacionais(), [{ atendimentoId: 'atendimento', tipo }]);
    assert.equal(x.chamadas.length, 1);
    await assert.rejects(x.servico[metodo]('atendimento', { ...entrada, chave_idempotencia: 'outra-chave' }));
    await x.servico.repetirTentativaOperacional('atendimento', tipo);
    assert.equal(x.chamadas.length, 2);
    assert.deepEqual(x.chamadas[0], x.chamadas[1]);
    assert.deepEqual(await x.servico.listarTentativasOperacionais(), []);
  });
  test(`${tipo}: troca de sessão e recusa eliminam recibo sem restaurar conteúdo`, async () => {
    const x = await cenario();
    await assert.rejects(x.servico[metodo]('atendimento', { chave_idempotencia: 'original' }));
    x.revogar();
    await assert.rejects(x.servico.repetirTentativaOperacional('atendimento', tipo));
    assert.deepEqual(await x.servico.listarTentativasOperacionais(), []);
    const y = await cenario();
    await assert.rejects(y.servico[metodo]('atendimento', { chave_idempotencia: 'original' }));
    y.trocarSessao();
    assert.deepEqual(await y.servico.listarTentativasOperacionais(), []);
    assert.equal(y.chamadas.length, 1);
  });
}
