import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroDispositivoNaoConfiavel,
  ErroMfaNecessario,
} from '../dist/autenticacao/erros-autenticacao.js';
import { ServicoAutenticacaoMobile } from '../dist/autenticacao/servico-autenticacao-mobile.js';
import { ErroNaoAutenticado } from '../dist/autorizacao/erros-autorizacao.js';

const hashHex = (valor) => createHash('sha256').update(valor).digest('hex');

function criarCenario(sobrescritas = {}) {
  const chamadas = {
    auditoria: [],
    autorizacoes: [],
    dispositivos: [],
    dispositivosRevogados: [],
    revogacoes: [],
    revogacoesDispositivos: [],
    resultadosTentativa: [],
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
    atualizarResultadoTentativa: async (...argumentos) => {
      chamadas.resultadosTentativa.push(argumentos);
      return true;
    },
    contarFalhasRecentes: async () =>
      sobrescritas.contagens ?? { contaIpDispositivo: 0, ip: 0 },
    criarDispositivo: async (...argumentos) =>
      chamadas.dispositivos.push(argumentos),
    criarSessao: async (...argumentos) => chamadas.sessoes.push(argumentos),
    listarDispositivosAtivosUsuario: async () =>
      sobrescritas.dispositivosAtivos ?? [],
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
    revogarDispositivos: async (...argumentos) => {
      chamadas.dispositivosRevogados.push(argumentos);
      return sobrescritas.quantidadeDispositivosRevogados ?? argumentos[1].length;
    },
    revogarSessoesAtivasDispositivo: async () => 0,
    revogarSessoesAtivasDispositivos: async (...argumentos) => {
      chamadas.revogacoesDispositivos.push(argumentos);
      return sobrescritas.quantidadeSessoesRevogadas ?? 1;
    },
    rotacionarSessao: async (...argumentos) => {
      chamadas.rotacoes.push(argumentos);
      return sobrescritas.rotacionada ?? true;
    },
    serializarDispositivosUsuario: async () => undefined,
    serializarLimiteLogin: async () => undefined,
    serializarTokenRefresh: async () => undefined,
    usuarioAtivo: async () => sobrescritas.usuarioAlvoAtivo ?? true,
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
      {
        autorizar: async (entrada, verificar, transacaoAutorizacao) => {
          chamadas.autorizacoes.push(entrada);
          return verificar({}, transacaoAutorizacao);
        },
      },
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
  assert.equal(emitida.dispositivoSubstituido, false);
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

test('terceiro aparelho revoga atomicamente o dispositivo mais antigo', async () => {
  const maisAntigo = {
    criadoEm: new Date('2026-01-01T00:00:00.000Z'),
    id: randomUUID(),
    plataforma: 'ANDROID',
    ultimoAcessoEm: new Date('2026-01-01T00:00:00.000Z'),
    versaoAplicativo: '1.0.0',
  };
  const maisRecente = {
    criadoEm: new Date('2026-02-01T00:00:00.000Z'),
    id: randomUUID(),
    plataforma: 'IOS',
    ultimoAcessoEm: new Date('2026-02-01T00:00:00.000Z'),
    versaoAplicativo: '1.0.0',
  };
  const cenario = criarCenario({
    dispositivosAtivos: [maisAntigo, maisRecente],
  });

  const emitida = await cenario.servico.entrar(entradaLogin);
  assert.equal(emitida.dispositivoSubstituido, true);
  assert.deepEqual(cenario.chamadas.dispositivosRevogados[0][1], [maisAntigo.id]);
  assert.equal(
    cenario.chamadas.dispositivosRevogados[0][3],
    'LIMITE_DISPOSITIVOS_MOBILE',
  );
  assert.deepEqual(cenario.chamadas.revogacoesDispositivos[0][1], [maisAntigo.id]);
  assert.equal(
    cenario.chamadas.auditoria[0][0].tipoEvento,
    'DISPOSITIVO_MOBILE_ANTIGO_REVOGADO',
  );
  assert.equal(cenario.chamadas.dispositivos.length, 1);
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

  const revogada = criarCenario({
    sessaoAcesso: { ...persistida.sessao, estado: 'REVOGADA' },
  });
  await assert.rejects(
    () =>
      revogada.servico.autenticar(
        persistida.tokenAcesso,
        persistida.dispositivoId,
        persistida.segredoVinculo,
      ),
    ErroNaoAutenticado,
  );
});

test('lista aparelhos próprios e revoga um dispositivo com todas as sessões', async () => {
  const persistida = criarSessaoPersistida();
  const outroId = randomUUID();
  const dispositivosAtivos = [
    {
      criadoEm: new Date('2026-01-01T00:00:00.000Z'),
      id: persistida.dispositivoId,
      plataforma: 'ANDROID',
      ultimoAcessoEm: new Date('2026-03-01T00:00:00.000Z'),
      versaoAplicativo: '1.0.0',
    },
    {
      criadoEm: new Date('2026-02-01T00:00:00.000Z'),
      id: outroId,
      plataforma: 'IOS',
      ultimoAcessoEm: new Date('2026-04-01T00:00:00.000Z'),
      versaoAplicativo: '1.0.0',
    },
  ];
  const cenario = criarCenario({
    dispositivosAtivos,
    sessaoAcesso: persistida.sessao,
  });

  const listados = await cenario.servico.listarDispositivos(
    persistida.tokenAcesso,
    persistida.dispositivoId,
    persistida.segredoVinculo,
  );
  assert.equal(listados.length, 2);
  assert.equal(listados[0].atual, true);
  assert.equal(listados[1].atual, false);

  await cenario.servico.revogarDispositivoDoUsuario(
    persistida.tokenAcesso,
    persistida.dispositivoId,
    persistida.segredoVinculo,
    outroId,
  );
  assert.deepEqual(cenario.chamadas.dispositivosRevogados[0][1], [outroId]);
  assert.deepEqual(cenario.chamadas.revogacoesDispositivos[0][1], [outroId]);
  assert.equal(
    cenario.chamadas.auditoria[0][0].tipoEvento,
    'DISPOSITIVO_MOBILE_REVOGADO_REMOTAMENTE',
  );
});

test('revogação administrativa exige autorização e encerra todos os aparelhos', async () => {
  const usuarioAlvoId = randomUUID();
  const dispositivosAtivos = [
    {
      criadoEm: new Date(),
      id: randomUUID(),
      plataforma: 'IOS',
      ultimoAcessoEm: new Date(),
      versaoAplicativo: '1.0.0',
    },
    {
      criadoEm: new Date(),
      id: randomUUID(),
      plataforma: 'ANDROID',
      ultimoAcessoEm: new Date(),
      versaoAplicativo: '1.0.0',
    },
  ];
  const cenario = criarCenario({ dispositivosAtivos });
  const sessaoAdministrativa = {
    estado: 'ATIVA',
    expiraEm: new Date(Date.now() + 60_000),
    sessaoId: randomUUID(),
    usuarioId: randomUUID(),
  };

  await cenario.servico.revogarDispositivosAdministrativamente(
    sessaoAdministrativa,
    usuarioAlvoId,
    new Date(),
    cenario.transacao,
  );
  assert.equal(cenario.chamadas.autorizacoes[0].permissao, 'ADMINISTRAR_USUARIOS');
  assert.deepEqual(
    cenario.chamadas.dispositivosRevogados[0][1],
    dispositivosAtivos.map(({ id }) => id),
  );
  assert.equal(
    cenario.chamadas.auditoria[0][0].tipoEvento,
    'DISPOSITIVOS_MOBILE_REVOGADOS_ADMINISTRATIVAMENTE',
  );
});

test('vínculo divergente não converte a tentativa em sucesso', async () => {
  const cenario = criarCenario({
    dispositivo: {
      estado: 'ATIVO',
      id: randomUUID(),
      segredoVinculoHash: hashHex('z'.repeat(43)),
      usuarioId: randomUUID(),
    },
  });

  await assert.rejects(
    () => cenario.servico.entrar(entradaLogin),
    ErroDispositivoNaoConfiavel,
  );
  assert.equal(cenario.chamadas.resultadosTentativa.length, 0);
  assert.equal(cenario.chamadas.sessoes.length, 0);
  assert.equal(
    cenario.chamadas.auditoria[0][0].tipoEvento,
    'DISPOSITIVO_MOBILE_RECUSADO',
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
