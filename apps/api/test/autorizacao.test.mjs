import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ErroNaoAutenticado,
  ErroPermissaoNegada,
} from '../dist/autorizacao/erros-autorizacao.js';
import {
  MATRIZ_PERMISSOES_BASE,
  PERMISSOES_SEMPRE_EXPLICITAS,
} from '../dist/autorizacao/matriz-permissoes.js';
import { RepositorioAutorizacaoPrisma } from '../dist/autorizacao/repositorio-autorizacao-prisma.js';
import { ServicoAutorizacao } from '../dist/autorizacao/servico-autorizacao.js';

const usuarioId = '10000000-0000-4000-8000-000000000001';
const sessaoId = '20000000-0000-4000-8000-000000000002';
const filaId = '30000000-0000-4000-8000-000000000003';
const recursoId = '40000000-0000-4000-8000-000000000004';

function contexto(sobrescrever = {}) {
  return {
    acessoFilaAtivo: true,
    ajustes: [],
    filaAtiva: true,
    papelBase: 'ATENDENTE',
    perfilAtivo: true,
    usuarioAtivo: true,
    ...sobrescrever,
  };
}

function entrada(sobrescrever = {}) {
  return {
    filaId,
    permissao: 'VISUALIZAR_FILA',
    recurso: { id: recursoId, tipo: 'FILA' },
    sessao: {
      estado: 'ATIVA',
      expiraEm: new Date(Date.now() + 60_000),
      sessaoId,
      usuarioId,
    },
    ...sobrescrever,
  };
}

function criarServico(contextoRetornado) {
  const chamadas = [];
  const repositorio = {
    obterContexto: async (...argumentos) => {
      chamadas.push(argumentos);
      return typeof contextoRetornado === 'function'
        ? contextoRetornado(...argumentos)
        : contextoRetornado;
    },
  };
  return { chamadas, servico: new ServicoAutorizacao(repositorio) };
}

const recursoPermitido = async () => ({
  acessivel: true,
  estadoPermiteAcao: true,
});

async function capturarNegacao(operacao) {
  try {
    await operacao();
  } catch (erro) {
    return {
      codigo: erro.codigo,
      message: erro.message,
      name: erro.name,
    };
  }
  assert.fail('A autorização deveria ter sido negada.');
}

test('aplica matriz conservadora dos três papéis base', () => {
  assert.ok(MATRIZ_PERMISSOES_BASE.ADMINISTRADOR.includes('ADMINISTRAR_USUARIOS'));
  assert.ok(MATRIZ_PERMISSOES_BASE.SUPERVISOR.includes('ASSUMIR_ATENDIMENTO'));
  assert.ok(MATRIZ_PERMISSOES_BASE.ATENDENTE.includes('RESGATAR_ATENDIMENTO'));

  for (const papel of ['ADMINISTRADOR', 'SUPERVISOR', 'ATENDENTE']) {
    for (const permissao of PERMISSOES_SEMPRE_EXPLICITAS) {
      assert.ok(!MATRIZ_PERMISSOES_BASE[papel].includes(permissao));
    }
  }
});

test('administrador acessa fila ativa sem vínculo, mas não recebe dado sensível', async () => {
  const cenario = criarServico(
    contexto({ acessoFilaAtivo: false, papelBase: 'ADMINISTRADOR' }),
  );
  const autorizada = await cenario.servico.autorizar(
    entrada(),
    recursoPermitido,
  );

  assert.equal(autorizada.papelBase, 'ADMINISTRADOR');
  await assert.rejects(
    cenario.servico.autorizar(
      entrada({ filaId: undefined, permissao: 'VISUALIZAR_DADO_SENSIVEL' }),
      recursoPermitido,
    ),
    ErroPermissaoNegada,
  );
});

test('supervisor e atendente exigem vínculo ativo para permissão de fila', async () => {
  const permitido = criarServico(contexto({ papelBase: 'SUPERVISOR' }));
  const negado = criarServico(
    contexto({ acessoFilaAtivo: false, papelBase: 'SUPERVISOR' }),
  );

  await permitido.servico.autorizar(
    entrada({ permissao: 'ASSUMIR_ATENDIMENTO' }),
    recursoPermitido,
  );
  await assert.rejects(
    negado.servico.autorizar(
      entrada({ permissao: 'ASSUMIR_ATENDIMENTO' }),
      recursoPermitido,
    ),
    ErroPermissaoNegada,
  );
});

test('NEGAR prevalece sobre a base e CONCEDER libera capacidade ausente', async () => {
  const negar = criarServico(
    contexto({
      ajustes: [{ codigo: 'RESGATAR_ATENDIMENTO', efeito: 'NEGAR' }],
    }),
  );
  const conceder = criarServico(
    contexto({
      ajustes: [{ codigo: 'CONSULTAR_FINANCEIRO', efeito: 'CONCEDER' }],
    }),
  );

  await assert.rejects(
    negar.servico.autorizar(
      entrada({ permissao: 'RESGATAR_ATENDIMENTO' }),
      recursoPermitido,
    ),
    ErroPermissaoNegada,
  );
  const autorizada = await conceder.servico.autorizar(
    entrada({ permissao: 'CONSULTAR_FINANCEIRO' }),
    recursoPermitido,
  );
  assert.equal(autorizada.permissao, 'CONSULTAR_FINANCEIRO');
});

