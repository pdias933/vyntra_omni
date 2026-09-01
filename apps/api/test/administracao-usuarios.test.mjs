import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ServicoAdministracaoUsuarios } from '../dist/administracao-usuarios/servico-administracao-usuarios.js';

const ids = { ator: randomUUID(), fila: randomUUID(), perfil: randomUUID(), sessao: randomUUID(), usuario: randomUUID() };
const sessao = { estado: 'ATIVA', expiraEm: new Date('2099-01-01T00:00:00Z'), sessaoId: ids.sessao, usuarioId: ids.ator };

test('painel autoriza ADMINISTRAR_USUARIOS antes de consultar equipe', async () => {
  let autorizado = false;
  const transacao = {
    fila: { findMany: async () => [] }, perfilAcesso: { findMany: async () => [] }, registroAuditoria: { findMany: async () => [] },
    usuario: { findMany: async () => { assert.equal(autorizado, true); return []; } },
  };
  const servico = new ServicoAdministracaoUsuarios(
    { executarLeituraConsistente: async (operacao) => operacao(transacao) },
    { autorizar: async (entrada) => { assert.equal(entrada.permissao, 'ADMINISTRAR_USUARIOS'); autorizado = true; } },
    {}, {},
  );
  assert.deepEqual(await servico.listar(sessao), { auditoriaRecente: [], filas: [], perfis: [], usuarios: [] });
});

test('alteração compara versão, invalida sessões conectadas e audita no mesmo commit', async () => {
  const chamadas = [];
  const transacao = {
    acessoUsuarioFila: { updateMany: async () => { chamadas.push('REVOGAR_FILAS'); }, upsert: async () => { chamadas.push('CONCEDER_FILA'); } },
    fila: { findMany: async () => [{ id: ids.fila }] },
    perfilAcesso: { findUnique: async () => ({ estado: 'ATIVO', papelBase: 'SUPERVISOR' }) },
    usuario: {
      count: async () => 1,
      findUnique: async () => ({ estado: 'ATIVO', perfil: { papelBase: 'ATENDENTE' }, perfilId: randomUUID(), versaoPermissoes: 2 }),
      updateMany: async () => { chamadas.push('ALTERAR_PERFIL'); return { count: 1 }; },
    },
  };
  const servico = new ServicoAdministracaoUsuarios(
    {},
    { autorizar: async (_entrada, verificar) => { assert.equal((await verificar()).acessivel, true); chamadas.push('AUTORIZAR'); } },
    { registrar: async () => { chamadas.push('INVALIDAR'); return 3; } },
    { registrar: async (_entrada, recebido) => { assert.equal(recebido, transacao); chamadas.push('AUDITAR'); } },
  );
  const versao = await servico.alterarAcesso(sessao, ids.usuario, { filaIds: [ids.fila], perfilId: ids.perfil, versaoEsperada: 2 }, transacao);
  assert.equal(versao, 3);
  assert.deepEqual(chamadas, ['AUTORIZAR', 'ALTERAR_PERFIL', 'REVOGAR_FILAS', 'CONCEDER_FILA', 'INVALIDAR', 'AUDITAR']);
});
