import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroEntradaDesbloqueioConfiancaInvalida } from '../dist/desbloqueios-confianca/erros-desbloqueio-confianca.js';
import { ServicoExecucaoDesbloqueioConfianca } from '../dist/desbloqueios-confianca/servico-execucao-desbloqueio-confianca.js';

const atendimentoId = '10000000-0000-4000-8000-000000000001';
const filaId = '20000000-0000-4000-8000-000000000002';
const contratoExternoId = 'contrato-sintetico-001';
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date(Date.now() + 3_600_000),
  sessaoId: '30000000-0000-4000-8000-000000000003',
  usuarioId: '40000000-0000-4000-8000-000000000004',
};

function criarIdempotencia() {
  const porChave = new Map();
  const porId = new Map();
  const mapear = (operacao) => ({
    atualizadoEm: operacao.atualizadoEm,
    criadoEm: operacao.criadoEm,
    estado: operacao.estado,
    id: operacao.id,
    proximaAcaoEm: operacao.proximaAcaoEm,
    registroIdempotenciaId: operacao.registroIdempotenciaId,
    tentativas: operacao.tentativas,
    tipo: operacao.tipo,
    versao: operacao.versao,
  });
  const obter = (id) => {
    const operacao = porId.get(id);
    assert.ok(operacao);
    return operacao;
  };
  return {
    disponibilizar: (id) => {
      obter(id).proximaAcaoEm = new Date(Date.now() - 1_000);
    },
    iniciarOuObter: async (entrada) => {
      let operacao = porChave.get(entrada.chaveIdempotencia);
      const nova = operacao === undefined;
      if (nova) {
        operacao = {
          assinatura: entrada.assinaturaRequisicaoHash,
          atualizadoEm: new Date(),
          criadoEm: new Date(),
          estado: 'PENDENTE',
          id: randomUUID(),
          proximaAcaoEm: new Date(Date.now() - 1_000),
          registroIdempotenciaId: randomUUID(),
          tentativas: 0,
          tipo: entrada.tipoOperacao,
          versao: 0,
        };
        porChave.set(entrada.chaveIdempotencia, operacao);
        porId.set(operacao.id, operacao);
      } else if (operacao.assinatura !== entrada.assinaturaRequisicaoHash) {
        throw new Error('CHAVE_IDEMPOTENCIA_REUTILIZADA');
      }
      return { operacao: mapear(operacao), situacao: nova ? 'NOVA' : 'EXISTENTE' };
    },
    concederExecucao: async (id) => {
      const operacao = obter(id);
      if (!['PENDENTE', 'AGUARDANDO_NOVA_TENTATIVA'].includes(operacao.estado)) {
        throw new Error('OPERACAO_NAO_DISPONIVEL');
      }
      operacao.estado = 'EM_EXECUCAO';
      operacao.proximaAcaoEm = undefined;
      operacao.tentativas += 1;
      return {
        concedidaAte: new Date(Date.now() + 60_000),
        numeroTentativa: operacao.tentativas,
        operacaoId: id,
        tipo: 'EXECUCAO',
        tokenConcessao: randomUUID(),
      };
    },
    concederReconciliacao: async (id) => {
      const operacao = obter(id);
      if (operacao.estado !== 'RESULTADO_INCERTO') {
        throw new Error('OPERACAO_NAO_DISPONIVEL');
      }
      operacao.estado = 'EM_RECONCILIACAO';
      operacao.proximaAcaoEm = undefined;
      operacao.tentativas += 1;
      return {
        concedidaAte: new Date(Date.now() + 60_000),
        numeroTentativa: operacao.tentativas,
        operacaoId: id,
        tipo: 'RECONCILIACAO',
        tokenConcessao: randomUUID(),
      };
    },
    concluir: async ({ operacaoId }) => {
      obter(operacaoId).estado = 'CONCLUIDA';
    },
    registrarEfeitoAusente: async ({ operacaoId, proximaAcaoEm }) => {
      const operacao = obter(operacaoId);
      operacao.estado = 'AGUARDANDO_NOVA_TENTATIVA';
      operacao.proximaAcaoEm = proximaAcaoEm;
    },
    registrarFalhaTemporaria: async ({ operacaoId, proximaAcaoEm }) => {
      const operacao = obter(operacaoId);
      operacao.estado = 'AGUARDANDO_NOVA_TENTATIVA';
      operacao.proximaAcaoEm = proximaAcaoEm;
    },
    registrarResultadoIncerto: async ({ operacaoId, proximaAcaoEm }) => {
      const operacao = obter(operacaoId);
      operacao.estado = 'RESULTADO_INCERTO';
      operacao.proximaAcaoEm = proximaAcaoEm;
    },
  };
}

