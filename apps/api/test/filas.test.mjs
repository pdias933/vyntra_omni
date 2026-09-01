import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroPermissaoNegada } from '../dist/autorizacao/erros-autorizacao.js';
import { ServicoAutorizacao } from '../dist/autorizacao/servico-autorizacao.js';
import {
  ErroFilaDuplicada,
  ErroFilaIndisponivel,
  ErroUsuarioFilaIndisponivel,
} from '../dist/filas/erros-fila.js';
import { ServicoFilas } from '../dist/filas/servico-filas.js';

const agora = new Date('2026-09-01T13:00:00.000Z');
const ids = {
  fila: randomUUID(),
  sessao: randomUUID(),
  usuario: randomUUID(),
  usuarioAlvo: randomUUID(),
};
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2099-01-01T00:00:00.000Z'),
  sessaoId: ids.sessao,
  usuarioId: ids.usuario,
};

function fila(sobrescritas = {}) {
  return {
    atualizadoEm: agora,
    criadoEm: agora,
    estado: 'ATIVA',
    id: ids.fila,
    nome: 'Suporte Técnico',
    nomeNormalizado: 'suporte-tecnico',
    ...sobrescritas,
  };
}

function criarCenario(sobrescritas = {}) {
  const chamadas = {
    auditoria: [],
    autorizacao: [],
    bloqueios: [],
    concessoes: [],
    criacoes: [],
    inativacoes: [],
    invalidacoes: [],
    revogacoes: [],
  };
  const repositorio = {
    bloquearFila: async (...argumentos) => chamadas.bloqueios.push(['FILA', ...argumentos]),
    bloquearNome: async (...argumentos) => chamadas.bloqueios.push(['NOME', ...argumentos]),
    bloquearVinculo: async (...argumentos) => chamadas.bloqueios.push(['VINCULO', ...argumentos]),
    concederAcesso: async (...argumentos) => chamadas.concessoes.push(argumentos),
    criarFila: async (...argumentos) => {
      chamadas.criacoes.push(argumentos);
      return sobrescritas.criada ?? true;
    },
    inativarFila: async (...argumentos) => {
      chamadas.inativacoes.push(argumentos);
      return sobrescritas.inativada ?? true;
    },
    listarUsuariosAfetadosFila: async () =>
      sobrescritas.usuariosAfetados ?? [ids.usuarioAlvo],
    obterAcesso: async () => sobrescritas.acesso,
    obterFila: async () => sobrescritas.fila ?? fila(),
    revogarAcesso: async (...argumentos) => {
      chamadas.revogacoes.push(argumentos);
      return sobrescritas.revogada ?? true;
    },
    usuarioEstaAtivo: async () => sobrescritas.usuarioAtivo ?? true,
  };
  const autorizacao = {
    autorizar: async (entrada, verificar, transacao) => {
      chamadas.autorizacao.push([entrada, transacao]);
      return { ...(await verificar({}, transacao)), permissao: entrada.permissao };
    },
  };
  const auditoria = {
    registrar: async (...argumentos) => chamadas.auditoria.push(argumentos),
  };
  const invalidacao = {
    registrar: async (...argumentos) => chamadas.invalidacoes.push(argumentos),
  };
  return {
    chamadas,
    servico: new ServicoFilas(
      repositorio,
      autorizacao,
      auditoria,
      invalidacao,
    ),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('cadastra fila ativa com nome canônico, autorização e auditoria', async () => {
  const cenario = criarCenario();
  const criada = await cenario.servico.cadastrar(
    sessao,
    { nome: '  Suporte   Técnico  ' },
    cenario.transacao,
    () => agora,
  );
  assert.equal(criada.nome, 'Suporte Técnico');
  assert.equal(criada.nomeNormalizado, 'suporte-tecnico');
  assert.equal(criada.estado, 'ATIVA');
  assert.equal(cenario.chamadas.autorizacao[0][0].permissao, 'ADMINISTRAR_FILAS');
  assert.equal(cenario.chamadas.criacoes[0][1], cenario.transacao);
  assert.equal(cenario.chamadas.auditoria[0][1], cenario.transacao);
});

test('nome duplicado não produz auditoria', async () => {
  const cenario = criarCenario({ criada: false });
  await assert.rejects(
    cenario.servico.cadastrar(sessao, { nome: 'Suporte' }, cenario.transacao),
    ErroFilaDuplicada,
  );
  assert.equal(cenario.chamadas.auditoria.length, 0);
});

test('concede vínculo somente para fila e usuário ativos', async () => {
  const cenario = criarCenario();
  const acesso = await cenario.servico.concederAcesso(
    sessao,
    ids.fila,
    ids.usuarioAlvo,
    cenario.transacao,
    () => agora,
  );
  assert.deepEqual(acesso, {
    criadoEm: agora,
    estado: 'ATIVO',
    filaId: ids.fila,
    usuarioId: ids.usuarioAlvo,
  });
  assert.equal(cenario.chamadas.concessoes.length, 1);
  assert.equal(cenario.chamadas.invalidacoes[0][0].motivo, 'ACESSO_FILA_CONCEDIDO');
  assert.equal(cenario.chamadas.auditoria[0][0].tipoEvento, 'ACESSO_USUARIO_FILA_CONCEDIDO');

  const inativa = criarCenario({ fila: fila({ estado: 'INATIVA', inativadaEm: agora }) });
  await assert.rejects(
    inativa.servico.concederAcesso(sessao, ids.fila, ids.usuarioAlvo, inativa.transacao),
    ErroFilaIndisponivel,
  );
  const usuarioInativo = criarCenario({ usuarioAtivo: false });
  await assert.rejects(
    usuarioInativo.servico.concederAcesso(sessao, ids.fila, ids.usuarioAlvo, usuarioInativo.transacao),
    ErroUsuarioFilaIndisponivel,
  );
});

test('concessão repetida e revogação repetida são idempotentes', async () => {
  const ativo = {
    criadoEm: agora,
    estado: 'ATIVO',
    filaId: ids.fila,
    usuarioId: ids.usuarioAlvo,
  };
  const cenario = criarCenario({ acesso: ativo });
  assert.equal(
    await cenario.servico.concederAcesso(sessao, ids.fila, ids.usuarioAlvo, cenario.transacao),
    ativo,
  );
  assert.equal(cenario.chamadas.concessoes.length, 0);
  await cenario.servico.revogarAcesso(
    sessao,
    ids.fila,
    ids.usuarioAlvo,
    cenario.transacao,
    () => agora,
  );
  assert.equal(cenario.chamadas.revogacoes.length, 1);
  assert.equal(cenario.chamadas.invalidacoes.at(-1)[0].motivo, 'ACESSO_FILA_REVOGADO');

  const revogado = criarCenario({ acesso: { ...ativo, estado: 'REVOGADO', revogadoEm: agora } });
  await revogado.servico.revogarAcesso(sessao, ids.fila, ids.usuarioAlvo, revogado.transacao);
  assert.equal(revogado.chamadas.revogacoes.length, 0);
  assert.equal(revogado.chamadas.auditoria.length, 0);
  assert.equal(revogado.chamadas.invalidacoes.length, 0);
});

test('inativar fila preserva vínculos e apenas torna o escopo ineficaz', async () => {
  const cenario = criarCenario();
  await cenario.servico.inativar(sessao, ids.fila, cenario.transacao, () => agora);
  assert.equal(cenario.chamadas.inativacoes.length, 1);
  assert.equal(cenario.chamadas.revogacoes.length, 0);
  assert.equal(cenario.chamadas.auditoria[0][0].tipoEvento, 'FILA_INATIVADA');
  assert.equal(cenario.chamadas.invalidacoes[0][0].motivo, 'FILA_INATIVADA');
});

test('vínculo de fila não concede uma ação ausente no RBAC', async () => {
  const autorizacao = new ServicoAutorizacao({
    obterContexto: async () => ({
      acessoFilaAtivo: true,
      ajustes: [],
      filaAtiva: true,
      papelBase: 'ATENDENTE',
      perfilAtivo: true,
      usuarioAtivo: true,
    }),
  });
  await autorizacao.autorizar(
    {
      filaId: ids.fila,
      permissao: 'VISUALIZAR_FILA',
      recurso: { id: ids.fila, tipo: 'FILA' },
      sessao,
    },
    async () => ({ acessivel: true, estadoPermiteAcao: true }),
  );
  await assert.rejects(
    autorizacao.autorizar(
      {
        filaId: ids.fila,
        permissao: 'REABRIR_ATENDIMENTO',
        recurso: { id: ids.fila, tipo: 'ATENDIMENTO' },
        sessao,
      },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
    ),
    ErroPermissaoNegada,
  );
});
