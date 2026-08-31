import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroLimitePareamentoQrExcedido,
  ErroPareamentoQrAguardandoConfirmacao,
  ErroPareamentoQrInvalido,
  ErroReautenticacaoNecessaria,
} from '../dist/autenticacao/erros-autenticacao.js';
import { ServicoPareamentoQr } from '../dist/autenticacao/servico-pareamento-qr.js';

const hashHex = (valor) => createHash('sha256').update(valor).digest('hex');
const tokenWeb = 'w'.repeat(43);
const csrfWeb = 'c'.repeat(43);
const tokenQr = 'q'.repeat(43);
const comprovante = 'r'.repeat(43);
const segredoVinculo = 'v'.repeat(43);
const identificadorInstalacao = randomUUID();
const dispositivo = {
  identificadorInstalacao,
  modeloSanitizado: 'Telefone de teste',
  plataforma: 'ANDROID',
  segredoVinculo,
  versaoAplicativo: '1.0.0',
};
const dispositivoNormalizado = {
  identificadorInstalacaoHash: hashHex(identificadorInstalacao),
  modeloSanitizado: dispositivo.modeloSanitizado,
  plataforma: dispositivo.plataforma,
  segredoVinculoHash: hashHex(segredoVinculo),
  versaoAplicativo: dispositivo.versaoAplicativo,
};

function criarPareamento(sobrescritas = {}) {
  return {
    estado: 'AGUARDANDO_RESGATE',
    expiraEm: new Date(Date.now() + 60_000),
    id: randomUUID(),
    nomeExibicaoUsuario: 'Maria Silva',
    sessaoWebAtiva: true,
    sessaoWebAutenticadaEm: new Date(),
    sessaoWebExpiraEm: new Date(Date.now() + 60 * 60_000),
    sessaoWebId: randomUUID(),
    usuarioAtivo: true,
    usuarioId: randomUUID(),
    ...sobrescritas,
  };
}

