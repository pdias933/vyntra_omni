import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ServicoInvalidacaoPermissoes } from '../dist/autorizacao/servico-invalidacao-permissoes.js';

const ids = {
  ator: randomUUID(),
  fila: randomUUID(),
  usuario: randomUUID(),
};

test('incrementa versão e confirma evento de escopo na mesma transação', async () => {
  const chamadas = { eventos: [], versoes: [] };
  const transacao = { id: 'transacao-permissoes' };
  const servico = new ServicoInvalidacaoPermissoes(
    {
      incrementarVersao: async (...argumentos) => {
        chamadas.versoes.push(argumentos);
        return 2;
      },
    },
    {
      acrescentar: async (...argumentos) => chamadas.eventos.push(argumentos),
    },
  );
  assert.equal(
    await servico.registrar(
      {
        filaId: ids.fila,
        motivo: 'ACESSO_FILA_REVOGADO',
        usuarioAlvoId: ids.usuario,
        usuarioAtorId: ids.ator,
      },
      transacao,
    ),
    2,
  );
  assert.deepEqual(chamadas.versoes, [[ids.usuario, transacao]]);
  assert.deepEqual(chamadas.eventos, [
    [
      {
        classificacaoDados: 'OPERACIONAL',
        dados: {
          filaId: ids.fila,
          tipo: 'ACESSO_FILA_REVOGADO',
          versaoPermissoes: 2,
        },
        entidadeId: ids.usuario,
        entidadeTipo: 'USUARIO',
        tipo: 'PERMISSOES_ALTERADAS',
        usuarioAtorId: ids.ator,
      },
      transacao,
    ],
  ]);
});

test('usuário indisponível ou entrada inválida não produz evento', async () => {
  const eventos = [];
  const servico = new ServicoInvalidacaoPermissoes(
    { incrementarVersao: async () => undefined },
    { acrescentar: async (...argumentos) => eventos.push(argumentos) },
  );
  await assert.rejects(
    servico.registrar(
      {
        motivo: 'PERFIL_ALTERADO',
        usuarioAlvoId: ids.usuario,
        usuarioAtorId: ids.ator,
      },
      {},
    ),
    /USUARIO_INVALIDACAO/u,
  );
  await assert.rejects(
    servico.registrar(
      {
        motivo: 'PERFIL_ALTERADO',
        usuarioAlvoId: 'invalido',
        usuarioAtorId: ids.ator,
      },
      {},
    ),
    /INVALIDACAO_PERMISSOES_INVALIDA/u,
  );
  assert.deepEqual(eventos, []);
});
