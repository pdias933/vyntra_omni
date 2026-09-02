import assert from 'node:assert/strict';
import test from 'node:test';

import { ErroPermissaoNegada } from '../dist/autorizacao/erros-autorizacao.js';
import { ServicoRelatoriosOperacionais } from '../dist/relatorios-operacionais/servico-relatorios-operacionais.js';

const filaPermitida = '10000000-0000-4000-8000-000000000001';
const filaNegada = '20000000-0000-4000-8000-000000000002';
const sessao = { estado: 'ATIVA', expiraEm: new Date(Date.now() + 60_000), sessaoId: '30000000-0000-4000-8000-000000000003', usuarioId: '40000000-0000-4000-8000-000000000004' };
const grupo = (campos) => campos.map((item) => ({ ...item, _count: { _all: item.quantidade } }));

function criarCenario(permitir = true) {
  const consultas = [];
  const transacao = {
    alertaSla: { groupBy: async (entrada) => { consultas.push(entrada); return grupo([{ nivel: 'ATENDENTE', quantidade: 2 }, { nivel: 'SUPERVISOR', quantidade: 1 }]); } },
    atendimento: { groupBy: async (entrada) => { consultas.push(entrada); return grupo([{ estado: 'AGUARDANDO', filaAtualId: filaPermitida, quantidade: 3 }, { estado: 'EM_ATENDIMENTO', filaAtualId: filaPermitida, quantidade: 2 }]); } },
    execucaoFluxo: { groupBy: async (entrada) => { consultas.push(entrada); return grupo([{ estado: 'EXECUTANDO', quantidade: 2 }, { estado: 'CONCLUIDA', quantidade: 4 }, { estado: 'FALHOU', quantidade: 1 }]); } },
    fila: { findMany: async () => [{ id: filaPermitida, nome: 'Financeiro' }, { id: filaNegada, nome: 'Suporte' }] },
    mensagem: { groupBy: async (entrada) => { consultas.push(entrada); return grupo([{ direcao: 'ENTRADA', estadoSaida: null, quantidade: 5 }, { direcao: 'SAIDA', estadoSaida: 'ENVIADA', quantidade: 2 }, { direcao: 'SAIDA', estadoSaida: 'ENTREGUE', quantidade: 3 }, { direcao: 'SAIDA', estadoSaida: 'LIDA', quantidade: 1 }, { direcao: 'SAIDA', estadoSaida: 'FALHOU', quantidade: 1 }]); } },
    operacaoRecuperavel: { groupBy: async (entrada) => { consultas.push(entrada); return grupo([{ estado: 'PENDENTE', quantidade: 2 }, { estado: 'CONCLUIDA', quantidade: 3 }, { estado: 'RESULTADO_INCERTO', quantidade: 1 }, { estado: 'FALHA_DEFINITIVA', quantidade: 1 }]); } },
  };
  const autorizacao = { autorizar: async ({ filaId }) => { if (!permitir || filaId === filaNegada) throw new ErroPermissaoNegada(); } };
  const prisma = { executarLeituraConsistente: async (operacao) => operacao(transacao) };
  return { consultas, servico: new ServicoRelatoriosOperacionais(prisma, autorizacao) };
}

test('agrega somente filas autorizadas com fórmulas fechadas', async () => {
  const cenario = criarCenario();
  const fim = new Date('2026-09-02T12:00:00.000Z');
  const relatorio = await cenario.servico.obter(sessao, '24H', fim);
  assert.deepEqual(relatorio.filas, [{ aguardando: 3, emAtendimento: 2, encerrados: 0, filaId: filaPermitida, nome: 'Financeiro' }]);
  assert.deepEqual(relatorio.mensagens, { entregues: 4, enviadas: 6, falhas: 1, lidas: 1, recebidas: 5, taxaEntrega: 0.6667 });
  assert.deepEqual(relatorio.sla, { administrador: 0, atendente: 2, supervisor: 1 });
  assert.deepEqual(relatorio.fluxos, { ativos: 2, concluidos: 4, falhas: 1 });
  assert.deepEqual(relatorio.erp, { concluidas: 3, falhasDefinitivas: 1, pendentes: 2, resultadosIncertos: 1 });
  assert.equal(relatorio.inicio.toISOString(), '2026-09-01T12:00:00.000Z');
  assert.ok(cenario.consultas.every((consulta) => JSON.stringify(consulta).includes(filaPermitida) && !JSON.stringify(consulta).includes(filaNegada)));
});

test('ausência de fila autorizada retorna zero sem consultar fatos operacionais', async () => {
  const cenario = criarCenario(false);
  const relatorio = await cenario.servico.obter(sessao, '7D');
  assert.deepEqual(relatorio.filas, []);
  assert.equal(relatorio.mensagens.recebidas, 0);
  assert.equal(cenario.consultas.length, 0);
});
