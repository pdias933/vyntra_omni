import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroFluxoNaoPublicavel } from '../dist/fluxos/erros-fluxo.js';
import { ServicoValidacaoPublicacaoFluxos } from '../dist/fluxos/servico-validacao-publicacao-fluxos.js';
import { ValidadorPublicacaoFluxo } from '../dist/fluxos/validador-publicacao-fluxo.js';

const agora = new Date('2026-09-01T16:00:00.000Z');
const ids = {
  fluxo: randomUUID(),
  recurso: randomUUID(),
  sessao: randomUUID(),
  usuario: randomUUID(),
  versao: randomUUID(),
};
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2099-01-01T00:00:00.000Z'),
  sessaoId: ids.sessao,
  usuarioId: ids.usuario,
};

function no(id, tipo, sobrescritas = {}) {
  return {
    id,
    parametros: {},
    referencias: [],
    tipo,
    variaveisEntrada: [],
    variaveisSaida: [],
    ...sobrescritas,
  };
}

function conexao(origemNoId, saida, destinoNoId) {
  return { destinoNoId, origemNoId, saida };
}

function definicaoBasica(sobrescritas = {}) {
  return {
    conexoes: [conexao('inicio', 'SUCESSO', 'fim')],
    inicioNoId: 'inicio',
    nos: [no('inicio', 'INICIO'), no('fim', 'FIM')],
    variaveis: [],
    versaoSchema: 1,
    ...sobrescritas,
  };
}

function contexto(sobrescritas = {}) {
  return {
    capacidadesHabilitadas: [],
    referenciasAtivas: [],
    ...sobrescritas,
  };
}

function codigos(relatorio) {
  return relatorio.problemas.map(({ codigo }) => codigo);
}

test('aceita grafo mínimo com início e fim únicos e alcançáveis', () => {
  const relatorio = new ValidadorPublicacaoFluxo().validar(
    definicaoBasica(),
    contexto(),
  );
  assert.equal(relatorio.valido, true);
  assert.equal(relatorio.quantidadeNos, 2);
  assert.deepEqual(relatorio.problemas, []);
});

test('rejeita início divergente, nó inalcançável, referência quebrada e saída ausente', () => {
  const definicao = definicaoBasica({
    conexoes: [conexao('inicio', 'OUTRA', 'ausente')],
    inicioNoId: 'fim',
    nos: [
      no('inicio', 'INICIO'),
      no('segundoInicio', 'INICIO'),
      no('fim', 'FIM'),
      no('orfao', 'FIM'),
    ],
  });
  const relatorio = new ValidadorPublicacaoFluxo().validar(
    definicao,
    contexto(),
  );
  assert.equal(relatorio.valido, false);
  assert.ok(codigos(relatorio).includes('INICIO_INVALIDO'));
  assert.ok(codigos(relatorio).includes('REFERENCIA_NO_INEXISTENTE'));
  assert.ok(codigos(relatorio).includes('SAIDA_SUCESSO_AUSENTE'));
  assert.ok(codigos(relatorio).includes('NO_INALCANCAVEL'));
});

test('exige capacidade, referência ativa e todas as saídas de falha', () => {
  const definicao = definicaoBasica({
    conexoes: [
      conexao('inicio', 'SUCESSO', 'horario'),
      conexao('horario', 'DENTRO_HORARIO', 'fim'),
    ],
    nos: [
      no('inicio', 'INICIO'),
      no('horario', 'HORARIO_ATENDIMENTO', {
        referencias: [{ recursoId: ids.recurso, tipo: 'CALENDARIO' }],
      }),
      no('fim', 'FIM'),
    ],
  });
  const relatorio = new ValidadorPublicacaoFluxo().validar(
    definicao,
    contexto(),
  );
  assert.ok(codigos(relatorio).includes('CAPACIDADE_NAO_HABILITADA'));
  assert.ok(codigos(relatorio).includes('REFERENCIA_INATIVA'));
  assert.ok(codigos(relatorio).includes('SAIDA_FORA_HORARIO_AUSENTE'));
  assert.ok(codigos(relatorio).includes('SAIDA_FALHA_AUSENTE'));
});

test('variável precisa existir em todos os caminhos e sensível não sai ao cliente', () => {
  const definicao = definicaoBasica({
    conexoes: [
      conexao('inicio', 'SUCESSO', 'decisao'),
      conexao('decisao', 'VERDADEIRO', 'definir'),
      conexao('decisao', 'FALSO', 'mensagem'),
      conexao('decisao', 'FALHA', 'fim'),
      conexao('definir', 'SUCESSO', 'mensagem'),
      conexao('definir', 'FALHA', 'fim'),
      conexao('mensagem', 'SUCESSO', 'fim'),
      conexao('mensagem', 'FALHA_TEMPORARIA', 'fim'),
      conexao('mensagem', 'FALHA_DEFINITIVA', 'fim'),
    ],
    nos: [
      no('inicio', 'INICIO'),
      no('decisao', 'CONDICAO'),
      no('definir', 'DEFINIR_VARIAVEL', { variaveisSaida: ['documento'] }),
      no('mensagem', 'ENVIAR_MENSAGEM', { variaveisEntrada: ['documento'] }),
      no('fim', 'FIM'),
    ],
    variaveis: [
      {
        disponivelNaEntrada: false,
        nome: 'documento',
        sensivel: true,
        tipo: 'TEXTO',
      },
    ],
  });
  const relatorio = new ValidadorPublicacaoFluxo().validar(
    definicao,
    contexto({ capacidadesHabilitadas: ['ENVIAR_MENSAGEM'] }),
  );
  assert.ok(codigos(relatorio).includes('VARIAVEL_NAO_DEFINIDA_NO_CAMINHO'));
  assert.ok(codigos(relatorio).includes('DADO_SENSIVEL_EM_SAIDA_CLIENTE'));
});

