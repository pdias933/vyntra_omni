import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroPermissaoNegada } from '../dist/autorizacao/erros-autorizacao.js';
import { ErroConflitoResgateAtendimento } from '../dist/atribuicoes-atendimento/erros-atribuicoes-atendimento.js';
import { ServicoOperacaoAtendimentos } from '../dist/operacao-atendimentos/servico-operacao-atendimentos.js';

function cenario() {
  const atendimentoId = randomUUID();
  const filaId = randomUUID();
  const sessao = { usuarioId: randomUUID(), sessaoId: randomUUID(), estado: 'ATIVA', expiraEm: new Date('2099-01-01') };
  let negado = false;
  let efeito = 0;
  let registro;
  const ordem = [];
  const transacao = {
    $executeRaw: async () => ordem.push('LOCK'),
    atendimento: {
      findUnique: async () => ({ filaAtualId: filaId }),
      count: async () => 1,
      findFirst: async () => ({ estado: efeito ? 'EM_ATENDIMENTO' : 'AGUARDANDO', usuarioResponsavelId: efeito ? sessao.usuarioId : null, versaoAtribuicao: efeito + 1, usuarioResponsavel: efeito ? { nomeExibicao: 'Operador sintético' } : null }),
    },
  };
  const autorizacao = { autorizar: async (entrada, verificar, tx) => {
    assert.equal(tx, transacao);
    ordem.push(entrada.permissao);
    if (negado) throw new ErroPermissaoNegada();
    assert.equal((await verificar()).acessivel, true);
  } };
  const atribuicoes = { resgatar: async (ator, id, fila, versao, tx) => {
    assert.equal(ator, sessao); assert.equal(id, atendimentoId); assert.equal(fila, filaId); assert.equal(tx, transacao);
    if (versao !== efeito + 1 || efeito) throw new ErroConflitoResgateAtendimento();
    efeito++;
    ordem.push('EFEITO_DOMINIO');
  } };
  const idempotencia = {
    iniciarOuObter: async (entrada, tx) => {
      assert.equal(tx, transacao);
      assert.equal(entrada.escopoId, sessao.usuarioId);
      ordem.push('IDEMPOTENCIA');
      if (registro) {
        if (registro.assinatura !== entrada.assinaturaRequisicaoHash) throw new Error('CHAVE_IDEMPOTENCIA_REUTILIZADA');
        return { situacao: 'EXISTENTE', operacao: { id: registro.id, estado: 'CONCLUIDA' } };
      }
      registro = { id: randomUUID(), assinatura: entrada.assinaturaRequisicaoHash };
      return { situacao: 'NOVA', operacao: { id: registro.id, estado: 'PENDENTE' } };
    },
    concederExecucao: async (id, _prazo, tx) => { assert.equal(tx, transacao); return { operacaoId: id, tokenConcessao: randomUUID() }; },
    concluir: async (entrada, tx) => { assert.equal(tx, transacao); assert.deepEqual(entrada.dados, { confirmado: true }); ordem.push('CONFIRMAR'); },
  };
  const servico = new ServicoOperacaoAtendimentos({ executarTransacao: (executar) => executar(transacao) }, autorizacao, atribuicoes, idempotencia);
  return { atendimentoId, sessao, transacao, servico, ordem, negar: () => { negado = true; }, efeitos: () => efeito };
}

test('consulta operacional não resgata e só projeta capacidades autorizadas', async () => {
  const x = cenario();
  const resultado = await x.servico.consultar(x.sessao, x.atendimentoId);
  assert.equal(resultado.podeResgatar, true);
  assert.equal(resultado.responsavelId, null);
  assert.equal(x.efeitos(), 0);
});

test('resgate delega e conclui idempotência na mesma transação; replay não duplica', async () => {
  const x = cenario();
  const chave = randomUUID();
  await x.servico.resgatar(x.sessao, x.atendimentoId, chave, 1, x.transacao);
  await x.servico.resgatar(x.sessao, x.atendimentoId, chave, 1, x.transacao);
  assert.equal(x.efeitos(), 1);
  assert.equal(x.ordem.filter((passo) => passo === 'CONFIRMAR').length, 1);
  assert.equal(x.ordem[0], 'LOCK');
  assert.ok(x.ordem.indexOf('RESGATAR_ATENDIMENTO') < x.ordem.indexOf('IDEMPOTENCIA'));
});

test('repetição não devolve resultado quando a permissão foi revogada', async () => {
  const x = cenario();
  const chave = randomUUID();
  await x.servico.resgatar(x.sessao, x.atendimentoId, chave, 1, x.transacao);
  x.negar();
  await assert.rejects(x.servico.resgatar(x.sessao, x.atendimentoId, chave, 1, x.transacao), ErroPermissaoNegada);
  assert.equal(x.efeitos(), 1);
});

test('mesma chave com versão diferente é recusada e conflito não expõe o vencedor', async () => {
  const x = cenario();
  const chave = randomUUID();
  await x.servico.resgatar(x.sessao, x.atendimentoId, chave, 1, x.transacao);
  await assert.rejects(x.servico.resgatar(x.sessao, x.atendimentoId, chave, 2, x.transacao), (erro) => erro.getStatus() === 409 && erro.getResponse().codigo === 'CHAVE_IDEMPOTENCIA_REUTILIZADA');
  const y = cenario();
  await assert.rejects(y.servico.resgatar(y.sessao, y.atendimentoId, randomUUID(), 9, y.transacao), (erro) => erro.getStatus() === 409 && !JSON.stringify(erro.getResponse()).includes('usuario'));
});
