import assert from 'node:assert/strict';
import test from 'node:test';

import { ServicoCopiasAtendimento } from '../dist/copias-atendimento/servico-copias-atendimento.js';

const atendimentoId = '10000000-0000-4000-8000-000000000001';
const filaId = '20000000-0000-4000-8000-000000000002';
const usuarioId = '30000000-0000-4000-8000-000000000003';
const sessaoId = '40000000-0000-4000-8000-000000000004';
const sessao = { estado: 'ATIVA', expiraEm: new Date(Date.now() + 60_000), sessaoId, usuarioId };

function criarCenario() {
  let copia;
  const auditorias = [];
  const autorizacoes = [];
  const mensagens = [
    {
      contaWhatsApp: { nomeExibicao: 'Empresa' },
      conteudoProtegido: { texto: 'Preciso de ajuda' },
      direcao: 'ENTRADA',
      recebidaServidorEm: new Date('2026-09-02T10:00:00.000Z'),
      tipo: 'TEXTO',
    },
    {
      contaWhatsApp: { nomeExibicao: 'Empresa' },
      conteudoProtegido: { chave_storage: 'segredo', nome: 'fatura.pdf' },
      direcao: 'SAIDA',
      recebidaServidorEm: new Date('2026-09-02T10:01:00.000Z'),
      tipo: 'PDF',
    },
  ];
  const atendimento = {
    filaAtualId: filaId,
    protocoloErp: { estado: 'OFICIAL', protocoloOficial: 'PROTOCOLO-123' },
  };
  const transacao = {
    atendimento: { findUnique: async () => atendimento },
    copiaAtendimento: {
      create: async ({ data }) => { copia = { ...data, atendimento, estado: 'ATIVA', consumidaEm: null }; },
      findUnique: async ({ where }) => copia?.tokenHash === where.tokenHash ? copia : null,
      updateMany: async ({ data, where }) => {
        if (copia?.id !== where.id || copia.estado !== 'ATIVA' || copia.expiraEm <= new Date()) return { count: 0 };
        copia = { ...copia, ...data };
        return { count: 1 };
      },
    },
    mensagem: { findMany: async () => mensagens },
  };
  const servico = new ServicoCopiasAtendimento(
    {},
    { autorizar: async (entrada) => { autorizacoes.push(entrada.permissao); } },
    { registrar: async (entrada) => { auditorias.push(entrada); } },
  );
  return { auditorias, autorizacoes, obterCopia: () => copia, servico, transacao };
}

test('token é opaco, curto, vinculado à sessão e consumido uma única vez', async () => {
  const cenario = criarCenario();
  const emitida = await cenario.servico.criar(sessao, atendimentoId, cenario.transacao);
  assert.match(emitida.token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(cenario.obterCopia().tokenHash.length, 64);
  assert.notEqual(cenario.obterCopia().tokenHash, emitida.token);
  assert.equal(cenario.obterCopia().sessaoWebId, sessaoId);

  const arquivo = await cenario.servico.baixar(sessao, emitida.token, cenario.transacao);
  assert.equal(cenario.obterCopia().estado, 'CONSUMIDA');
  assert.match(arquivo.conteudo, /PROTOCOLO-123/u);
  await assert.rejects(
    () => cenario.servico.baixar(sessao, emitida.token, cenario.transacao),
    (erro) => erro.getStatus?.() === 404 && erro.getResponse?.().codigo === 'COPIA_ATENDIMENTO_NAO_ENCONTRADA',
  );
});

test('cópia contém somente mensagens cliente↔empresa e não vaza metadado da mídia', async () => {
  const cenario = criarCenario();
  const emitida = await cenario.servico.criar(sessao, atendimentoId, cenario.transacao);
  const arquivo = await cenario.servico.baixar(sessao, emitida.token, cenario.transacao);
  assert.match(arquivo.conteudo, /Cliente: Preciso de ajuda/u);
  assert.match(arquivo.conteudo, /Empresa: \[PDF não incluído\]/u);
  assert.doesNotMatch(arquivo.conteudo, /chave_storage|segredo/iu);
  assert.deepEqual(cenario.autorizacoes, [
    'VISUALIZAR_FILA', 'EXPORTAR_HISTORICO',
    'VISUALIZAR_FILA', 'EXPORTAR_HISTORICO',
  ]);
  assert.deepEqual(cenario.auditorias.map(({ tipoEvento }) => tipoEvento), ['COPIA_ATENDIMENTO_CRIADA', 'COPIA_ATENDIMENTO_BAIXADA']);
});

test('outra sessão recebe resposta indistinguível de token ausente', async () => {
  const cenario = criarCenario();
  const emitida = await cenario.servico.criar(sessao, atendimentoId, cenario.transacao);
  await assert.rejects(
    () => cenario.servico.baixar({ ...sessao, sessaoId: '50000000-0000-4000-8000-000000000005' }, emitida.token, cenario.transacao),
    (erro) => erro.getStatus?.() === 404 && erro.getResponse?.().codigo === 'COPIA_ATENDIMENTO_NAO_ENCONTRADA',
  );
});
