import assert from 'node:assert/strict';
import test from 'node:test';

import { RegistroMetricasOperacionais } from '../dist/observabilidade/registro-metricas.js';
import { ServicoObservabilidade } from '../dist/observabilidade/servico-observabilidade.js';

const agora = new Date('2026-09-02T20:00:00.000Z');
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2099-01-01T00:00:00.000Z'),
  sessaoId: '10000000-0000-4000-8000-000000000001',
  usuarioId: '20000000-0000-4000-8000-000000000002',
};

function criarCenario() {
  const ordem = [];
  const transacao = {
    execucaoFluxo: {
      count: async () => 1,
      findFirst: async () => ({
        retomarEm: new Date('2026-09-02T19:50:00.000Z'),
      }),
    },
    itemCaixaSaida: {
      count: async () => {
        ordem.push('DADOS');
        return 3;
      },
      findFirst: async () => ({
        criadoEm: new Date('2026-09-02T19:40:00.000Z'),
      }),
    },
    operacaoRecuperavel: {
      count: async () => 2,
      findFirst: async () => ({
        atualizadoEm: new Date('2026-09-02T19:30:00.000Z'),
      }),
    },
  };
  const servico = new ServicoObservabilidade(
    {
      autorizar: async (_entrada, verificar) => {
        ordem.push('AUTORIZAR');
        return verificar();
      },
    },
    { executarLeituraConsistente: async (executar) => executar(transacao) },
    {
      verificar: async () => {
        ordem.push('PRONTIDAO');
        return { falhas: ['REDIS'], pronto: false };
      },
    },
  );
  return { ordem, servico };
}

test('observação autoriza antes dos fatos e cria alertas agregados acionáveis', async () => {
  const cenario = criarCenario();
  const painel = await cenario.servico.observar(sessao, agora);

  assert.ok(
    cenario.ordem.indexOf('AUTORIZAR') < cenario.ordem.indexOf('DADOS'),
  );
  assert.ok(
    cenario.ordem.indexOf('AUTORIZAR') < cenario.ordem.indexOf('PRONTIDAO'),
  );
  assert.deepEqual(
    painel.alertas.map(({ codigo, componente, runbook }) => ({
      codigo,
      componente,
      runbook,
    })),
    [
      {
        codigo: 'DEPENDENCIA_INDISPONIVEL',
        componente: 'REDIS',
        runbook: 'DEPENDENCIA_REDIS',
      },
      {
        codigo: 'CAIXA_SAIDA_ATRASADA',
        componente: 'CAIXA_SAIDA',
        runbook: 'CAIXA_SAIDA_BACKLOG',
      },
      {
        codigo: 'OPERACAO_RECUPERAVEL_ATRASADA',
        componente: 'OPERACOES_RECUPERAVEIS',
        runbook: 'OPERACAO_RECUPERAVEL_PRESA',
      },
      {
        codigo: 'FLUXO_ATRASADO',
        componente: 'MOTOR_FLUXOS',
        runbook: 'WORKER_FLUXOS_BACKLOG',
      },
    ],
  );
  assert.equal(painel.metricas.caixaSaida.quantidade, 3);
  assert.equal(painel.metricas.caixaSaida.idadeItemMaisAntigoSegundos, 1_200);
});

test('métrica HTTP é limitada a agregados e usa faixas fixas', () => {
  const registro = new RegistroMetricasOperacionais();
  registro.observarHttp(200, 8);
  registro.observarHttp(503, 80);
  registro.observarHttp(201, 800);
  registro.observarHttp(999, 1);

  assert.deepEqual(registro.resumirHttp(), {
    duracaoMediaMs: 296,
    duracaoP95AproximadaMs: 1_000,
    falhas: 1,
    requisicoes: 3,
  });
});
