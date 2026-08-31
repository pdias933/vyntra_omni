import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroMfaNecessario,
} from '../dist/autenticacao/erros-autenticacao.js';
import { ServicoAutenticacaoMobile } from '../dist/autenticacao/servico-autenticacao-mobile.js';
import { ErroNaoAutenticado } from '../dist/autorizacao/erros-autorizacao.js';

const hashHex = (valor) => createHash('sha256').update(valor).digest('hex');

function criarCenario(sobrescritas = {}) {
  const chamadas = {
    auditoria: [],
    dispositivos: [],
    revogacoes: [],
    rotacoes: [],
    sessoes: [],
    tentativas: [],
  };
  const credencial = {
    ajustes: [],
    credencialAtiva: true,
    nomeExibicao: 'Maria Silva',
    papelBase: 'ATENDENTE',
    perfilAtivo: true,
    senhaHash: 'hash-controlado',
    usuarioAtivo: true,
    usuarioId: randomUUID(),
    ...sobrescritas.credencial,
  };
  const repositorio = {
    atualizarDispositivo: async () => sobrescritas.dispositivoAtualizado ?? true,
    atualizarResultadoTentativa: async () => true,
    contarFalhasRecentes: async () =>
      sobrescritas.contagens ?? { contaIpDispositivo: 0, ip: 0 },
    criarDispositivo: async (...argumentos) =>
      chamadas.dispositivos.push(argumentos),
    criarSessao: async (...argumentos) => chamadas.sessoes.push(argumentos),
    obterCredencial: async () => credencial,
    obterDispositivo: async () => sobrescritas.dispositivo,
    obterSessaoPorAcesso: async () => sobrescritas.sessaoAcesso,
    obterSessaoPorRefreshAtual: async () => sobrescritas.sessaoRefresh,
    obterSessaoPorRefreshUsado: async () => sobrescritas.sessaoRefreshUsada,
    registrarTentativa: async (...argumentos) =>
      chamadas.tentativas.push(argumentos),
    revogarSessao: async (...argumentos) => {
      chamadas.revogacoes.push(argumentos);
      return sobrescritas.revogada ?? true;
    },
    revogarSessoesAtivasDispositivo: async () => 0,
    rotacionarSessao: async (...argumentos) => {
      chamadas.rotacoes.push(argumentos);
      return sobrescritas.rotacionada ?? true;
    },
    serializarDispositivo: async () => undefined,
    serializarLimiteLogin: async () => undefined,
    serializarTokenRefresh: async () => undefined,
  };
  const transacao = { id: 'transacao-controlada' };
  const prisma = { executarTransacao: async (operacao) => operacao(transacao) };
  const auditoria = {
    registrar: async (...argumentos) => chamadas.auditoria.push(argumentos),
  };
  const senhas = {
    simularVerificacao: async () => undefined,
    verificar: async () => sobrescritas.senhaCorreta ?? true,
  };
  return {
    chamadas,
    credencial,
    servico: new ServicoAutenticacaoMobile(
      repositorio,
      prisma,
      auditoria,
      senhas,
    ),
    transacao,
  };
}

const segredoVinculo = 'v'.repeat(43);
const entradaLogin = {
  enderecoIp: '127.0.0.1',
  identificador: 'Maria.Silva',
  identificadorInstalacao: randomUUID(),
  modeloSanitizado: 'Aparelho de teste',
  plataforma: 'ANDROID',
  segredoVinculo,
  senha: 'senha longa de teste',
  versaoAplicativo: '1.0.0',
};

function criarSessaoPersistida(sobrescritas = {}) {
  const tokenAcesso = 'a'.repeat(43);
  const tokenRefresh = 'r'.repeat(43);
  const dispositivoId = randomUUID();
  return {
    dispositivoId,
    segredoVinculo,
    sessao: {
      acessoExpiraEm: new Date(Date.now() + 15 * 60_000),
      dispositivoAtivo: true,
      dispositivoId,
      estado: 'ATIVA',
      id: randomUUID(),
      nomeExibicao: 'Maria Silva',
      refreshExpiraEm: new Date(Date.now() + 24 * 60 * 60_000),
      segredoVinculoHash: hashHex(segredoVinculo),
      tokenAcessoHash: hashHex(tokenAcesso),
      tokenRefreshHash: hashHex(tokenRefresh),
      usuarioAtivo: true,
      usuarioId: randomUUID(),
      versao: 1,
      ...sobrescritas,
    },
    tokenAcesso,
    tokenRefresh,
  };
}

