import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroConflitoVersaoFluxo,
  ErroTransicaoPublicacaoFluxoInvalida,
  ErroVersaoFluxoNaoPublicavel,
} from '../dist/fluxos/erros-fluxo.js';
import { ServicoPublicacaoFluxos } from '../dist/fluxos/servico-publicacao-fluxos.js';

const agora = new Date('2026-09-01T15:00:00.000Z');
const ids = {
  fluxo: randomUUID(),
  outroFluxo: randomUUID(),
  sessao: randomUUID(),
  usuario: randomUUID(),
  v1: randomUUID(),
  v2: randomUUID(),
};
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2099-01-01T00:00:00.000Z'),
  sessaoId: ids.sessao,
  usuarioId: ids.usuario,
};

function fluxo(sobrescritas = {}) {
  return {
    ativo: true,
    atualizadoEm: agora,
    criadoEm: agora,
    criadoPorUsuarioId: ids.usuario,
    id: ids.fluxo,
    nome: 'Fluxo de aceite',
    nomeNormalizado: 'fluxo-de-aceite',
    revisao: 2,
    tipo: 'ATENDIMENTO',
    versaoPublicadaId: ids.v1,
    ...sobrescritas,
  };
}

function versao(id, estado, sobrescritas = {}) {
  return {
    atualizadaEm: agora,
    criadaEm: agora,
    criadaPorUsuarioId: ids.usuario,
    definicao: { inicio: 'entrada', nos: [] },
    estado,
    fluxoId: ids.fluxo,
    id,
    numeroVersao: id === ids.v1 ? 1 : 2,
    ...(estado === 'PUBLICADA' || estado === 'ARQUIVADA'
      ? { publicadaEm: agora, publicadaPorUsuarioId: ids.usuario }
      : {}),
    revisao: 1,
    versaoSchemaDefinicao: 1,
    ...sobrescritas,
  };
}

