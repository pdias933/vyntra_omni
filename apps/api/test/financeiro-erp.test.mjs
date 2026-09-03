import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AdaptadorErpSimulado } from '../dist/erp/simuladores/adaptador-erp-simulado.js';
import { ErroRespostaConsultaErpInvalida } from '../dist/erp/servico-consultas-cliente-contrato-erp.js';
import { ServicoFinanceiroErp } from '../dist/erp/servico-financeiro-erp.js';

const pdfSintetico = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const contextoContrato = {
  clienteExternoId: 'cliente-sintetico-061',
  contratoExternoId: 'contrato-sintetico-061',
};
const contextoFatura = {
  ...contextoContrato,
  faturaExternaId: 'fatura-sintetica-061',
};

function criarServico({ comDocumento = true, comPagamento = true } = {}) {
  const fatura = {
    clienteExternoId: contextoContrato.clienteExternoId,
    contratoExternoId: 'contrato-sintetico-061',
    faturaExternaId: 'fatura-sintetica-061',
    situacao: 'ABERTA',
    valorCentavos: 12345,
    vencimento: '2026-09-10',
  };
  const adaptador = new AdaptadorErpSimulado({
    contratos: [
      {
        clienteExternoId: contextoContrato.clienteExternoId,
        contratoExternoId: contextoContrato.contratoExternoId,
        situacao: 'ATIVO',
      },
    ],
    dadosPagamentoFatura: comPagamento
      ? [
          {
            clienteExternoId: fatura.clienteExternoId,
            contratoExternoId: fatura.contratoExternoId,
            faturaExternaId: fatura.faturaExternaId,
            linhaDigitavel: '12345678901234567890123456789012345678901234',
            pixCopiaCola: '00020101021226880014BR.GOV.BCB.PIX',
          },
        ]
      : [],
    documentosFatura: comDocumento
      ? [
          {
            clienteExternoId: fatura.clienteExternoId,
            conteudo: pdfSintetico,
            contratoExternoId: fatura.contratoExternoId,
            faturaExternaId: fatura.faturaExternaId,
            nomeArquivo: 'fatura-sintetica.pdf',
            tipoArquivo: 'PDF',
          },
        ]
      : [],
    faturas: [fatura],
  });
  return { adaptador, servico: new ServicoFinanceiroErp(adaptador) };
}

test('fatura completa preserva situação, PDF, Pix, linha e origem em tempo real', async () => {
  const { servico } = criarServico();
  const resultado = await servico.consultarDetalhesFatura(contextoFatura);
  assert.equal(resultado.resultado, 'SUCESSO');
  assert.equal(resultado.origem, 'TEMPO_REAL');
  assert.equal(resultado.completude, 'COMPLETA');
  assert.equal(resultado.fatura.situacao, 'ABERTA');
  assert.equal(resultado.documento.estado, 'DISPONIVEL');
  assert.equal(resultado.documento.item.tipoArquivo, 'PDF');
  assert.equal(resultado.dadosPagamento.estado, 'DISPONIVEL');
  assert.match(resultado.dadosPagamento.item.pixCopiaCola, /^000201/u);
  assert.match(resultado.dadosPagamento.item.linhaDigitavel, /^\d{44}$/u);
});

test('simulador não resolve fatura ou complemento fora do par cliente e contrato', async () => {
  const { adaptador } = criarServico();
  const contextoDivergente = {
    ...contextoFatura,
    clienteExternoId: 'outro-cliente-sintetico',
  };
  assert.equal(
    (await adaptador.consultarFatura(contextoDivergente)).resultado,
    'NAO_ENCONTRADO',
  );
  assert.equal(
    (await adaptador.obterDocumentoFatura(contextoDivergente)).resultado,
    'NAO_ENCONTRADO',
  );
  assert.equal(
    (await adaptador.obterDadosPagamentoFatura(contextoDivergente)).resultado,
    'NAO_ENCONTRADO',
  );
});

test('complementos ausentes viram resposta parcial explícita', async () => {
  const { servico } = criarServico({ comDocumento: false, comPagamento: false });
  const resultado = await servico.consultarDetalhesFatura(contextoFatura);
  assert.equal(resultado.resultado, 'SUCESSO');
  assert.equal(resultado.completude, 'PARCIAL');
  assert.deepEqual(resultado.documento, {
    estado: 'INDISPONIVEL',
    motivo: 'NAO_FORNECIDO',
  });
  assert.deepEqual(resultado.dadosPagamento, {
    estado: 'INDISPONIVEL',
    motivo: 'NAO_FORNECIDO',
  });
});

test('lista recusa fatura pertencente a outro contrato', async () => {
  const consultas = {
    async listarFaturas() {
      return {
        cobertura: { tipo: 'INTEGRAL' },
        itens: [
          {
            clienteExternoId: contextoContrato.clienteExternoId,
            contratoExternoId: 'contrato-divergente-061',
            faturaExternaId: 'fatura-sintetica-061',
            situacao: 'ABERTA',
            valorCentavos: 12345,
            vencimento: '2026-09-10',
          },
        ],
        origem: 'TEMPO_REAL',
        resultado: 'SUCESSO',
      };
    },
  };
  const servico = new ServicoFinanceiroErp(consultas);
  await assert.rejects(
    servico.listarFaturas(contextoContrato),
    ErroRespostaConsultaErpInvalida,
  );
});