function criarCenario(sobrescritas = {}) {
  const chamadas = {
    auditoria: [],
    cancelamentos: [],
    conclusoes: [],
    confirmacoes: [],
    criacoes: [],
    emissoes: [],
    finalizacoes: [],
    resgates: [],
    tentativas: [],
  };
  const transacao = { id: 'transacao-controlada' };
  const pareamento = sobrescritas.pareamento ?? criarPareamento();
  const sessaoWeb = {
    autenticadaEm: sobrescritas.autenticadaEm ?? new Date(),
    id: pareamento.sessaoWebId,
    usuarioId: pareamento.usuarioId,
  };
  const repositorio = {
    cancelarAtivosSessao: async (...argumentos) => {
      chamadas.cancelamentos.push(argumentos);
      return sobrescritas.cancelados ?? 0;
    },
    concluir: async (...argumentos) => {
      chamadas.conclusoes.push(argumentos);
      if (pareamento.estado !== 'CONFIRMADO') return false;
      pareamento.estado = 'CONCLUIDO';
      return true;
    },
    confirmar: async (...argumentos) => {
      chamadas.confirmacoes.push(argumentos);
      if (pareamento.estado !== 'AGUARDANDO_CONFIRMACAO') return false;
      pareamento.estado = 'CONFIRMADO';
      return true;
    },
    contarGeracoesUsuario: async () => sobrescritas.geracoes ?? 0,
    contarTentativasResgate: async () =>
      sobrescritas.tentativasContadas ?? { dispositivo: 0, ip: 0 },
    criar: async (...argumentos) => chamadas.criacoes.push(argumentos),
    finalizar: async (...argumentos) => {
      chamadas.finalizacoes.push(argumentos);
      pareamento.estado = argumentos[1];
      return true;
    },
    obterPorComprovante: async (_id, comprovanteHash) =>
      comprovanteHash === hashHex(sobrescritas.comprovante ?? comprovante)
        ? pareamento
        : undefined,
    obterPorId: async () => pareamento,
    obterPorToken: async (tokenHash) =>
      tokenHash === hashHex(sobrescritas.tokenQr ?? tokenQr)
        ? pareamento
        : undefined,
    registrarTentativaResgate: async (...argumentos) =>
      chamadas.tentativas.push(argumentos),
    resgatar: async (...argumentos) => {
      chamadas.resgates.push(argumentos);
      if (pareamento.estado !== 'AGUARDANDO_RESGATE') return false;
      const [, , normalizado, enderecoIp] = argumentos;
      Object.assign(pareamento, normalizado, {
        enderecoIpResgate: enderecoIp,
        estado: 'AGUARDANDO_CONFIRMACAO',
      });
      return true;
    },
    serializarGeracao: async () => undefined,
    serializarPareamento: async () => undefined,
    serializarResgate: async () => undefined,
  };
  const prisma = { executarTransacao: async (operacao) => operacao(transacao) };
  const autenticacaoWeb = {
    autenticar: async () => ({ contexto: { sessaoId: sessaoWeb.id } }),
    executarComSessaoAtual: async (_token, _csrf, operacao) =>
      operacao(sessaoWeb, new Date(), transacao),
  };
  const sessaoMobile = {
    acessoExpiraEm: new Date(Date.now() + 15 * 60_000),
    dispositivoId: randomUUID(),
    dispositivoSubstituido: false,
    id: randomUUID(),
    nomeExibicao: 'Maria Silva',
    refreshExpiraEm: new Date(Date.now() + 24 * 60 * 60_000),
    tokenAcesso: 'a'.repeat(43),
    tokenRefresh: 'f'.repeat(43),
    usuarioId: pareamento.usuarioId,
  };
  const autenticacaoMobile = {
    emitirSessaoPorPareamento: async (...argumentos) => {
      chamadas.emissoes.push(argumentos);
      return { dispositivoNaoConfiavel: false, sessao: sessaoMobile };
    },
    normalizarDispositivo: () => dispositivoNormalizado,
  };
  const auditoria = {
    registrar: async (...argumentos) => chamadas.auditoria.push(argumentos),
  };
  return {
    chamadas,
    pareamento,
    servico: new ServicoPareamentoQr(
      repositorio,
      prisma,
      auditoria,
      autenticacaoWeb,
      autenticacaoMobile,
    ),
    sessaoMobile,
    transacao,
  };
}

