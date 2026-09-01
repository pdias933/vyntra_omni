import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { AdaptadorErpSimulado } from '../dist/erp/simuladores/adaptador-erp-simulado.js';
import {
  ErroChaveErpReutilizada,
  ErroComandoErpInvalido,
  ErroConsultaErpInvalida,
} from '../dist/erp/erros-erp.js';

const agora = new Date('2026-08-31T16:00:00.000Z');

function comando(sobrescritas = {}) {
  return {
    assunto: 'Atendimento de suporte',
    atendimentoId: randomUUID(),
    chaveIdempotencia: 'chave_erp_atendimento_0001',
    clienteExternoId: 'cliente-sintetico-001',
    contratoExternoId: 'contrato-sintetico-001',
    iniciadoEm: agora,
    ...sobrescritas,
  };
}

function adaptadorComDados() {
  return new AdaptadorErpSimulado(
    {
      clientes: [
        {
          clienteExternoId: 'cliente-sintetico-001',
          documentoBusca: 'DOC-SINTETICO-001',
          documentoMascarado: 'XXX.XXX.XXX-XX',
          nomeExibicao: 'Cliente Sintético',
          telefoneBusca: '+550000000000',
          telefoneMascarado: '+55 XX XXXXX-XXXX',
        },
      ],
      contratos: [
        {
          clienteExternoId: 'cliente-sintetico-001',
          contratoExternoId: 'contrato-sintetico-001',
          enderecoResumido: 'Endereço sintético',
          servico: 'Plano sintético',
          situacao: 'ATIVO',
        },
      ],
      faturas: [
        {
          contratoExternoId: 'contrato-sintetico-001',
          faturaExternaId: 'fatura-sintetica-001',
          situacao: 'ABERTA',
          valorCentavos: 12345,
          vencimento: '2026-09-10',
        },
      ],
      elegibilidadesDesbloqueio: [
        {
          contratoExternoId: 'contrato-sintetico-001',
          elegivel: true,
        },
      ],
    },
    () => agora,
  );
}

test('consultas retornam somente modelos internos normalizados em tempo real', async () => {
  const adaptador = adaptadorComDados();
  const clientes = await adaptador.localizarClientes({
    documento: 'DOC-SINTETICO-001',
  });
  const contratos = await adaptador.listarContratos('cliente-sintetico-001');
  const faturas = await adaptador.listarFaturas('contrato-sintetico-001');

  assert.deepEqual(clientes, {
    itens: [
      {
        clienteExternoId: 'cliente-sintetico-001',
        documentoMascarado: 'XXX.XXX.XXX-XX',
        nomeExibicao: 'Cliente Sintético',
        telefoneMascarado: '+55 XX XXXXX-XXXX',
      },
    ],
    origem: 'TEMPO_REAL',
    resultado: 'SUCESSO',
  });
  assert.equal(contratos.resultado, 'SUCESSO');
  assert.equal(contratos.itens.length, 1);
  assert.equal(faturas.resultado, 'SUCESSO');
  assert.equal(faturas.itens.length, 1);
  assert.ok(!JSON.stringify(clientes).includes('DOC-SINTETICO-001'));
  assert.ok(!JSON.stringify(clientes).includes('+550000000000'));
});

test('indisponibilidade de consulta é explícita e não finge snapshot', async () => {
  const adaptador = adaptadorComDados();
  adaptador.definirConsultasDisponiveis(false);
  assert.deepEqual(
    await adaptador.localizarClientes({ nome: 'Cliente' }),
    { codigo: 'ERP_INDISPONIVEL', resultado: 'INDISPONIVEL' },
  );
  assert.deepEqual(await adaptador.listarContratos('cliente-sintetico-001'), {
    codigo: 'ERP_INDISPONIVEL',
    resultado: 'INDISPONIVEL',
  });
});

test('elegibilidade de desbloqueio é consulta normalizada em tempo real', async () => {
  const adaptador = adaptadorComDados();
  assert.deepEqual(
    await adaptador.verificarElegibilidadeDesbloqueio(
      'contrato-sintetico-001',
    ),
    {
      item: {
        contratoExternoId: 'contrato-sintetico-001',
        elegivel: true,
      },
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    },
  );
});

