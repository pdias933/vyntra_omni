import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroEntradaAcaoAtendimentoErpInvalida } from '../dist/acoes-atendimento-erp/erros-acoes-atendimento-erp.js';
import { PoliticaLinkTranscricaoPublica } from '../dist/acoes-atendimento-erp/politica-link-transcricao.js';
import { ServicoAcoesAtendimentoErp } from '../dist/acoes-atendimento-erp/servico-acoes-atendimento-erp.js';

const atendimentoId = '10000000-0000-4000-8000-000000000001';
const conversaId = '20000000-0000-4000-8000-000000000002';
const contaId = '30000000-0000-4000-8000-000000000003';
const filaId = '40000000-0000-4000-8000-000000000004';
const usuarioId = '50000000-0000-4000-8000-000000000005';
const protocoloOficial = 'PROTOCOLO-OFICIAL-PR067';
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date(Date.now() + 3_600_000),
  sessaoId: '60000000-0000-4000-8000-000000000006',
  usuarioId,
};

function criarIdempotencia() {
  const porChave = new Map();
  const porId = new Map();
  const obter = (id) => {
    const operacao = porId.get(id);
    assert.ok(operacao);
    return operacao;
  };
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
  const encerrar = (id, estado, proximaAcaoEm) => {
    const operacao = obter(id);
    operacao.estado = estado;
    operacao.proximaAcaoEm = proximaAcaoEm;
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
      return {
        operacao: mapear(operacao),
        situacao: nova ? 'NOVA' : 'EXISTENTE',
      };
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
    concluir: async ({ operacaoId }) => encerrar(operacaoId, 'CONCLUIDA'),
    registrarEfeitoAusente: async ({ operacaoId, proximaAcaoEm }) =>
      encerrar(operacaoId, 'AGUARDANDO_NOVA_TENTATIVA', proximaAcaoEm),
    registrarFalhaTemporaria: async ({ operacaoId, proximaAcaoEm }) =>
      encerrar(operacaoId, 'AGUARDANDO_NOVA_TENTATIVA', proximaAcaoEm),
    registrarResultadoIncerto: async ({ operacaoId, proximaAcaoEm }) =>
      encerrar(operacaoId, 'RESULTADO_INCERTO', proximaAcaoEm),
  };
}

