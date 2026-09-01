import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroPermissaoNegada } from '../dist/autorizacao/erros-autorizacao.js';
import { ServicoListaAtendimentosWeb } from '../dist/console-web/servico-lista-atendimentos-web.js';

const ids = {
  atendimento: randomUUID(),
  conta: randomUUID(),
  contato: randomUUID(),
  conversa: randomUUID(),
  filaAutorizada: randomUUID(),
  filaNegada: randomUUID(),
  sessao: randomUUID(),
  usuario: randomUUID(),
};

const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date(Date.now() + 60_000),
  sessaoId: ids.sessao,
  usuarioId: ids.usuario,
};

function criarCenario(linhas) {
  const consultas = [];
  const cliente = {
    $queryRaw: async (consulta) => {
      consultas.push(consulta.strings.join('?'));
      return linhas;
    },
    fila: {
      findMany: async () => [
        { id: ids.filaAutorizada },
        { id: ids.filaNegada },
      ],
    },
  };
  const prisma = { obterCliente: async () => cliente };
  const autorizacao = {
    autorizar: async (entrada) => {
      if (entrada.filaId === ids.filaNegada) throw new ErroPermissaoNegada();
    },
  };
  return {
    consultas,
    servico: new ServicoListaAtendimentosWeb(prisma, autorizacao),
  };
}

test('lista consulta conteúdo somente depois de resolver filas autorizadas', async () => {
  const cenario = criarCenario([{
    atendimento_id: ids.atendimento,
    conta_whatsapp_id: ids.conta,
    contato_id: ids.contato,
    conversa_id: ids.conversa,
    estado: 'EM_ATENDIMENTO',
    fila_id: ids.filaAutorizada,
    fila_nome: 'Suporte',
    janela_expira_em: new Date('2026-09-01T20:00:00Z'),
    modo: 'HUMANO',
    nome_contato: 'João da Silva',
    nome_usuario: null,
    quantidade_nao_lida: 3n,
    sla_em: new Date('2026-09-01T19:00:00Z'),
    telefone_e164: '+5527998887777',
    ultima_atividade_em: new Date('2026-09-01T18:00:00Z'),
    ultima_mensagem_direcao: 'ENTRADA',
    ultima_mensagem_texto: 'Preciso de ajuda',
    ultima_mensagem_tipo: 'TEXTO',
  }]);

  const resultado = await cenario.servico.listar(sessao, 'MEUS');
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].filaId, ids.filaAutorizada);
  assert.equal(resultado[0].quantidadeNaoLida, 3);
  assert.equal(resultado[0].identidadeSecundaria, '+55 ******-7777');
  assert.equal(resultado[0].ultimaMensagemResumo, 'Preciso de ajuda');
  assert.equal(cenario.consultas.length, 1);
  assert.match(cenario.consultas[0], /fila_atual_id/);
});

test('seis filtros são materializados no PostgreSQL, inclusive automação', async () => {
  const expectativas = new Map([
    ['MEUS', /usuario_responsavel_id/],
    ['PENDENTES', /AGUARDANDO/],
    ['NAO_LIDOS', /marcada_nao_lida/],
    ['SLA', /15 minutes/],
    ['EXPIRANDO', /30 minutes/],
    ['EM_AUTOMACAO', /execucao_fluxo/],
  ]);
  for (const [filtro, esperado] of expectativas) {
    const cenario = criarCenario([]);
    await cenario.servico.listar(sessao, filtro);
    assert.match(cenario.consultas[0], esperado);
  }
});

test('erro de infraestrutura na autorização não é convertido em fila vazia', async () => {
  const prisma = {
    obterCliente: async () => ({
      fila: { findMany: async () => [{ id: ids.filaAutorizada }] },
    }),
  };
  const servico = new ServicoListaAtendimentosWeb(prisma, {
    autorizar: async () => { throw new Error('BANCO_INDISPONIVEL'); },
  });
  await assert.rejects(() => servico.listar(sessao, 'MEUS'), /BANCO_INDISPONIVEL/);
});
