import assert from 'node:assert/strict';
import test from 'node:test';

import { ServicoCaixaSaida } from '../dist/eventos/servico-caixa-saida.js';
import { ServicoEventoDominio } from '../dist/eventos/servico-evento-dominio.js';
import { ServicoTransacaoDominio } from '../dist/eventos/servico-transacao-dominio.js';

const entidadeId = '11111111-1111-4111-8111-111111111111';

function criarCenario() {
  const ordem = [];
  const transacao = { identificador: 'mesma-transacao' };
  let confirmada = false;
  let revertida = false;
  const prisma = {
    executarTransacao: async (operacao) => {
      try {
        const resultado = await operacao(transacao);
        confirmada = true;
        return resultado;
      } catch (erro) {
        revertida = true;
        throw erro;
      }
    },
  };
  const repositorioEventos = {
    acrescentar: async (evento, contexto) => {
      assert.equal(contexto, transacao);
      ordem.push(['evento', evento]);
      return 41n;
    },
  };
  const repositorioCaixaSaida = {
    acrescentar: async (item, contexto) => {
      assert.equal(contexto, transacao);
      ordem.push(['caixa_saida', item]);
    },
  };
  const servico = new ServicoTransacaoDominio(
    prisma,
    new ServicoEventoDominio(repositorioEventos),
    new ServicoCaixaSaida(repositorioCaixaSaida),
  );

  return {
    estado: () => ({ confirmada, revertida }),
    ordem,
    servico,
    transacao,
  };
}

test('confirma alteração, evento e caixa de saída na mesma transação e em ordem', async () => {
  const cenario = criarCenario();

  const resultado = await cenario.servico.executarComCaixaSaida({
    alterar: async (transacao) => {
      assert.equal(transacao, cenario.transacao);
      cenario.ordem.push(['alteracao', { id: entidadeId }]);
      return { id: entidadeId };
    },
    criarEvento: ({ id }) => ({
      classificacaoDados: 'OPERACIONAL',
      dados: { senha: 'nao-persistir', situacao: 'confirmada' },
      entidadeId: id,
      entidadeTipo: 'REGISTRO_ACEITE',
      tipo: 'REGISTRO_ACEITE_CRIADO',
    }),
    criarItensCaixaSaida: ({ id }) => [
      {
        dados: { entidade_id: id, token: 'nao-persistir' },
        destino: 'DISTRIBUIDOR_EVENTOS',
        tipo: 'DISTRIBUIR_EVENTO',
      },
    ],
  });

  assert.deepEqual(
    cenario.ordem.map(([etapa]) => etapa),
    ['alteracao', 'evento', 'caixa_saida'],
  );
  assert.equal(resultado.evento.sequenciaEvento, 41n);
  assert.equal(resultado.evento.dadosProtegidosMinimizados.senha, '[PROTEGIDO]');
  assert.equal(
    resultado.itensCaixaSaida[0].dadosProtegidosMinimizados.token,
    '[PROTEGIDO]',
  );
  assert.equal(
    resultado.itensCaixaSaida[0].eventoDominioId,
    resultado.evento.id,
  );
  assert.deepEqual(cenario.estado(), { confirmada: true, revertida: false });
});

test('reverte toda a unidade quando o efeito assíncrono não é declarado', async () => {
  const cenario = criarCenario();

  await assert.rejects(
    cenario.servico.executarComCaixaSaida({
      alterar: async () => ({ id: entidadeId }),
      criarEvento: ({ id }) => ({
        classificacaoDados: 'OPERACIONAL',
        entidadeId: id,
        entidadeTipo: 'REGISTRO_ACEITE',
        tipo: 'REGISTRO_ACEITE_CRIADO',
      }),
      criarItensCaixaSaida: () => [],
    }),
    /QUANTIDADE_ITENS_CAIXA_SAIDA_INVALIDA/,
  );

  assert.deepEqual(cenario.estado(), { confirmada: false, revertida: true });
});

test('recusa evento e item inválidos antes da persistência correspondente', async () => {
  const cenarioEvento = criarCenario();
  await assert.rejects(
    cenarioEvento.servico.executarComCaixaSaida({
      alterar: async () => ({ id: entidadeId }),
      criarEvento: ({ id }) => ({
        classificacaoDados: 'OPERACIONAL',
        entidadeId: id,
        entidadeTipo: 'invalido',
        tipo: 'EVENTO_VALIDO',
      }),
      criarItensCaixaSaida: () => [
        { destino: 'DISTRIBUIDOR_EVENTOS', tipo: 'DISTRIBUIR_EVENTO' },
      ],
    }),
    /EVENTO_DOMINIO_INVALIDO/,
  );

  const cenarioItem = criarCenario();
  await assert.rejects(
    cenarioItem.servico.executarComCaixaSaida({
      alterar: async () => ({ id: entidadeId }),
      criarEvento: ({ id }) => ({
        classificacaoDados: 'OPERACIONAL',
        entidadeId: id,
        entidadeTipo: 'REGISTRO_ACEITE',
        tipo: 'REGISTRO_ACEITE_CRIADO',
      }),
      criarItensCaixaSaida: () => [
        { destino: 'destino-invalido', tipo: 'DISTRIBUIR_EVENTO' },
      ],
    }),
    /ITEM_CAIXA_SAIDA_INVALIDO/,
  );
});
