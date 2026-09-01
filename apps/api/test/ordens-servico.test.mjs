import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroEntradaOrdemServicoInvalida } from '../dist/ordens-servico/erros-ordem-servico.js';
import { ServicoOrdensServicoErp } from '../dist/ordens-servico/servico-ordens-servico.js';

const atendimentoId = '10000000-0000-4000-8000-000000000001';
const filaId = '20000000-0000-4000-8000-000000000002';
const clienteExternoId = 'cliente-sintetico-001';
const contratoExternoId = 'contrato-sintetico-001';
const protocoloOficial = 'PROTOCOLO-OFICIAL-001';
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
      const indice = `${entrada.escopoId}:${entrada.chaveIdempotencia}`;
      let operacao = porChave.get(indice);
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
        porChave.set(indice, operacao);
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
  const ordens = new Map();
  const porOperacaoCriacao = new Map();
  const historicoPorOperacao = new Map();
  const reservas = new Map();
  const auditorias = [];
  const autorizacoes = [];
  const idempotencia = criarIdempotencia();
  const prisma = {
    executarLeituraConsistente: async (operacao) => operacao({}),
    executarTransacao: async (operacao) => operacao({}),
  };
  const autorizacao = {
    autorizar: async (entrada, verificar, transacao) => {
      autorizacoes.push(entrada);
      const recurso = await verificar({}, transacao);
      if (!recurso.acessivel || !recurso.estadoPermiteAcao) {
        throw new Error('PERMISSAO_NEGADA');
      }
    },
  };
  const repositorio = {
    bloquearOrdem: async () => undefined,
    confirmarAtualizacao: async (atualizacao) => {
      const ordem = ordens.get(atualizacao.ordemServicoId);
      if (ordem?.versao !== atualizacao.versaoEsperada) return false;
      ordem.versao += 1;
      ordem.atualizadoEm = atualizacao.confirmadoEm;
      historicoPorOperacao.set(atualizacao.operacaoId, {
        confirmadoEm: atualizacao.confirmadoEm,
        ordemServicoId: atualizacao.ordemServicoId,
        versaoResultante: ordem.versao,
      });
      return true;
    },
    contextoEProtocoloCorrespondem: async (contexto) =>
      contexto.atendimentoId === atendimentoId &&
      contexto.filaId === filaId &&
      contexto.clienteExternoId === clienteExternoId &&
      contexto.contratoExternoId === contratoExternoId &&
      contexto.protocoloOficial === protocoloOficial,
    contextoEProtocoloCorrespondemParaFluxo: async (
      contexto,
      fluxoId,
      versaoFluxoId,
    ) =>
      contexto.atendimentoId === atendimentoId &&
      contexto.filaId === undefined &&
      contexto.clienteExternoId === clienteExternoId &&
      contexto.contratoExternoId === contratoExternoId &&
      contexto.protocoloOficial === protocoloOficial &&
      typeof fluxoId === 'string' &&
      typeof versaoFluxoId === 'string',
    criar: async (ordem) => {
      if (
        ordens.has(ordem.id) ||
        porOperacaoCriacao.has(ordem.operacaoCriacaoId)
      ) {
        return false;
      }
      ordens.set(ordem.id, { ...ordem });
      porOperacaoCriacao.set(ordem.operacaoCriacaoId, ordem.id);
      return true;
    },
    liberarReservaAtualizacao: async (ordemId, operacaoId) =>
      reservas.get(ordemId) === operacaoId && reservas.delete(ordemId),
    obterAtualizacaoPorOperacao: async (operacaoId) =>
      historicoPorOperacao.get(operacaoId),
    obterNoContexto: async (ordemId, contexto) => {
      const ordem = ordens.get(ordemId);
      if (ordem === undefined) return undefined;
      if (
        ordem.atendimentoId !== contexto.atendimentoId ||
        ordem.clienteExternoId !== contexto.clienteExternoId ||
        ordem.contratoExternoId !== contexto.contratoExternoId ||
        ordem.protocoloOficial !== contexto.protocoloOficial
      ) {
        return undefined;
      }
      return { ...ordem };
    },
    obterPorOperacaoCriacao: async (operacaoId) => {
      const ordemId = porOperacaoCriacao.get(operacaoId);
      return ordemId === undefined ? undefined : { ...ordens.get(ordemId) };
    },
    reservarAtualizacao: async (ordemId, operacaoId) => {
      if (!reservas.has(ordemId)) reservas.set(ordemId, operacaoId);
      return reservas.get(ordemId) === operacaoId;
    },
    reservaAtualizacaoPertence: async (ordemId, operacaoId) =>
      reservas.get(ordemId) === operacaoId,
  };
  const chamadas = [];
  const adaptador = {
    atualizarOrdemServico: async () => {
      chamadas.push('ATUALIZAR');
      return { resultado: 'CONFIRMADO' };
    },
    criarOrdemServico: async () => {
      chamadas.push('CRIAR');
      return {
        ordemServicoExternaId: 'OS-EXTERNA-SINTETICA-001',
        resultado: 'CONFIRMADO',
      };
    },
    reconciliarAtualizacaoOrdemServico: async () => {
      chamadas.push('RECONCILIAR_ATUALIZACAO');
      return { resultado: 'CONFIRMADO' };
    },
    reconciliarCriacaoOrdemServico: async () => {
      chamadas.push('RECONCILIAR_CRIACAO');
      return {
        ordemServicoExternaId: 'OS-EXTERNA-SINTETICA-001',
        resultado: 'CONFIRMADO',
      };
    },
    ...adaptadorPersonalizado,
  };
  const auditoria = {
    registrar: async (registro) => auditorias.push(registro),
  };
  return {
    adaptador,
    auditorias,
    autorizacoes,
    chamadas,
    historicoPorOperacao,
    idempotencia,
    ordens,
    reservas,
    servico: new ServicoOrdensServicoErp(
      prisma,
      autorizacao,
      idempotencia,
      repositorio,
      auditoria,
    ),
  };
}

