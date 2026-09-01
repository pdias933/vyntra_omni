import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AdaptadorSessaoAcessoSimulado } from '../dist/sessao-acesso/simuladores/adaptador-sessao-acesso-simulado.js';
import {
  ErroChaveSessaoAcessoReutilizada,
  ErroEntradaSessaoAcessoInvalida,
} from '../dist/sessao-acesso/erros-sessao-acesso.js';

const agora = new Date('2026-08-31T17:00:00.000Z');

function sessoes() {
  return [
    {
      conexaoExternaId: 'conexao-sintetica-001',
      contratoExternoId: 'contrato-sintetico-001',
      duracaoSegundos: 120,
      enderecoIp: '192.0.2.10',
      estado: 'ATIVA',
      iniciadaEm: new Date('2026-08-31T16:58:00.000Z'),
      nomeUsuario: 'usuario-sintetico-001',
      sessaoId: 'sessao-sintetica-ativa-001',
    },
    {
      conexaoExternaId: 'conexao-sintetica-002',
      contratoExternoId: 'contrato-sintetico-001',
      estado: 'DESCONHECIDA',
      sessaoId: 'sessao-sintetica-desconhecida-001',
    },
    {
      contratoExternoId: 'contrato-sintetico-002',
      estado: 'INATIVA',
      sessaoId: 'sessao-sintetica-inativa-001',
    },
  ];
}

function comando(sessaoId, sobrescritas = {}) {
  return {
    chaveIdempotencia: 'chave_desconexao_sessao_0001',
    motivo: 'Confirmação explícita sintética',
    sessaoId,
    ...sobrescritas,
  };
}

test('simulador nasce desativado e não revela fixture', async () => {
  const adaptador = new AdaptadorSessaoAcessoSimulado(sessoes(), () => agora);
  assert.deepEqual(
    await adaptador.listarSessoes({
      contratoExternoId: 'contrato-sintetico-001',
    }),
    { resultado: 'DESATIVADO' },
  );
  assert.deepEqual(
    await adaptador.consultarSessao('sessao-sintetica-ativa-001'),
    { resultado: 'DESATIVADO' },
  );
});

test('fonte ausente é não configurada e não degrada para dado inventado', async () => {
  const adaptador = new AdaptadorSessaoAcessoSimulado(sessoes(), () => agora);
  adaptador.definirEstadoFonte('NAO_CONFIGURADO');
  assert.deepEqual(
    await adaptador.listarSessoes({
      contratoExternoId: 'contrato-sintetico-001',
    }),
    { resultado: 'NAO_CONFIGURADO' },
  );
});

test('fonte disponível preserva apenas estados explicitamente fornecidos', async () => {
  const adaptador = new AdaptadorSessaoAcessoSimulado(sessoes(), () => agora);
  adaptador.definirEstadoFonte('DISPONIVEL');
  const resultado = await adaptador.listarSessoes({
    contratoExternoId: 'contrato-sintetico-001',
  });
  assert.equal(resultado.resultado, 'SUCESSO');
  assert.deepEqual(
    resultado.sessoes.map((sessao) => sessao.estado),
    ['ATIVA', 'DESCONHECIDA'],
  );
  assert.ok(
    resultado.sessoes.every(
      (sessao) =>
        sessao.origemDado === 'TEMPO_REAL' &&
        sessao.obtidaEm.getTime() === agora.getTime(),
    ),
  );
});

test('conexão cadastrada com estado desconhecido não permite desconexão', async () => {
  const adaptador = new AdaptadorSessaoAcessoSimulado(sessoes(), () => agora);
  adaptador.definirEstadoFonte('DISPONIVEL');
  assert.deepEqual(
    await adaptador.desconectarSessao(
      comando('sessao-sintetica-desconhecida-001'),
    ),
    { resultado: 'ESTADO_NAO_PERMITE' },
  );
  assert.equal(adaptador.obterQuantidadeEfeitosDesconexao(), 0);
});

test('desconexão concorrente compatível produz um efeito', async () => {
  const adaptador = new AdaptadorSessaoAcessoSimulado(sessoes(), () => agora);
  adaptador.definirEstadoFonte('DISPONIVEL');
  const entrada = comando('sessao-sintetica-ativa-001');
  const [primeira, repetida] = await Promise.all([
    adaptador.desconectarSessao(entrada),
    adaptador.desconectarSessao(entrada),
  ]);
  assert.deepEqual(repetida, primeira);
  assert.equal(primeira.resultado, 'CONFIRMADA');
  assert.equal(adaptador.obterQuantidadeTentativasDesconexao(), 1);
  assert.equal(adaptador.obterQuantidadeEfeitosDesconexao(), 1);
  const atual = await adaptador.consultarSessao(entrada.sessaoId);
  assert.equal(atual.resultado, 'SUCESSO');
  assert.equal(atual.sessao.estado, 'INATIVA');
});

test('resposta perdida exige reconciliação e não repete o efeito', async () => {
  const adaptador = new AdaptadorSessaoAcessoSimulado(sessoes(), () => agora);
  adaptador.definirEstadoFonte('DISPONIVEL');
  const entrada = comando('sessao-sintetica-ativa-001', {
    chaveIdempotencia: 'chave_desconexao_perdida_0001',
  });
  adaptador.programarDesconexao(
    entrada.chaveIdempotencia,
    'PERDER_RESPOSTA',
  );
  const primeira = await adaptador.desconectarSessao(entrada);
  const repetida = await adaptador.desconectarSessao(entrada);
  assert.deepEqual(primeira, {
    codigo: 'RESPOSTA_PERDIDA',
    requerReconciliacao: true,
    resultado: 'RESULTADO_INCERTO',
  });
  assert.deepEqual(repetida, primeira);
  assert.equal(adaptador.obterQuantidadeEfeitosDesconexao(), 1);
  assert.equal(
    (
      await adaptador.reconciliarDesconexao({
        chaveIdempotencia: entrada.chaveIdempotencia,
        sessaoId: entrada.sessaoId,
      })
    ).resultado,
    'CONFIRMADA',
  );
});

test('fonte indisponível impede consulta e escrita sem efeito', async () => {
  const adaptador = new AdaptadorSessaoAcessoSimulado(sessoes(), () => agora);
  adaptador.definirEstadoFonte('INDISPONIVEL');
  const esperado = {
    codigo: 'FONTE_SESSAO_ACESSO_INDISPONIVEL',
    resultado: 'INDISPONIVEL',
  };
  assert.deepEqual(
    await adaptador.consultarSessao('sessao-sintetica-ativa-001'),
    esperado,
  );
  assert.deepEqual(
    await adaptador.desconectarSessao(
      comando('sessao-sintetica-ativa-001'),
    ),
    esperado,
  );
  assert.equal(adaptador.obterQuantidadeTentativasDesconexao(), 0);
});

test('entrada inválida e reutilização divergente são recusadas', async () => {
  assert.throws(
    () =>
      new AdaptadorSessaoAcessoSimulado([
        {
          contratoExternoId: 'contrato',
          estado: 'CADASTRADA',
          sessaoId: 'sessao',
        },
      ]),
    ErroEntradaSessaoAcessoInvalida,
  );
  const adaptador = new AdaptadorSessaoAcessoSimulado(sessoes(), () => agora);
  adaptador.definirEstadoFonte('DISPONIVEL');
  const entrada = comando('sessao-sintetica-ativa-001');
  await adaptador.desconectarSessao(entrada);
  await assert.rejects(
    adaptador.desconectarSessao({ ...entrada, motivo: 'Motivo divergente' }),
    ErroChaveSessaoAcessoReutilizada,
  );
});
