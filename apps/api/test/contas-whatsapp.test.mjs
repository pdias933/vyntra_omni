import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroContaWhatsAppDuplicada,
  ErroContaWhatsAppInvalida,
} from '../dist/contas-whatsapp/erros-conta-whatsapp.js';
import { ServicoContasWhatsApp } from '../dist/contas-whatsapp/servico-contas-whatsapp.js';

const agora = new Date('2026-08-31T18:00:00.000Z');
const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2026-08-31T19:00:00.000Z'),
  sessaoId: randomUUID(),
  usuarioId: randomUUID(),
};

function entrada(sobrescritas = {}) {
  return {
    identificadorCanalExterno: 'canal-sintetico-001',
    nomeExibicao: 'WhatsApp Suporte',
    portfolioEmpresarialExternoId: 'portfolio-sintetico-001',
    telefoneExibicaoE164: '+551100000001',
    ...sobrescritas,
  };
}

function criarCenario(sobrescritas = {}) {
  const chamadas = { auditoria: [], autorizacao: [], criacoes: [], ordem: [] };
  const repositorio = {
    criar: async (conta, transacao) => {
      chamadas.ordem.push('CRIAR');
      chamadas.criacoes.push([conta, transacao]);
      return sobrescritas.criada ?? true;
    },
    listar: async () => [],
    obterPorId: async () => undefined,
  };
  const autorizacao = {
    autorizar: async (pedido, verificar, transacao) => {
      chamadas.ordem.push('AUTORIZAR');
      chamadas.autorizacao.push([pedido, transacao]);
      if (sobrescritas.erroAutorizacao !== undefined) {
        throw sobrescritas.erroAutorizacao;
      }
      return verificar({}, transacao);
    },
  };
  const auditoria = {
    registrar: async (...argumentos) => {
      chamadas.ordem.push('AUDITAR');
      chamadas.auditoria.push(argumentos);
    },
  };
  return {
    chamadas,
    servico: new ServicoContasWhatsApp(
      repositorio,
      autorizacao,
      auditoria,
    ),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('cadastra conta inativa com autorização e auditoria na mesma transação', async () => {
  const cenario = criarCenario();
  const conta = await cenario.servico.cadastrar(
    sessao,
    entrada(),
    cenario.transacao,
    () => agora,
  );

  assert.match(conta.id, /^[0-9a-f-]{36}$/);
  assert.equal(conta.estado, 'INATIVA');
  assert.equal(conta.versao, 1);
  assert.deepEqual(cenario.chamadas.ordem, [
    'AUTORIZAR',
    'CRIAR',
    'AUDITAR',
  ]);
  assert.equal(
    cenario.chamadas.autorizacao[0][0].permissao,
    'ADMINISTRAR_INTEGRACOES',
  );
  assert.equal(cenario.chamadas.criacoes[0][1], cenario.transacao);
  assert.equal(cenario.chamadas.auditoria[0][1], cenario.transacao);
});

test('permite múltiplas contas com origens internas distintas', async () => {
  const cenario = criarCenario();
  const primeira = await cenario.servico.cadastrar(
    sessao,
    entrada(),
    cenario.transacao,
    () => agora,
  );
  const segunda = await cenario.servico.cadastrar(
    sessao,
    entrada({
      identificadorCanalExterno: 'canal-sintetico-002',
      nomeExibicao: 'WhatsApp Comercial',
      telefoneExibicaoE164: '+551100000002',
    }),
    cenario.transacao,
    () => agora,
  );

  assert.notEqual(primeira.id, segunda.id);
  assert.deepEqual(
    cenario.chamadas.criacoes.map(([conta]) => conta.id),
    [primeira.id, segunda.id],
  );
});

test('normaliza espaços da identidade textual antes da persistência', async () => {
  const cenario = criarCenario();
  const conta = await cenario.servico.cadastrar(
    sessao,
    entrada({
      identificadorCanalExterno: '  canal-sintetico-001  ',
      nomeExibicao: '  WhatsApp Suporte  ',
      portfolioEmpresarialExternoId: '  portfolio-sintetico-001  ',
    }),
    cenario.transacao,
    () => agora,
  );

  assert.equal(conta.identificadorCanalExterno, 'canal-sintetico-001');
  assert.equal(conta.nomeExibicao, 'WhatsApp Suporte');
  assert.equal(
    conta.portfolioEmpresarialExternoId,
    'portfolio-sintetico-001',
  );
});

test('credencial adicional recebida em runtime não atravessa para domínio ou auditoria', async () => {
  const cenario = criarCenario();
  await cenario.servico.cadastrar(
    sessao,
    { ...entrada(), tokenAcesso: 'valor-que-nao-pode-propagar' },
    cenario.transacao,
    () => agora,
  );
  const persistida = JSON.stringify(cenario.chamadas.criacoes[0][0]);
  const auditada = JSON.stringify(cenario.chamadas.auditoria[0][0]);
  assert.ok(!persistida.includes('tokenAcesso'));
  assert.ok(!persistida.includes('valor-que-nao-pode-propagar'));
  assert.ok(!auditada.includes('tokenAcesso'));
  assert.ok(!auditada.includes('valor-que-nao-pode-propagar'));
});

test('identidade externa duplicada retorna erro canônico e não audita', async () => {
  const cenario = criarCenario({ criada: false });
  await assert.rejects(
    cenario.servico.cadastrar(
      sessao,
      entrada(),
      cenario.transacao,
      () => agora,
    ),
    ErroContaWhatsAppDuplicada,
  );
  assert.equal(cenario.chamadas.auditoria.length, 0);
});

test('entrada inválida falha antes de autorização e persistência', async () => {
  const cenario = criarCenario();
  await assert.rejects(
    cenario.servico.cadastrar(
      sessao,
      entrada({ telefoneExibicaoE164: 'telefone-invalido' }),
      cenario.transacao,
      () => agora,
    ),
    ErroContaWhatsAppInvalida,
  );
  assert.equal(cenario.chamadas.autorizacao.length, 0);
  assert.equal(cenario.chamadas.criacoes.length, 0);
});

test('negação de autorização impede persistência', async () => {
  const cenario = criarCenario({ erroAutorizacao: new Error('NEGADO') });
  await assert.rejects(
    cenario.servico.cadastrar(
      sessao,
      entrada(),
      cenario.transacao,
      () => agora,
    ),
  );
  assert.equal(cenario.chamadas.criacoes.length, 0);
  assert.equal(cenario.chamadas.auditoria.length, 0);
});
