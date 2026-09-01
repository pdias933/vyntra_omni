import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ServicoCriacaoProtocoloErp } from '../dist/protocolos-erp/servico-criacao-protocolo-erp.js';

const atendimentoId = '10000000-0000-4000-8000-000000000001';
const operacaoId = '20000000-0000-4000-8000-000000000002';
const chaveIdempotencia = '30000000-0000-4000-8000-000000000003';
const tokenExecucao = '40000000-0000-4000-8000-000000000004';
const tokenReconciliacao = '50000000-0000-4000-8000-000000000005';

function criarControleIdempotencia() {
  const chamadas = [];
  const operacao = {
    atualizadoEm: new Date(),
    criadoEm: new Date(),
    estado: 'PENDENTE',
    id: operacaoId,
    proximaAcaoEm: new Date(Date.now() - 1_000),
    registroIdempotenciaId: '60000000-0000-4000-8000-000000000006',
    tentativas: 0,
    tipo: 'CRIAR_PROTOCOLO_ERP',
    versao: 0,
  };
  return {
    chamadas,
    disponibilizar: () => {
      operacao.proximaAcaoEm = new Date(Date.now() - 1_000);
    },
    iniciarOuObter: async (_entrada, transacao) => {
      chamadas.push(['PREPARAR', transacao]);
      return { operacao: { ...operacao }, situacao: 'EXISTENTE' };
    },
    concederExecucao: async () => {
      assert.ok(['PENDENTE', 'AGUARDANDO_NOVA_TENTATIVA'].includes(operacao.estado));
      operacao.estado = 'EM_EXECUCAO';
      operacao.proximaAcaoEm = undefined;
      operacao.tentativas += 1;
      chamadas.push(['CONCEDER_EXECUCAO']);
      return {
        concedidaAte: new Date(Date.now() + 60_000),
        numeroTentativa: operacao.tentativas,
        operacaoId,
        tipo: 'EXECUCAO',
        tokenConcessao: tokenExecucao,
      };
    },
    concederReconciliacao: async () => {
      assert.equal(operacao.estado, 'RESULTADO_INCERTO');
      operacao.estado = 'EM_RECONCILIACAO';
      operacao.proximaAcaoEm = undefined;
      operacao.tentativas += 1;
      chamadas.push(['CONCEDER_RECONCILIACAO']);
      return {
        concedidaAte: new Date(Date.now() + 60_000),
        numeroTentativa: operacao.tentativas,
        operacaoId,
        tipo: 'RECONCILIACAO',
        tokenConcessao: tokenReconciliacao,
      };
    },
    concluir: async (entrada, transacao) => {
      assert.ok(['EM_EXECUCAO', 'EM_RECONCILIACAO'].includes(operacao.estado));
      operacao.estado = 'CONCLUIDA';
      chamadas.push(['CONCLUIR', entrada, transacao]);
    },
    registrarEfeitoAusente: async (entrada) => {
      operacao.estado = 'AGUARDANDO_NOVA_TENTATIVA';
      operacao.proximaAcaoEm = entrada.proximaAcaoEm;
      chamadas.push(['EFEITO_AUSENTE']);
    },
    registrarFalhaTemporaria: async (entrada) => {
      operacao.estado = 'AGUARDANDO_NOVA_TENTATIVA';
      operacao.proximaAcaoEm = entrada.proximaAcaoEm;
      chamadas.push(['FALHA_TEMPORARIA']);
    },
    registrarResultadoIncerto: async (entrada) => {
      operacao.estado = 'RESULTADO_INCERTO';
      operacao.proximaAcaoEm = entrada.proximaAcaoEm;
      chamadas.push(['RESULTADO_INCERTO']);
    },
  };
}

