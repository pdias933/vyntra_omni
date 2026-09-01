import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { PlanejadorRelacoesMensagem } from '../dist/mensagens/relacoes-mensagem.js';
import { projetarCapacidadesRelacoesMetaCloud } from '../dist/mensageria/adaptadores/meta-cloud/capacidades-relacoes-meta-cloud.js';

const conversaId = randomUUID();
const contaWhatsAppId = randomUUID();
const origem = { conversaId, contaWhatsAppId };
const alvo = {
  contaWhatsAppId,
  conversaId,
  id: randomUUID(),
  identificadorExternoMensagem: 'wamid.ALVO',
  resumoProtegido: 'Mensagem original do cliente',
};
const habilitadas = { previaUrl: true, reacaoNativa: true, respostaNativa: true };

test('resposta citada preserva relação real e contexto externo quando habilitado', () => {
  const plano = new PlanejadorRelacoesMensagem().planejarResposta(origem, alvo, habilitadas);
  assert.deepEqual(plano, {
    identificadorContextoExterno: 'wamid.ALVO',
    modoCanal: 'CONTEXTO_NATIVO',
    previaProtegida: 'Mensagem original do cliente',
    respondeAMensagemId: alvo.id,
  });
});

test('capacidade ausente produz fallback explícito sem inventar contexto externo', () => {
  const planejador = new PlanejadorRelacoesMensagem();
  const resposta = planejador.planejarResposta(origem, alvo, {
    previaUrl: false, reacaoNativa: false, respostaNativa: false,
  });
  const reacao = planejador.planejarReacao(origem, alvo, {
    previaUrl: false, reacaoNativa: false, respostaNativa: false,
  });
  assert.equal(resposta.modoCanal, 'FALLBACK_TEXTO');
  assert.equal('identificadorContextoExterno' in resposta, false);
  assert.equal(reacao.modoCanal, 'SOMENTE_INTERNO');
  assert.equal('identificadorAlvoExterno' in reacao, false);
  assert.equal(planejador.permitirPreviaUrl({ previaUrl: false, reacaoNativa: false, respostaNativa: false }), false);
});

test('adapter só habilita capacidades realmente observadas e domínio recusa contexto cruzado', () => {
  const capacidades = projetarCapacidadesRelacoesMetaCloud({
    capacidades: { flows: 'NAO_OBSERVADA', reactions: 'HABILITADA', replyContext: 'DESABILITADA', urlPreview: 'NAO_OBSERVADA' },
    graphApiVersion: 'v25.0', identificacao: { bsuid: 'HABILITADA', telefoneOpcional: true, username: 'NAO_OBSERVADA' },
    limites: { throughputMensagensPorSegundo: 80 }, observadaEm: '2026-09-01T00:00:00Z', origemEvidencia: 'CONTA_REAL',
  });
  assert.deepEqual(capacidades, { previaUrl: false, reacaoNativa: true, respostaNativa: false });
  assert.throws(
    () => new PlanejadorRelacoesMensagem().planejarResposta(origem, { ...alvo, conversaId: randomUUID() }, habilitadas),
    /RELACAO_MENSAGEM_INVALIDA/u,
  );
});
