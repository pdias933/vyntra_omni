import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  ErroContaWhatsAppIndisponivel,
  ErroObservacaoIdentidadeInvalida,
} from '../dist/contatos/erros-contato.js';
import { ServicoIdentidadeWhatsApp } from '../dist/contatos/servico-identidade-whatsapp.js';

const agora = new Date('2026-08-31T22:00:00.000Z');
const conta = {
  atualizadaEm: agora,
  criadaEm: agora,
  estado: 'ATIVA',
  id: '33333333-3333-4333-8333-333333333331',
  identificadorCanalExterno: 'canal-sintetico',
  nomeExibicao: 'WhatsApp Sintetico',
  portfolioEmpresarialExternoId: 'portfolio-sintetico',
  versao: 1,
};

function entrada(sobrescritas = {}) {
  return {
    contaWhatsAppId: conta.id,
    identificadorExternoEstavel: 'identidade-estavel-sintetica',
    ...sobrescritas,
  };
}

function cenario(sobrescritas = {}) {
  const chamadas = { auditoria: [], bloqueios: [], criacoes: [], consultas: [] };
  const contatos = {
    bloquearIdentidade: async (...argumentos) => chamadas.bloqueios.push(argumentos),
    criar: async (...argumentos) => chamadas.criacoes.push(argumentos),
    obterPorIdentificadorEstavel: async (...argumentos) => {
      chamadas.consultas.push(argumentos);
      return sobrescritas.existente;
    },
  };
  const contas = {
    obterPorId: async () =>
      Object.hasOwn(sobrescritas, 'conta') ? sobrescritas.conta : conta,
  };
  const auditoria = {
    registrar: async (...argumentos) => chamadas.auditoria.push(argumentos),
  };
  return {
    chamadas,
    servico: new ServicoIdentidadeWhatsApp(contatos, contas, auditoria),
    transacao: { id: 'transacao-sintetica' },
  };
}

test('cria contato e identidade pela chave estável do portfólio', async () => {
  const caso = cenario();
  const resultado = await caso.servico.resolver(
    entrada({ nomePerfil: '  Pessoa Sintética  ' }),
    caso.transacao,
    () => agora,
  );
  assert.equal(resultado.criada, true);
  assert.equal(resultado.contato.nomeExibicao, 'Pessoa Sintética');
  assert.equal(resultado.identidade.contatoId, resultado.contato.id);
  assert.equal(
    resultado.identidade.portfolioEmpresarialExternoId,
    conta.portfolioEmpresarialExternoId,
  );
  assert.equal(caso.chamadas.bloqueios.length, 1);
  assert.equal(caso.chamadas.criacoes[0][2], caso.transacao);
  assert.equal(caso.chamadas.auditoria[0][1], caso.transacao);
});

test('username e telefone são opcionais e não impedem resolver contato', async () => {
  const caso = cenario();
  const resultado = await caso.servico.resolver(
    entrada(),
    caso.transacao,
    () => agora,
  );
  assert.equal(resultado.contato.nomeExibicao, undefined);
  assert.equal(resultado.identidade.nomeUsuario, undefined);
  assert.equal(resultado.identidade.telefoneE164, undefined);
});

test('reobservação devolve o mesmo contato sem criar ou auditar novamente', async () => {
  const contatoId = randomUUID();
  const existente = {
    contato: {
      atualizadoEm: agora,
      criadoEm: agora,
      estado: 'NORMAL',
      id: contatoId,
    },
    identidade: {
      atualizadaEm: agora,
      contaWhatsAppUltimaObservacaoId: conta.id,
      contatoId,
      criadaEm: agora,
      id: randomUUID(),
      identificadorExternoEstavel: 'identidade-estavel-sintetica',
      portfolioEmpresarialExternoId: 'portfolio-sintetico',
    },
  };
  const caso = cenario({ existente });
  const resultado = await caso.servico.resolver(entrada(), caso.transacao);
  assert.equal(resultado.criada, false);
  assert.equal(resultado.contato.id, existente.contato.id);
  assert.equal(caso.chamadas.criacoes.length, 0);
  assert.equal(caso.chamadas.auditoria.length, 0);
});

test('auditoria não recebe identificador estável, username ou telefone', async () => {
  const caso = cenario();
  await caso.servico.resolver(
    entrada({ nomeUsuario: 'usuario-sintetico', telefoneE164: '+551100000231' }),
    caso.transacao,
    () => agora,
  );
  const auditado = JSON.stringify(caso.chamadas.auditoria[0][0]);
  assert.ok(!auditado.includes('identidade-estavel-sintetica'));
  assert.ok(!auditado.includes('usuario-sintetico'));
  assert.ok(!auditado.includes('+551100000231'));
});

test('conta ausente ou inativa falha fechada antes de criar contato', async () => {
  for (const indisponivel of [undefined, { ...conta, estado: 'INATIVA' }]) {
    const caso = cenario({ conta: indisponivel });
    await assert.rejects(
      caso.servico.resolver(entrada(), caso.transacao),
      ErroContaWhatsAppIndisponivel,
    );
    assert.equal(caso.chamadas.criacoes.length, 0);
  }
});

test('telefone inválido falha antes de consultar conta ou identidade', async () => {
  const caso = cenario();
  await assert.rejects(
    caso.servico.resolver(
      entrada({ telefoneE164: 'telefone-invalido' }),
      caso.transacao,
    ),
    ErroObservacaoIdentidadeInvalida,
  );
  assert.equal(caso.chamadas.bloqueios.length, 0);
});