function criarCenario(adaptadorPersonalizado = {}) {
  const reservas = new Map();
  const confirmados = new Map();
  const auditorias = [];
  const idempotencia = criarIdempotencia();
  const repositorio = {
    bloquearContrato: async () => undefined,
    liberarReserva: async (contrato, operacaoId) =>
      reservas.get(contrato) === operacaoId && reservas.delete(contrato),
    obterConfirmadoPorOperacao: async (operacaoId) =>
      confirmados.get(operacaoId),
    registrarConfirmado: async (
      _atendimento,
      contrato,
      operacaoId,
      confirmadoEm,
    ) => {
      if (confirmados.has(operacaoId)) return false;
      confirmados.set(operacaoId, { confirmadoEm, contrato });
      return true;
    },
    reservar: async (contrato, _atendimento, operacaoId) => {
      const existente = reservas.get(contrato);
      if (existente === undefined) reservas.set(contrato, operacaoId);
      return reservas.get(contrato) === operacaoId;
    },
    reservaPertence: async (contrato, operacaoId) =>
      reservas.get(contrato) === operacaoId,
  };
  const elegibilidade = {
    autorizarExecucaoEObterUltimo: async (_sessao, entrada) => {
      const registros = [...confirmados.values()]
        .filter((item) => item.contrato === entrada.contratoExternoId)
        .sort((a, b) => b.confirmadoEm - a.confirmadoEm);
      return registros[0];
    },
    intervaloLocalPermite: (ultimo, agora) =>
      ultimo === undefined ||
      ultimo.confirmadoEm.getTime() + 30 * 24 * 60 * 60 * 1_000 <=
        agora.getTime(),
    verificarParaExecucao: async (_sessao, entrada, adaptador) => {
      const erp = await adaptador.verificarElegibilidadeDesbloqueio(
        entrada.contratoExternoId,
      );
      if (erp.resultado !== 'SUCESSO') return erp;
      return {
        consultadoEm: new Date(),
        elegivel: erp.item.elegivel,
        motivos: erp.item.elegivel ? [] : ['ERP_NAO_AUTORIZOU'],
        origem: 'TEMPO_REAL',
        resultado: 'SUCESSO',
      };
    },
  };
  const prisma = {
    executarLeituraConsistente: async (operacao) => operacao({}),
    executarTransacao: async (operacao) => operacao({}),
  };
  const auditoria = {
    registrar: async (registro, transacao) => {
      auditorias.push([registro, transacao]);
    },
  };
  const chamadas = [];
  const adaptador = {
    executarDesbloqueioConfianca: async () => {
      chamadas.push('EXECUTAR');
      return { resultado: 'CONFIRMADO' };
    },
    reconciliarDesbloqueioConfianca: async () => {
      chamadas.push('RECONCILIAR');
      return { resultado: 'CONFIRMADO' };
    },
    verificarElegibilidadeDesbloqueio: async () => {
      chamadas.push('VERIFICAR');
      return {
        item: { contratoExternoId, elegivel: true },
        origem: 'TEMPO_REAL',
        resultado: 'SUCESSO',
      };
    },
    ...adaptadorPersonalizado,
  };
  return {
    adaptador,
    auditorias,
    chamadas,
    confirmados,
    idempotencia,
    reservas,
    servico: new ServicoExecucaoDesbloqueioConfianca(
      prisma,
      idempotencia,
      elegibilidade,
      repositorio,
      auditoria,
    ),
  };
}

function entrada(chaveIdempotencia = randomUUID(), sobrescritas = {}) {
  return {
    atendimentoId,
    chaveIdempotencia,
    confirmacaoExplicita: true,
    contratoExternoId,
    filaId,
    proximaAcaoEm: new Date(Date.now() + 300_000),
    ...sobrescritas,
  };
}

