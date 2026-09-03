import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { AdaptadorConsultasMkSolutions } from '../dist/erp/adaptadores/mk-solutions/adaptador-consultas-mk-solutions.js';
import { ClienteHttpMkSolutions, criarLookupFixo, enderecoRedePublica } from '../dist/erp/adaptadores/mk-solutions/cliente-http-mk-solutions.js';
import { carregarConfiguracaoMkSolutions } from '../dist/erp/adaptadores/mk-solutions/configuracao-mk-solutions.js';

const fixture = JSON.parse(
  await readFile(
    new URL('./fixtures/mk-solutions/consultas-reais-publicas-sanitizadas.json', import.meta.url),
    'utf8',
  ),
);

const configuracao = {
  codigoServico: 9999,
  contraSenha: 'contra-senha-publica-sintetica',
  hostPermitido: 'erp.example.invalid',
  identificacaoSistema: 'MK0',
  limiteConcorrencia: 4,
  limiteCorpoBytes: 1024 * 1024,
  origem: new URL('https://erp.example.invalid/'),
  tempoEsperaMs: 5000,
  tokenCadastroUsuario: 'token-cadastro-publico-sintetico',
};

function criarTransporte(sobrescritas = {}) {
  const chamadas = [];
  return {
    chamadas,
    async obterJson(caminho, parametros) {
      chamadas.push({ caminho, parametros });
      if (sobrescritas[caminho] !== undefined) {
        const valor = sobrescritas[caminho];
        return typeof valor === 'function' ? valor(parametros) : valor;
      }
      if (caminho === '/mk/WSAutenticacao.rule') return fixture.autenticacao;
      if (caminho === '/mk/WSMKConsultaDoc.rule') return fixture.clientePorDocumento;
      if (caminho === '/mk/WSMKConsultaClientes.rule') return fixture.clientePorCodigo;
      if (caminho === '/mk/WSMKContratosPorCliente.rule') return fixture.contratos;
      if (caminho === '/mk/WSMKConexoesPorCliente.rule') return fixture.conexoes;
      if (caminho === '/mk/WSMKFaturas.rule') return fixture.faturas;
      throw new Error('ROTA_NAO_SIMULADA');
    },
  };
}

test('modo desligado não lê arquivo de segredo nem cria configuração', async () => {
  const resultado = await carregarConfiguracaoMkSolutions({
    MK_MODO: 'DESATIVADO',
    MK_TOKEN_CADASTRO_USUARIO_FILE: '/arquivo/que-nao-existe',
  });
  assert.equal(resultado, undefined);
});

test('caracterização não registra provider nem lê segredo', async () => {
  const resultado = await carregarConfiguracaoMkSolutions({
    MK_MODO: 'CARACTERIZACAO',
    MK_TOKEN_CADASTRO_USUARIO_FILE: '/arquivo/que-nao-existe',
  });
  assert.equal(resultado, undefined);
});

test('modo desconhecido e origem sem HTTPS falham fechados', async () => {
  await assert.rejects(
    carregarConfiguracaoMkSolutions({ MK_MODO: 'ATIVO' }),
    /MODO_MK_INVALIDO/u,
  );
  await assert.rejects(
    carregarConfiguracaoMkSolutions({
      MK_MODO: 'SOMENTE_LEITURA',
      MK_ORIGEM: 'http://erp.example.invalid/',
    }),
    /ORIGEM_MK_INVALIDA/u,
  );
  await assert.rejects(
    carregarConfiguracaoMkSolutions({
      MK_MODO: 'SOMENTE_LEITURA',
      MK_ORIGEM: '://segredo-nao-pode-vazar@example.invalid',
    }),
    (erro) =>
      erro.message === 'ORIGEM_MK_INVALIDA' &&
      !String(erro.stack).includes('segredo-nao-pode-vazar'),
  );
});

test('runtime somente leitura recusa autenticação ampla antes de ler credenciais', async () => {
  await assert.rejects(
    carregarConfiguracaoMkSolutions({
      MK_CODIGO_SERVICO: '9999',
      MK_HOST_PERMITIDO: 'erp.example.invalid',
      MK_IDENTIFICACAO_SISTEMA: 'MK0',
      MK_MODO: 'SOMENTE_LEITURA',
      MK_ORIGEM: 'https://erp.example.invalid/',
      MK_TOKEN_CADASTRO_USUARIO_FILE: '/arquivo/que-nao-existe',
    }),
    /PRIVILEGIO_MK_EXCESSIVO/u,
  );
});