test('login mobile persiste apenas hashes e vincula a sessão ao dispositivo', async () => {
  const cenario = criarCenario();
  const emitida = await cenario.servico.entrar(entradaLogin);

  assert.match(emitida.tokenAcesso, /^[A-Za-z0-9_-]{43}$/);
  assert.match(emitida.tokenRefresh, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(emitida.tokenAcesso, emitida.tokenRefresh);
  assert.equal(cenario.chamadas.dispositivos.length, 1);
  const [dispositivo, transacaoDispositivo] = cenario.chamadas.dispositivos[0];
  assert.equal(dispositivo.segredoVinculoHash, hashHex(segredoVinculo));
  assert.ok(!JSON.stringify(dispositivo).includes(segredoVinculo));
  assert.equal(transacaoDispositivo, cenario.transacao);

  const [sessao, transacaoSessao] = cenario.chamadas.sessoes[0];
  assert.equal(sessao.tokenAcessoHash, hashHex(emitida.tokenAcesso));
  assert.equal(sessao.tokenRefreshHash, hashHex(emitida.tokenRefresh));
  assert.ok(!JSON.stringify(sessao).includes(emitida.tokenAcesso));
  assert.ok(!JSON.stringify(sessao).includes(emitida.tokenRefresh));
  assert.equal(transacaoSessao, cenario.transacao);
  assert.equal(cenario.chamadas.auditoria.at(-1)[0].tipoEvento, 'SESSAO_MOBILE_CRIADA');
});

test('access token exige o dispositivo e o segredo de vínculo corretos', async () => {
  const persistida = criarSessaoPersistida();
  const cenario = criarCenario({ sessaoAcesso: persistida.sessao });

  const autenticada = await cenario.servico.autenticar(
    persistida.tokenAcesso,
    persistida.dispositivoId,
    persistida.segredoVinculo,
  );
  assert.equal(autenticada.contexto.sessaoId, persistida.sessao.id);

  await assert.rejects(
    () =>
      cenario.servico.autenticar(
        persistida.tokenAcesso,
        randomUUID(),
        persistida.segredoVinculo,
      ),
    ErroNaoAutenticado,
  );
  await assert.rejects(
    () =>
      cenario.servico.autenticar(
        persistida.tokenAcesso,
        persistida.dispositivoId,
        'z'.repeat(43),
      ),
    ErroNaoAutenticado,
  );
});

test('refresh rotaciona os dois tokens e registra o token anterior como usado', async () => {
  const persistida = criarSessaoPersistida();
  const cenario = criarCenario({ sessaoRefresh: persistida.sessao });

  const nova = await cenario.servico.renovar(
    persistida.tokenRefresh,
    persistida.dispositivoId,
    persistida.segredoVinculo,
  );
  assert.notEqual(nova.tokenAcesso, persistida.tokenAcesso);
  assert.notEqual(nova.tokenRefresh, persistida.tokenRefresh);
  assert.equal(cenario.chamadas.rotacoes[0][1], hashHex(persistida.tokenRefresh));
  assert.equal(cenario.chamadas.rotacoes[0][2], hashHex(nova.tokenAcesso));
  assert.equal(cenario.chamadas.rotacoes[0][3], hashHex(nova.tokenRefresh));
  assert.equal(cenario.chamadas.auditoria[0][0].tipoEvento, 'SESSAO_MOBILE_ROTACIONADA');
});

test('replay de refresh revoga a sessão inteira e gera auditoria', async () => {
  const persistida = criarSessaoPersistida();
  const cenario = criarCenario({ sessaoRefreshUsada: persistida.sessao });

  await assert.rejects(
    () =>
      cenario.servico.renovar(
        persistida.tokenRefresh,
        persistida.dispositivoId,
        persistida.segredoVinculo,
      ),
    ErroNaoAutenticado,
  );
  assert.equal(cenario.chamadas.revogacoes[0][0], persistida.sessao.id);
  assert.equal(cenario.chamadas.revogacoes[0][2], 'REPLAY_TOKEN_REFRESH');
  assert.equal(cenario.chamadas.auditoria[0][0].tipoEvento, 'REPLAY_TOKEN_REFRESH_MOBILE');
});

test('conta privilegiada não recebe sessão mobile sem MFA', async () => {
  const cenario = criarCenario({ credencial: { papelBase: 'ADMINISTRADOR' } });
  await assert.rejects(() => cenario.servico.entrar(entradaLogin), ErroMfaNecessario);
  assert.equal(cenario.chamadas.sessoes.length, 0);
  assert.equal(cenario.chamadas.auditoria[0][0].tipoEvento, 'LOGIN_MOBILE_MFA_NECESSARIO');
});

test('logout revoga atomicamente a sessão mobile autenticada', async () => {
  const persistida = criarSessaoPersistida();
  const cenario = criarCenario({ sessaoAcesso: persistida.sessao });

  await cenario.servico.sair(
    persistida.tokenAcesso,
    persistida.dispositivoId,
    persistida.segredoVinculo,
  );
  assert.equal(cenario.chamadas.revogacoes[0][2], 'LOGOUT');
  assert.equal(cenario.chamadas.auditoria[0][0].tipoEvento, 'SESSAO_MOBILE_REVOGADA');
  assert.equal(cenario.chamadas.auditoria[0][1], cenario.transacao);
});
