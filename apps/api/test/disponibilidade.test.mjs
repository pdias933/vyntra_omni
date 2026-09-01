import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroConflitoDisponibilidade, ErroUsuarioDisponibilidadeIndisponivel } from '../dist/disponibilidade/erros-disponibilidade.js';
import { ServicoDisponibilidade } from '../dist/disponibilidade/servico-disponibilidade.js';

const agora = new Date('2026-09-01T14:00:00.000Z');
const ids = { sessao: randomUUID(), usuario: randomUUID(), outro: randomUUID() };
const sessao = { estado: 'ATIVA', expiraEm: new Date('2099-01-01T00:00:00Z'), sessaoId: ids.sessao, usuarioId: ids.usuario };

function cenario(opcoes = {}) {
  let atual = opcoes.atual;
  const chamadas = { auditoria: [], autorizacao: [], bloqueio: 0, criacao: 0, alteracao: 0 };
  const repositorio = {
    alterar: async (valor) => { chamadas.alteracao += 1; atual = valor; return opcoes.sucesso ?? true; },
    bloquearUsuario: async () => { chamadas.bloqueio += 1; },
    criar: async (valor) => { chamadas.criacao += 1; atual = valor; return opcoes.sucesso ?? true; },
    obter: async () => atual,
    usuarioEstaAtivo: async () => opcoes.usuarioAtivo ?? true,
  };
  const autorizacao = { autorizar: async (entrada, verificar, transacao) => { chamadas.autorizacao.push(entrada); return verificar({}, transacao); } };
  const auditoria = { registrar: async (...args) => chamadas.auditoria.push(args) };
  return { chamadas, servico: new ServicoDisponibilidade(repositorio, autorizacao, auditoria), transacao: {} };
}

test('usuário define manualmente a própria disponibilidade', async () => {
  const x = cenario();
  const valor = await x.servico.definir(sessao, ids.usuario, 'DISPONIVEL', 0, x.transacao, () => agora);
  assert.equal(valor.estado, 'DISPONIVEL');
  assert.equal(valor.versao, 1);
  assert.equal(x.chamadas.autorizacao[0].permissao, 'ALTERAR_DISPONIBILIDADE_PROPRIA');
  assert.equal(x.chamadas.criacao, 1);
  assert.equal(x.chamadas.auditoria.length, 1);
});

test('alteração de outro usuário exige permissão distinta e incrementa versão', async () => {
  const atual = { alteradoEm: agora, alteradoPorUsuarioId: ids.outro, estado: 'INDISPONIVEL', usuarioId: ids.outro, versao: 1 };
  const x = cenario({ atual });
  const valor = await x.servico.definir(sessao, ids.outro, 'DISPONIVEL', 1, x.transacao, () => agora);
  assert.equal(valor.versao, 2);
  assert.equal(x.chamadas.autorizacao[0].permissao, 'ALTERAR_DISPONIBILIDADE_USUARIO');
  assert.equal(x.chamadas.alteracao, 1);
});

test('repetição idêntica é idempotente e não gera auditoria', async () => {
  const atual = { alteradoEm: agora, alteradoPorUsuarioId: ids.usuario, estado: 'DISPONIVEL', usuarioId: ids.usuario, versao: 2 };
  const x = cenario({ atual });
  assert.equal(await x.servico.definir(sessao, ids.usuario, 'DISPONIVEL', 2, x.transacao), atual);
  assert.equal(x.chamadas.alteracao, 0);
  assert.equal(x.chamadas.auditoria.length, 0);
});

test('versão concorrente e usuário inativo falham sem escrita', async () => {
  const atual = { alteradoEm: agora, alteradoPorUsuarioId: ids.usuario, estado: 'DISPONIVEL', usuarioId: ids.usuario, versao: 2 };
  await assert.rejects(cenario({ atual }).servico.definir(sessao, ids.usuario, 'INDISPONIVEL', 1, {}), ErroConflitoDisponibilidade);
  await assert.rejects(cenario({ usuarioAtivo: false }).servico.definir(sessao, ids.usuario, 'DISPONIVEL', 0, {}), ErroUsuarioDisponibilidadeIndisponivel);
});

