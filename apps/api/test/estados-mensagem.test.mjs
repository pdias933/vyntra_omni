import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ServicoEstadosMensagem } from '../dist/mensagens/servico-estados-mensagem.js';
import { normalizarEstadoMetaCloud } from '../dist/mensageria/adaptadores/meta-cloud/estados-meta-cloud.js';

const ids = { atendimento: randomUUID(), conta: randomUUID(), conversa: randomUUID(), mensagem: randomUUID() };
const enviadaEm = new Date('2026-09-01T12:00:00Z');

function mensagemEnviada() {
  return {
    atendimentoId: ids.atendimento, canceladaEm: undefined, codigoFalha: undefined,
    contatoRemetenteId: undefined, contaWhatsAppId: ids.conta, conteudoHash: 'a'.repeat(64),
    conteudoProtegido: { texto: 'Olá' }, conversaId: ids.conversa, criadaDispositivoEm: undefined,
    direcao: 'SAIDA', entregueEm: undefined, enviadaEm, estadoSaida: 'ENVIADA', falhouEm: undefined,
    id: ids.mensagem, identificadorExternoMensagem: 'wamid.PR046', lidaEm: undefined,
    mensagemClienteId: randomUUID(), proximaTentativaEm: undefined, recebidaServidorEm: enviadaEm,
    tentativasEnvio: 1, tipo: 'TEXTO', usuarioRemetenteId: randomUUID(), versao: 3,
  };
}

function criarServico() {
  const estado = { eventos: [], mensagem: mensagemEnviada(), recepcoes: new Map() };
  const repositorio = {
    atualizarMensagem: async (mensagem, versao) => {
      if (estado.mensagem.versao !== versao) return false;
      estado.mensagem = mensagem;
      return true;
    },
    marcarAplicado: async (id, aplicadoEm) => {
      estado.recepcoes.set(id, { ...estado.recepcoes.get(id), aplicado: true, aplicadoEm });
    },
    obterMensagem: async () => estado.mensagem,
    registrarRecepcao: async (recepcao) => {
      if ([...estado.recepcoes.values()].some((item) => item.identificadorEventoExterno === recepcao.identificadorEventoExterno)) return false;
      estado.recepcoes.set(recepcao.id, recepcao);
      return true;
    },
  };
  const eventos = { acrescentar: async (evento) => estado.eventos.push(evento) };
  return { estado, servico: new ServicoEstadosMensagem(repositorio, eventos) };
}

test('leitura fora de ordem infere entrega e evento atrasado não regride nem emite domínio', async () => {
  const { estado, servico } = criarServico();
  const lida = normalizarEstadoMetaCloud(ids.conta, { id: 'wamid.PR046', status: 'read', timestamp: '1788264120' });
  assert.equal((await servico.aplicar(lida, {})).resultado, 'APLICADO');
  assert.equal(estado.mensagem.estadoSaida, 'LIDA');
  assert.equal(estado.mensagem.entregueEm.toISOString(), estado.mensagem.lidaEm.toISOString());

  const atrasada = normalizarEstadoMetaCloud(ids.conta, { id: 'wamid.PR046', status: 'delivered', timestamp: '1788264060' });
  assert.equal((await servico.aplicar(atrasada, {})).resultado, 'IGNORADO_POR_ESTADO');
  assert.equal(estado.mensagem.estadoSaida, 'LIDA');
  assert.equal(estado.eventos.length, 1);
});

test('repetição do mesmo recibo é deduplicada e falha tardia não vence entrega', async () => {
  const { estado, servico } = criarServico();
  const entregue = normalizarEstadoMetaCloud(ids.conta, { id: 'wamid.PR046', status: 'delivered', timestamp: '1788264060' });
  assert.equal((await servico.aplicar(entregue, {})).resultado, 'APLICADO');
  assert.equal((await servico.aplicar(entregue, {})).resultado, 'DUPLICADO');
  const falha = normalizarEstadoMetaCloud(ids.conta, { errors: [{ code: 131026 }], id: 'wamid.PR046', status: 'failed', timestamp: '1788264120' });
  assert.equal((await servico.aplicar(falha, {})).resultado, 'IGNORADO_POR_ESTADO');
  assert.equal(estado.mensagem.estadoSaida, 'ENTREGUE');
  assert.equal(estado.eventos.length, 1);
});
