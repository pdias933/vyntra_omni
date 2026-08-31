import assert from 'node:assert/strict';
import test from 'node:test';

import { ServicoAuditoria } from '../dist/auditoria/servico-auditoria.js';
import { contextoCorrelacao } from '../dist/observabilidade/contexto-correlacao.js';

const ids = {
  atendimento: '11111111-1111-4111-8111-111111111111',
  correlacao: '22222222-2222-4222-8222-222222222222',
  entidade: '33333333-3333-4333-8333-333333333333',
  usuario: '44444444-4444-4444-8444-444444444444',
};

function criarServico() {
  const registros = [];
  const repositorio = {
    acrescentar: async (registro) => {
      registros.push(registro);
    },
  };

  return { registros, servico: new ServicoAuditoria(repositorio) };
}

test('acrescenta auditoria sanitizada com ator, contexto e correlação', async () => {
  const { registros, servico } = criarServico();

  const registro = await contextoCorrelacao.executar(ids.correlacao, () =>
    servico.registrar({
      acao: 'ALTERAR_CONTEXTO_CLIENTE',
      atendimentoId: ids.atendimento,
      dadosAnteriores: {
        documento: 'CPF 123.456.789-00',
        token: 'segredo-que-nao-pode-persistir',
      },
      dadosNovos: {
        contrato_id: 'CONTRATO_SANITIZADO_1',
        detalhes: { senha: 'valor-proibido' },
      },
      entidadeId: ids.entidade,
      entidadeTipo: 'CONTEXTO_ATENDIMENTO',
      origem: 'USUARIO',
      tipoEvento: 'CONTEXTO_CLIENTE_ALTERADO',
      usuarioId: ids.usuario,
    }),
  );

  assert.equal(registros.length, 1);
  assert.equal(registros[0], registro);
  assert.equal(registro.correlacaoId, ids.correlacao);
  assert.match(registro.id, /^[0-9a-f-]{36}$/);
  assert.ok(registro.criadoEm instanceof Date);
  assert.equal(
    registro.dadosAnterioresSanitizados.documento,
    'CPF [DOCUMENTO_REMOVIDO]',
  );
  assert.equal(registro.dadosAnterioresSanitizados.token, '[PROTEGIDO]');
  assert.deepEqual(registro.dadosNovosSanitizados.detalhes, {
    senha: '[PROTEGIDO]',
  });
});

test('gera IDs distintos e não oferece operação de mutação no repositório central', async () => {
  const { registros, servico } = criarServico();

  await Promise.all([
    servico.registrar({
      acao: 'SISTEMA_INICIADO',
      origem: 'SISTEMA',
      tipoEvento: 'SISTEMA_INICIADO',
    }),
    servico.registrar({
      acao: 'INTEGRACAO_VERIFICADA',
      origem: 'INTEGRACAO',
      tipoEvento: 'INTEGRACAO_VERIFICADA',
    }),
  ]);

  assert.equal(registros.length, 2);
  assert.notEqual(registros[0].id, registros[1].id);
  assert.notEqual(registros[0].correlacaoId, registros[1].correlacaoId);
});

test('recusa ator incompatível, entidade parcial e identificador inválido antes de persistir', async () => {
  const { registros, servico } = criarServico();

  await assert.rejects(
    servico.registrar({
      acao: 'ALTERAR_USUARIO',
      origem: 'USUARIO',
      tipoEvento: 'USUARIO_ALTERADO',
    }),
    /ATOR_AUDITORIA_INCOMPATIVEL/,
  );
  await assert.rejects(
    servico.registrar({
      acao: 'SISTEMA_INICIADO',
      entidadeTipo: 'SISTEMA',
      origem: 'SISTEMA',
      tipoEvento: 'SISTEMA_INICIADO',
    }),
    /ENTIDADE_AUDITORIA_INCOMPLETA/,
  );
  await assert.rejects(
    servico.registrar({
      acao: 'ALTERAR_USUARIO',
      origem: 'USUARIO',
      tipoEvento: 'USUARIO_ALTERADO',
      usuarioId: 'nao-e-uuid',
    }),
    /IDENTIFICADOR_AUDITORIA_INVALIDO/,
  );

  assert.equal(registros.length, 0);
});
