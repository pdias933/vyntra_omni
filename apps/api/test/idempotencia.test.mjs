import assert from 'node:assert/strict';
import test from 'node:test';

import { ServicoIdempotencia } from '../dist/idempotencia/servico-idempotencia.js';

const escopoId = '10000000-0000-4000-8000-000000000001';
const chaveIdempotencia = '20000000-0000-4000-8000-000000000002';
const assinatura = 'a'.repeat(64);

function criarCenario() {
  const registros = new Map();
  const operacoes = new Map();
  const tentativas = [];

  function chaveRegistro(dados) {
    return `${dados.escopoTipo}:${dados.escopoId}:${dados.chaveHash}`;
  }

  function corresponde(valor, filtro) {
    if (filtro === undefined) return true;
    if (typeof filtro !== 'object' || filtro === null) return valor === filtro;
    if (filtro.in !== undefined && !filtro.in.includes(valor)) return false;
    if (filtro.lte !== undefined && !(valor <= filtro.lte)) return false;
    if (filtro.gt !== undefined && !(valor > filtro.gt)) return false;
    return true;
  }

  const transacao = {
    registroIdempotencia: {
      createMany: async ({ data }) => {
        const chave = chaveRegistro(data);
        if (registros.has(chave)) return { count: 0 };
        registros.set(chave, { ...data });
        return { count: 1 };
      },
      findUnique: async ({ where }) => {
        const registro = registros.get(
          chaveRegistro(where.escopoTipo_escopoId_chaveHash),
        );
        if (registro === undefined) return null;
        return {
          ...registro,
          operacao:
            [...operacoes.values()].find(
              (operacao) => operacao.registroIdempotenciaId === registro.id,
            ) ?? null,
        };
      },
    },
    operacaoRecuperavel: {
      create: async ({ data }) => {
        const agora = new Date();
        const operacao = {
          atualizadoEm: data.atualizadoEm ?? agora,
          codigoUltimoErro: null,
          concluidoEm: null,
          concessaoAte: null,
          concessaoTokenHash: null,
          criadoEm: data.criadoEm ?? agora,
          entidadeId: data.entidadeId ?? null,
          entidadeTipo: data.entidadeTipo ?? null,
          estado: 'PENDENTE',
          proximaAcaoEm: agora,
          resultadoProtegido: null,
          tentativas: 0,
          versao: 0,
          ...data,
        };
        operacoes.set(operacao.id, operacao);
        return operacao;
      },
      findUnique: async ({ where }) => operacoes.get(where.id) ?? null,
      findMany: async ({ where, take }) =>
        [...operacoes.values()]
          .filter(
            (operacao) =>
              corresponde(operacao.estado, where.estado) &&
              corresponde(operacao.concessaoAte, where.concessaoAte),
          )
          .slice(0, take),
      updateMany: async ({ data, where }) => {
        const operacao = operacoes.get(where.id);
        if (
          operacao === undefined ||
          !corresponde(operacao.estado, where.estado) ||
          !corresponde(operacao.versao, where.versao) ||
          !corresponde(operacao.proximaAcaoEm, where.proximaAcaoEm) ||
          !corresponde(operacao.concessaoAte, where.concessaoAte) ||
          !corresponde(operacao.concessaoTokenHash, where.concessaoTokenHash)
        ) {
          return { count: 0 };
        }
        for (const [campo, valor] of Object.entries(data)) {
          if (valor?.increment !== undefined) {
            operacao[campo] += valor.increment;
          } else {
            operacao[campo] = valor;
          }
        }
        operacao.atualizadoEm = new Date();
        return { count: 1 };
      },
    },
    tentativaOperacao: {
      create: async ({ data }) => {
        tentativas.push({
          codigoResultado: null,
          dadosProtegidos: null,
          encerradaEm: null,
          resultado: 'EM_ANDAMENTO',
          ...data,
        });
      },
      updateMany: async ({ data, where }) => {
        const tentativa = tentativas.find(
          (item) =>
            item.operacaoId === where.operacaoId &&
            item.numero === where.numero &&
            item.resultado === where.resultado &&
            corresponde(item.concessaoTokenHash, where.concessaoTokenHash),
        );
        if (tentativa === undefined) return { count: 0 };
        Object.assign(tentativa, data);
        return { count: 1 };
      },
    },
  };
  const prisma = {
    executarTransacao: async (operacao) => operacao(transacao),
  };

  return {
    operacoes,
    registros,
    servico: new ServicoIdempotencia(prisma),
    tentativas,
  };
}