test('desbloqueio confirmado é idempotente no limite do adapter', async () => {
  const adaptador = adaptadorComDados();
  const comandoDesbloqueio = {
    atendimentoId: randomUUID(),
    chaveIdempotencia: 'chave_desbloqueio_confirmado_01',
    contratoExternoId: 'contrato-sintetico-001',
  };
  const primeira = await adaptador.executarDesbloqueioConfianca(
    comandoDesbloqueio,
  );
  const repetida = await adaptador.executarDesbloqueioConfianca(
    comandoDesbloqueio,
  );

  assert.deepEqual(primeira, { resultado: 'CONFIRMADO' });
  assert.deepEqual(repetida, primeira);
  assert.equal(adaptador.obterQuantidadeTentativasDesbloqueio(), 1);
  assert.equal(adaptador.obterQuantidadeEfeitosDesbloqueio(), 1);
});

test('resposta perdida no desbloqueio exige reconciliação sem repetir efeito', async () => {
  const adaptador = adaptadorComDados();
  const comandoDesbloqueio = {
    atendimentoId: randomUUID(),
    chaveIdempotencia: 'chave_desbloqueio_resposta_perdida_01',
    contratoExternoId: 'contrato-sintetico-001',
  };
  adaptador.programarDesbloqueioConfianca(
    comandoDesbloqueio.chaveIdempotencia,
    'PERDER_RESPOSTA',
  );

  const primeira = await adaptador.executarDesbloqueioConfianca(
    comandoDesbloqueio,
  );
  const repetida = await adaptador.executarDesbloqueioConfianca(
    comandoDesbloqueio,
  );
  assert.deepEqual(primeira, {
    codigo: 'RESPOSTA_PERDIDA',
    requerReconciliacao: true,
    resultado: 'RESULTADO_INCERTO',
  });
  assert.deepEqual(repetida, primeira);
  assert.equal(adaptador.obterQuantidadeTentativasDesbloqueio(), 1);
  assert.equal(adaptador.obterQuantidadeEfeitosDesbloqueio(), 1);
  assert.deepEqual(
    await adaptador.reconciliarDesbloqueioConfianca(comandoDesbloqueio),
    { resultado: 'CONFIRMADO' },
  );
});

function comandoOrdemServico(sobrescritas = {}) {
  return {
    assunto: 'Visita técnica',
    atendimentoId: randomUUID(),
    chaveIdempotencia: 'chave_ordem_servico_0001',
    clienteExternoId: 'cliente-sintetico-001',
    contratoExternoId: 'contrato-sintetico-001',
    descricao: 'Verificar sinal no endereço do contrato.',
    protocoloOficial: 'PROTOCOLO-OFICIAL-0001',
    ...sobrescritas,
  };
}

test('criação de ordem de serviço é idempotente no limite do adapter', async () => {
  const adaptador = adaptadorComDados();
  const entrada = comandoOrdemServico();
  const primeira = await adaptador.criarOrdemServico(entrada);
  const repetida = await adaptador.criarOrdemServico(entrada);

  assert.deepEqual(repetida, primeira);
  assert.equal(primeira.resultado, 'CONFIRMADO');
  assert.match(primeira.ordemServicoExternaId, /^OS-SIM-[A-F0-9]{16}$/);
  assert.equal(adaptador.obterQuantidadeTentativasCriacaoOrdemServico(), 1);
  assert.equal(adaptador.obterQuantidadeEfeitosCriacaoOrdemServico(), 1);
});

test('resposta perdida na criação da ordem reconcilia sem repetir efeito', async () => {
  const adaptador = adaptadorComDados();
  const entrada = comandoOrdemServico({
    chaveIdempotencia: 'chave_ordem_criacao_perdida_01',
  });
  adaptador.programarCriacaoOrdemServico(
    entrada.chaveIdempotencia,
    'PERDER_RESPOSTA',
  );

  const primeira = await adaptador.criarOrdemServico(entrada);
  const repetida = await adaptador.criarOrdemServico(entrada);
  assert.deepEqual(primeira, {
    codigo: 'RESPOSTA_PERDIDA',
    requerReconciliacao: true,
    resultado: 'RESULTADO_INCERTO',
  });
  assert.deepEqual(repetida, primeira);
  assert.equal(adaptador.obterQuantidadeTentativasCriacaoOrdemServico(), 1);
  assert.equal(adaptador.obterQuantidadeEfeitosCriacaoOrdemServico(), 1);

  const reconciliada = await adaptador.reconciliarCriacaoOrdemServico({
    atendimentoId: entrada.atendimentoId,
    chaveIdempotencia: entrada.chaveIdempotencia,
    clienteExternoId: entrada.clienteExternoId,
    contratoExternoId: entrada.contratoExternoId,
    protocoloOficial: entrada.protocoloOficial,
  });
  assert.equal(reconciliada.resultado, 'CONFIRMADO');
  assert.match(reconciliada.ordemServicoExternaId, /^OS-SIM-[A-F0-9]{16}$/);
});

