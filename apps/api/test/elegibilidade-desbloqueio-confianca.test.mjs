import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ErroRespostaElegibilidadeDesbloqueioInvalida } from '../dist/desbloqueios-confianca/erros-desbloqueio-confianca.js';
import { ServicoElegibilidadeDesbloqueioConfianca } from '../dist/desbloqueios-confianca/servico-elegibilidade-desbloqueio-confianca.js';

const atendimentoId = '10000000-0000-4000-8000-000000000001';
const filaId = '20000000-0000-4000-8000-000000000002';
const contratoExternoId = 'contrato-sintetico-001';
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2026-09-02T00:00:00.000Z'),
  sessaoId: '30000000-0000-4000-8000-000000000003',
  usuarioId: '40000000-0000-4000-8000-000000000004',
};

function criarCenario({
  contextoValido = true,
  resultadoErp = {
    item: { contratoExternoId, elegivel: true },
    origem: 'TEMPO_REAL',
    resultado: 'SUCESSO',
  },
  ultimo,
} = {}) {
  const chamadas = [];
  const transacao = { id: 'leitura-consistente' };
  const prisma = {
    executarLeituraConsistente: async (operacao) => operacao(transacao),
  };
  const repositorio = {
    contextoAtivoCorresponde: async (...argumentos) => {
      chamadas.push(['CONTEXTO', ...argumentos]);
      return contextoValido;
    },
    obterUltimoConfirmado: async (...argumentos) => {
      chamadas.push(['HISTORICO', ...argumentos]);
      return ultimo;
    },
  };
  const autorizacao = {
    autorizar: async (entrada, verificar, transacaoRecebida) => {
      chamadas.push(['AUTORIZAR', entrada, transacaoRecebida]);
      const recurso = await verificar({}, transacaoRecebida);
      if (!recurso.acessivel || !recurso.estadoPermiteAcao) {
        throw new Error('PERMISSAO_NEGADA');
      }
    },
  };
  const consultas = {
    verificarElegibilidadeDesbloqueio: async (contratoId) => {
      chamadas.push(['ERP', contratoId]);
      return resultadoErp;
    },
  };
  return {
    chamadas,
    consultas,
    servico: new ServicoElegibilidadeDesbloqueioConfianca(
      prisma,
      autorizacao,
      repositorio,
    ),
    transacao,
  };
}

function entrada() {
  return { atendimentoId, contratoExternoId, filaId };
}

test('combina consulta ERP em tempo real com elegibilidade local', async () => {
  const cenario = criarCenario();
  const agora = new Date('2026-09-01T12:00:00.000Z');
  const resultado = await cenario.servico.verificar(
    sessao,
    entrada(),
    cenario.consultas,
    () => agora,
  );

  assert.deepEqual(resultado, {
    consultadoEm: agora,
    elegivel: true,
    motivos: [],
    origem: 'TEMPO_REAL',
    resultado: 'SUCESSO',
  });
  assert.deepEqual(
    cenario.chamadas.map(([tipo]) => tipo),
    ['AUTORIZAR', 'CONTEXTO', 'HISTORICO', 'ERP'],
  );
  assert.equal(cenario.chamadas[0][1].permissao, 'VERIFICAR_DESBLOQUEIO_CONFIANCA');
  assert.equal(cenario.chamadas[1].at(-1), cenario.transacao);
});

test('intervalo é de 30 dias exatos e nunca executa a ação', async () => {
  const confirmadoEm = new Date('2026-08-02T12:00:00.000Z');
  const bloqueadoEm = new Date('2026-09-01T11:59:59.999Z');
  const liberadoEm = new Date('2026-09-01T12:00:00.000Z');
  const cenario = criarCenario({ ultimo: { confirmadoEm } });

  const bloqueado = await cenario.servico.verificar(
    sessao,
    entrada(),
    cenario.consultas,
    () => bloqueadoEm,
  );
  assert.equal(bloqueado.elegivel, false);
  assert.deepEqual(bloqueado.motivos, ['INTERVALO_30_DIAS']);
  assert.deepEqual(bloqueado.proximoDesbloqueioEm, liberadoEm);

  const liberado = await cenario.servico.verificar(
    sessao,
    entrada(),
    cenario.consultas,
    () => liberadoEm,
  );
  assert.equal(liberado.elegivel, true);
  assert.ok(!('executarDesbloqueio' in cenario.consultas));
});

test('nega se ERP ou janela local negar e mantém os dois motivos', async () => {
  const cenario = criarCenario({
    resultadoErp: {
      item: { contratoExternoId, elegivel: false },
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    },
    ultimo: { confirmadoEm: new Date('2026-08-20T12:00:00.000Z') },
  });
  const resultado = await cenario.servico.verificar(
    sessao,
    entrada(),
    cenario.consultas,
    () => new Date('2026-09-01T12:00:00.000Z'),
  );
  assert.equal(resultado.elegivel, false);
  assert.deepEqual(resultado.motivos, [
    'ERP_NAO_AUTORIZOU',
    'INTERVALO_30_DIAS',
  ]);
});

test('indisponibilidade ERP não cai para snapshot nem elegibilidade local', async () => {
  const cenario = criarCenario({
    resultadoErp: {
      codigo: 'ERP_INDISPONIVEL',
      resultado: 'INDISPONIVEL',
    },
  });
  assert.deepEqual(
    await cenario.servico.verificar(sessao, entrada(), cenario.consultas),
    { codigo: 'ERP_INDISPONIVEL', resultado: 'INDISPONIVEL' },
  );
});

test('contexto divergente falha antes de consultar o ERP', async () => {
  const cenario = criarCenario({ contextoValido: false });
  await assert.rejects(
    cenario.servico.verificar(sessao, entrada(), cenario.consultas),
    /PERMISSAO_NEGADA/,
  );
  assert.ok(!cenario.chamadas.some(([tipo]) => tipo === 'ERP'));
});

test('resposta ERP com contrato ou campo divergente falha fechada', async () => {
  for (const resultadoErp of [
    {
      item: { contratoExternoId: 'outro-contrato', elegivel: true },
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    },
    {
      item: { contratoExternoId, elegivel: true, campoExterno: 'nao-aceitar' },
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    },
    {
      item: { contratoExternoId, elegivel: true },
      origem: 'SNAPSHOT',
      resultado: 'SUCESSO',
    },
  ]) {
    const cenario = criarCenario({ resultadoErp });
    await assert.rejects(
      cenario.servico.verificar(sessao, entrada(), cenario.consultas),
      ErroRespostaElegibilidadeDesbloqueioInvalida,
    );
  }
});