test('ciclo exige limite defensivo e caminho de saída', () => {
  const semLimite = definicaoBasica({
    conexoes: [
      conexao('inicio', 'SUCESSO', 'ciclo'),
      conexao('ciclo', 'VERDADEIRO', 'ciclo'),
      conexao('ciclo', 'FALSO', 'fim'),
      conexao('ciclo', 'FALHA', 'fim'),
    ],
    nos: [no('inicio', 'INICIO'), no('ciclo', 'CONDICAO'), no('fim', 'FIM')],
  });
  assert.ok(
    codigos(
      new ValidadorPublicacaoFluxo().validar(semLimite, contexto()),
    ).includes('CICLO_SEM_LIMITE'),
  );
  const limitado = {
    ...semLimite,
    nos: [
      no('inicio', 'INICIO'),
      no('ciclo', 'CONDICAO', { limiteIteracoes: 10 }),
      no('fim', 'FIM'),
    ],
  };
  assert.equal(
    new ValidadorPublicacaoFluxo().validar(limitado, contexto()).valido,
    true,
  );
  const semSaida = {
    ...limitado,
    conexoes: [
      conexao('inicio', 'SUCESSO', 'ciclo'),
      conexao('ciclo', 'VERDADEIRO', 'ciclo'),
      conexao('ciclo', 'FALSO', 'ciclo'),
      conexao('ciclo', 'FALHA', 'ciclo'),
    ],
  };
  assert.ok(
    codigos(
      new ValidadorPublicacaoFluxo().validar(semSaida, contexto()),
    ).includes('CICLO_SEM_SAIDA'),
  );
});

test('schema estrito recusa campo, script, URL técnica e versão desconhecida', () => {
  const casos = [
    { ...definicaoBasica(), extra: true },
    { ...definicaoBasica(), versaoSchema: 2 },
    definicaoBasica({
      nos: [no('inicio', 'INICIO', { parametros: { script: 'executar()' } }), no('fim', 'FIM')],
    }),
    definicaoBasica({
      nos: [no('inicio', 'INICIO', { parametros: { url: 'https://arbitraria.invalid' } }), no('fim', 'FIM')],
    }),
  ];
  for (const definicao of casos) {
    const relatorio = new ValidadorPublicacaoFluxo().validar(
      definicao,
      contexto(),
    );
    assert.equal(relatorio.valido, false);
    assert.ok(codigos(relatorio).includes('DEFINICAO_ESTRUTURAL_INVALIDA'));
  }
});

function criarCenario(definicao = definicaoBasica()) {
  const chamadas = { auditoria: [], autorizacao: [], marcacoes: [] };
  const fluxo = {
    ativo: true,
    atualizadoEm: agora,
    criadoEm: agora,
    criadoPorUsuarioId: ids.usuario,
    id: ids.fluxo,
    nome: 'Fluxo validado',
    nomeNormalizado: 'fluxo-validado',
    revisao: 1,
    tipo: 'ATENDIMENTO',
  };
  const versao = {
    atualizadaEm: agora,
    criadaEm: agora,
    criadaPorUsuarioId: ids.usuario,
    definicao,
    estado: 'RASCUNHO',
    fluxoId: ids.fluxo,
    id: ids.versao,
    numeroVersao: 1,
    revisao: 1,
    versaoSchemaDefinicao: 1,
  };
  const repositorio = {
    bloquearFluxo: async () => undefined,
    marcarVersaoEmTeste: async (...argumentos) => {
      chamadas.marcacoes.push(argumentos);
      return true;
    },
    obterFluxo: async () => fluxo,
    obterVersao: async () => versao,
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
  const provedorContexto = { obter: async () => contexto() };
  return {
    chamadas,
    servico: new ServicoValidacaoPublicacaoFluxos(
      repositorio,
      autorizacao,
      auditoria,
      new ValidadorPublicacaoFluxo(),
      provedorContexto,
    ),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('serviço promove somente versão válida a EM_TESTE com RBAC e auditoria', async () => {
  const cenario = criarCenario();
  const resultado = await cenario.servico.prepararParaPublicacao(
    sessao,
    {
      revisaoVersaoEsperada: 1,
      versaoFluxoId: ids.versao,
    },
    cenario.transacao,
    () => agora,
  );
  assert.equal(resultado.estado, 'EM_TESTE');
  assert.equal(resultado.revisaoVersao, 2);
  assert.equal(cenario.chamadas.autorizacao[0][0].permissao, 'PUBLICAR_FLUXO');
  assert.equal(cenario.chamadas.marcacoes[0][4], cenario.transacao);
  assert.equal(cenario.chamadas.auditoria[0][1], cenario.transacao);
  assert.equal(cenario.chamadas.auditoria[0][0].dadosNovos.definicao, undefined);
});

test('serviço inválido não muda estado nem registra auditoria', async () => {
  const cenario = criarCenario(
    definicaoBasica({ conexoes: [] }),
  );
  await assert.rejects(
    cenario.servico.prepararParaPublicacao(
      sessao,
      {
        revisaoVersaoEsperada: 1,
        versaoFluxoId: ids.versao,
      },
      cenario.transacao,
    ),
    ErroFluxoNaoPublicavel,
  );
  assert.equal(cenario.chamadas.marcacoes.length, 0);
  assert.equal(cenario.chamadas.auditoria.length, 0);
});