test('sessão revogada ou expirada falha antes de consultar usuário/recurso', async () => {
  const cenario = criarServico(contexto());
  let recursoConsultado = false;
  const verificar = async () => {
    recursoConsultado = true;
    return { acessivel: true, estadoPermiteAcao: true };
  };

  await assert.rejects(
    cenario.servico.autorizar(
      entrada({ sessao: { ...entrada().sessao, estado: 'REVOGADA' } }),
      verificar,
    ),
    ErroNaoAutenticado,
  );
  await assert.rejects(
    cenario.servico.autorizar(
      entrada({
        sessao: { ...entrada().sessao, expiraEm: new Date(Date.now() - 1) },
      }),
      verificar,
    ),
    ErroNaoAutenticado,
  );
  assert.equal(cenario.chamadas.length, 0);
  assert.equal(recursoConsultado, false);
});

test('usuário/perfil inativo e fila inativa negam antes de consultar recurso', async () => {
  for (const contextoNegado of [
    undefined,
    contexto({ usuarioAtivo: false }),
    contexto({ perfilAtivo: false }),
    contexto({ filaAtiva: false }),
  ]) {
    const cenario = criarServico(contextoNegado);
    let recursoConsultado = false;
    await assert.rejects(
      cenario.servico.autorizar(entrada(), async () => {
        recursoConsultado = true;
        return { acessivel: true, estadoPermiteAcao: true };
      }),
      ErroPermissaoNegada,
    );
    assert.equal(recursoConsultado, false);
  }
});

test('UUID inexistente, outra fila, recurso inacessível e estado inválido não vazam motivo', async () => {
  const usuarioInexistente = criarServico(undefined);
  const outraFila = criarServico(contexto({ acessoFilaAtivo: false }));
  const recursoInacessivel = criarServico(contexto());
  const estadoInvalido = criarServico(contexto());

  const negacoes = await Promise.all([
    capturarNegacao(() =>
      usuarioInexistente.servico.autorizar(entrada(), recursoPermitido),
    ),
    capturarNegacao(() =>
      outraFila.servico.autorizar(entrada(), recursoPermitido),
    ),
    capturarNegacao(() =>
      recursoInacessivel.servico.autorizar(entrada(), async () => ({
        acessivel: false,
        estadoPermiteAcao: false,
      })),
    ),
    capturarNegacao(() =>
      estadoInvalido.servico.autorizar(entrada(), async () => ({
        acessivel: true,
        estadoPermiteAcao: false,
      })),
    ),
  ]);

  for (const negacao of negacoes.slice(1)) {
    assert.deepEqual(negacao, negacoes[0]);
  }
  assert.deepEqual(negacoes[0], {
    codigo: 'PERMISSAO_NEGADA',
    message: 'PERMISSAO_NEGADA',
    name: 'ErroPermissaoNegada',
  });
});

test('propaga a mesma transação para contexto e verificação do recurso', async () => {
  const cenario = criarServico(contexto());
  const transacao = { id: 'transacao-teste' };
  let transacaoRecurso;

  await cenario.servico.autorizar(
    entrada(),
    async (_autorizacao, transacaoRecebida) => {
      transacaoRecurso = transacaoRecebida;
      return { acessivel: true, estadoPermiteAcao: true };
    },
    transacao,
  );

  assert.equal(cenario.chamadas[0][2], transacao);
  assert.equal(transacaoRecurso, transacao);
});

test('repositório Prisma projeta somente o contexto da fila solicitada', async () => {
  const consultas = [];
  const cliente = {
    acessoUsuarioFila: {
      findUnique: async (consulta) => {
        consultas.push(['acesso', consulta]);
        return { estado: 'ATIVO' };
      },
    },
    fila: {
      findUnique: async (consulta) => {
        consultas.push(['fila', consulta]);
        return { estado: 'ATIVA' };
      },
    },
    usuario: {
      findUnique: async (consulta) => {
        consultas.push(['usuario', consulta]);
        return {
          estado: 'ATIVO',
          perfil: {
            estado: 'ATIVO',
            papelBase: 'ATENDENTE',
            permissoes: [
              { codigo: 'CONSULTAR_FINANCEIRO', efeito: 'CONCEDER' },
            ],
          },
        };
      },
    },
  };
  const repositorio = new RepositorioAutorizacaoPrisma({
    obterCliente: async () => cliente,
  });

  const obtido = await repositorio.obterContexto(usuarioId, filaId);

  assert.equal(consultas.length, 3);
  assert.deepEqual(
    consultas.map(([tipo]) => tipo).sort(),
    ['acesso', 'fila', 'usuario'],
  );
  assert.deepEqual(obtido, {
    acessoFilaAtivo: true,
    ajustes: [{ codigo: 'CONSULTAR_FINANCEIRO', efeito: 'CONCEDER' }],
    filaAtiva: true,
    papelBase: 'ATENDENTE',
    perfilAtivo: true,
    usuarioAtivo: true,
  });
  assert.deepEqual(consultas.find(([tipo]) => tipo === 'acesso')[1].where, {
    usuarioId_filaId: { filaId, usuarioId },
  });
});