test('confirmação explícita é obrigatória antes de qualquer consulta ou escrita', async () => {
  const cenario = criarCenario();
  await assert.rejects(
    cenario.servico.executar(
      sessao,
      entrada(randomUUID(), { confirmacaoExplicita: false }),
      cenario.adaptador,
    ),
    ErroEntradaDesbloqueioConfiancaInvalida,
  );
  assert.deepEqual(cenario.chamadas, []);
});

test('execução confirmada é idempotente, auditada e inicia janela local', async () => {
  const chave = randomUUID();
  const cenario = criarCenario();
  const primeira = await cenario.servico.executar(
    sessao,
    entrada(chave),
    cenario.adaptador,
  );
  const repetida = await cenario.servico.executar(
    sessao,
    entrada(chave),
    cenario.adaptador,
  );

  assert.equal(primeira.situacao, 'CONCLUIDO');
  assert.deepEqual(repetida, primeira);
  assert.deepEqual(cenario.chamadas, ['VERIFICAR', 'EXECUTAR']);
  assert.equal(cenario.confirmados.size, 1);
  assert.equal(cenario.reservas.size, 0);
  assert.equal(cenario.auditorias.length, 1);
  assert.equal(
    cenario.auditorias[0][0].tipoEvento,
    'DESBLOQUEIO_CONFIANCA_CONFIRMADO',
  );
  assert.ok(!JSON.stringify(cenario.auditorias).includes(contratoExternoId));
});

test('reserva por contrato impede duas chaves concorrentes', async () => {
  let liberar;
  let iniciou;
  const iniciouExecucao = new Promise((resolver) => {
    iniciou = resolver;
  });
  const efeitoPendente = new Promise((resolver) => {
    liberar = resolver;
  });
  const cenario = criarCenario({
    executarDesbloqueioConfianca: async () => {
      cenario.chamadas.push('EXECUTAR');
      iniciou();
      return efeitoPendente;
    },
  });

  const primeira = cenario.servico.executar(
    sessao,
    entrada(randomUUID()),
    cenario.adaptador,
  );
  await iniciouExecucao;
  const concorrente = await cenario.servico.executar(
    sessao,
    entrada(randomUUID()),
    cenario.adaptador,
  );
  assert.equal(concorrente.situacao, 'DESBLOQUEIO_CONCORRENTE');
  assert.equal(cenario.chamadas.filter((item) => item === 'EXECUTAR').length, 1);

  liberar({ resultado: 'CONFIRMADO' });
  assert.equal((await primeira).situacao, 'CONCLUIDO');
  assert.equal(cenario.confirmados.size, 1);
});

test('resposta perdida bloqueia repetição e reconciliação confirma o efeito', async () => {
  const chave = randomUUID();
  const cenario = criarCenario({
    executarDesbloqueioConfianca: async () => {
      cenario.chamadas.push('EXECUTAR');
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    },
  });
  const incerto = await cenario.servico.executar(
    sessao,
    entrada(chave),
    cenario.adaptador,
  );
  const repetido = await cenario.servico.executar(
    sessao,
    entrada(chave),
    cenario.adaptador,
  );
  assert.equal(incerto.situacao, 'RECONCILIACAO_NECESSARIA');
  assert.equal(repetido.situacao, 'RECONCILIACAO_NECESSARIA');
  assert.equal(cenario.chamadas.filter((item) => item === 'EXECUTAR').length, 1);

  cenario.idempotencia.disponibilizar(incerto.operacaoId);
  const reconciliado = await cenario.servico.reconciliar(
    sessao,
    entrada(chave),
    cenario.adaptador,
  );
  assert.equal(reconciliado.situacao, 'CONCLUIDO');
  assert.equal(cenario.confirmados.size, 1);
  assert.equal(cenario.reservas.size, 0);
});

test('resposta externa não normalizada vira resultado incerto conservador', async () => {
  const cenario = criarCenario({
    executarDesbloqueioConfianca: async () => {
      cenario.chamadas.push('EXECUTAR');
      return { campoExterno: 'nao-aceitar', resultado: 'CONFIRMADO' };
    },
  });
  const resultado = await cenario.servico.executar(
    sessao,
    entrada(),
    cenario.adaptador,
  );
  assert.equal(resultado.situacao, 'RECONCILIACAO_NECESSARIA');
  assert.equal(cenario.confirmados.size, 0);
  assert.equal(cenario.reservas.size, 1);
});
