import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ErroFluxoInvalido } from '../dist/fluxos/erros-fluxo.js';
import { SimuladorFluxos } from '../dist/fluxos/simulador-fluxos.js';

const simulador = new SimuladorFluxos();

function no(id, tipo, limiteIteracoes) {
  return {
    id,
    parametros: tipo === 'ENVIAR_MENSAGEM' ? { texto: 'SEGREDO_AUTORAL' } : {},
    referencias: [],
    tipo,
    variaveisEntrada: [],
    variaveisSaida: [],
    ...(limiteIteracoes === undefined ? {} : { limiteIteracoes }),
  };
}

function fluxoComNo(tipo, saidas) {
  return {
    conexoes: [
      { destinoNoId: 'acao', origemNoId: 'inicio', saida: 'SUCESSO' },
      ...saidas.map((saida) => ({
        destinoNoId: 'fim',
        origemNoId: 'acao',
        saida,
      })),
    ],
    inicioNoId: 'inicio',
    nos: [no('inicio', 'INICIO'), no('acao', tipo), no('fim', 'FIM')],
    variaveis: [],
    versaoSchema: 1,
  };
}

test('caminho feliz mostra passos e prévia somente com dados fictícios', () => {
  const resultado = simulador.simular(
    fluxoComNo('ENVIAR_MENSAGEM', ['SUCESSO']),
    'CAMINHO_FELIZ',
  );
  assert.equal(resultado.estado, 'CONCLUIDA');
  assert.equal(resultado.efeitosReaisExecutados, false);
  assert.deepEqual(resultado.passos.map(({ tipoNo }) => tipoNo), [
    'INICIO',
    'ENVIAR_MENSAGEM',
    'FIM',
  ]);
  assert.equal(resultado.contextoFicticio.contato, 'Cliente fictício');
  assert.equal(JSON.stringify(resultado).includes('SEGREDO_AUTORAL'), false);
});

test('cenários escolhem saídas determinísticas sem provider externo', () => {
  const cenarios = [
    ['CAMINHO_ALTERNATIVO', 'CONDICAO', 'FALSO'],
    ['CONTATO_NAO_IDENTIFICADO', 'IDENTIFICAR_CONTATO', 'NAO_IDENTIFICADO'],
    ['ERP_INDISPONIVEL', 'CONSULTAR_FATURAS', 'ERP_INDISPONIVEL'],
    ['TIMEOUT', 'AGUARDAR', 'TIMEOUT'],
    ['FORA_DO_HORARIO', 'HORARIO_ATENDIMENTO', 'FORA_HORARIO'],
    ['CANAL_LIMITADO', 'SOLICITAR_FORMULARIO_WHATSAPP', 'FALLBACK'],
  ];
  for (const [cenario, tipo, saida] of cenarios) {
    const resultado = simulador.simular(fluxoComNo(tipo, [saida]), cenario);
    assert.equal(resultado.estado, 'CONCLUIDA');
    assert.equal(resultado.passos[1].saida, saida);
    assert.equal(resultado.efeitosReaisExecutados, false);
  }
});

test('saída ausente e ciclo encerram de forma visível e limitada', () => {
  const semSaida = simulador.simular(
    fluxoComNo('CONDICAO', ['FALSO']),
    'CAMINHO_FELIZ',
  );
  assert.equal(semSaida.estado, 'INTERROMPIDA');
  assert.equal(semSaida.codigoFinal, 'SAIDA_SEM_CONEXAO_UNICA');
  assert.equal(semSaida.passos.at(-1).estado, 'INTERROMPIDO');

  const ciclico = {
    conexoes: [
      { destinoNoId: 'acao', origemNoId: 'inicio', saida: 'SUCESSO' },
      { destinoNoId: 'acao', origemNoId: 'acao', saida: 'VERDADEIRO' },
    ],
    inicioNoId: 'inicio',
    nos: [no('inicio', 'INICIO'), no('acao', 'CONDICAO', 2)],
    variaveis: [],
    versaoSchema: 1,
  };
  const limitado = simulador.simular(ciclico, 'CAMINHO_FELIZ');
  assert.equal(limitado.estado, 'LIMITE_ATINGIDO');
  assert.equal(limitado.codigoFinal, 'LIMITE_SIMULACAO_ATINGIDO');
  assert.ok(limitado.passos.length < 10);
});

test('cenário desconhecido falha antes de percorrer o grafo', () => {
  assert.throws(
    () => simulador.simular(fluxoComNo('CONDICAO', ['VERDADEIRO']), 'INVENTADO'),
    ErroFluxoInvalido,
  );
});
