import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  obterTokenCsrfWeb,
  obterTokenSessaoWeb,
  serializarCookiesSessaoWeb,
  serializarRemocaoCookiesSessaoWeb,
} from '../dist/autenticacao/cookies-sessao-web.js';
import {
  ErroCredenciaisInvalidas,
  ErroConfirmacaoRevogacaoSessaoNecessaria,
  ErroLimiteLoginExcedido,
  ErroMfaNecessario,
  ErroRequisicaoWebNaoConfiavel,
} from '../dist/autenticacao/erros-autenticacao.js';
import { ServicoAutenticacaoWeb } from '../dist/autenticacao/servico-autenticacao-web.js';
import { ServicoOrigemWeb } from '../dist/autenticacao/servico-origem-web.js';
import { ServicoSenha } from '../dist/autenticacao/servico-senha.js';
import { ErroNaoAutenticado } from '../dist/autorizacao/erros-autorizacao.js';

const hashHex = (valor) => createHash('sha256').update(valor).digest('hex');

function criarCenario(sobrescritas = {}) {
  const chamadas = {
    auditoria: [],
    atualizacoesTentativa: [],
    criarSessao: [],
    falhas: [],
    rotacoes: [],
    revogacoes: [],
    revogacoesMultiplas: [],
    simulacoes: 0,
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
    atualizarResultadoTentativa: async (...argumentos) => {
      chamadas.atualizacoesTentativa.push(argumentos);
      return true;
    },
    contarFalhasRecentes: async () => sobrescritas.contagens ?? { contaIp: 0, ip: 0 },
    criarSessao: async (...argumentos) => chamadas.criarSessao.push(argumentos),
    listarSessoesAtivasUsuario: async () => sobrescritas.sessoesAtivas ?? [],
    obterCredencial: async () =>
      sobrescritas.credencialAusente === true ? undefined : credencial,
    obterSessao: async () => sobrescritas.sessao,
    registrarTentativa: async (...argumentos) => chamadas.falhas.push(argumentos),
    registrarAtividadeSessao: async () => sobrescritas.atividadeAtualizada ?? true,
    revogarSessoes: async (...argumentos) => {
      chamadas.revogacoesMultiplas.push(argumentos);
      return sobrescritas.quantidadeRevogada ?? argumentos[1].length;
    },
    revogarSessao: async (...argumentos) => {
      chamadas.revogacoes.push(argumentos);
      return sobrescritas.revogada ?? true;
    },
    rotacionarSessao: async (...argumentos) => {
      chamadas.rotacoes.push(argumentos);
      return sobrescritas.rotacionada ?? true;
    },
    serializarLimiteLogin: async () => undefined,
    serializarSessoesUsuario: async () => undefined,
    usuarioAtivo: async () => true,
  };
  const transacao = { id: 'transacao-controlada' };
  const prisma = { executarTransacao: async (operacao) => operacao(transacao) };
  const auditoria = {
    registrar: async (...argumentos) => chamadas.auditoria.push(argumentos),
  };
  const senhas = {
    simularVerificacao: async () => {
      chamadas.simulacoes += 1;
    },
    verificar: async () => sobrescritas.senhaCorreta ?? true,
  };
  const servico = new ServicoAutenticacaoWeb(
    repositorio,
    prisma,
    auditoria,
    senhas,
    { autorizar: async () => ({}) },
  );
  return { chamadas, credencial, servico, transacao };
}

const entradaLogin = {
  agenteUsuario: 'Navegador de teste',
  enderecoIp: '127.0.0.1',
  identificador: 'Maria.Silva',
  senha: 'senha longa de teste',
  confirmarRevogacaoSessaoMaisAntiga: false,
};

