import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { DespachanteMensagem } from '../dist/mensagens/despachante-mensagem.js';
import { AdaptadorSaidaMetaCloud } from '../dist/mensageria/adaptadores/meta-cloud/saida-meta-cloud.js';
import { ErroTransporteMetaCloud } from '../dist/mensageria/adaptadores/meta-cloud/cliente-http-meta-cloud.js';

const comando = {
  chaveIdempotencia: 'chave-idempotente-045',
  comandoId: randomUUID(),
  contaMensageriaId: randomUUID(),
  conteudo: { texto: 'Olá', tipo: 'TEXTO' },
  enderecoDestino: 'US.1234567890',
};
const configuracao = {
  graphApiVersion: 'v25.0',
  identificadorNumeroExterno: '123456789012345',
  tokenAcesso: 't'.repeat(64),
};

function criarAdaptador(resposta) {
  const chamadas = [];
  const cliente = {
    postarJson: async (...argumentos) => {
      chamadas.push(argumentos);
      if (resposta instanceof Error) throw resposta;
      return resposta;
    },
  };
  return {
    adaptador: new AdaptadorSaidaMetaCloud(
      cliente,
      { obter: async () => configuracao },
      () => new Date('2026-09-01T12:00:01Z'),
    ),
    chamadas,
  };
}

test('aceite exige HTTP 2xx e identificador externo válido', async () => {
  const { adaptador, chamadas } = criarAdaptador({
    corpo: { messages: [{ id: 'wamid.ACEITE_PR045' }] },
    status: 200,
  });
  assert.deepEqual(await adaptador.enviar(comando), {
    aceitaEm: new Date('2026-09-01T12:00:01Z'),
    identificadorExternoMensagem: 'wamid.ACEITE_PR045',
    resultado: 'ACEITA',
  });
  assert.equal(chamadas[0][0], '/v25.0/123456789012345/messages');
  assert.equal(chamadas[0][2].to, 'US.1234567890');
  assert.equal(JSON.stringify(chamadas).includes(configuracao.tokenAcesso), true);
});

test('2xx sem id nunca é aceite e não autoriza repetição cega', async () => {
  const { adaptador } = criarAdaptador({ corpo: { messages: [] }, status: 200 });
  assert.deepEqual(await adaptador.enviar(comando), {
    categoria: 'CONFIGURACAO',
    codigo: 'CANAL_INDISPONIVEL',
    permiteNovaTentativa: false,
    resultado: 'FALHA',
  });
});

test('timeout, limite e indisponibilidade são temporários; destino e autenticação não', async () => {
  const timeout = criarAdaptador(new ErroTransporteMetaCloud('TIMEOUT')).adaptador;
  const limite = criarAdaptador({ corpo: { error: { code: 130429 } }, status: 400 }).adaptador;
  const destino = criarAdaptador({ corpo: { error: { code: 131026 } }, status: 400 }).adaptador;
  const credencial = criarAdaptador({ corpo: { error: { code: 190 } }, status: 401 }).adaptador;
  assert.equal((await timeout.enviar(comando)).permiteNovaTentativa, true);
  assert.equal((await limite.enviar(comando)).categoria, 'TEMPORARIA');
  assert.deepEqual(await destino.enviar(comando), {
    categoria: 'DEFINITIVA', codigo: 'DESTINO_INVALIDO', permiteNovaTentativa: false, resultado: 'FALHA',
  });
  assert.equal((await credencial.enviar(comando)).categoria, 'CONFIGURACAO');
});

function mensagemNaFila() {
  return {
    atendimentoId: randomUUID(), canceladaEm: undefined, codigoFalha: undefined,
    contatoRemetenteId: undefined, contaWhatsAppId: comando.contaMensageriaId,
    conteudoHash: 'a'.repeat(64), conteudoProtegido: { texto: 'Olá' }, conversaId: randomUUID(),
    criadaDispositivoEm: undefined, direcao: 'SAIDA', entregueEm: undefined, enviadaEm: undefined,
    estadoSaida: 'NA_FILA', falhouEm: undefined, id: comando.comandoId,
    identificadorExternoMensagem: undefined, lidaEm: undefined, mensagemClienteId: randomUUID(),
    proximaTentativaEm: new Date('2026-09-01T12:00:00Z'),
    recebidaServidorEm: new Date('2026-09-01T12:00:00Z'), tentativasEnvio: 0,
    tipo: 'TEXTO', usuarioRemetenteId: randomUUID(), versao: 1,
  };
}

test('despachante marca ENVIADA somente após ACEITA e separa retentativa de falha terminal', async () => {
  const despachante = new DespachanteMensagem();
  const aceita = criarAdaptador({ corpo: { messages: [{ id: 'wamid.PR045' }] }, status: 200 }).adaptador;
  const temporaria = criarAdaptador({ corpo: {}, status: 503 }).adaptador;
  const definitiva = criarAdaptador({ corpo: { error: { code: 131026 } }, status: 400 }).adaptador;
  const enviada = await despachante.despachar(
    mensagemNaFila(), comando, aceita, new Date('2026-09-01T12:01:00Z'),
  );
  const naFila = await despachante.despachar(
    mensagemNaFila(), comando, temporaria, new Date('2026-09-01T12:01:00Z'),
    () => new Date('2026-09-01T12:00:01Z'),
  );
  const falhou = await despachante.despachar(
    mensagemNaFila(), comando, definitiva, new Date('2026-09-01T12:01:00Z'),
    () => new Date('2026-09-01T12:00:01Z'),
  );
  assert.equal(enviada.estadoSaida, 'ENVIADA');
  assert.equal(naFila.estadoSaida, 'NA_FILA');
  assert.equal(falhou.estadoSaida, 'FALHOU');
});
