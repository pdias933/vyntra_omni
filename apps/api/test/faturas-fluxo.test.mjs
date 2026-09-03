import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { AdaptadorErpSimulado } from '../dist/erp/simuladores/adaptador-erp-simulado.js';
import { ServicoFaturasFluxo } from '../dist/execucoes-fluxo/servico-faturas-fluxo.js';

const contexto = {
  atendimentoId: randomUUID(),
  clienteExternoId: 'cliente-sintetico-078',
  contaWhatsAppId: randomUUID(),
  contatoId: randomUUID(),
  contratoExternoId: 'contrato-sintetico-078',
  versao: 2,
};
const fatura = {
  clienteExternoId: contexto.clienteExternoId,
  contratoExternoId: contexto.contratoExternoId,
  faturaExternaId: 'fatura-sintetica-078',
  situacao: 'ABERTA',
  valorCentavos: 12345,
  vencimento: '2026-09-10',
};
const pix = '00020101021226880014BR.GOV.BCB.PIX';
const linha = '12345678901234567890123456789012345678901234';
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

function criarServico({ adaptador, contextoAtual = contexto } = {}) {
  const chamadas = { auditoria: [], composicoes: [] };
  const contextos = {
    obterContextoFinanceiroParaFluxo: async () => contextoAtual,
  };
  const repositorio = {
    acrescentar: async (...argumentos) => chamadas.composicoes.push(argumentos),
  };
  const auditoria = {
    registrar: async (...argumentos) => chamadas.auditoria.push(argumentos),
  };
  return {
    chamadas,
    servico: new ServicoFaturasFluxo(
      contextos,
      repositorio,
      auditoria,
      adaptador,
    ),
  };
}

function adaptadorComFaturas(faturas = [fatura]) {
  return new AdaptadorErpSimulado({
    contratos: [
      {
        clienteExternoId: contexto.clienteExternoId,
        contratoExternoId: contexto.contratoExternoId,
        situacao: 'ATIVO',
      },
    ],
    dadosPagamentoFatura: [
      {
        clienteExternoId: fatura.clienteExternoId,
        contratoExternoId: fatura.contratoExternoId,
        faturaExternaId: fatura.faturaExternaId,
        linhaDigitavel: linha,
        pixCopiaCola: pix,
      },
    ],
    documentosFatura: [
      {
        clienteExternoId: fatura.clienteExternoId,
        conteudo: pdf,
        contratoExternoId: fatura.contratoExternoId,
        faturaExternaId: fatura.faturaExternaId,
        nomeArquivo: 'fatura-sintetica.pdf',
        tipoArquivo: 'PDF',
      },
    ],
    faturas,
  });
}

test('consulta seleciona somente a única fatura pagável do contrato explícito', async () => {
  const { servico } = criarServico({ adaptador: adaptadorComFaturas() });
  const preparacao = await servico.preparar(
    'CONSULTAR_FATURAS',
    contexto.atendimentoId,
    {},
    { id: 'transacao' },
  );
  assert.equal(preparacao.resultado, 'PRONTA');
  const resultado = await servico.executar(preparacao);
  assert.equal(resultado.resultado, 'ENCONTRADA');
  assert.equal(resultado.selecao.faturaExternaId, fatura.faturaExternaId);
  assert.equal(
    resultado.selecao.contextoAtendimentoVersao,
    contexto.versao,
  );
});

test('não escolhe primeira fatura e ERP ausente permanece indisponível', async () => {
  const segunda = {
    ...fatura,
    faturaExternaId: 'fatura-sintetica-078-b',
  };
  const multipla = criarServico({
    adaptador: adaptadorComFaturas([fatura, segunda]),
  });
  const preparacao = await multipla.servico.preparar(
    'CONSULTAR_FATURAS',
    contexto.atendimentoId,
    {},
    {},
  );
  assert.deepEqual(await multipla.servico.executar(preparacao), {
    codigo: 'SELECAO_FATURA_NECESSARIA',
    resultado: 'FALHA',
  });

  const semProvider = criarServico();
  const semProviderPreparado = await semProvider.servico.preparar(
    'CONSULTAR_FATURAS',
    contexto.atendimentoId,
    {},
    {},
  );
  assert.deepEqual(await semProvider.servico.executar(semProviderPreparado), {
    resultado: 'ERP_INDISPONIVEL',
  });
});