function entradaCriacao(sobrescritas = {}) {
  return {
    assunto: 'Instalação técnica',
    atendimentoId,
    chaveIdempotencia: randomUUID(),
    clienteExternoId,
    confirmacaoExplicita: true,
    contratoExternoId,
    descricao: 'Executar instalação no endereço já confirmado.',
    filaId,
    protocoloOficial,
    proximaAcaoEm: new Date(Date.now() + 300_000),
    ...sobrescritas,
  };
}

function entradaAtualizacao(ordemServicoId, sobrescritas = {}) {
  return {
    ...entradaCriacao({
      assunto: 'Instalação técnica reagendada',
      descricao: 'Reagendar visita conforme confirmação do cliente.',
    }),
    ordemServicoId,
    versaoEsperada: 1,
    ...sobrescritas,
  };
}

test('confirmação explícita é exigida antes de autorização ou efeito', async () => {
  const cenario = criarCenario();
  await assert.rejects(
    cenario.servico.criar(
      sessao,
      entradaCriacao({ confirmacaoExplicita: false }),
      cenario.adaptador,
    ),
    ErroEntradaOrdemServicoInvalida,
  );
  assert.equal(cenario.autorizacoes.length, 0);
  assert.deepEqual(cenario.chamadas, []);
});

test('criação confirmada fixa contexto, protocolo e uma operação por chave', async () => {
  const cenario = criarCenario();
  const entrada = entradaCriacao();
  const primeira = await cenario.servico.criar(
    sessao,
    entrada,
    cenario.adaptador,
  );
  const repetida = await cenario.servico.criar(
    sessao,
    entrada,
    cenario.adaptador,
  );

  assert.equal(primeira.situacao, 'CONCLUIDA');
  assert.deepEqual(repetida, primeira);
  assert.deepEqual(cenario.chamadas, ['CRIAR']);
  assert.equal(cenario.ordens.size, 1);
  assert.equal(cenario.auditorias.length, 1);
  assert.deepEqual(cenario.auditorias[0].dadosNovos, {
    resultado: 'CONFIRMADO',
  });
  assert.ok(!JSON.stringify(cenario.auditorias).includes(entrada.descricao));
  assert.equal(
    cenario.autorizacoes.every(
      ({ permissao }) => permissao === 'CRIAR_ORDEM_SERVICO',
    ),
    true,
  );
});

test('criação por fluxo não fabrica usuário e revalida autoridade automatizada', async () => {
  const cenario = criarCenario();
  const ator = { fluxoId: randomUUID(), versaoFluxoId: randomUUID() };
  const resultado = await cenario.servico.criar(
    ator,
    entradaCriacao({ filaId: undefined }),
    cenario.adaptador,
  );
  assert.equal(resultado.situacao, 'CONCLUIDA');
  assert.equal(cenario.autorizacoes.length, 0);
  assert.equal(cenario.auditorias[0].origem, 'FLUXO');
  assert.equal(cenario.auditorias[0].fluxoId, ator.fluxoId);
  assert.equal(cenario.auditorias[0].versaoFluxoId, ator.versaoFluxoId);
  assert.equal(cenario.auditorias[0].usuarioId, undefined);
  assert.equal(cenario.auditorias[0].sessaoId, undefined);

  await assert.rejects(
    cenario.servico.criar(ator, entradaCriacao(), cenario.adaptador),
    ErroEntradaOrdemServicoInvalida,
  );
});