test('modo real é recusado no ambiente limitado a dados sanitizados', async () => {
  await assert.rejects(
    carregarConfiguracaoMkSolutions({
      DADOS_PERMITIDOS: 'sinteticos_ou_sanitizados',
      MK_MODO: 'SOMENTE_LEITURA',
    }),
    /DADOS_REAIS_MK_PROIBIDOS_NESTE_AMBIENTE/u,
  );
});

test('endereços internos e reservados são bloqueados antes da conexão', () => {
  for (const endereco of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.0.1',
    '169.254.1.1',
    '192.0.2.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
  ]) {
    assert.equal(enderecoRedePublica(endereco), false, endereco);
  }
  assert.equal(enderecoRedePublica('1.1.1.1'), true);
  assert.equal(enderecoRedePublica('2606:4700:4700::1111'), true);
});

test('lookup fixo respeita chamadas Node para um ou todos os endereços', async () => {
  const lookup = criarLookupFixo({ address: '1.1.1.1', family: 4 });
  const unico = await new Promise((resolver, rejeitar) => {
    lookup('erp.example.invalid', { all: false }, (erro, endereco, familia) => {
      if (erro !== null) rejeitar(erro);
      else resolver({ endereco, familia });
    });
  });
  assert.deepEqual(unico, { endereco: '1.1.1.1', familia: 4 });
  const todos = await new Promise((resolver, rejeitar) => {
    lookup('erp.example.invalid', { all: true }, (erro, enderecos) => {
      if (erro !== null) rejeitar(erro);
      else resolver(enderecos);
    });
  });
  assert.deepEqual(todos, [{ address: '1.1.1.1', family: 4 }]);
});

test('cliente HTTP limita concorrência e abre circuito após falhas', async () => {
  let ativas = 0;
  let maximo = 0;
  let execucoes = 0;
  const cliente = new ClienteHttpMkSolutions(
    { ...configuracao, limiteConcorrencia: 2 },
    async () => {
      execucoes += 1;
      ativas += 1;
      maximo = Math.max(maximo, ativas);
      await new Promise((resolver) => setTimeout(resolver, 5));
      ativas -= 1;
      return {};
    },
  );
  await Promise.all(
    Array.from({ length: 6 }, () =>
      cliente.obterJson('/mk/WSMKConsultaDoc.rule', {}),
    ),
  );
  assert.equal(maximo, 2);

  const falho = new ClienteHttpMkSolutions(configuracao, async () => {
    throw new Error('falha sintética');
  });
  for (let indice = 0; indice < 3; indice += 1) {
    await assert.rejects(
      falho.obterJson('/mk/WSMKConsultaDoc.rule', {}),
      /TRANSPORTE_MK_INDISPONIVEL/u,
    );
  }
  await assert.rejects(
    falho.obterJson('/mk/WSMKConsultaDoc.rule', {}),
    (erro) => erro.codigo === 'CIRCUITO_ABERTO',
  );
  assert.equal(execucoes, 6);
});

test('cliente HTTP aplica prazo absoluto e aborta o transporte', async () => {
  let abortado = false;
  const cliente = new ClienteHttpMkSolutions(
    { ...configuracao, tempoEsperaMs: 10 },
    async (_caminho, _parametros, sinal) =>
      new Promise((_resolver, rejeitar) => {
        sinal.addEventListener(
          'abort',
          () => {
            abortado = true;
            rejeitar(new Error('transporte sintético abortado'));
          },
          { once: true },
        );
      }),
  );
  await assert.rejects(
    cliente.obterJson('/mk/WSMKConsultaDoc.rule', {}),
    (erro) => erro.codigo === 'TEMPO_ESGOTADO',
  );
  assert.equal(abortado, true);
});

test('normaliza cliente, contrato, conexão cadastrada e fatura sem vazar campos externos', async () => {
  const transporte = criarTransporte();
  const adaptador = new AdaptadorConsultasMkSolutions(configuracao, transporte);
  const clientes = await adaptador.localizarClientes({ documento: '111.111.111-11' });
  const cliente = await adaptador.consultarCliente('101');
  const contratos = await adaptador.listarContratos('101');
  const conexoes = await adaptador.listarConexoes('101');
  const faturas = await adaptador.listarFaturas({
    clienteExternoId: '101',
    contratoExternoId: '202',
  });

  assert.equal(clientes.resultado, 'SUCESSO');
  assert.equal(clientes.itens[0].documentoMascarado.endsWith('1111'), true);
  assert.equal(cliente.resultado, 'SUCESSO');
  assert.equal(contratos.itens[0].contratoExternoId, '202');
  assert.deepEqual(conexoes.itens[0], {
    clienteExternoId: '101',
    conexaoExternaId: '303',
    contratoExternoId: '202',
    enderecoResumido: 'Endereço sintético',
    reduzida: false,
    situacaoCadastro: 'LIBERADA',
    tecnologia: 'Fibra sintética',
  });
  assert.deepEqual(faturas.itens[0], {
    clienteExternoId: '101',
    contratoExternoId: '202',
    faturaExternaId: '404',
    situacao: 'ABERTA',
    valorCentavos: 12345,
    vencimento: '2026-09-10',
  });
  const serializado = JSON.stringify({ cliente, clientes, conexoes, contratos, faturas });
  assert.equal(serializado.includes('usuario-sintetico'), false);
  assert.equal(serializado.includes('00:00:00:00:00:00'), false);
  assert.equal(serializado.includes('11111111111'), false);
});

