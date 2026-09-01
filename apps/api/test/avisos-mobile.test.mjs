import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { AdaptadorPushSimulado } from '../dist/avisos-mobile/adaptadores/push/adaptador-push-simulado.js';
import { CompositorAvisoMobile } from '../dist/avisos-mobile/compositor-aviso-mobile.js';
import { ServicoAvisosMobile } from '../dist/avisos-mobile/servico-avisos-mobile.js';

const dispositivoId = randomUUID();
const atendimentoId = randomUUID();
const conversaId = randomUUID();

function evento(sobrescrita = {}) {
  return {
    atendimentoId,
    audiencia: 'PUSH',
    chaveAgrupamento: conversaId,
    conversaId,
    sequenciaEvento: '57',
    tipoNotificacao: 'NOVA_MENSAGEM',
    ...sobrescrita,
  };
}

test('compõe texto genérico e navegação mínima sem conteúdo protegido', () => {
  const aviso = new CompositorAvisoMobile().compor(
    dispositivoId,
    evento(),
  );
  assert.deepEqual(aviso, {
    atendimentoId,
    chaveAgrupamento: conversaId,
    conversaId,
    corpo: 'Abra o app para ver a atualização.',
    destinatarioDispositivoId: dispositivoId,
    sequenciaObservada: '57',
    tipo: 'NOVA_MENSAGEM',
    titulo: 'Nova mensagem',
  });
  assert.doesNotMatch(
    JSON.stringify(aviso),
    /conteudo|cpf|fatura|dados|mensagem do cliente/iu,
  );
});

test('rajada da mesma conversa substitui o aviso agrupado anterior', async () => {
  const adaptador = new AdaptadorPushSimulado();
  const servico = new ServicoAvisosMobile(
    adaptador,
    new CompositorAvisoMobile(),
  );
  await servico.avisar(dispositivoId, evento({ sequenciaEvento: '57' }));
  await servico.avisar(dispositivoId, evento({ sequenciaEvento: '58' }));
  assert.equal(adaptador.listarAgrupados().length, 1);
  assert.equal(adaptador.listarAgrupados()[0].sequenciaObservada, '58');
});

test('indisponibilidade é explícita e não converte aviso em estado aplicado', async () => {
  const adaptador = new AdaptadorPushSimulado();
  adaptador.definirDisponibilidade(false);
  const resultado = await new ServicoAvisosMobile(
    adaptador,
    new CompositorAvisoMobile(),
  ).avisar(dispositivoId, evento());
  assert.deepEqual(resultado, { estado: 'INDISPONIVEL' });
  assert.deepEqual(adaptador.listarAgrupados(), []);
});

test('recusa payload adicional, agrupamento divergente e destino ausente', () => {
  const compositor = new CompositorAvisoMobile();
  assert.throws(
    () => compositor.compor(dispositivoId, { ...evento(), conteudo: 'segredo' }),
    /EVENTO_AVISO_MOBILE_INVALIDO/u,
  );
  assert.throws(
    () =>
      compositor.compor(
        dispositivoId,
        evento({ chaveAgrupamento: randomUUID() }),
      ),
    /EVENTO_AVISO_MOBILE_INVALIDO/u,
  );
  assert.throws(
    () =>
      compositor.compor(
        dispositivoId,
        evento({
          atendimentoId: undefined,
          chaveAgrupamento: undefined,
          conversaId: undefined,
        }),
      ),
    /DESTINO_AVISO_MOBILE_AUSENTE/u,
  );
});
