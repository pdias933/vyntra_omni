import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroConflitoConversa,
  ErroEntradaConversaInvalida,
  ErroOrigemConversaIndisponivel,
} from '../dist/conversas/erros-conversa.js';
import { ServicoConversas } from '../dist/conversas/servico-conversas.js';

const ids = {
  contaA: randomUUID(),
  contaB: randomUUID(),
  contato: randomUUID(),
  conversa: randomUUID(),
};
const agora = new Date('2026-09-01T03:00:00.000Z');
const interacao = new Date('2026-09-01T02:00:00.000Z');

function entrada(sobrescritas = {}) {
  return {
    contaWhatsAppId: ids.contaA,
    contatoId: ids.contato,
    interacaoEm: interacao,
    ...sobrescritas,
  };
}

function conversaExistente(sobrescritas = {}) {
  return {
    atualizadaEm: new Date('2026-09-01T02:30:00.000Z'),
    contatoId: ids.contato,
    criadaEm: new Date('2026-09-01T01:00:00.000Z'),
    id: ids.conversa,
    ultimaAtividadeEm: interacao,
    versao: 1,
    ...sobrescritas,
  };
}

function participacaoExistente(sobrescritas = {}) {
  return {
    contaWhatsAppId: ids.contaA,
    conversaId: ids.conversa,
    primeiraInteracaoEm: new Date('2026-09-01T01:30:00.000Z'),
    ultimaInteracaoEm: interacao,
    versao: 1,
    ...sobrescritas,
  };
}

function criarCenario(sobrescritas = {}) {
  const chamadas = {
    atualizacoes: [],
    atualizacoesParticipacao: [],
    criacoes: [],
    criacoesParticipacao: [],
    ordem: [],
  };
  const repositorio = {
    atualizar: async (...argumentos) => {
      chamadas.ordem.push('ATUALIZAR_CONVERSA');
      chamadas.atualizacoes.push(argumentos);
      return sobrescritas.atualizada ?? true;
    },
    atualizarParticipacao: async (...argumentos) => {
      chamadas.ordem.push('ATUALIZAR_PARTICIPACAO');
      chamadas.atualizacoesParticipacao.push(argumentos);
      return sobrescritas.participacaoAtualizada ?? true;
    },
    bloquearContato: async () => chamadas.ordem.push('BLOQUEAR'),
    contatoExiste: async () => sobrescritas.contatoExiste ?? true,
    contaEstaAtiva: async () => sobrescritas.contaAtiva ?? true,
    criar: async (...argumentos) => {
      chamadas.ordem.push('CRIAR_CONVERSA');
      chamadas.criacoes.push(argumentos);
    },
    criarParticipacao: async (...argumentos) => {
      chamadas.ordem.push('CRIAR_PARTICIPACAO');
      chamadas.criacoesParticipacao.push(argumentos);
    },
    obterParticipacao: async () => sobrescritas.participacao,
    obterPorContato: async () => sobrescritas.conversa,
  };
  return {
    chamadas,
    servico: new ServicoConversas(repositorio),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('cria conversa única e registra a conta de origem na mesma transação', async () => {
  const cenario = criarCenario();
  const resultado = await cenario.servico.obterOuCriar(
    entrada(),
    cenario.transacao,
    () => agora,
  );
  assert.equal(resultado.conversaCriada, true);
  assert.equal(resultado.origemRegistrada, true);
  assert.equal(resultado.conversa.contatoId, ids.contato);
  assert.equal(resultado.participacao.contaWhatsAppId, ids.contaA);
  assert.deepEqual(cenario.chamadas.ordem, [
    'BLOQUEAR',
    'CRIAR_CONVERSA',
    'CRIAR_PARTICIPACAO',
  ]);
  assert.equal(cenario.chamadas.criacoes[0][1], cenario.transacao);
  assert.equal(cenario.chamadas.criacoesParticipacao[0][1], cenario.transacao);
});

test('segunda conta reutiliza a mesma conversa e preserva nova origem', async () => {
  const existente = conversaExistente();
  const cenario = criarCenario({ conversa: existente });
  const resultado = await cenario.servico.obterOuCriar(
    entrada({
      contaWhatsAppId: ids.contaB,
      interacaoEm: new Date('2026-09-01T02:45:00.000Z'),
    }),
    cenario.transacao,
    () => agora,
  );
  assert.equal(resultado.conversa.id, existente.id);
  assert.equal(resultado.conversaCriada, false);
  assert.equal(resultado.origemRegistrada, true);
  assert.equal(resultado.participacao.contaWhatsAppId, ids.contaB);
  assert.equal(resultado.conversa.versao, 2);
  assert.equal(cenario.chamadas.criacoes.length, 0);
  assert.equal(cenario.chamadas.atualizacoes.length, 1);
});

test('interação atrasada amplia apenas o início da participação', async () => {
  const existente = conversaExistente();
  const participacao = participacaoExistente();
  const cenario = criarCenario({ conversa: existente, participacao });
  const atrasada = new Date('2026-09-01T01:00:00.000Z');
  const resultado = await cenario.servico.obterOuCriar(
    entrada({ interacaoEm: atrasada }),
    cenario.transacao,
    () => agora,
  );
  assert.equal(resultado.participacao.primeiraInteracaoEm, atrasada);
  assert.equal(resultado.participacao.ultimaInteracaoEm, interacao);
  assert.equal(resultado.participacao.versao, 2);
  assert.equal(cenario.chamadas.atualizacoes.length, 0);
  assert.equal(cenario.chamadas.atualizacoesParticipacao.length, 1);
});

test('replay dentro do intervalo não cria nem altera conversa', async () => {
  const cenario = criarCenario({
    conversa: conversaExistente(),
    participacao: participacaoExistente(),
  });
  const resultado = await cenario.servico.obterOuCriar(
    entrada({ interacaoEm: new Date('2026-09-01T01:45:00.000Z') }),
    cenario.transacao,
    () => agora,
  );
  assert.equal(resultado.conversaCriada, false);
  assert.equal(resultado.origemRegistrada, false);
  assert.equal(cenario.chamadas.criacoes.length, 0);
  assert.equal(cenario.chamadas.atualizacoes.length, 0);
  assert.equal(cenario.chamadas.atualizacoesParticipacao.length, 0);
});

test('conflito otimista reverte a ampliação da participação', async () => {
  const cenario = criarCenario({
    atualizada: false,
    conversa: conversaExistente(),
    participacao: participacaoExistente(),
  });
  await assert.rejects(
    cenario.servico.obterOuCriar(
      entrada({ interacaoEm: new Date('2026-09-01T02:45:00.000Z') }),
      cenario.transacao,
      () => agora,
    ),
    ErroConflitoConversa,
  );
});

test('entrada inválida e conta inativa falham antes de criar conversa', async () => {
  const invalido = criarCenario();
  await assert.rejects(
    invalido.servico.obterOuCriar(
      entrada({ contatoId: 'invalido' }),
      invalido.transacao,
      () => agora,
    ),
    ErroEntradaConversaInvalida,
  );
  assert.equal(invalido.chamadas.ordem.length, 0);

  const inativo = criarCenario({ contaAtiva: false });
  await assert.rejects(
    inativo.servico.obterOuCriar(entrada(), inativo.transacao, () => agora),
    ErroOrigemConversaIndisponivel,
  );
  assert.equal(inativo.chamadas.criacoes.length, 0);
});