test('serviço financeiro recusa cliente divergente e data impossível', async () => {
  for (const item of [
    {
      clienteExternoId: 'cliente-divergente-061',
      contratoExternoId: contextoContrato.contratoExternoId,
      faturaExternaId: 'fatura-sintetica-061',
      situacao: 'ABERTA',
      valorCentavos: 12345,
      vencimento: '2026-09-10',
    },
    {
      clienteExternoId: contextoContrato.clienteExternoId,
      contratoExternoId: contextoContrato.contratoExternoId,
      faturaExternaId: 'fatura-sintetica-061',
      situacao: 'ABERTA',
      valorCentavos: 12345,
      vencimento: '2026-02-31',
    },
  ]) {
    const servico = new ServicoFinanceiroErp({
      listarFaturas: async () => ({
        cobertura: { tipo: 'INTEGRAL' },
        itens: [item],
        origem: 'TEMPO_REAL',
        resultado: 'SUCESSO',
      }),
    });
    await assert.rejects(
      servico.listarFaturas(contextoContrato),
      ErroRespostaConsultaErpInvalida,
    );
  }
});

test('PDF falso e dados de pagamento malformados falham fechados', async () => {
  const base = {
    clienteExternoId: contextoContrato.clienteExternoId,
    contratoExternoId: 'contrato-sintetico-061',
    faturaExternaId: 'fatura-sintetica-061',
    situacao: 'ABERTA',
    valorCentavos: 12345,
    vencimento: '2026-09-10',
  };
  const consultas = {
    async consultarFatura() {
      return { item: base, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
    },
    async obterDocumentoFatura() {
      return {
        item: {
          clienteExternoId: base.clienteExternoId,
          conteudo: new Uint8Array([1, 2, 3, 4, 5]),
          contratoExternoId: base.contratoExternoId,
          faturaExternaId: base.faturaExternaId,
          nomeArquivo: 'falso.pdf',
          tipoArquivo: 'PDF',
        },
        origem: 'TEMPO_REAL',
        resultado: 'SUCESSO',
      };
    },
    async obterDadosPagamentoFatura() {
      return {
        item: {
          clienteExternoId: base.clienteExternoId,
          contratoExternoId: base.contratoExternoId,
          faturaExternaId: base.faturaExternaId,
          linhaDigitavel: 'abc',
        },
        origem: 'TEMPO_REAL',
        resultado: 'SUCESSO',
      };
    },
  };
  const servico = new ServicoFinanceiroErp(consultas);
  await assert.rejects(
    servico.consultarDetalhesFatura({
      ...contextoContrato,
      faturaExternaId: base.faturaExternaId,
    }),
    ErroRespostaConsultaErpInvalida,
  );
});

test('complemento precisa pertencer ao trio cliente, contrato e fatura', async () => {
  const base = {
    clienteExternoId: contextoContrato.clienteExternoId,
    contratoExternoId: contextoContrato.contratoExternoId,
    faturaExternaId: contextoFatura.faturaExternaId,
    situacao: 'ABERTA',
    valorCentavos: 12345,
    vencimento: '2026-09-10',
  };
  const servico = new ServicoFinanceiroErp({
    consultarFatura: async () => ({ item: base, origem: 'TEMPO_REAL', resultado: 'SUCESSO' }),
    obterDocumentoFatura: async () => ({
      item: { clienteExternoId: 'outro-cliente', conteudo: pdfSintetico, contratoExternoId: base.contratoExternoId, faturaExternaId: base.faturaExternaId, nomeArquivo: 'fatura.pdf', tipoArquivo: 'PDF' },
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    }),
    obterDadosPagamentoFatura: async () => ({ codigo: 'CAPACIDADE_NAO_HABILITADA', resultado: 'INDISPONIVEL' }),
  });
  await assert.rejects(
    servico.consultarDetalhesFatura(contextoFatura),
    ErroRespostaConsultaErpInvalida,
  );
});

test('simulador aceita o mesmo número de contrato em clientes diferentes', async () => {
  const adaptador = new AdaptadorErpSimulado({
    contratos: [
      { clienteExternoId: contextoContrato.clienteExternoId, contratoExternoId: contextoContrato.contratoExternoId, situacao: 'ATIVO' },
      { clienteExternoId: 'outro-cliente', contratoExternoId: contextoContrato.contratoExternoId, situacao: 'ATIVO' },
    ],
    faturas: [{ clienteExternoId: contextoContrato.clienteExternoId, contratoExternoId: contextoContrato.contratoExternoId, faturaExternaId: contextoFatura.faturaExternaId, situacao: 'ABERTA', valorCentavos: 12345, vencimento: '2026-09-10' }],
  });
  const resultado = await adaptador.listarFaturas(contextoContrato);
  assert.equal(resultado.resultado, 'SUCESSO');
  assert.equal(resultado.itens.length, 1);
});

test('ERP indisponível não cai para snapshot financeiro', async () => {
  const { adaptador, servico } = criarServico();
  adaptador.definirConsultasDisponiveis(false);
  assert.deepEqual(
    await servico.consultarDetalhesFatura(contextoFatura),
    { codigo: 'ERP_INDISPONIVEL', resultado: 'INDISPONIVEL' },
  );
});
