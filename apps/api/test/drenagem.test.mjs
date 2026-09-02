import assert from 'node:assert/strict';
import test from 'node:test';

import { encerrarAplicacaoGraciosamente } from '../dist/ciclo-vida-aplicacao.js';
import { ProcessoRecuperacaoExecucoesFluxo } from '../dist/execucoes-fluxo/processo-recuperacao-execucoes-fluxo.js';
import { RegistroConexoesSse } from '../dist/sincronizacao/registro-conexoes-sse.js';

test('API deixa a prontidão antes de fechar transportes e recursos', async () => {
  const ordem = [];
  await encerrarAplicacaoGraciosamente(
    { close: async () => ordem.push('FECHAR') },
    { iniciarDrenagem: () => ordem.push('DRENAR') },
    100,
  );
  assert.deepEqual(ordem, ['DRENAR', 'FECHAR']);
});

test('registro encerra todas as conexões SSE durante shutdown', () => {
  const registro = new RegistroConexoesSse();
  const encerradas = [];
  const remover = registro.registrar(() => encerradas.push('REMOVIDA'));
  registro.registrar(() => encerradas.push('ATIVA'));
  remover();
  registro.onModuleDestroy();
  assert.deepEqual(encerradas, ['ATIVA']);
});

test('worker termina o ciclo adquirido e não inicia outro após drenagem', async () => {
  let ciclosRecuperacao = 0;
  let ciclosExecucao = 0;
  let liberarExecucao;
  const execucaoEmCurso = new Promise((resolver) => {
    liberarExecucao = resolver;
  });
  const processo = new ProcessoRecuperacaoExecucoesFluxo(
    { executarCiclo: async () => { ciclosRecuperacao += 1; return 0; } },
    { executarCiclo: async () => { ciclosExecucao += 1; await execucaoEmCurso; return 0; } },
  );
  const termino = processo.executar();
  await new Promise((resolver) => setImmediate(resolver));
  processo.solicitarDrenagem();
  liberarExecucao();
  await termino;
  assert.equal(ciclosRecuperacao, 1);
  assert.equal(ciclosExecucao, 1);
});