function criarCenario(resultadosCriacao, resultadosReconciliacao) {
  const transacoes = [];
  const protocolo = {
    atendimentoId,
    atualizadoEm: new Date('2026-09-01T12:00:00.000Z'),
    criadoEm: new Date('2026-09-01T12:00:00.000Z'),
    estado: 'PENDENTE',
    versao: 1,
  };
  const chamadasAdaptador = [];
  const controle = criarControleIdempotencia();
  const prisma = {
    executarTransacao: async (operacao) => {
      const transacao = { numero: transacoes.length + 1 };
      transacoes.push(transacao);
      return operacao(transacao);
    },
  };
  const protocolos = {
    inicializarPendente: async (_id, transacao) => {
      assert.equal(_id, atendimentoId);
      return { ...protocolo, transacao };
    },
    aplicarResultado: async (_id, resultado, transacao) => {
      assert.equal(_id, atendimentoId);
      if (protocolo.estado !== 'OFICIAL') {
        protocolo.estado = 'OFICIAL';
        protocolo.protocoloOficial = resultado.protocoloOficial;
        protocolo.confirmadoEm = resultado.confirmadoEm;
        protocolo.versao += 1;
      } else {
        assert.equal(protocolo.protocoloOficial, resultado.protocoloOficial);
      }
      protocolo.transacaoConfirmacao = transacao;
      return { ...protocolo };
    },
  };
  const adaptador = {
    criarAtendimento: async () => {
      chamadasAdaptador.push('CRIAR');
      return resultadosCriacao.shift();
    },
    reconciliarCriacaoAtendimento: async () => {
      chamadasAdaptador.push('RECONCILIAR');
      return resultadosReconciliacao.shift();
    },
  };
  return {
    adaptador,
    chamadasAdaptador,
    controle,
    protocolo,
    servico: new ServicoCriacaoProtocoloErp(prisma, controle, protocolos),
    transacoes,
  };
}

function entrada() {
  return {
    comando: {
      assunto: 'Suporte de conexão',
      atendimentoId,
      chaveIdempotencia,
      iniciadoEm: new Date('2026-09-01T12:00:00.000Z'),
    },
    proximaAcaoEm: new Date(Date.now() + 300_000),
  };
}

test('resposta perdida exige reconciliação antes de qualquer repetição', async () => {
  const confirmadoEm = new Date('2026-09-01T12:01:00.000Z');
  const cenario = criarCenario(
    [{ codigo: 'RESPOSTA_PERDIDA', requerReconciliacao: true, resultado: 'RESULTADO_INCERTO' }],
    [{ confirmadoEm, protocoloOficial: 'MK-OFICIAL-001', resultado: 'CONFIRMADO' }],
  );

  const incerto = await cenario.servico.executarCriacao(entrada(), cenario.adaptador);
  assert.equal(incerto.situacao, 'RECONCILIACAO_NECESSARIA');

  const repeticaoBloqueada = await cenario.servico.executarCriacao(
    entrada(),
    cenario.adaptador,
  );
  assert.equal(repeticaoBloqueada.situacao, 'RECONCILIACAO_NECESSARIA');
  assert.deepEqual(cenario.chamadasAdaptador, ['CRIAR']);

  cenario.controle.disponibilizar();
  const reconciliado = await cenario.servico.reconciliarCriacao(
    entrada(),
    cenario.adaptador,
  );
  assert.equal(reconciliado.situacao, 'CONCLUIDO');
  assert.equal(reconciliado.protocoloOficial, 'MK-OFICIAL-001');
  assert.deepEqual(cenario.chamadasAdaptador, ['CRIAR', 'RECONCILIAR']);
  assert.equal(cenario.protocolo.versao, 2);

  const conclusao = cenario.controle.chamadas.find(
    ([tipo]) => tipo === 'CONCLUIR',
  );
  assert.equal(conclusao[2], cenario.protocolo.transacaoConfirmacao);
});

test('efeito comprovadamente ausente libera nova criação com a mesma chave', async () => {
  const confirmadoEm = new Date('2026-09-01T12:02:00.000Z');
  const cenario = criarCenario(
    [
      { codigo: 'RESPOSTA_PERDIDA', requerReconciliacao: true, resultado: 'RESULTADO_INCERTO' },
      { confirmadoEm, protocoloOficial: 'MK-OFICIAL-002', resultado: 'CONFIRMADO' },
    ],
    [{ resultado: 'EFEITO_AUSENTE' }],
  );

  await cenario.servico.executarCriacao(entrada(), cenario.adaptador);
  cenario.controle.disponibilizar();
  const ausente = await cenario.servico.reconciliarCriacao(
    entrada(),
    cenario.adaptador,
  );
  assert.equal(ausente.situacao, 'AGUARDANDO_NOVA_TENTATIVA');
  assert.deepEqual(cenario.chamadasAdaptador, ['CRIAR', 'RECONCILIAR']);

  cenario.controle.disponibilizar();
  const repetido = await cenario.servico.executarCriacao(
    entrada(),
    cenario.adaptador,
  );
  assert.equal(repetido.situacao, 'CONCLUIDO');
  assert.deepEqual(cenario.chamadasAdaptador, [
    'CRIAR',
    'RECONCILIAR',
    'CRIAR',
  ]);
});