test('atualização de ordem de serviço é idempotente no limite do adapter', async () => {
  const adaptador = adaptadorComDados();
  const criacao = comandoOrdemServico({
    chaveIdempotencia: 'chave_ordem_base_atualizacao_01',
  });
  const ordem = await adaptador.criarOrdemServico(criacao);
  assert.equal(ordem.resultado, 'CONFIRMADO');
  const atualizacao = {
    ...criacao,
    assunto: 'Visita técnica reagendada',
    chaveIdempotencia: 'chave_ordem_atualizacao_0001',
    ordemServicoExternaId: ordem.ordemServicoExternaId,
  };

  const primeira = await adaptador.atualizarOrdemServico(atualizacao);
  const repetida = await adaptador.atualizarOrdemServico(atualizacao);
  assert.deepEqual(primeira, { resultado: 'CONFIRMADO' });
  assert.deepEqual(repetida, primeira);
  assert.equal(
    adaptador.obterQuantidadeTentativasAtualizacaoOrdemServico(),
    1,
  );
  assert.equal(adaptador.obterQuantidadeEfeitosAtualizacaoOrdemServico(), 1);
});

test('resposta perdida na atualização da ordem reconcilia sem repetir efeito', async () => {
  const adaptador = adaptadorComDados();
  const criacao = comandoOrdemServico({
    chaveIdempotencia: 'chave_ordem_base_perdida_0001',
  });
  const ordem = await adaptador.criarOrdemServico(criacao);
  assert.equal(ordem.resultado, 'CONFIRMADO');
  const atualizacao = {
    ...criacao,
    chaveIdempotencia: 'chave_ordem_atualizacao_perdida_01',
    descricao: 'Atualização aplicada, mas resposta não recebida.',
    ordemServicoExternaId: ordem.ordemServicoExternaId,
  };
  adaptador.programarAtualizacaoOrdemServico(
    atualizacao.chaveIdempotencia,
    'PERDER_RESPOSTA',
  );

  const primeira = await adaptador.atualizarOrdemServico(atualizacao);
  const repetida = await adaptador.atualizarOrdemServico(atualizacao);
  assert.deepEqual(primeira, {
    codigo: 'RESPOSTA_PERDIDA',
    requerReconciliacao: true,
    resultado: 'RESULTADO_INCERTO',
  });
  assert.deepEqual(repetida, primeira);
  assert.equal(
    adaptador.obterQuantidadeTentativasAtualizacaoOrdemServico(),
    1,
  );
  assert.equal(adaptador.obterQuantidadeEfeitosAtualizacaoOrdemServico(), 1);
  assert.deepEqual(
    await adaptador.reconciliarAtualizacaoOrdemServico({
      atendimentoId: atualizacao.atendimentoId,
      chaveIdempotencia: atualizacao.chaveIdempotencia,
      clienteExternoId: atualizacao.clienteExternoId,
      contratoExternoId: atualizacao.contratoExternoId,
      ordemServicoExternaId: atualizacao.ordemServicoExternaId,
      protocoloOficial: atualizacao.protocoloOficial,
    }),
    { resultado: 'CONFIRMADO' },
  );
});

test('criação confirmada é idempotente e produz um protocolo oficial', async () => {
  const adaptador = adaptadorComDados();
  const entrada = comando();
  const [primeira, repetida] = await Promise.all([
    adaptador.criarAtendimento(entrada),
    adaptador.criarAtendimento(entrada),
  ]);

  assert.deepEqual(repetida, primeira);
  assert.equal(primeira.resultado, 'CONFIRMADO');
  assert.match(primeira.protocoloOficial, /^SIM-[A-F0-9]{16}$/);
  assert.equal(adaptador.obterQuantidadeTentativasCriacao(), 1);
  assert.equal(adaptador.obterQuantidadeEfeitosCriacao(), 1);
});

