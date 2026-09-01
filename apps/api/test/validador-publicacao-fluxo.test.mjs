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
      no('decisao', 'CONDICAO', {
        parametros: { operador: 'IGUAL', valor: true, variavel: 'autorizar' },
        variaveisEntrada: ['autorizar'],
      }),
      no('definir', 'DEFINIR_VARIAVEL', {
        parametros: { valor: 'disponível', variavel: 'documento' },
        variaveisSaida: ['documento'],
      }),
      no('mensagem', 'ENVIAR_MENSAGEM', {
        parametros: { texto: 'Documento disponível' },
        variaveisEntrada: ['documento', 'segredo'],
      }),
      no('fim', 'FIM'),
    ],
    variaveis: [
      {
        disponivelNaEntrada: true,
        nome: 'autorizar',
        sensivel: false,
        tipo: 'BOOLEANO',
      },
      {
        disponivelNaEntrada: false,
        nome: 'documento',
        sensivel: false,
        tipo: 'TEXTO',
      },
      {
        disponivelNaEntrada: true,
        nome: 'segredo',
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
  const noCiclo = (sobrescritas = {}) =>
    no('ciclo', 'CONDICAO', {
      parametros: { operador: 'IGUAL', valor: true, variavel: 'continuar' },
      variaveisEntrada: ['continuar'],
      ...sobrescritas,
    });
  const semLimite = definicaoBasica({
    conexoes: [
      conexao('inicio', 'SUCESSO', 'ciclo'),
      conexao('ciclo', 'VERDADEIRO', 'ciclo'),
      conexao('ciclo', 'FALSO', 'fim'),
      conexao('ciclo', 'FALHA', 'fim'),
    ],
    nos: [no('inicio', 'INICIO'), noCiclo(), no('fim', 'FIM')],
    variaveis: [
      {
        disponivelNaEntrada: true,
        nome: 'continuar',
        sensivel: false,
        tipo: 'BOOLEANO',
      },
    ],
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
      noCiclo({ limiteIteracoes: 10 }),
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
  assert.ok(
    codigos(
      new ValidadorPublicacaoFluxo().validar(semSaida, contexto()),
    ).includes('LIMITE_ITERACOES_SEM_SAIDA'),
  );
  const falhaDoLimiteRetornaAoCiclo = {
    ...limitado,
    conexoes: [
      conexao('inicio', 'SUCESSO', 'ciclo'),
      conexao('ciclo', 'VERDADEIRO', 'ciclo'),
      conexao('ciclo', 'FALSO', 'fim'),
      conexao('ciclo', 'FALHA', 'ciclo'),
    ],
  };
  assert.ok(
    codigos(
      new ValidadorPublicacaoFluxo().validar(
        falhaDoLimiteRetornaAoCiclo,
        contexto(),
      ),
    ).includes('LIMITE_ITERACOES_SEM_SAIDA'),
  );
  const subcicloSemLimite = definicaoBasica({
    conexoes: [
      conexao('inicio', 'SUCESSO', 'limitado'),
      conexao('limitado', 'VERDADEIRO', 'livre'),
      conexao('limitado', 'FALSO', 'fim'),
      conexao('limitado', 'FALHA', 'fim'),
      conexao('livre', 'VERDADEIRO', 'livre'),
      conexao('livre', 'FALSO', 'limitado'),
      conexao('livre', 'FALHA', 'fim'),
    ],
    nos: [
      no('inicio', 'INICIO'),
      no('limitado', 'CONDICAO', {
        limiteIteracoes: 10,
        parametros: { operador: 'IGUAL', valor: true, variavel: 'continuar' },
        variaveisEntrada: ['continuar'],
      }),
      no('livre', 'CONDICAO', {
        parametros: { operador: 'IGUAL', valor: true, variavel: 'continuar' },
        variaveisEntrada: ['continuar'],
      }),
      no('fim', 'FIM'),
    ],
    variaveis: [
      {
        disponivelNaEntrada: true,
        nome: 'continuar',
        sensivel: false,
        tipo: 'BOOLEANO',
      },
    ],
  });
  assert.ok(
    codigos(
      new ValidadorPublicacaoFluxo().validar(subcicloSemLimite, contexto()),
    ).includes('CICLO_SEM_LIMITE'),
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

test('mensagem e lista possuem parâmetros tipados e fallback limitado', () => {
  const mensagemInvalida = definicaoBasica({
    nos: [
      no('inicio', 'INICIO'),
      no('mensagem', 'ENVIAR_MENSAGEM', { parametros: { mensagem: 'campo antigo' } }),
      no('fim', 'FIM'),
    ],
  });
  assert.ok(
    codigos(
      new ValidadorPublicacaoFluxo().validar(mensagemInvalida, contexto()),
    ).includes('DEFINICAO_ESTRUTURAL_INVALIDA'),
  );
  const listaInvalida = definicaoBasica({
    nos: [
      no('inicio', 'INICIO'),
      no('lista', 'ENVIAR_BOTOES_OU_LISTA', {
        parametros: {
          opcoes: [
            { id: 'duplicada', titulo: 'Primeira' },
            { id: 'duplicada', titulo: 'Segunda' },
          ],
          texto: 'Escolha',
        },
      }),
      no('fim', 'FIM'),
    ],
  });
  assert.ok(
    codigos(
      new ValidadorPublicacaoFluxo().validar(listaInvalida, contexto()),
    ).includes('DEFINICAO_ESTRUTURAL_INVALIDA'),
  );
});

test('espera por resposta e instante usam configuração exata e caminhos explícitos', () => {
  const casosValidos = [
    { tempoLimiteSegundos: 60, tipo: 'RESPOSTA' },
    { retomarEm: '2026-09-02T12:30:00.000Z', tipo: 'ATE_INSTANTE' },
  ];
  for (const parametros of casosValidos) {
    const definicao = definicaoBasica({
      conexoes: [
        conexao('inicio', 'SUCESSO', 'espera'),
        conexao('espera', 'CONCLUIDO', 'fim'),
        conexao('espera', 'TIMEOUT', 'fim'),
        conexao('espera', 'FALHA', 'fim'),
      ],
      nos: [
        no('inicio', 'INICIO'),
        no('espera', 'AGUARDAR', { parametros }),
        no('fim', 'FIM'),
      ],
    });
    assert.equal(
      new ValidadorPublicacaoFluxo().validar(definicao, contexto()).valido,
      true,
    );
  }

  const casosInvalidos = [
    { tempoLimiteSegundos: 0, tipo: 'RESPOSTA' },
    { tempoLimiteSegundos: 86_401, tipo: 'RESPOSTA' },
    { retomarEm: '2026-09-02T12:30:00Z', tipo: 'ATE_INSTANTE' },
    { retomarEm: 'amanhã', tipo: 'ATE_INSTANTE' },
    { segundos: 10, tipo: 'SISTEMA' },
  ];
  for (const parametros of casosInvalidos) {
    const definicao = definicaoBasica({
      nos: [
        no('inicio', 'INICIO'),
        no('espera', 'AGUARDAR', { parametros }),
        no('fim', 'FIM'),
      ],
    });
    assert.ok(
      codigos(
        new ValidadorPublicacaoFluxo().validar(definicao, contexto()),
      ).includes('DEFINICAO_ESTRUTURAL_INVALIDA'),
    );
  }
});

test('calendário exige uma referência ativa e capacidade habilitada', () => {
  const definicao = definicaoBasica({
    conexoes: [
      conexao('inicio', 'SUCESSO', 'horario'),
      conexao('horario', 'DENTRO_HORARIO', 'fim'),
      conexao('horario', 'FORA_HORARIO', 'fim'),
      conexao('horario', 'FALHA', 'fim'),
    ],
    nos: [
      no('inicio', 'INICIO'),
      no('horario', 'HORARIO_ATENDIMENTO', {
        referencias: [{ recursoId: ids.recurso, tipo: 'CALENDARIO' }],
      }),
      no('fim', 'FIM'),
    ],
  });
  assert.equal(
    new ValidadorPublicacaoFluxo().validar(
      definicao,
      contexto({
        capacidadesHabilitadas: ['HORARIO_ATENDIMENTO'],
        referenciasAtivas: [
          { recursoId: ids.recurso, tipo: 'CALENDARIO' },
        ],
      }),
    ).valido,
    true,
  );

  const duplicada = {
    ...definicao,
    nos: definicao.nos.map((item) =>
      item.id === 'horario'
        ? {
            ...item,
            referencias: [
              ...item.referencias,
              { recursoId: randomUUID(), tipo: 'CALENDARIO' },
            ],
          }
        : item,
    ),
  };
  assert.ok(
    codigos(
      new ValidadorPublicacaoFluxo().validar(
        duplicada,
        contexto({ capacidadesHabilitadas: ['HORARIO_ATENDIMENTO'] }),
      ),
    ).includes('CONFIGURACAO_CALENDARIO_INVALIDA'),
  );
});

test('condição e definição aceitam somente operadores e literais tipados', () => {
  const casos = [
    ['BOOLEANO', 'IGUAL', true],
    ['DATA_HORA', 'ANTES_DE', '2026-09-02T00:00:00.000Z'],
    ['DECIMAL', 'MAIOR_OU_IGUAL', '10.250000'],
    ['INTEIRO', 'MENOR_QUE', 20],
    ['TEXTO', 'CONTEM', 'premium'],
    ['UUID', 'DIFERENTE', randomUUID()],
  ];
  for (const [tipo, operador, valor] of casos) {
    const definicao = definicaoBasica({
      conexoes: [
        conexao('inicio', 'SUCESSO', 'condicao'),
        conexao('condicao', 'VERDADEIRO', 'fim'),
        conexao('condicao', 'FALSO', 'fim'),
        conexao('condicao', 'FALHA', 'fim'),
      ],
      nos: [
        no('inicio', 'INICIO'),
        no('condicao', 'CONDICAO', {
          parametros: { operador, valor, variavel: 'valorAtual' },
          variaveisEntrada: ['valorAtual'],
        }),
        no('fim', 'FIM'),
      ],
      variaveis: [
        {
          disponivelNaEntrada: true,
          nome: 'valorAtual',
          sensivel: false,
          tipo,
        },
      ],
    });
    assert.equal(
      new ValidadorPublicacaoFluxo().validar(definicao, contexto()).valido,
      true,
      `${tipo}/${operador}`,
    );
  }

  const definicao = definicaoBasica({
    conexoes: [
      conexao('inicio', 'SUCESSO', 'definir'),
      conexao('definir', 'SUCESSO', 'fim'),
      conexao('definir', 'FALHA', 'fim'),
    ],
    nos: [
      no('inicio', 'INICIO'),
      no('definir', 'DEFINIR_VARIAVEL', {
        parametros: { valor: '10.50', variavel: 'total' },
        variaveisSaida: ['total'],
      }),
      no('fim', 'FIM'),
    ],
    variaveis: [
      {
        disponivelNaEntrada: false,
        nome: 'total',
        sensivel: false,
        tipo: 'DECIMAL',
      },
    ],
  });
  assert.equal(
    new ValidadorPublicacaoFluxo().validar(definicao, contexto()).valido,
    true,
  );
});

test('condição recusa coerção, expressão, operador incompatível e segredo constante', () => {
  const casos = [
    {
      operador: 'MAIOR_QUE',
      tipo: 'DECIMAL',
      valor: 10.5,
    },
    {
      operador: 'CONTEM',
      tipo: 'INTEIRO',
      valor: 10,
    },
    {
      operador: 'IGUAL',
      tipo: 'TEXTO',
      valor: { expressao: 'contexto.total' },
    },
  ];
  for (const caso of casos) {
    const definicao = definicaoBasica({
      conexoes: [
        conexao('inicio', 'SUCESSO', 'condicao'),
        conexao('condicao', 'VERDADEIRO', 'fim'),
        conexao('condicao', 'FALSO', 'fim'),
        conexao('condicao', 'FALHA', 'fim'),
      ],
      nos: [
        no('inicio', 'INICIO'),
        no('condicao', 'CONDICAO', {
          parametros: {
            operador: caso.operador,
            valor: caso.valor,
            variavel: 'alvo',
          },
          variaveisEntrada: ['alvo'],
        }),
        no('fim', 'FIM'),
      ],
      variaveis: [
        {
          disponivelNaEntrada: true,
          nome: 'alvo',
          sensivel: false,
          tipo: caso.tipo,
        },
      ],
    });
    assert.equal(
      new ValidadorPublicacaoFluxo().validar(definicao, contexto()).valido,
      false,
    );
  }

  const segredo = definicaoBasica({
    conexoes: [
      conexao('inicio', 'SUCESSO', 'definir'),
      conexao('definir', 'SUCESSO', 'fim'),
      conexao('definir', 'FALHA', 'fim'),
    ],
    nos: [
      no('inicio', 'INICIO'),
      no('definir', 'DEFINIR_VARIAVEL', {
        parametros: { valor: 'nao-versionar', variavel: 'chave' },
        variaveisSaida: ['chave'],
      }),
      no('fim', 'FIM'),
    ],
    variaveis: [
      {
        disponivelNaEntrada: false,
        nome: 'chave',
        sensivel: true,
        tipo: 'TEXTO',
      },
    ],
  });
  assert.ok(
    codigos(
      new ValidadorPublicacaoFluxo().validar(segredo, contexto()),
    ).includes('CONFIGURACAO_VARIAVEL_INVALIDA'),
  );
});

test('nós de identidade exigem configuração fechada e seleção UUID sensível explícita', () => {
  const selecao = (tipo) =>
    definicaoBasica({
      conexoes: [
        conexao('inicio', 'SUCESSO', 'selecionar'),
        conexao('selecionar', 'SELECIONADO', 'fim'),
        conexao('selecionar', 'NAO_SELECIONADO', 'fim'),
        conexao('selecionar', 'FALHA', 'fim'),
      ],
      nos: [
        no('inicio', 'INICIO'),
        no('selecionar', tipo, {
          parametros: { variavel: 'vinculoEscolhido' },
          variaveisEntrada: ['vinculoEscolhido'],
        }),
        no('fim', 'FIM'),
      ],
      variaveis: [
        {
          disponivelNaEntrada: true,
          nome: 'vinculoEscolhido',
          sensivel: true,
          tipo: 'UUID',
        },
      ],
    });
  for (const tipo of ['SELECIONAR_CLIENTE', 'SELECIONAR_CONTRATO']) {
    assert.equal(
      new ValidadorPublicacaoFluxo().validar(
        selecao(tipo),
        contexto({ capacidadesHabilitadas: [tipo] }),
      ).valido,
      true,
    );
  }

  const insegura = selecao('SELECIONAR_CLIENTE');
  insegura.variaveis[0].sensivel = false;
  insegura.variaveis[0].tipo = 'TEXTO';
  assert.ok(
    codigos(
      new ValidadorPublicacaoFluxo().validar(
        insegura,
        contexto({ capacidadesHabilitadas: ['SELECIONAR_CLIENTE'] }),
      ),
    ).includes('CONFIGURACAO_SELECAO_CONTEXTO_INVALIDA'),
  );
});

test('nós de fatura não aceitam parâmetro, referência ou variável declarada pelo fluxo', () => {
  for (const [tipo, saidas] of [
    ['CONSULTAR_FATURAS', ['ENCONTRADA', 'NAO_ENCONTRADA', 'ERP_INDISPONIVEL', 'FALHA']],
    ['ENVIAR_FATURA', ['SUCESSO', 'DADOS_INCOMPLETOS', 'ERP_INDISPONIVEL', 'FALHA']],
  ]) {
    const definicao = definicaoBasica({
      conexoes: [
        conexao('inicio', 'SUCESSO', 'fatura'),
        ...saidas.map((saida) => conexao('fatura', saida, 'fim')),
      ],
      nos: [no('inicio', 'INICIO'), no('fatura', tipo), no('fim', 'FIM')],
    });
    assert.equal(
      new ValidadorPublicacaoFluxo().validar(
        definicao,
        contexto({ capacidadesHabilitadas: [tipo] }),
      ).valido,
      true,
    );
    const contaminada = {
      ...definicao,
      nos: definicao.nos.map((item) =>
        item.id === 'fatura'
          ? { ...item, parametros: { faturaExternaId: 'não-versionar' } }
          : item,
      ),
    };
    assert.ok(
      codigos(
        new ValidadorPublicacaoFluxo().validar(
          contaminada,
          contexto({ capacidadesHabilitadas: [tipo] }),
        ),
      ).includes('DEFINICAO_ESTRUTURAL_INVALIDA'),
    );
  }
});

test('nó de formulário exige um cadastro ativo e fallback textual fechado', () => {
  const formularioId = randomUUID();
  const definicao = definicaoBasica({
    conexoes: [
      conexao('inicio', 'SUCESSO', 'formulario'),
      conexao('formulario', 'ENVIADO', 'fim'),
      conexao('formulario', 'FALLBACK', 'fim'),
      conexao('formulario', 'FALHA', 'fim'),
    ],
    nos: [
      no('inicio', 'INICIO'),
      no('formulario', 'SOLICITAR_FORMULARIO_WHATSAPP', {
        parametros: { textoFallback: 'Vamos continuar pelo atendimento seguro.' },
        referencias: [
          { recursoId: formularioId, tipo: 'FORMULARIO_WHATSAPP' },
        ],
      }),
      no('fim', 'FIM'),
    ],
  });
  assert.equal(
    new ValidadorPublicacaoFluxo().validar(
      definicao,
      contexto({
        capacidadesHabilitadas: ['SOLICITAR_FORMULARIO_WHATSAPP'],
        referenciasAtivas: [
          { recursoId: formularioId, tipo: 'FORMULARIO_WHATSAPP' },
        ],
      }),
    ).valido,
    true,
  );

  const duplicada = structuredClone(definicao);
  duplicada.nos[1].referencias.push({
    recursoId: randomUUID(),
    tipo: 'FORMULARIO_WHATSAPP',
  });
  const relatorio = new ValidadorPublicacaoFluxo().validar(
    duplicada,
    contexto({
      capacidadesHabilitadas: ['SOLICITAR_FORMULARIO_WHATSAPP'],
      referenciasAtivas: duplicada.nos[1].referencias,
    }),
  );
  assert.ok(codigos(relatorio).includes('CONFIGURACAO_FORMULARIO_INVALIDA'));

  const payloadLivre = structuredClone(definicao);
  payloadLivre.nos[1].parametros = {
    identificadorExterno: 'não pertence ao domínio',
    textoFallback: 'Fallback seguro.',
  };
  assert.ok(
    codigos(
      new ValidadorPublicacaoFluxo().validar(
        payloadLivre,
        contexto({
          capacidadesHabilitadas: ['SOLICITAR_FORMULARIO_WHATSAPP'],
          referenciasAtivas: [
            { recursoId: formularioId, tipo: 'FORMULARIO_WHATSAPP' },
          ],
        }),
      ),
    ).includes('DEFINICAO_ESTRUTURAL_INVALIDA'),
  );
});

test('identificação e pedido de dados não aceitam variáveis, referências ou payload livre', () => {
  const casos = [
    {
      no: no('identificar', 'IDENTIFICAR_CONTATO'),
      saidas: ['IDENTIFICADO', 'NAO_IDENTIFICADO', 'FALHA'],
      tipo: 'IDENTIFICAR_CONTATO',
    },
    {
      no: no('solicitar', 'SOLICITAR_DADOS_CONTATO', {
        parametros: { textoFallback: 'Compartilhe seus dados pelo canal seguro.' },
      }),
      saidas: ['ENVIADO', 'FALLBACK', 'FALHA'],
      tipo: 'SOLICITAR_DADOS_CONTATO',
    },
  ];
  for (const caso of casos) {
    const definicao = definicaoBasica({
      conexoes: [
        conexao('inicio', 'SUCESSO', caso.no.id),
        ...caso.saidas.map((saida) => conexao(caso.no.id, saida, 'fim')),
      ],
      nos: [no('inicio', 'INICIO'), caso.no, no('fim', 'FIM')],
    });
    assert.equal(
      new ValidadorPublicacaoFluxo().validar(
        definicao,
        contexto({ capacidadesHabilitadas: [caso.tipo] }),
      ).valido,
      true,
    );
  }

  const livre = definicaoBasica({
    conexoes: [
      conexao('inicio', 'SUCESSO', 'identificar'),
      conexao('identificar', 'IDENTIFICADO', 'fim'),
      conexao('identificar', 'NAO_IDENTIFICADO', 'fim'),
      conexao('identificar', 'FALHA', 'fim'),
    ],
    nos: [
      no('inicio', 'INICIO'),
      no('identificar', 'IDENTIFICAR_CONTATO', {
        parametros: { telefone: '+5511999999999' },
      }),
      no('fim', 'FIM'),
    ],
  });
  assert.equal(
    new ValidadorPublicacaoFluxo().validar(
      livre,
      contexto({ capacidadesHabilitadas: ['IDENTIFICAR_CONTATO'] }),
    ).valido,
    false,
  );
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