test('cria hash Argon2id calibrado e verifica sem normalizar a senha', async () => {
  const servico = new ServicoSenha();
  const hash = await servico.criarHash('frase secreta longa 2026');

  assert.match(hash, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  assert.equal(await servico.verificar('frase secreta longa 2026', hash), true);
  assert.equal(await servico.verificar('frase secreta longa 2026 ', hash), false);
  assert.throws(() => servico.validarNovaSenha('senha12345678'));
  assert.throws(() => servico.validarNovaSenha('curta'));
});

test('emite cookies __Host seguros e exige dupla apresentação do CSRF', () => {
  const token = 'a'.repeat(43);
  const csrf = 'b'.repeat(43);
  const cookies = serializarCookiesSessaoWeb(
    token,
    csrf,
    new Date(Date.now() + 60_000),
  );

  assert.match(cookies[0], /^__Host-vyntra_sessao=/);
  assert.match(cookies[0], /; Secure; SameSite=Strict; HttpOnly$/);
  assert.match(cookies[1], /^__Host-vyntra_csrf=/);
  assert.match(cookies[1], /; Secure; SameSite=Strict$/);
  assert.ok(!cookies[1].includes('HttpOnly'));
  const cabecalho = `__Host-vyntra_sessao=${token}; __Host-vyntra_csrf=${csrf}`;
  assert.equal(obterTokenSessaoWeb(cabecalho), token);
  assert.equal(obterTokenCsrfWeb(cabecalho, csrf), csrf);
  assert.throws(
    () => obterTokenCsrfWeb(cabecalho, 'c'.repeat(43)),
    ErroRequisicaoWebNaoConfiavel,
  );
  assert.throws(
    () => obterTokenSessaoWeb(`${cabecalho}; __Host-vyntra_sessao=${token}`),
    ErroNaoAutenticado,
  );
  assert.match(serializarRemocaoCookiesSessaoWeb()[0], /Max-Age=0/);
});

test('aceita somente origem HTTPS explicitamente configurada', () => {
  const anterior = process.env.ORIGENS_WEB_PERMITIDAS;
  process.env.ORIGENS_WEB_PERMITIDAS = 'https://painel.exemplo.com';
  try {
    const servico = new ServicoOrigemWeb();
    servico.validar('https://painel.exemplo.com');
    assert.equal(servico.permiteCors(undefined), true);
    assert.equal(servico.permiteCors('https://malicioso.example'), false);
    assert.throws(() => servico.validar(undefined), ErroRequisicaoWebNaoConfiavel);
    assert.throws(
      () => servico.validar('https://malicioso.example'),
      ErroRequisicaoWebNaoConfiavel,
    );
  } finally {
    if (anterior === undefined) delete process.env.ORIGENS_WEB_PERMITIDAS;
    else process.env.ORIGENS_WEB_PERMITIDAS = anterior;
  }
});

test('login persiste apenas hashes e auditoria na mesma transação', async () => {
  const { chamadas, credencial, servico, transacao } = criarCenario();
  const sessao = await servico.entrar(entradaLogin);

  assert.equal(sessao.usuarioId, credencial.usuarioId);
  assert.match(sessao.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(sessao.csrf, /^[A-Za-z0-9_-]{43}$/);
  const [persistida, transacaoSessao] = chamadas.criarSessao[0];
  assert.equal(transacaoSessao, transacao);
  assert.equal(persistida.tokenHash, hashHex(sessao.token));
  assert.equal(persistida.csrfHash, hashHex(sessao.csrf));
  assert.ok(!JSON.stringify(persistida).includes(sessao.token));
  assert.equal(chamadas.falhas[0][0].resultado, 'FALHA');
  assert.equal(chamadas.falhas[0][1], transacao);
  assert.equal(chamadas.atualizacoesTentativa[0][1], 'SUCESSO');
  assert.equal(chamadas.atualizacoesTentativa[0][2], transacao);
  assert.equal(chamadas.auditoria[0][1], transacao);
  assert.equal(chamadas.auditoria[0][0].tipoEvento, 'SESSAO_WEB_CRIADA');
});

test('usuário inexistente e senha errada têm a mesma negação', async () => {
  const ausente = criarCenario({ credencialAusente: true });
  const errada = criarCenario({ senhaCorreta: false });

  await assert.rejects(() => ausente.servico.entrar(entradaLogin), ErroCredenciaisInvalidas);
  await assert.rejects(() => errada.servico.entrar(entradaLogin), ErroCredenciaisInvalidas);
  assert.equal(ausente.chamadas.simulacoes, 1);
  assert.equal(ausente.chamadas.falhas[0][0].resultado, 'FALHA');
  assert.equal(errada.chamadas.falhas[0][0].resultado, 'FALHA');
});

test('bloqueia no limite antes de consultar credencial e registra o fato', async () => {
  const cenario = criarCenario({ contagens: { contaIp: 5, ip: 5 } });
  await assert.rejects(
    () => cenario.servico.entrar(entradaLogin),
    ErroLimiteLoginExcedido,
  );
  assert.equal(cenario.chamadas.falhas[0][0].resultado, 'BLOQUEADA');
  assert.equal(cenario.chamadas.criarSessao.length, 0);
});

test('conta privilegiada não recebe sessão sem MFA', async () => {
  const cenario = criarCenario({ credencial: { papelBase: 'ADMINISTRADOR' } });
  await assert.rejects(() => cenario.servico.entrar(entradaLogin), ErroMfaNecessario);
  assert.equal(cenario.chamadas.criarSessao.length, 0);
  assert.equal(cenario.chamadas.auditoria[0][0].tipoEvento, 'LOGIN_WEB_MFA_NECESSARIO');
});

test('rotação invalida o segredo anterior e renova a inatividade atomicamente', async () => {
  const token = 'd'.repeat(43);
  const csrf = 'e'.repeat(43);
  const expiraEm = new Date(Date.now() + 60_000);
  const sessaoPersistida = {
    autenticadaEm: new Date(Date.now() - 30_000),
    csrfHash: hashHex(csrf),
    estado: 'ATIVA',
    expiraEm,
    id: randomUUID(),
    nomeExibicao: 'Maria Silva',
    tokenHash: hashHex(token),
    ultimaAtividadeEm: new Date(),
    usuarioAtivo: true,
    usuarioId: randomUUID(),
    versao: 2,
  };
  const cenario = criarCenario({ sessao: sessaoPersistida });
  const nova = await cenario.servico.rotacionar(token, csrf);

  assert.ok(nova.expiraEm > expiraEm);
  assert.notEqual(nova.token, token);
  assert.notEqual(nova.csrf, csrf);
  assert.equal(cenario.chamadas.rotacoes[0][1], hashHex(token));
  assert.equal(cenario.chamadas.rotacoes[0][2], hashHex(nova.token));
  assert.equal(cenario.chamadas.rotacoes[0][3], hashHex(nova.csrf));
  assert.ok(cenario.chamadas.rotacoes[0][5] instanceof Date);
  assert.equal(cenario.chamadas.auditoria[0][0].dadosNovos.versao, 3);

  const perdeuCorrida = criarCenario({ rotacionada: false, sessao: sessaoPersistida });
  await assert.rejects(
    () => perdeuCorrida.servico.rotacionar(token, csrf),
    ErroNaoAutenticado,
  );
});

test('sessão expirada é negada e logout revoga com auditoria', async () => {
  const token = 'f'.repeat(43);
  const csrf = 'g'.repeat(43);
  const base = {
    autenticadaEm: new Date(Date.now() - 30_000),
    csrfHash: hashHex(csrf),
    estado: 'ATIVA',
    id: randomUUID(),
    nomeExibicao: 'Maria Silva',
    tokenHash: hashHex(token),
    ultimaAtividadeEm: new Date(),
    usuarioAtivo: true,
    usuarioId: randomUUID(),
    versao: 0,
  };
  const expirada = criarCenario({
    sessao: { ...base, expiraEm: new Date(Date.now() - 1_000) },
  });
  await assert.rejects(() => expirada.servico.autenticar(token), ErroNaoAutenticado);

  const ativa = criarCenario({
    sessao: { ...base, expiraEm: new Date(Date.now() + 60_000) },
  });
  await ativa.servico.sair(token, csrf);
  assert.equal(ativa.chamadas.revogacoes.length, 1);
  assert.equal(ativa.chamadas.auditoria[0][0].tipoEvento, 'SESSAO_WEB_REVOGADA');
  await assert.rejects(
    () => ativa.servico.sair(token, 'h'.repeat(43)),
    ErroRequisicaoWebNaoConfiavel,
  );
});

test('terceira sessão exige confirmação antes de revogar a mais antiga', async () => {
  const antigas = [
    {
      autenticadaEm: new Date(Date.now() - 120_000),
      expiraEm: new Date(Date.now() + 60_000),
      id: randomUUID(),
      ultimaAtividadeEm: new Date(Date.now() - 60_000),
    },
    {
      autenticadaEm: new Date(Date.now() - 60_000),
      expiraEm: new Date(Date.now() + 60_000),
      id: randomUUID(),
      ultimaAtividadeEm: new Date(Date.now() - 30_000),
    },
  ];
  const semConfirmacao = criarCenario({ sessoesAtivas: antigas });
  await assert.rejects(
    () => semConfirmacao.servico.entrar(entradaLogin),
    ErroConfirmacaoRevogacaoSessaoNecessaria,
  );
  assert.equal(semConfirmacao.chamadas.criarSessao.length, 0);
  assert.equal(semConfirmacao.chamadas.revogacoesMultiplas.length, 0);

  const confirmada = criarCenario({ sessoesAtivas: antigas });
  await confirmada.servico.entrar({
    ...entradaLogin,
    confirmarRevogacaoSessaoMaisAntiga: true,
  });
  assert.deepEqual(confirmada.chamadas.revogacoesMultiplas[0][1], [antigas[0].id]);
  assert.equal(confirmada.chamadas.criarSessao.length, 1);
});

test('logout global revoga todas as sessões ativas na mesma transação', async () => {
  const token = 'i'.repeat(43);
  const csrf = 'j'.repeat(43);
  const usuarioId = randomUUID();
  const sessoesAtivas = [
    {
      autenticadaEm: new Date(),
      expiraEm: new Date(Date.now() + 60_000),
      id: randomUUID(),
      ultimaAtividadeEm: new Date(),
    },
    {
      autenticadaEm: new Date(),
      expiraEm: new Date(Date.now() + 60_000),
      id: randomUUID(),
      ultimaAtividadeEm: new Date(),
    },
  ];
  const cenario = criarCenario({
    sessao: {
      autenticadaEm: new Date(),
      csrfHash: hashHex(csrf),
      estado: 'ATIVA',
      expiraEm: new Date(Date.now() + 60_000),
      id: sessoesAtivas[0].id,
      nomeExibicao: 'Maria Silva',
      tokenHash: hashHex(token),
      ultimaAtividadeEm: new Date(),
      usuarioAtivo: true,
      usuarioId,
      versao: 0,
    },
    sessoesAtivas,
  });
  await cenario.servico.sairDeTodas(token, csrf);
  assert.deepEqual(
    cenario.chamadas.revogacoesMultiplas[0][1],
    sessoesAtivas.map(({ id }) => id),
  );
  assert.equal(
    cenario.chamadas.auditoria[0][0].tipoEvento,
    'SESSOES_WEB_REVOGADAS_GLOBALMENTE',
  );
});
