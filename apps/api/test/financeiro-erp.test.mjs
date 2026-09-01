import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AdaptadorErpSimulado } from '../dist/erp/simuladores/adaptador-erp-simulado.js';
import { ErroRespostaConsultaErpInvalida } from '../dist/erp/servico-consultas-cliente-contrato-erp.js';
import { ServicoFinanceiroErp } from '../dist/erp/servico-financeiro-erp.js';

const pdfSintetico = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

function criarServico({ comDocumento = true, comPagamento = true } = {}) {
  const fatura = {
    contratoExternoId: 'contrato-sintetico-061',
    faturaExternaId: 'fatura-sintetica-061',
    situacao: 'ABERTA',
    valorCentavos: 12345,
    vencimento: '2026-09-10',
  };
  const adaptador = new AdaptadorErpSimulado({
    dadosPagamentoFatura: comPagamento
      ? [
          {
            faturaExternaId: fatura.faturaExternaId,
            linhaDigitavel: '12345678901234567890123456789012345678901234',
            pixCopiaCola: '00020101021226880014BR.GOV.BCB.PIX',
          },
        ]
      : [],
    documentosFatura: comDocumento
      ? [
          {
            conteudo: pdfSintetico,
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
  const resultado = await servico.consultarDetalhesFatura(
    'fatura-sintetica-061',
  );
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

test('complementos ausentes viram resposta parcial explícita', async () => {
  const { servico } = criarServico({ comDocumento: false, comPagamento: false });
  const resultado = await servico.consultarDetalhesFatura(
    'fatura-sintetica-061',
  );
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
        itens: [
          {
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
    servico.listarFaturas('contrato-sintetico-061'),
    ErroRespostaConsultaErpInvalida,
  );
});

test('PDF falso e dados de pagamento malformados falham fechados', async () => {
  const base = {
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
          conteudo: new Uint8Array([1, 2, 3, 4, 5]),
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
    servico.consultarDetalhesFatura(base.faturaExternaId),
    ErroRespostaConsultaErpInvalida,
  );
});

test('ERP indisponível não cai para snapshot financeiro', async () => {
  const { adaptador, servico } = criarServico();
  adaptador.definirConsultasDisponiveis(false);
  assert.deepEqual(
    await servico.consultarDetalhesFatura('fatura-sintetica-061'),
    { codigo: 'ERP_INDISPONIVEL', resultado: 'INDISPONIVEL' },
  );
});