test('fatura sempre envia cliente e contrato explícitos e complemento não ativa PDF', async () => {
  const transporte = criarTransporte();
  const adaptador = new AdaptadorConsultasMkSolutions(configuracao, transporte);
  const contexto = {
    clienteExternoId: '101',
    contratoExternoId: '202',
    faturaExternaId: '404',
  };
  const pagamento = await adaptador.obterDadosPagamentoFatura(contexto);
  const documento = await adaptador.obterDocumentoFatura(contexto);
  assert.equal(pagamento.resultado, 'SUCESSO');
  assert.equal(documento.codigo, 'CAPACIDADE_NAO_HABILITADA');
  const chamada = transporte.chamadas.find(({ caminho }) => caminho === '/mk/WSMKFaturas.rule');
  assert.equal(chamada.parametros.codigo_cliente, '101');
  assert.equal(chamada.parametros.codigo_contrato, '202');
  assert.equal('codigo_fatura' in chamada.parametros, false);
});

test('fatura exige vínculo exato e exclusivo entre cliente e contrato', async () => {
  const contexto = {
    clienteExternoId: '101',
    contratoExternoId: '202',
  };
  const contratoDivergente = criarTransporte({
    '/mk/WSMKContratosPorCliente.rule': {
      ...fixture.contratos,
      CodigoPessoa: 999,
    },
  });
  const adaptadorDivergente = new AdaptadorConsultasMkSolutions(
    configuracao,
    contratoDivergente,
  );
  assert.deepEqual(await adaptadorDivergente.listarFaturas(contexto), {
    codigo: 'ERP_INDISPONIVEL',
    resultado: 'INDISPONIVEL',
  });
  assert.equal(
    contratoDivergente.chamadas.some(
      ({ caminho }) => caminho === '/mk/WSMKFaturas.rule',
    ),
    false,
  );

  const faturaAmbigua = criarTransporte({
    '/mk/WSMKFaturas.rule': [
      {
        ...fixture.faturas[0],
        contratos: [
          ...fixture.faturas[0].contratos,
          {
            ...fixture.faturas[0].contratos[0],
            codigo_contrato: 999,
          },
        ],
      },
    ],
  });
  const adaptadorAmbiguo = new AdaptadorConsultasMkSolutions(
    configuracao,
    faturaAmbigua,
  );
  assert.deepEqual(await adaptadorAmbiguo.listarFaturas(contexto), {
    codigo: 'ERP_INDISPONIVEL',
    resultado: 'INDISPONIVEL',
  });
});

test('IDs duplicados e data impossível falham fechados', async () => {
  const contexto = {
    clienteExternoId: '101',
    contratoExternoId: '202',
  };
  const duplicada = criarTransporte({
    '/mk/WSMKFaturas.rule': [
      fixture.faturas[0],
      { ...fixture.faturas[0], valor_total_faturas: '999.99' },
    ],
  });
  assert.equal(
    (
      await new AdaptadorConsultasMkSolutions(
        configuracao,
        duplicada,
      ).listarFaturas(contexto)
    ).resultado,
    'INDISPONIVEL',
  );

  const dataInvalida = criarTransporte({
    '/mk/WSMKFaturas.rule': [
      { ...fixture.faturas[0], data_vencimento: '2026-02-31' },
    ],
  });
  assert.equal(
    (
      await new AdaptadorConsultasMkSolutions(
        configuracao,
        dataInvalida,
      ).listarFaturas(contexto)
    ).resultado,
    'INDISPONIVEL',
  );
});

test('identificador externo zero falha fechado', async () => {
  const transporte = criarTransporte({
    '/mk/WSMKContratosPorCliente.rule': {
      ...fixture.contratos,
      ContratosAtivos: [
        { ...fixture.contratos.ContratosAtivos[0], codcontrato: 0 },
      ],
    },
  });
  const resultado = await new AdaptadorConsultasMkSolutions(
    configuracao,
    transporte,
  ).listarContratos('101');
  assert.deepEqual(resultado, {
    codigo: 'ERP_INDISPONIVEL',
    resultado: 'INDISPONIVEL',
  });
});

