import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ServicoProtocolosOrdensFluxo } from '../dist/execucoes-fluxo/servico-protocolos-ordens-fluxo.js';

const ids = {
  atendimento: randomUUID(),
  execucao: randomUUID(),
  fila: randomUUID(),
  fluxo: randomUUID(),
  versao: randomUUID(),
};
const execucao = {
  atendimentoId: ids.atendimento,
  atualizadaEm: new Date('2026-09-01T18:00:00.000Z'),
  contextoProtegido: {},
  estado: 'EXECUTANDO',
  fluxoId: ids.fluxo,
  id: ids.execucao,
  iniciadaEm: new Date('2026-09-01T18:00:00.000Z'),
  noAtualId: 'operacao',
  revisao: 7,
  versaoFluxoId: ids.versao,
};

function no(tipo, parametros = {}) {
  return {
    id: 'operacao',
    parametros,
    referencias: [],
    tipo,
    variaveisEntrada: [],
    variaveisSaida: [],
  };
}

function transacao(atendimento) {
  return {
    atendimento: {
      findUnique: async () => atendimento,
    },
  };
}

test('provider ausente segue indisponível sem criar operação externa', async () => {
  const chamadas = [];
  const servico = new ServicoProtocolosOrdensFluxo(
    { executarCriacao: async () => chamadas.push('PROTOCOLO') },
    { criar: async () => chamadas.push('ORDEM') },
  );
  const preparacao = await servico.preparar(
    no('CRIAR_ATENDIMENTO'),
    execucao,
    transacao({
      contexto: null,
      filaAtualId: ids.fila,
      iniciadoEm: execucao.iniciadaEm,
      protocoloErp: null,
    }),
  );
  assert.deepEqual(await servico.executar(preparacao), {
    resultado: 'INDISPONIVEL',
  });
  assert.deepEqual(chamadas, []);
});

test('protocolo oficial existente é idempotente sem chamar adapter', async () => {
  const servico = new ServicoProtocolosOrdensFluxo(
    { executarCriacao: async () => assert.fail('criação inesperada') },
    { criar: async () => assert.fail('OS inesperada') },
  );
  const preparacao = await servico.preparar(
    no('CRIAR_ATENDIMENTO'),
    execucao,
    transacao({
      contexto: null,
      filaAtualId: ids.fila,
      iniciadoEm: execucao.iniciadaEm,
      protocoloErp: { estado: 'OFICIAL', protocoloOficial: 'ERP-123' },
    }),
  );
  assert.deepEqual(await servico.executar(preparacao), { resultado: 'CRIADO' });
});

test('OS deriva contexto interno, mantém chave estável e audita como fluxo no domínio', async () => {
  const chamadas = [];
  const adaptador = {};
  const servico = new ServicoProtocolosOrdensFluxo(
    { executarCriacao: async () => assert.fail('protocolo inesperado') },
    {
      criar: async (...argumentos) => {
        chamadas.push(argumentos);
        return { operacaoId: randomUUID(), situacao: 'CONCLUIDA' };
      },
    },
    adaptador,
  );
  const atendimento = {
    contexto: {
      clienteExternoAtivoId: 'cliente-erp-1',
      contratoExternoAtivoId: 'contrato-erp-1',
    },
    filaAtualId: ids.fila,
    iniciadoEm: execucao.iniciadaEm,
    protocoloErp: { estado: 'OFICIAL', protocoloOficial: 'ERP-123' },
  };
  const definicao = no('CRIAR_ORDEM_SERVICO', {
    assunto: 'Instalação técnica',
    confirmacaoExplicita: true,
    descricao: 'Executar instalação confirmada.',
  });
  const primeira = await servico.preparar(
    definicao,
    execucao,
    transacao(atendimento),
  );
  const repetida = await servico.preparar(
    definicao,
    { ...execucao, revisao: 8 },
    transacao(atendimento),
  );
  assert.equal(primeira.chaveIdempotencia, repetida.chaveIdempotencia);
  assert.deepEqual(await servico.executar(primeira), { resultado: 'CRIADA' });
  assert.deepEqual(chamadas[0][0], {
    fluxoId: ids.fluxo,
    versaoFluxoId: ids.versao,
  });
  assert.equal(chamadas[0][1].confirmacaoExplicita, true);
  assert.equal(chamadas[0][1].clienteExternoId, 'cliente-erp-1');
  assert.equal(chamadas[0][2], adaptador);
});