test('automação recusa consulta financeira com cobertura limitada', async () => {
  const parcial = criarServico({
    adaptador: {
      listarFaturas: async () => ({
        cobertura: { quantidadeMeses: 1, tipo: 'JANELA_LIMITADA' },
        itens: [fatura],
        origem: 'TEMPO_REAL',
        resultado: 'SUCESSO',
      }),
    },
  });
  const preparacao = await parcial.servico.preparar(
    'CONSULTAR_FATURAS',
    contexto.atendimentoId,
    {},
    {},
  );
  assert.deepEqual(await parcial.servico.executar(preparacao), {
    codigo: 'COBERTURA_FINANCEIRA_INCOMPLETA',
    resultado: 'FALHA',
  });
});

test('envio exige seleção atual e compõe códigos protegidos sem fingir PDF', async () => {
  const { servico } = criarServico({ adaptador: adaptadorComFaturas() });
  const selecao = {
    contextoAtendimentoVersao: contexto.versao,
    contratoExternoId: contexto.contratoExternoId,
    faturaExternaId: fatura.faturaExternaId,
    situacao: fatura.situacao,
    valorCentavos: fatura.valorCentavos,
    vencimento: fatura.vencimento,
  };
  const preparacao = await servico.preparar(
    'ENVIAR_FATURA',
    contexto.atendimentoId,
    { faturaFluxo: selecao },
    {},
  );
  assert.equal(preparacao.resultado, 'PRONTA');
  const resultado = await servico.executar(
    preparacao,
    () => new Date('2026-09-01T20:00:00.000Z'),
  );
  assert.equal(resultado.resultado, 'DADOS_INCOMPLETOS');
  assert.equal(resultado.composicao.incluiPdf, false);
  assert.equal(resultado.composicao.incluiPix, true);
  assert.match(resultado.composicao.textoProtegido, /Pix copia e cola/u);
  assert.match(resultado.composicao.textoProtegido, new RegExp(pix, 'u'));
  assert.equal('conteudo' in resultado.composicao, false);
  assert.equal(
    JSON.stringify(resultado.composicao).includes(Buffer.from(pdf).toString('base64')),
    false,
  );
});

test('contexto alterado invalida aplicação e auditoria omite referências externas', async () => {
  const { chamadas, servico } = criarServico({
    adaptador: adaptadorComFaturas(),
  });
  const preparacao = await servico.preparar(
    'CONSULTAR_FATURAS',
    contexto.atendimentoId,
    {},
    {},
  );
  assert.equal(await servico.contextoPermaneceValido(preparacao, {}), true);
  const composicao = {
    contaWhatsAppId: contexto.contaWhatsAppId,
    contatoId: contexto.contatoId,
    criadaEm: new Date('2026-09-01T20:00:00.000Z'),
    id: randomUUID(),
    incluiLinhaDigitavel: true,
    incluiLinkSeguro: false,
    incluiPdf: false,
    incluiPix: true,
    opcoesHash: 'a'.repeat(64),
    opcoesProtegidas: { linhaDigitavel: linha, pixCopiaCola: pix },
    referenciaFatura: fatura.faturaExternaId,
    textoProtegido: 'conteúdo protegido',
    valorCentavos: fatura.valorCentavos,
    vencimento: new Date('2026-09-10T00:00:00.000Z'),
  };
  await servico.registrarComposicao(
    {
      atendimentoId: contexto.atendimentoId,
      composicao,
      fluxoId: randomUUID(),
      versaoFluxoId: randomUUID(),
    },
    { id: 'transacao' },
  );
  assert.equal(chamadas.composicoes.length, 1);
  assert.equal(chamadas.auditoria.length, 1);
  const auditoriaSerializada = JSON.stringify(chamadas.auditoria[0][0]);
  assert.equal(auditoriaSerializada.includes(fatura.faturaExternaId), false);
  assert.equal(auditoriaSerializada.includes(pix), false);
  assert.equal(auditoriaSerializada.includes(linha), false);
});
