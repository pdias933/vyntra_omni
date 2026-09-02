import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  randomUUID,
  verify,
} from 'node:crypto';
import { test } from 'node:test';

import { ServicoAutorizacaoOffline } from '../dist/sincronizacao/servico-autorizacao-offline.js';

const agora = new Date('2026-09-02T12:00:00.000Z');

function criarContexto(refreshExpiraEm = new Date('2026-09-03T12:00:00.000Z')) {
  return {
    contexto: {
      estado: 'ATIVA',
      expiraEm: new Date('2026-09-02T12:15:00.000Z'),
      sessaoId: randomUUID(),
      usuarioId: randomUUID(),
    },
    dispositivoId: randomUUID(),
    identificadorInstalacaoHash: 'a'.repeat(64),
    nomeExibicao: 'Operador',
    refreshExpiraEm,
  };
}

function criarSnapshot(filaId = randomUUID()) {
  return {
    atendimentos: [],
    controlesRecurso: {},
    conversas: [],
    filas: [{ id: filaId, nome: 'Suporte' }],
    geradoEm: agora.toISOString(),
    mensagensRecentes: [],
    notasInternasRecentes: [],
    permissoes: [
      'ENVIAR_MENSAGEM',
      'VISUALIZAR_DADO_SENSIVEL',
      'VISUALIZAR_NOTA_INTERNA',
    ],
    politicasVersao: [],
    sequenciaBase: '10',
    versaoPermissoes: 7,
  };
}

function decodificarToken(token) {
  const [versao, chaveId, payload, assinatura] = token.split('.');
  assert.equal(versao, 'v1');
  assert.equal(chaveId, 'teste-2026');
  assert.ok(payload);
  assert.ok(assinatura);
  return {
    assinatura: Buffer.from(assinatura, 'base64url'),
    conteudo: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    parteAssinada: Buffer.from(`v1.${chaveId}.${payload}`, 'utf8'),
  };
}

test('autorização offline Ed25519 vincula sessão, aparelho, instalação e escopo mínimo', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const sessao = criarContexto();
  const snapshot = criarSnapshot();
  const resultado = await new ServicoAutorizacaoOffline().emitir(
    sessao,
    snapshot,
    () => agora,
    { chaveId: 'teste-2026', chavePrivada: privateKey },
  );
  const token = decodificarToken(resultado.token);

  assert.equal(verify(null, token.parteAssinada, publicKey, token.assinatura), true);
  assert.equal(token.conteudo.usuario_id, sessao.contexto.usuarioId);
  assert.equal(token.conteudo.sessao_id, sessao.contexto.sessaoId);
  assert.equal(token.conteudo.dispositivo_id, sessao.dispositivoId);
  assert.equal(token.conteudo.instalacao_hash, sessao.identificadorInstalacaoHash);
  assert.equal(token.conteudo.versao_permissoes, 7);
  assert.equal(token.conteudo.sequencia_base, '10');
  assert.deepEqual(token.conteudo.filas, [snapshot.filas[0].id]);
  assert.deepEqual(token.conteudo.escopos, [
    'CRIAR_PENDENCIA_TEXTO',
    'CRIAR_RASCUNHO',
    'LER_NOTA_INTERNA',
    'LER_REPLICA',
  ]);
  assert.ok(!resultado.token.includes('VISUALIZAR_DADO_SENSIVEL'));
  assert.equal(resultado.validaAte, '2026-09-02T16:00:00.000Z');
});

test('autorização offline nunca ultrapassa o vencimento absoluto do refresh', async () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const resultado = await new ServicoAutorizacaoOffline().emitir(
    criarContexto(new Date('2026-09-02T13:00:00.000Z')),
    criarSnapshot(),
    () => agora,
    { chaveId: 'teste-2026', chavePrivada: privateKey },
  );
  assert.equal(resultado.validaAte, '2026-09-02T13:00:00.000Z');
});

test('contexto inconsistente falha antes de assinar', async () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  await assert.rejects(
    () =>
      new ServicoAutorizacaoOffline().emitir(
        { ...criarContexto(), identificadorInstalacaoHash: 'invalido' },
        criarSnapshot(),
        () => agora,
        { chaveId: 'teste-2026', chavePrivada: privateKey },
      ),
    /AUTORIZACAO_OFFLINE_INVALIDA/u,
  );
});