test('resposta perdida na criação reconcilia sem repetir a escrita', async () => {
  let efeitos = 0;
  const cenario = criarCenario({
    criarOrdemServico: async () => {
      efeitos += 1;
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    },
  });
  const entrada = entradaCriacao();
  const incerta = await cenario.servico.criar(
    sessao,
    entrada,
    cenario.adaptador,
  );
  const bloqueada = await cenario.servico.criar(
    sessao,
    entrada,
    cenario.adaptador,
  );
  assert.equal(incerta.situacao, 'RECONCILIACAO_NECESSARIA');
  assert.equal(bloqueada.situacao, 'RECONCILIACAO_NECESSARIA');
  assert.equal(efeitos, 1);
  cenario.idempotencia.disponibilizar(incerta.operacaoId);
  const reconciliada = await cenario.servico.reconciliarCriacao(
    sessao,
    entrada,
    cenario.adaptador,
  );
  assert.equal(reconciliada.situacao, 'CONCLUIDA');
  assert.equal(efeitos, 1);
});

test('atualização confirmada incrementa versão, histórico e replay estável', async () => {
  const cenario = criarCenario();
  const criada = await cenario.servico.criar(
    sessao,
    entradaCriacao(),
    cenario.adaptador,
  );
  const entrada = entradaAtualizacao(criada.ordemServicoId);
  const atualizada = await cenario.servico.atualizar(
    sessao,
    entrada,
    cenario.adaptador,
  );
  const repetida = await cenario.servico.atualizar(
    sessao,
    entrada,
    cenario.adaptador,
  );

  assert.equal(atualizada.situacao, 'CONCLUIDA');
  assert.equal(atualizada.versao, 2);
  assert.deepEqual(repetida, atualizada);
  assert.equal(cenario.historicoPorOperacao.size, 1);
  assert.equal(cenario.reservas.size, 0);
  assert.deepEqual(cenario.chamadas, ['CRIAR', 'ATUALIZAR']);
});

test('reserva impede duas chaves de atualizarem a mesma versão', async () => {
  let liberar;
  const bloqueio = new Promise((resolver) => {
    liberar = resolver;
  });
  let iniciou;
  const iniciouPromessa = new Promise((resolver) => {
    iniciou = resolver;
  });
  const cenario = criarCenario({
    atualizarOrdemServico: async () => {
      iniciou();
      await bloqueio;
      return { resultado: 'CONFIRMADO' };
    },
  });
  const criada = await cenario.servico.criar(
    sessao,
    entradaCriacao(),
    cenario.adaptador,
  );
  const primeiraEntrada = entradaAtualizacao(criada.ordemServicoId);
  const primeira = cenario.servico.atualizar(
    sessao,
    primeiraEntrada,
    cenario.adaptador,
  );
  await iniciouPromessa;
  const concorrente = await cenario.servico.atualizar(
    sessao,
    entradaAtualizacao(criada.ordemServicoId),
    cenario.adaptador,
  );
  assert.equal(concorrente.situacao, 'ATUALIZACAO_CONCORRENTE');
  liberar();
  assert.equal((await primeira).situacao, 'CONCLUIDA');
});

test('resposta perdida na atualização mantém reserva até reconciliação', async () => {
  let efeitos = 0;
  const cenario = criarCenario({
    atualizarOrdemServico: async () => {
      efeitos += 1;
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    },
  });
  const criada = await cenario.servico.criar(
    sessao,
    entradaCriacao(),
    cenario.adaptador,
  );
  const entrada = entradaAtualizacao(criada.ordemServicoId);
  const incerta = await cenario.servico.atualizar(
    sessao,
    entrada,
    cenario.adaptador,
  );
  assert.equal(incerta.situacao, 'RECONCILIACAO_NECESSARIA');
  assert.equal(cenario.reservas.size, 1);
  cenario.idempotencia.disponibilizar(incerta.operacaoId);
  const reconciliada = await cenario.servico.reconciliarAtualizacao(
    sessao,
    entrada,
    cenario.adaptador,
  );
  assert.equal(reconciliada.situacao, 'CONCLUIDA');
  assert.equal(reconciliada.versao, 2);
  assert.equal(efeitos, 1);
  assert.equal(cenario.reservas.size, 0);
});

test('resposta externa não normalizada vira resultado incerto', async () => {
  const cenario = criarCenario({
    criarOrdemServico: async () => ({
      ordemServicoExternaId: 'OS-001',
      resultado: 'CONFIRMADO',
      segredoExterno: 'nao pode atravessar',
    }),
  });
  const resultado = await cenario.servico.criar(
    sessao,
    entradaCriacao(),
    cenario.adaptador,
  );
  assert.equal(resultado.situacao, 'RECONCILIACAO_NECESSARIA');
  assert.equal(cenario.ordens.size, 0);
});
