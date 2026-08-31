import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { AdaptadorMetaCloudSimulado } from '../dist/mensageria/adaptadores/meta/adaptador-meta-cloud-simulado.js';
import {
  ErroChaveMensageriaReutilizada,
  ErroComandoMensageriaInvalido,
  ErroEventoMensageriaInvalido,
} from '../dist/mensageria/erros-mensageria.js';

const agora = new Date('2026-08-31T12:00:00.000Z');
const contaMensageriaId = randomUUID();

function comando(sobrescritas = {}) {
  return {
    chaveIdempotencia: 'chave_mensageria_0001',
    comandoId: randomUUID(),
    contaMensageriaId,
    conteudo: { texto: 'Olá!', tipo: 'TEXTO' },
    enderecoDestino: 'identidade-tecnica-destino',
    ...sobrescritas,
  };
}

function evento(sobrescritas = {}) {
  return {
    contaMensageriaId,
    conteudo: { texto: 'Preciso de ajuda.', tipo: 'TEXTO' },
    identificadorEvento: 'evento-externo-0001',
    identificadorExternoMensagem: 'mensagem-externa-0001',
    identidade: {
      identificadorTecnico: 'identidade-tecnica-origem',
      nomeUsuario: 'cliente',
    },
    recebidoEm: agora,
    tipo: 'MENSAGEM_RECEBIDA',
    ...sobrescritas,
  };
}

test('aceite é determinístico e repetição não produz segundo efeito externo', async () => {
  const adaptador = new AdaptadorMetaCloudSimulado(() => agora);
  const entrada = comando();
  const primeira = await adaptador.enviar(entrada);
  const repetida = await adaptador.enviar(entrada);

  assert.deepEqual(repetida, primeira);
  assert.equal(primeira.resultado, 'ACEITA');
  assert.match(primeira.identificadorExternoMensagem, /^simulado\.[a-f0-9]{40}$/);
  assert.equal(adaptador.obterQuantidadeTentativasExternas(), 1);
});

test('falha temporária é normalizada e repetição devolve o mesmo resultado', async () => {
  const adaptador = new AdaptadorMetaCloudSimulado(() => agora);
  const entrada = comando({ chaveIdempotencia: 'chave_mensageria_falha_01' });
  adaptador.programarFalha(entrada.chaveIdempotencia, {
    categoria: 'TEMPORARIA',
    codigo: 'CANAL_INDISPONIVEL',
    permiteNovaTentativa: true,
  });

  const primeira = await adaptador.enviar(entrada);
  const repetida = await adaptador.enviar(entrada);
  assert.deepEqual(primeira, {
    categoria: 'TEMPORARIA',
    codigo: 'CANAL_INDISPONIVEL',
    permiteNovaTentativa: true,
    resultado: 'FALHA',
  });
  assert.deepEqual(repetida, primeira);
  assert.equal(adaptador.obterQuantidadeTentativasExternas(), 1);
});

test('mesma chave com comando diferente é recusada', async () => {
  const adaptador = new AdaptadorMetaCloudSimulado(() => agora);
  const entrada = comando();
  await adaptador.enviar(entrada);
  await assert.rejects(
    adaptador.enviar({
      ...entrada,
      conteudo: { texto: 'Conteúdo divergente', tipo: 'TEXTO' },
    }),
    ErroChaveMensageriaReutilizada,
  );
});

test('ordem de parâmetros não muda a assinatura idempotente', async () => {
  const adaptador = new AdaptadorMetaCloudSimulado(() => agora);
  const entrada = comando({
    conteudo: {
      idioma: 'pt_BR',
      modeloId: randomUUID(),
      parametros: { nome: 'Maria', protocolo: '123' },
      tipo: 'MODELO_APROVADO',
    },
  });
  const primeira = await adaptador.enviar(entrada);
  const repetida = await adaptador.enviar({
    ...entrada,
    conteudo: {
      ...entrada.conteudo,
      parametros: { protocolo: '123', nome: 'Maria' },
    },
  });
  assert.deepEqual(repetida, primeira);
  assert.equal(adaptador.obterQuantidadeTentativasExternas(), 1);
});

test('evento duplicado concorrente chega uma única vez ao consumidor', async () => {
  const adaptador = new AdaptadorMetaCloudSimulado(() => agora);
  let entregas = 0;
  let liberar;
  const bloqueio = new Promise((resolver) => {
    liberar = resolver;
  });
  const consumidor = {
    receber: async () => {
      entregas += 1;
      await bloqueio;
      return 'APLICADO';
    },
  };
  const entrada = evento();
  const primeira = adaptador.simularRecepcao(entrada, consumidor);
  const repetida = adaptador.simularRecepcao(entrada, consumidor);
  liberar();

  assert.deepEqual(await primeira, { resultado: 'APLICADO' });
  assert.deepEqual(await repetida, { resultado: 'DUPLICADO' });
  assert.equal(entregas, 1);
  assert.equal(adaptador.obterQuantidadeEventosEntregues(), 1);
});

test('falha do consumidor não marca evento como aplicado', async () => {
  const adaptador = new AdaptadorMetaCloudSimulado(() => agora);
  const entrada = evento();
  await assert.rejects(
    adaptador.simularRecepcao(entrada, {
      receber: async () => {
        throw new Error('falha sintética');
      },
    }),
  );
  const repeticao = await adaptador.simularRecepcao(entrada, {
    receber: async () => 'APLICADO',
  });
  assert.deepEqual(repeticao, { resultado: 'APLICADO' });
  assert.equal(adaptador.obterQuantidadeEventosEntregues(), 1);
});

test('estados externos ficam restritos ao adapter e saem normalizados', () => {
  const adaptador = new AdaptadorMetaCloudSimulado(() => agora);
  const base = {
    contaMensageriaId,
    identificadorEvento: 'estado-externo-0001',
    identificadorExternoMensagem: 'mensagem-externa-0001',
    ocorridoEm: agora,
  };
  assert.equal(
    adaptador.normalizarEstadoSimulado({ ...base, estadoMeta: 'sent' }).estado,
    'ENVIADA',
  );
  assert.equal(
    adaptador.normalizarEstadoSimulado({ ...base, estadoMeta: 'delivered' })
      .estado,
    'ENTREGUE',
  );
  assert.equal(
    adaptador.normalizarEstadoSimulado({ ...base, estadoMeta: 'read' }).estado,
    'LIDA',
  );
  assert.throws(
    () => adaptador.normalizarEstadoSimulado({ ...base, estadoMeta: 'failed' }),
    ErroEventoMensageriaInvalido,
  );
});

test('contratos inválidos falham antes de simular o provedor', async () => {
  const adaptador = new AdaptadorMetaCloudSimulado(() => agora);
  await assert.rejects(
    adaptador.enviar(comando({ enderecoDestino: '  ' })),
    ErroComandoMensageriaInvalido,
  );
  await assert.rejects(
    adaptador.simularRecepcao(
      evento({
        identidade: {
          identificadorTecnico: 'origem',
          telefoneE164: 'telefone inválido',
        },
      }),
      { receber: async () => 'APLICADO' },
    ),
    ErroEventoMensageriaInvalido,
  );
  assert.equal(adaptador.obterQuantidadeTentativasExternas(), 0);
});
