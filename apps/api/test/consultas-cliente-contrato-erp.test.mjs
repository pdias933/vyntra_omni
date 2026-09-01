import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AdaptadorErpSimulado } from '../dist/erp/simuladores/adaptador-erp-simulado.js';
import {
  ErroRespostaConsultaErpInvalida,
  ServicoConsultasClienteContratoErp,
} from '../dist/erp/servico-consultas-cliente-contrato-erp.js';

function criarServico() {
  const adaptador = new AdaptadorErpSimulado({
    clientes: [
      {
        clienteExternoId: 'cliente-sintetico-060',
        documentoBusca: 'DOCUMENTO-SINTETICO-060',
        documentoMascarado: 'XXX.XXX.XXX-XX',
        nomeExibicao: 'Cliente Sintético PR 060',
        telefoneBusca: '+550000000060',
        telefoneMascarado: '+55 XX XXXXX-XX60',
      },
    ],
    contratos: [
      {
        clienteExternoId: 'cliente-sintetico-060',
        contratoExternoId: 'contrato-sintetico-060',
        enderecoResumido: 'Endereço sintético',
        servico: 'Plano sintético',
        situacao: 'ATIVO',
      },
    ],
  });
  return {
    adaptador,
    servico: new ServicoConsultasClienteContratoErp(adaptador),
  };
}

test('busca e detalhes expõem somente modelos internos normalizados', async () => {
  const { servico } = criarServico();
  const busca = await servico.localizarClientes({
    documento: 'DOCUMENTO-SINTETICO-060',
  });
  const cliente = await servico.consultarCliente('cliente-sintetico-060');
  const contratos = await servico.listarContratos('cliente-sintetico-060');
  const contrato = await servico.consultarContrato('contrato-sintetico-060');

  assert.equal(busca.resultado, 'SUCESSO');
  assert.equal(cliente.resultado, 'SUCESSO');
  assert.equal(contratos.resultado, 'SUCESSO');
  assert.equal(contrato.resultado, 'SUCESSO');
  assert.equal(contrato.item.situacao, 'ATIVO');
  const saida = JSON.stringify({ busca, cliente, contrato, contratos });
  assert.ok(!saida.includes('DOCUMENTO-SINTETICO-060'));
  assert.ok(!saida.includes('+550000000060'));
  assert.match(saida, /TEMPO_REAL/);
});

test('consulta exata diferencia ausência de indisponibilidade', async () => {
  const { adaptador, servico } = criarServico();
  assert.deepEqual(await servico.consultarCliente('cliente-ausente-060'), {
    origem: 'TEMPO_REAL',
    resultado: 'NAO_ENCONTRADO',
  });
  adaptador.definirConsultasDisponiveis(false);
  assert.deepEqual(await servico.consultarContrato('contrato-sintetico-060'), {
    codigo: 'ERP_INDISPONIVEL',
    resultado: 'INDISPONIVEL',
  });
});

test('resposta com campo externo desconhecido falha fechada', async () => {
  const consultas = {
    async consultarCliente() {
      return {
        item: {
          clienteExternoId: 'cliente-sintetico-060',
          nomeExibicao: 'Cliente Sintético',
          raw_document: 'nao-deve-atravessar',
        },
        origem: 'TEMPO_REAL',
        resultado: 'SUCESSO',
      };
    },
  };
  const servico = new ServicoConsultasClienteContratoErp(consultas);
  await assert.rejects(
    servico.consultarCliente('cliente-sintetico-060'),
    ErroRespostaConsultaErpInvalida,
  );
});

test('contrato de outro cliente é recusado antes de chegar ao consumidor', async () => {
  const consultas = {
    async listarContratos() {
      return {
        itens: [
          {
            clienteExternoId: 'outro-cliente',
            contratoExternoId: 'contrato-sintetico-060',
            situacao: 'ATIVO',
          },
        ],
        origem: 'TEMPO_REAL',
        resultado: 'SUCESSO',
      };
    },
  };
  const servico = new ServicoConsultasClienteContratoErp(consultas);
  await assert.rejects(
    servico.listarContratos('cliente-sintetico-060'),
    ErroRespostaConsultaErpInvalida,
  );
});
