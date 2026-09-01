import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroNotaInternaInvalida } from '../dist/notas-internas/erros-nota-interna.js';
import { ServicoNotasInternas } from '../dist/notas-internas/servico-notas-internas.js';
import { CompositorTimeline } from '../dist/timeline/compositor-timeline.js';

const ids = {
  atendimento: randomUUID(),
  autor: randomUUID(),
  conta: randomUUID(),
  conversa: randomUUID(),
  fila: randomUUID(),
  sessao: randomUUID(),
};

test('timeline mantém mensagem, nota, evento, formulário e separador distintos', () => {
  const base = (minuto, sequencia) => ({
    id: randomUUID(),
    ocorridoEm: new Date(`2026-09-01T10:0${minuto}:00Z`),
    sequenciaEvento: BigInt(sequencia),
  });
  const mensagem = {
    ...base(1, 2),
    contaWhatsAppOrigemId: ids.conta,
    direcao: 'ENTRADA',
    mensagemId: randomUUID(),
    tipo: 'MENSAGEM',
  };
  const nota = {
    ...base(2, 3),
    autorUsuarioId: ids.autor,
    conteudoProtegido: { texto: 'Somente equipe' },
    notaInternaId: randomUUID(),
    tipo: 'NOTA_INTERNA',
    visibilidade: 'SOMENTE_EQUIPE',
  };
  const evento = {
    ...base(3, 4),
    codigoEvento: 'ATENDIMENTO_TRANSFERIDO',
    eventoDominioId: randomUUID(),
    rotulo: 'Transferido',
    tipo: 'EVENTO_OPERACIONAL',
    visibilidade: 'SOMENTE_EQUIPE',
  };
  const formulario = {
    ...base(4, 5),
    acao: 'VER_FORMULARIO',
    camposMascarados: { documento: '***.***.***-**' },
    nomeFormulario: 'Identificação',
    submissaoFormularioId: randomUUID(),
    tipo: 'FORMULARIO',
    visibilidade: 'SOMENTE_EQUIPE',
  };
  const separador = {
    ...base(0, 1),
    atendimentoId: ids.atendimento,
    contaWhatsAppOrigemId: ids.conta,
    rotulo: 'Novo atendimento',
    tipo: 'SEPARADOR_ATENDIMENTO',
  };
  const itens = new CompositorTimeline().compor({
    eventosOperacionais: [evento],
    formularios: [formulario],
    mensagens: [mensagem],
    notasInternas: [nota],
    separadoresAtendimento: [separador],
  });
  assert.deepEqual(
    itens.map(({ tipo }) => tipo),
    ['SEPARADOR_ATENDIMENTO', 'MENSAGEM', 'NOTA_INTERNA', 'EVENTO_OPERACIONAL', 'FORMULARIO'],
  );
  assert.equal(itens[2].visibilidade, 'SOMENTE_EQUIPE');
  assert.equal(Object.isFrozen(itens), true);
});

function criarServico(contextoPermitido = true) {
  const chamadas = { auditoria: [], autorizacao: [], eventos: [], notas: [] };
  const repositorio = {
    acrescentar: async (nota) => chamadas.notas.push(nota),
    contextoPermiteNota: async () => contextoPermitido,
  };
  const autorizacao = {
    autorizar: async (entrada, verificar, transacao) => {
      chamadas.autorizacao.push(entrada);
      const recurso = await verificar({}, transacao);
      if (!recurso.acessivel || !recurso.estadoPermiteAcao) throw new Error('NEGADO');
    },
  };
  const eventos = { acrescentar: async (entrada) => chamadas.eventos.push(entrada) };
  const auditoria = { registrar: async (entrada) => chamadas.auditoria.push(entrada) };
  return {
    chamadas,
    servico: new ServicoNotasInternas(repositorio, autorizacao, eventos, auditoria),
  };
}

const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date('2099-01-01T00:00:00Z'),
  sessaoId: ids.sessao,
  usuarioId: ids.autor,
};

test('nota exige RBAC, pertence ao atendimento e nunca vaza conteúdo no evento/auditoria', async () => {
  const { chamadas, servico } = criarServico();
  const nota = await servico.adicionar(
    sessao,
    ids.conversa,
    ids.atendimento,
    ids.fila,
    '  Cliente pediu retorno interno.  ',
    {},
    () => new Date('2026-09-01T10:00:00Z'),
  );
  assert.equal(chamadas.autorizacao[0].permissao, 'ADICIONAR_NOTA_INTERNA');
  assert.equal(nota.visibilidade, 'SOMENTE_EQUIPE');
  assert.equal(nota.filaId, ids.fila);
  assert.equal(nota.conteudoProtegido.texto, 'Cliente pediu retorno interno.');
  assert.equal(chamadas.notas.length, 1);
  assert.equal(chamadas.eventos[0].tipo, 'NOTA_INTERNA_ADICIONADA');
  assert.equal(chamadas.eventos[0].dados.filaId, ids.fila);
  assert.doesNotMatch(JSON.stringify(chamadas.eventos), /Cliente pediu/);
  assert.doesNotMatch(JSON.stringify(chamadas.auditoria), /Cliente pediu/);
});

test('contexto alheio e conteúdo inválido não persistem nota', async () => {
  const negado = criarServico(false);
  await assert.rejects(
    negado.servico.adicionar(
      sessao,
      ids.conversa,
      ids.atendimento,
      ids.fila,
      'Nota válida',
      {},
    ),
    /NEGADO/,
  );
  assert.equal(negado.chamadas.notas.length, 0);

  const invalido = criarServico();
  await assert.rejects(
    invalido.servico.adicionar(
      sessao,
      ids.conversa,
      ids.atendimento,
      ids.fila,
      '   ',
      {},
    ),
    ErroNotaInternaInvalida,
  );
  assert.equal(invalido.chamadas.autorizacao.length, 0);
});
