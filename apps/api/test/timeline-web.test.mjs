import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroPermissaoNegada } from '../dist/autorizacao/erros-autorizacao.js';
import { ServicoTimelineWeb } from '../dist/console-web/servico-timeline-web.js';

const ids = {
  atendimento: randomUUID(),
  conta: randomUUID(),
  conversa: randomUUID(),
  fila: randomUUID(),
  filaNegada: randomUUID(),
  mensagem: randomUUID(),
  sessao: randomUUID(),
  usuario: randomUUID(),
};
const sessao = { estado: 'ATIVA', expiraEm: new Date('2099-01-01T00:00:00Z'), sessaoId: ids.sessao, usuarioId: ids.usuario };

function cenarioTimeline() {
  let autorizouAtendimento = false;
  const consultasConteudo = [];
  const transacao = {
    atendimento: {
      findMany: async () => [{ contaWhatsAppOrigem: { nomeExibicao: 'Suporte' }, encerradoEm: null, filaAtualId: ids.fila, id: ids.atendimento, iniciadoEm: new Date('2026-09-01T10:00:00Z') }],
      findUnique: async () => ({ conversaId: ids.conversa, filaAtualId: ids.fila }),
    },
    eventoDominio: { findMany: async (entrada) => { consultasConteudo.push(entrada); return []; } },
    fila: { findMany: async () => [{ id: ids.fila }, { id: ids.filaNegada }] },
    marcadorLeituraConversaUsuario: { findUnique: async () => null },
    mensagem: {
      findMany: async (entrada) => {
        assert.equal(autorizouAtendimento, true);
        consultasConteudo.push(entrada);
        return [{ atendimentoId: ids.atendimento, contaWhatsApp: { nomeExibicao: 'Suporte' }, conteudoProtegido: { texto: 'Olá' }, direcao: 'ENTRADA', estadoSaida: null, id: ids.mensagem, reacoes: [], recebidaServidorEm: new Date('2026-09-01T10:01:00Z'), respondeAMensagem: null, submissaoFormulario: null, tipo: 'TEXTO' }];
      },
    },
    notaInterna: { findMany: async (entrada) => { consultasConteudo.push(entrada); return []; } },
  };
  const autorizacao = {
    autorizar: async (entrada) => {
      if (entrada.permissao === 'VISUALIZAR_HISTORICO_TRANSVERSAL' || entrada.permissao === 'VISUALIZAR_NOTAS_TRANSVERSAIS') throw new ErroPermissaoNegada();
      if (entrada.filaId === ids.filaNegada) throw new ErroPermissaoNegada();
      if (entrada.recurso.tipo === 'ATENDIMENTO') autorizouAtendimento = true;
    },
  };
  const prisma = { executarLeituraConsistente: async (operacao) => operacao(transacao) };
  return { consultasConteudo, servico: new ServicoTimelineWeb(prisma, autorizacao) };
}

test('timeline só consulta conteúdo após autorizar atendimento e filas', async () => {
  const cenario = cenarioTimeline();
  const pagina = await cenario.servico.obter(sessao, ids.atendimento);
  assert.equal(pagina.itens.some((item) => item.texto === 'Olá'), true);
  assert.equal(pagina.marcador.versao, 0);
  const consultaNota = cenario.consultasConteudo.find((entrada) => entrada.where.filaId !== undefined);
  assert.deepEqual(consultaNota.where.filaId.in, [ids.fila]);
});

test('marcador pessoal usa versão esperada e conflito não é ocultado', async () => {
  const ordem = [];
  const criar = (count) => ({
    atendimento: { findUnique: async () => ({ conversaId: ids.conversa, filaAtualId: ids.fila }) },
    marcadorLeituraConversaUsuario: { updateMany: async () => { ordem.push('gravar'); return { count }; } },
  });
  const autorizacao = { autorizar: async () => { ordem.push('autorizar'); } };
  const servico = new ServicoTimelineWeb({}, autorizacao);
  assert.equal(await servico.marcarNaoLida(sessao, ids.atendimento, 3, criar(1)), 4);
  assert.deepEqual(ordem, ['autorizar', 'gravar']);
  await assert.rejects(() => servico.marcarNaoLida(sessao, ids.atendimento, 3, criar(0)), /CONFLITO_VERSAO_MARCADOR/);
});