test('gera QR por 90 segundos, persiste apenas hash e cancela o anterior', async () => {
  const cenario = criarCenario({ cancelados: 1 });
  const antes = Date.now();
  const gerado = await cenario.servico.gerar(tokenWeb, csrfWeb);
  const depois = Date.now();

  assert.match(gerado.tokenQr, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(gerado.expiraEm.getTime() >= antes + 90_000);
  assert.ok(gerado.expiraEm.getTime() <= depois + 90_000);
  const [persistido, transacao] = cenario.chamadas.criacoes[0];
  assert.equal(persistido.tokenQrHash, hashHex(gerado.tokenQr));
  assert.ok(!JSON.stringify(persistido).includes(gerado.tokenQr));
  assert.equal(transacao, cenario.transacao);
  assert.equal(cenario.chamadas.cancelamentos.length, 1);
  assert.equal(
    cenario.chamadas.auditoria[0][0].dadosNovos.pareamentos_anteriores_cancelados,
    1,
  );
});

test('limita geração antes de persistir novo pareamento', async () => {
  const cenario = criarCenario({ geracoes: 5 });
  await assert.rejects(
    () => cenario.servico.gerar(tokenWeb, csrfWeb),
    ErroLimitePareamentoQrExcedido,
  );
  assert.equal(cenario.chamadas.criacoes.length, 0);
  assert.equal(
    cenario.chamadas.auditoria[0][0].tipoEvento,
    'GERACAO_PAREAMENTO_QR_BLOQUEADA',
  );
});

test('resgate é de uso único, vincula o aparelho e não persiste o comprovante cru', async () => {
  const cenario = criarCenario({ tokenQr });
  const resgate = await cenario.servico.resgatar(
    tokenQr,
    dispositivo,
    '127.0.0.1',
  );

  assert.match(resgate.comprovanteResgate, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(cenario.chamadas.tentativas[0][0].resultado, 'SUCESSO');
  const [, comprovanteHash, persistido, enderecoIp] =
    cenario.chamadas.resgates[0];
  assert.equal(comprovanteHash, hashHex(resgate.comprovanteResgate));
  assert.deepEqual(persistido, dispositivoNormalizado);
  assert.equal(enderecoIp, '127.0.0.1');
  assert.ok(
    !JSON.stringify(cenario.chamadas.resgates).includes(
      resgate.comprovanteResgate,
    ),
  );

  await assert.rejects(
    () => cenario.servico.resgatar(tokenQr, dispositivo, '127.0.0.1'),
    ErroPareamentoQrInvalido,
  );
  assert.equal(cenario.chamadas.resgates.length, 1);
  assert.equal(cenario.chamadas.tentativas[1][0].resultado, 'FALHA');
});

test('confirma somente pela mesma sessão web com autenticação recente', async () => {
  const pareamento = criarPareamento({ estado: 'AGUARDANDO_CONFIRMACAO' });
  const antigo = criarCenario({
    autenticadaEm: new Date(Date.now() - 11 * 60_000),
    pareamento,
  });
  await assert.rejects(
    () => antigo.servico.confirmar(tokenWeb, csrfWeb, pareamento.id),
    ErroReautenticacaoNecessaria,
  );
  assert.equal(antigo.chamadas.confirmacoes.length, 0);

  const recente = criarCenario({ pareamento });
  await recente.servico.confirmar(tokenWeb, csrfWeb, pareamento.id);
  assert.equal(pareamento.estado, 'CONFIRMADO');
  assert.equal(
    recente.chamadas.auditoria[0][0].tipoEvento,
    'PAREAMENTO_QR_CONFIRMADO',
  );

  const alheio = criarCenario({
    pareamento: criarPareamento({
      estado: 'AGUARDANDO_CONFIRMACAO',
      sessaoWebId: randomUUID(),
    }),
  });
  alheio.pareamento.sessaoWebId = randomUUID();
  await assert.rejects(
    () => alheio.servico.confirmar(tokenWeb, csrfWeb, alheio.pareamento.id),
    ErroPareamentoQrInvalido,
  );
});

test('entrega a sessão somente ao mobile depois da confirmação e recusa replay', async () => {
  const pareamento = criarPareamento({
    ...dispositivoNormalizado,
    enderecoIpResgate: '127.0.0.1',
    estado: 'AGUARDANDO_CONFIRMACAO',
  });
  const cenario = criarCenario({ comprovante, pareamento });

  await assert.rejects(
    () => cenario.servico.concluir(pareamento.id, comprovante, dispositivo),
    ErroPareamentoQrAguardandoConfirmacao,
  );
  assert.equal(cenario.chamadas.emissoes.length, 0);

  pareamento.estado = 'CONFIRMADO';
  const sessao = await cenario.servico.concluir(
    pareamento.id,
    comprovante,
    dispositivo,
  );
  assert.deepEqual(sessao, cenario.sessaoMobile);
  assert.equal(cenario.chamadas.emissoes.length, 1);
  assert.equal(cenario.chamadas.emissoes[0][1], cenario.transacao);
  assert.equal(cenario.chamadas.conclusoes.length, 1);
  assert.equal(
    cenario.chamadas.auditoria.at(-1)[0].tipoEvento,
    'PAREAMENTO_QR_CONCLUIDO',
  );

  await assert.rejects(
    () => cenario.servico.concluir(pareamento.id, comprovante, dispositivo),
    ErroPareamentoQrInvalido,
  );
  assert.equal(cenario.chamadas.emissoes.length, 1);
});