function criarCenario(sobrescritas = {}) {
  const chamadas = {
    arquivo: [],
    auditoria: [],
    autorizacao: [],
    historico: [],
    ponteiro: [],
    publicacao: [],
    reativacao: [],
  };
  const versoes =
    sobrescritas.versoes ??
    new Map([
      [ids.v1, versao(ids.v1, 'PUBLICADA')],
      [ids.v2, versao(ids.v2, 'EM_TESTE')],
    ]);
  const repositorio = {
    alterarPonteiroPublicado: async (...argumentos) => {
      chamadas.ponteiro.push(argumentos);
      return sobrescritas.ponteiroAlterado ?? true;
    },
    arquivarVersao: async (...argumentos) => {
      chamadas.arquivo.push(argumentos);
      return sobrescritas.arquivada ?? true;
    },
    bloquearFluxo: async () => undefined,
    obterFluxo: async () => sobrescritas.fluxo ?? fluxo(),
    obterVersao: async (id) => versoes.get(id),
    publicarVersao: async (...argumentos) => {
      chamadas.publicacao.push(argumentos);
      return sobrescritas.publicada ?? true;
    },
    reativarVersaoArquivada: async (...argumentos) => {
      chamadas.reativacao.push(argumentos);
      return sobrescritas.reativada ?? true;
    },
    registrarHistoricoPublicacao: async (...argumentos) =>
      chamadas.historico.push(argumentos),
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
  return {
    chamadas,
    servico: new ServicoPublicacaoFluxos(
      repositorio,
      autorizacao,
      auditoria,
    ),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('publica nova versão, arquiva a atual e troca o ponteiro atomicamente', async () => {
  const cenario = criarCenario();
  const resultado = await cenario.servico.publicar(
    sessao,
    {
      fluxoId: ids.fluxo,
      revisaoFluxoEsperada: 2,
      versaoFluxoId: ids.v2,
    },
    cenario.transacao,
    () => agora,
  );
  assert.deepEqual(resultado, {
    fluxoId: ids.fluxo,
    revisaoFluxo: 3,
    tipo: 'PUBLICACAO',
    versaoAnteriorId: ids.v1,
    versaoPublicadaId: ids.v2,
  });
  assert.equal(cenario.chamadas.autorizacao[0][0].permissao, 'PUBLICAR_FLUXO');
  assert.equal(cenario.chamadas.arquivo[0][0], ids.v1);
  assert.equal(cenario.chamadas.publicacao[0][0], ids.v2);
  assert.deepEqual(cenario.chamadas.ponteiro[0].slice(0, 5), [
    ids.fluxo,
    2,
    ids.v1,
    ids.v2,
    agora,
  ]);
  assert.equal(cenario.chamadas.historico[0][0].tipo, 'PUBLICACAO');
  assert.equal(cenario.chamadas.auditoria[0][1], cenario.transacao);
  assert.equal(cenario.chamadas.auditoria[0][0].dadosNovos.definicao, undefined);
});

test('primeira publicação parte de fluxo sem ponteiro', async () => {
  const cenario = criarCenario({ fluxo: fluxo({ revisao: 1, versaoPublicadaId: undefined }) });
  const resultado = await cenario.servico.publicar(
    sessao,
    {
      fluxoId: ids.fluxo,
      revisaoFluxoEsperada: 1,
      versaoFluxoId: ids.v2,
    },
    cenario.transacao,
    () => agora,
  );
  assert.equal(cenario.chamadas.arquivo.length, 0);
  assert.equal(resultado.versaoAnteriorId, undefined);
  assert.equal(resultado.versaoPublicadaId, ids.v2);
});

test('arquivamento explícito remove o ponteiro sem apagar histórico', async () => {
  const cenario = criarCenario();
  const resultado = await cenario.servico.arquivarPublicacaoAtual(
    sessao,
    { fluxoId: ids.fluxo, revisaoFluxoEsperada: 2 },
    cenario.transacao,
    () => agora,
  );
  assert.equal(resultado.tipo, 'ARQUIVAMENTO');
  assert.equal(resultado.versaoPublicadaId, undefined);
  assert.equal(cenario.chamadas.publicacao.length, 0);
  assert.equal(cenario.chamadas.ponteiro[0][3], undefined);
  assert.equal(cenario.chamadas.historico[0][0].versaoNovaId, undefined);
});

test('reversão arquiva atual e reativa versão anterior sem reescrever autoria', async () => {
  const versoes = new Map([
    [ids.v1, versao(ids.v1, 'ARQUIVADA')],
    [ids.v2, versao(ids.v2, 'PUBLICADA')],
  ]);
  const cenario = criarCenario({
    fluxo: fluxo({ versaoPublicadaId: ids.v2 }),
    versoes,
  });
  const resultado = await cenario.servico.reverter(
    sessao,
    {
      fluxoId: ids.fluxo,
      revisaoFluxoEsperada: 2,
      versaoFluxoId: ids.v1,
    },
    cenario.transacao,
    () => agora,
  );
  assert.equal(cenario.chamadas.autorizacao[0][0].permissao, 'REVERTER_FLUXO');
  assert.equal(cenario.chamadas.arquivo[0][0], ids.v2);
  assert.equal(cenario.chamadas.reativacao[0][0], ids.v1);
  assert.equal(resultado.tipo, 'REVERSAO');
  assert.equal(resultado.versaoPublicadaId, ids.v1);
  assert.equal(cenario.chamadas.historico[0][0].versaoAnteriorId, ids.v2);
});

test('estado, pertencimento e revisão inválidos não geram histórico ou auditoria', async () => {
  const naoPublicavel = criarCenario({
    versoes: new Map([
      [ids.v1, versao(ids.v1, 'PUBLICADA')],
      [ids.v2, versao(ids.v2, 'ARQUIVADA')],
    ]),
  });
  await assert.rejects(
    naoPublicavel.servico.publicar(
      sessao,
      {
        fluxoId: ids.fluxo,
        revisaoFluxoEsperada: 2,
        versaoFluxoId: ids.v2,
      },
      naoPublicavel.transacao,
    ),
    ErroVersaoFluxoNaoPublicavel,
  );

  const outroFluxo = criarCenario({
    versoes: new Map([
      [ids.v2, versao(ids.v2, 'EM_TESTE', { fluxoId: ids.outroFluxo })],
    ]),
  });
  await assert.rejects(
    outroFluxo.servico.publicar(
      sessao,
      {
        fluxoId: ids.fluxo,
        revisaoFluxoEsperada: 2,
        versaoFluxoId: ids.v2,
      },
      outroFluxo.transacao,
    ),
    ErroTransicaoPublicacaoFluxoInvalida,
  );

  const concorrente = criarCenario({ fluxo: fluxo({ revisao: 3 }) });
  await assert.rejects(
    concorrente.servico.arquivarPublicacaoAtual(
      sessao,
      { fluxoId: ids.fluxo, revisaoFluxoEsperada: 2 },
      concorrente.transacao,
    ),
    ErroConflitoVersaoFluxo,
  );
  for (const cenario of [naoPublicavel, outroFluxo, concorrente]) {
    assert.equal(cenario.chamadas.historico.length, 0);
    assert.equal(cenario.chamadas.auditoria.length, 0);
  }
});

test('falha condicional não registra mudança inexistente', async () => {
  const cenario = criarCenario({ ponteiroAlterado: false });
  await assert.rejects(
    cenario.servico.publicar(
      sessao,
      {
        fluxoId: ids.fluxo,
        revisaoFluxoEsperada: 2,
        versaoFluxoId: ids.v2,
      },
      cenario.transacao,
    ),
    ErroConflitoVersaoFluxo,
  );
  assert.equal(cenario.chamadas.historico.length, 0);
  assert.equal(cenario.chamadas.auditoria.length, 0);
});