test('resposta perdida não repete criação e reconcilia o efeito existente', async () => {
  const adaptador = adaptadorComDados();
  const entrada = comando({ chaveIdempotencia: 'chave_erp_resposta_perdida_01' });
  adaptador.programarCriacaoAtendimento(
    entrada.chaveIdempotencia,
    'PERDER_RESPOSTA',
  );

  const primeira = await adaptador.criarAtendimento(entrada);
  const repetida = await adaptador.criarAtendimento(entrada);
  assert.deepEqual(primeira, {
    codigo: 'RESPOSTA_PERDIDA',
    requerReconciliacao: true,
    resultado: 'RESULTADO_INCERTO',
  });
  assert.deepEqual(repetida, primeira);
  assert.equal(adaptador.obterQuantidadeTentativasCriacao(), 1);
  assert.equal(adaptador.obterQuantidadeEfeitosCriacao(), 1);

  const reconciliada = await adaptador.reconciliarCriacaoAtendimento({
    atendimentoId: entrada.atendimentoId,
    chaveIdempotencia: entrada.chaveIdempotencia,
  });
  assert.equal(reconciliada.resultado, 'CONFIRMADO');
  assert.match(reconciliada.protocoloOficial, /^SIM-[A-F0-9]{16}$/);
});

test('ERP indisponível antes da escrita mantém efeito ausente', async () => {
  const adaptador = adaptadorComDados();
  const entrada = comando({ chaveIdempotencia: 'chave_erp_indisponivel_0001' });
  adaptador.programarCriacaoAtendimento(
    entrada.chaveIdempotencia,
    'ERP_INDISPONIVEL',
  );
  assert.deepEqual(await adaptador.criarAtendimento(entrada), {
    codigo: 'ERP_INDISPONIVEL',
    efeitoExternoPossivel: false,
    resultado: 'INDISPONIVEL',
  });
  assert.equal(adaptador.obterQuantidadeEfeitosCriacao(), 0);
  assert.deepEqual(
    await adaptador.reconciliarCriacaoAtendimento({
      atendimentoId: entrada.atendimentoId,
      chaveIdempotencia: entrada.chaveIdempotencia,
    }),
    { resultado: 'EFEITO_AUSENTE' },
  );
});

test('reconciliação indisponível não autoriza concluir nem repetir', async () => {
  const adaptador = adaptadorComDados();
  const entrada = comando({ chaveIdempotencia: 'chave_erp_reconciliacao_0001' });
  adaptador.programarCriacaoAtendimento(
    entrada.chaveIdempotencia,
    'PERDER_RESPOSTA',
  );
  await adaptador.criarAtendimento(entrada);
  adaptador.definirReconciliacaoDisponivel(false);
  assert.deepEqual(
    await adaptador.reconciliarCriacaoAtendimento({
      atendimentoId: entrada.atendimentoId,
      chaveIdempotencia: entrada.chaveIdempotencia,
    }),
    { codigo: 'ERP_INDISPONIVEL', resultado: 'INDISPONIVEL' },
  );
  assert.equal(adaptador.obterQuantidadeTentativasCriacao(), 1);
});

test('mesma chave com comando divergente é recusada', async () => {
  const adaptador = adaptadorComDados();
  const entrada = comando();
  await adaptador.criarAtendimento(entrada);
  await assert.rejects(
    adaptador.criarAtendimento({ ...entrada, assunto: 'Outro assunto' }),
    ErroChaveErpReutilizada,
  );
});

test('entrada inválida falha antes de qualquer efeito', async () => {
  const adaptador = adaptadorComDados();
  await assert.rejects(
    adaptador.localizarClientes({}),
    ErroConsultaErpInvalida,
  );
  await assert.rejects(
    adaptador.criarAtendimento(comando({ assunto: '   ' })),
    ErroComandoErpInvalido,
  );
  assert.equal(adaptador.obterQuantidadeTentativasCriacao(), 0);
  assert.equal(adaptador.obterQuantidadeEfeitosCriacao(), 0);
});