function criarCenario(adaptadorPersonalizado = {}) {
  let atendimento = {
    atualizadoEm: new Date('2026-09-01T10:00:00.000Z'),
    contaWhatsAppOrigemId: contaId,
    conversaId,
    estado: 'AGUARDANDO',
    filaAtualId: filaId,
    id: atendimentoId,
    iniciadoEm: new Date('2026-09-01T09:00:00.000Z'),
    modo: 'FILA_HUMANA',
    motivoEspera: 'AGUARDANDO_HUMANO',
    versaoAtribuicao: 1,
    versaoEstado: 1,
  };
  let atribuicaoAberta = true;
  let reserva;
  const registros = new Map();
  const auditorias = [];
  const eventos = [];
  const chamadas = [];
  const autorizacoes = [];
  const idempotencia = criarIdempotencia();
  const prisma = {
    executarLeituraConsistente: async (operacao) => operacao({}),
    executarTransacao: async (operacao) => operacao({}),
  };
  const repositorio = {
    bloquearAtendimento: async () => undefined,
    confirmarEncerramento: async (atual, proximo) => {
      if (
        atendimento.versaoEstado !== atual.versaoEstado ||
        atendimento.versaoAtribuicao !== atual.versaoAtribuicao
      ) {
        return false;
      }
      atendimento = { ...proximo };
      return true;
    },
    finalizarAtribuicaoAberta: async () => {
      if (!atribuicaoAberta) throw new Error('HISTORICO_INCONSISTENTE');
      atribuicaoAberta = false;
    },
    liberarReservaEncerramento: async (_atendimentoId, operacaoId) => {
      if (reserva !== operacaoId) return false;
      reserva = undefined;
      return true;
    },
    obterNoContexto: async (contexto, exigirAberto) => {
      if (
        contexto.atendimentoId !== atendimentoId ||
        contexto.filaId !== atendimento.filaAtualId ||
        contexto.protocoloOficial !== protocoloOficial ||
        (exigirAberto &&
          !['AGUARDANDO', 'EM_ATENDIMENTO'].includes(atendimento.estado))
      ) {
        return undefined;
      }
      return { atendimento: { ...atendimento }, protocoloOficial };
    },
    obterPorAtendimentoEProtocolo: async (id, protocolo) =>
      id === atendimentoId && protocolo === protocoloOficial
        ? { atendimento: { ...atendimento }, protocoloOficial }
        : undefined,
    obterPorOperacao: async (operacaoId) => registros.get(operacaoId),
    registrar: async (registro) => {
      if (registros.has(registro.operacaoId)) return false;
      registros.set(registro.operacaoId, {
        atendimentoId: registro.atendimentoId,
        confirmadoEm: registro.confirmadoEm,
        operacaoId: registro.operacaoId,
        protocoloOficial: registro.protocoloOficial,
        tipo: registro.tipo,
        ...(registro.versaoAtribuicaoResultante === undefined
          ? {}
          : {
              versaoAtribuicaoResultante:
                registro.versaoAtribuicaoResultante,
            }),
        ...(registro.versaoEstadoResultante === undefined
          ? {}
          : { versaoEstadoResultante: registro.versaoEstadoResultante }),
      });
      return true;
    },
    reservarEncerramento: async (_id, operacaoId) => {
      reserva ??= operacaoId;
      return reserva === operacaoId;
    },
    reservaEncerramentoPertence: async (_id, operacaoId) =>
      reserva === operacaoId,
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
  const adaptador = {
    adicionarComentarioAtendimento: async () => {
      chamadas.push('COMENTARIO');
      return { resultado: 'CONFIRMADO' };
    },
    encerrarAtendimento: async () => {
      chamadas.push('ENCERRAMENTO');
      return { resultado: 'CONFIRMADO' };
    },
    reconciliarComentarioAtendimento: async () => {
      chamadas.push('RECONCILIAR_COMENTARIO');
      return { resultado: 'CONFIRMADO' };
    },
    reconciliarEncerramentoAtendimento: async () => {
      chamadas.push('RECONCILIAR_ENCERRAMENTO');
      return { resultado: 'CONFIRMADO' };
    },
    ...adaptadorPersonalizado,
  };
  const servico = new ServicoAcoesAtendimentoErp(
    prisma,
    autorizacao,
    idempotencia,
    repositorio,
    { acrescentar: async (evento) => eventos.push(evento) },
    { registrar: async (registro) => auditorias.push(registro) },
  );
  return {
    adaptador,
    atendimento: () => atendimento,
    atribuicaoAberta: () => atribuicaoAberta,
    auditorias,
    autorizacoes,
    chamadas,
    eventos,
    idempotencia,
    registros,
    reserva: () => reserva,
    servico,
  };
}

function entradaComentario(sobrescritas = {}) {
  return {
    atendimentoId,
    chaveIdempotencia: randomUUID(),
    comentario: 'Comentário operacional sintético.',
    confirmacaoExplicita: true,
    filaId,
    protocoloOficial,
    proximaAcaoEm: new Date(Date.now() + 300_000),
    ...sobrescritas,
  };
}

function entradaEncerramento(sobrescritas = {}) {
  return {
    atendimentoId,
    chaveIdempotencia: randomUUID(),
    confirmacaoExplicita: true,
    filaId,
    motivo: 'Solicitação concluída.',
    protocoloOficial,
    proximaAcaoEm: new Date(Date.now() + 300_000),
    versaoAtribuicaoEsperada: 1,
    versaoEstadoEsperada: 1,
    ...sobrescritas,
  };
}

test('confirmação explícita falha antes de autorização ou efeito', async () => {
  const cenario = criarCenario();
  await assert.rejects(
    cenario.servico.encerrar(
      sessao,
      { ...entradaEncerramento(), confirmacaoExplicita: false },
      cenario.adaptador,
    ),
    ErroEntradaAcaoAtendimentoErpInvalida,
  );
  assert.equal(cenario.autorizacoes.length, 0);
  assert.deepEqual(cenario.chamadas, []);
});

test('comentário confirmado é idempotente, auditado e não altera atendimento', async () => {
  const cenario = criarCenario();
  const entrada = entradaComentario();
  const primeira = await cenario.servico.adicionarComentario(
    sessao,
    entrada,
    cenario.adaptador,
  );
  const repetida = await cenario.servico.adicionarComentario(
    sessao,
    entrada,
    cenario.adaptador,
  );

  assert.equal(primeira.situacao, 'CONCLUIDA');
  assert.deepEqual(repetida, primeira);
  assert.deepEqual(cenario.chamadas, ['COMENTARIO']);
  assert.equal(cenario.atendimento().estado, 'AGUARDANDO');
  assert.equal(cenario.registros.size, 1);
  assert.equal(cenario.auditorias.length, 1);
  assert.ok(
    !JSON.stringify(cenario.auditorias).includes(entrada.comentario),
  );
});

test('comentário com resposta perdida reconcilia sem repetir escrita', async () => {
  const cenario = criarCenario({
    adicionarComentarioAtendimento: async () => {
      cenario.chamadas.push('COMENTARIO');
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    },
  });
  const entrada = entradaComentario();
  const incerta = await cenario.servico.adicionarComentario(
    sessao,
    entrada,
    cenario.adaptador,
  );
  assert.equal(incerta.situacao, 'RECONCILIACAO_NECESSARIA');
  cenario.idempotencia.disponibilizar(incerta.operacaoId);
  const confirmada = await cenario.servico.reconciliarComentario(
    sessao,
    entrada,
    cenario.adaptador,
  );
  assert.equal(confirmada.situacao, 'CONCLUIDA');
  assert.deepEqual(cenario.chamadas, [
    'COMENTARIO',
    'RECONCILIAR_COMENTARIO',
  ]);
});

test('falha anterior ao efeito preserva atendimento e libera a reserva', async () => {
  const cenario = criarCenario({
    encerrarAtendimento: async () => {
      cenario.chamadas.push('ENCERRAMENTO');
      return {
        codigo: 'CAPACIDADE_NAO_HABILITADA',
        efeitoExternoPossivel: false,
        resultado: 'INDISPONIVEL',
      };
    },
  });
  const resultado = await cenario.servico.encerrar(
    sessao,
    entradaEncerramento(),
    cenario.adaptador,
  );
  assert.equal(resultado.situacao, 'AGUARDANDO_NOVA_TENTATIVA');
  assert.equal(cenario.atendimento().estado, 'AGUARDANDO');
  assert.equal(cenario.eventos.length, 0);
  assert.equal(cenario.reserva(), undefined);
});

test('encerramento confirmado atualiza domínio, evento e auditoria atomicamente', async () => {
  const cenario = criarCenario();
  const entrada = entradaEncerramento();
  const primeira = await cenario.servico.encerrar(
    sessao,
    entrada,
    cenario.adaptador,
  );
  const repetida = await cenario.servico.encerrar(
    sessao,
    entrada,
    cenario.adaptador,
  );

  assert.equal(primeira.situacao, 'CONCLUIDA');
  assert.equal(primeira.versaoEstado, 2);
  assert.equal(primeira.versaoAtribuicao, 1);
  assert.deepEqual(repetida, primeira);
  assert.equal(cenario.atendimento().estado, 'ENCERRADO_REABRIVEL');
  assert.equal(cenario.atendimento().usuarioResponsavelId, undefined);
  assert.equal(cenario.atribuicaoAberta(), false);
  assert.equal(cenario.eventos.length, 1);
  assert.equal(cenario.eventos[0].tipo, 'ATENDIMENTO_ENCERRADO');
  assert.equal(cenario.auditorias.length, 1);
  assert.equal(cenario.reserva(), undefined);
  assert.deepEqual(cenario.chamadas, ['ENCERRAMENTO']);
  assert.ok(!JSON.stringify(cenario.auditorias).includes(entrada.motivo));
});

test('resposta perdida mantém atendimento aberto até reconciliação', async () => {
  const cenario = criarCenario({
    encerrarAtendimento: async () => {
      cenario.chamadas.push('ENCERRAMENTO');
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    },
  });
  const entrada = entradaEncerramento();
  const incerta = await cenario.servico.encerrar(
    sessao,
    entrada,
    cenario.adaptador,
  );
  assert.equal(incerta.situacao, 'RECONCILIACAO_NECESSARIA');
  assert.equal(cenario.atendimento().estado, 'AGUARDANDO');
  assert.ok(cenario.reserva());

  cenario.idempotencia.disponibilizar(incerta.operacaoId);
  const confirmada = await cenario.servico.reconciliarEncerramento(
    sessao,
    entrada,
    cenario.adaptador,
  );
  assert.equal(confirmada.situacao, 'CONCLUIDA');
  assert.equal(cenario.atendimento().estado, 'ENCERRADO_REABRIVEL');
  assert.equal(cenario.reserva(), undefined);
  assert.deepEqual(cenario.chamadas, [
    'ENCERRAMENTO',
    'RECONCILIAR_ENCERRAMENTO',
  ]);
});

test('reserva bloqueia outra chave de encerramento', async () => {
  const cenario = criarCenario({
    encerrarAtendimento: async () => {
      cenario.chamadas.push('ENCERRAMENTO');
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    },
  });
  await cenario.servico.encerrar(
    sessao,
    entradaEncerramento(),
    cenario.adaptador,
  );
  const concorrente = await cenario.servico.encerrar(
    sessao,
    entradaEncerramento(),
    cenario.adaptador,
  );
  assert.equal(concorrente.situacao, 'ENCERRAMENTO_CONCORRENTE');
  assert.deepEqual(cenario.chamadas, ['ENCERRAMENTO']);
  assert.equal(cenario.atendimento().estado, 'AGUARDANDO');
});

test('resposta externa desconhecida vira resultado incerto conservador', async () => {
  const cenario = criarCenario({
    encerrarAtendimento: async () => ({
      campoExterno: 'nao permitido',
      resultado: 'CONFIRMADO',
    }),
  });
  const resultado = await cenario.servico.encerrar(
    sessao,
    entradaEncerramento(),
    cenario.adaptador,
  );
  assert.equal(resultado.situacao, 'RECONCILIACAO_NECESSARIA');
  assert.equal(cenario.atendimento().estado, 'AGUARDANDO');
  assert.ok(cenario.reserva());
});

test('link público permanece indisponível sem gerar token ou URL', () => {
  const politica = new PoliticaLinkTranscricaoPublica();
  assert.deepEqual(politica.avaliar(), {
    motivo: 'APROVACAO_JURIDICA_PENDENTE',
    situacao: 'DESATIVADO',
  });
});