test('autenticação concorrente é coalescida e token nunca aparece na saída', async () => {
  let autenticacoes = 0;
  const transporte = criarTransporte({
    '/mk/WSAutenticacao.rule': async () => {
      autenticacoes += 1;
      await new Promise((resolver) => setTimeout(resolver, 5));
      return fixture.autenticacao;
    },
  });
  const adaptador = new AdaptadorConsultasMkSolutions(configuracao, transporte);
  const resultados = await Promise.all([
    adaptador.listarContratos('101'),
    adaptador.listarConexoes('101'),
  ]);
  assert.equal(autenticacoes, 1);
  assert.equal(JSON.stringify(resultados).includes(fixture.autenticacao.Token), false);
});

test('erro externo não caracterizado não repete consulta nem autenticação', async () => {
  const transporte = criarTransporte({
    '/mk/WSMKContratosPorCliente.rule': {
      'Num. ERRO': '001',
      Mensagem: 'Falha sintética',
      status: 'ERRO',
    },
  });
  const adaptador = new AdaptadorConsultasMkSolutions(configuracao, transporte);
  const resultado = await adaptador.listarContratos('101');
  assert.equal(resultado.resultado, 'INDISPONIVEL');
  assert.equal(
    transporte.chamadas.filter(({ caminho }) => caminho === '/mk/WSAutenticacao.rule').length,
    1,
  );
  assert.equal(
    transporte.chamadas.filter(
      ({ caminho }) => caminho === '/mk/WSMKContratosPorCliente.rule',
    ).length,
    1,
  );
});

test('erro persistente não cria ciclo de autenticação', async () => {
  const erro = { 'Num. ERRO': '001', Mensagem: 'Falha sintética', status: 'ERRO' };
  const transporte = criarTransporte({ '/mk/WSMKContratosPorCliente.rule': erro });
  const adaptador = new AdaptadorConsultasMkSolutions(configuracao, transporte);
  assert.deepEqual(await adaptador.listarContratos('101'), {
    codigo: 'ERP_INDISPONIVEL',
    resultado: 'INDISPONIVEL',
  });
  assert.equal(
    transporte.chamadas.filter(({ caminho }) => caminho === '/mk/WSMKContratosPorCliente.rule').length,
    1,
  );
});

test('cliente HTTP permite somente as rotas caracterizadas de leitura', async () => {
  let chamadas = 0;
  const cliente = new ClienteHttpMkSolutions(configuracao, async () => {
    chamadas += 1;
    return {};
  });
  await assert.rejects(
    cliente.obterJson('/mk/WSMKNovoContrato.rule', {}),
    (erro) => erro.codigo === 'HTTP_INESPERADO',
  );
  assert.equal(chamadas, 0);
});

test('documento inexistente não renova token nem fabrica cliente', async () => {
  const transporte = criarTransporte({
    '/mk/WSMKConsultaDoc.rule': {
      'Num. ERRO': '003',
      Mensagem: 'Documento não localizado.',
      status: 'ERRO',
    },
  });
  const adaptador = new AdaptadorConsultasMkSolutions(configuracao, transporte);
  assert.deepEqual(await adaptador.localizarClientes({ documento: '11111111111' }), {
    itens: [],
    origem: 'TEMPO_REAL',
    resultado: 'SUCESSO',
  });
  assert.equal(
    transporte.chamadas.filter(({ caminho }) => caminho === '/mk/WSAutenticacao.rule').length,
    1,
  );
});

test('campo externo inesperado falha fechado sem propagar resposta', async () => {
  const transporte = criarTransporte({
    '/mk/WSMKContratosPorCliente.rule': {
      ...fixture.contratos,
      campo_novo: 'não caracterizado',
    },
  });
  const adaptador = new AdaptadorConsultasMkSolutions(configuracao, transporte);
  assert.deepEqual(await adaptador.listarContratos('101'), {
    codigo: 'ERP_INDISPONIVEL',
    resultado: 'INDISPONIVEL',
  });
});

test('critério não caracterizado fica indisponível sem chamar a rede', async () => {
  const transporte = criarTransporte();
  const adaptador = new AdaptadorConsultasMkSolutions(configuracao, transporte);
  assert.deepEqual(await adaptador.localizarClientes({ nome: 'Teste' }), {
    codigo: 'CAPACIDADE_NAO_HABILITADA',
    resultado: 'INDISPONIVEL',
  });
  assert.equal(transporte.chamadas.length, 0);
});