function entradaBase(sobrescrever = {}) {
  return {
    assinaturaRequisicaoHash: assinatura,
    chaveIdempotencia,
    escopoId,
    escopoTipo: 'USUARIO',
    tipoOperacao: 'EMITIR_SEGUNDA_VIA',
    ...sobrescrever,
  };
}

test('cria uma operação e devolve a mesma para repetição compatível', async () => {
  const cenario = criarCenario();
  const primeira = await cenario.servico.iniciarOuObter(entradaBase());
  const segunda = await cenario.servico.iniciarOuObter(entradaBase());

  assert.equal(primeira.situacao, 'NOVA');
  assert.equal(segunda.situacao, 'EXISTENTE');
  assert.equal(segunda.operacao.id, primeira.operacao.id);
  assert.equal(cenario.registros.size, 1);
  assert.equal(cenario.operacoes.size, 1);
  assert.ok(
    !JSON.stringify([...cenario.registros.values()]).includes(chaveIdempotencia),
  );
});

test('recusa reutilizar a chave com assinatura de comando diferente', async () => {
  const cenario = criarCenario();
  await cenario.servico.iniciarOuObter(entradaBase());

  await assert.rejects(
    cenario.servico.iniciarOuObter(
      entradaBase({ assinaturaRequisicaoHash: 'b'.repeat(64) }),
    ),
    /CHAVE_IDEMPOTENCIA_REUTILIZADA/,
  );
});

test('concessão concorrente tem um vencedor, persiste tentativa e protege resultado', async () => {
  const cenario = criarCenario();
  const iniciada = await cenario.servico.iniciarOuObter(entradaBase());
  const disputas = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      cenario.servico.concederExecucao(iniciada.operacao.id, 30_000),
    ),
  );
  const vencedores = disputas.filter((resultado) => resultado.status === 'fulfilled');

  assert.equal(vencedores.length, 1);
  const concessao = vencedores[0].value;
  const operacaoEmExecucao = cenario.operacoes.get(iniciada.operacao.id);
  assert.equal(operacaoEmExecucao.estado, 'EM_EXECUCAO');
  assert.equal(operacaoEmExecucao.concessaoTokenHash.length, 64);
  assert.notEqual(operacaoEmExecucao.concessaoTokenHash, concessao.tokenConcessao);
  assert.equal(cenario.tentativas.length, 1);

  await cenario.servico.concluir({
    dados: { contrato: 'SINTETICO', senha: 'nao-persistir' },
    operacaoId: iniciada.operacao.id,
    tokenConcessao: concessao.tokenConcessao,
  });

  assert.equal(operacaoEmExecucao.estado, 'CONCLUIDA');
  assert.equal(operacaoEmExecucao.concessaoTokenHash, null);
  assert.equal(operacaoEmExecucao.resultadoProtegido.senha, '[PROTEGIDO]');
  assert.equal(cenario.tentativas[0].resultado, 'SUCESSO');
  assert.equal(cenario.tentativas[0].dadosProtegidos.senha, '[PROTEGIDO]');
});

test('valida escopo, UUID e assinatura antes de abrir transação', async () => {
  const cenario = criarCenario();
  await assert.rejects(
    cenario.servico.iniciarOuObter(
      entradaBase({ assinaturaRequisicaoHash: 'invalida' }),
    ),
    /ASSINATURA_REQUISICAO_INVALIDA/,
  );
  assert.equal(cenario.registros.size, 0);
});
