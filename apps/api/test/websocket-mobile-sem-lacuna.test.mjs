import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as aguardar } from 'node:timers/promises';
import { test } from 'node:test';

import { WebSocket } from 'ws';

import { CoordenadorWebSocketMobileSemLacuna } from '../dist/sincronizacao/coordenador-websocket-mobile-sem-lacuna.js';
import {
  ControleConfirmacaoWebSocketMobile,
  GatewayEventosMobile,
} from '../dist/sincronizacao/gateway-eventos-mobile.js';

const sessao = {
  estado: 'ATIVA',
  expiraEm: new Date(Date.now() + 60_000),
  sessaoId: randomUUID(),
  usuarioId: randomUUID(),
};

function evento(sequencia) {
  return {
    audiencia: 'MOBILE',
    dados: { estado: 'AGUARDANDO' },
    entidadeId: randomUUID(),
    entidadeTipo: 'ATENDIMENTO',
    ocorridoEm: '2026-09-01T12:00:00.000Z',
    politicaCache: 'OPERACIONAL',
    sequenciaEvento: String(sequencia),
    tipo: 'ATENDIMENTO_CRIADO',
  };
}

function lote(eventos, apos, limite) {
  const posteriores = eventos.filter(
    (item) => BigInt(item.sequenciaEvento) > BigInt(apos),
  );
  const pagina = posteriores.slice(0, Number(limite));
  return {
    eventos: pagina,
    sequenciaFinal: pagina.at(-1)?.sequenciaEvento ?? String(apos),
    temMais: posteriores.length > pagina.length,
  };
}

test('WebSocket assina antes da marca d’água e entrega backlog, buffer e vivo sem duplicar', async () => {
  const eventos = [evento(1), evento(2)];
  let marcaCapturada = false;
  const sincronizacao = {
    obterMarcaDagua: async () => {
      marcaCapturada = true;
      eventos.push(evento(3));
      return '2';
    },
    sincronizar: async (_sessao, audiencia, apos, limite) => {
      assert.equal(audiencia, 'MOBILE');
      return lote(
        eventos.slice(0, marcaCapturada ? eventos.length : 2),
        apos,
        limite,
      );
    },
  };
  const recebidos = [];
  const prontos = [];
  const falhas = [];
  const fechar = new CoordenadorWebSocketMobileSemLacuna(
    sincronizacao,
  ).abrir(
    sessao,
    '0',
    {
      enviar: (item) => recebidos.push(item.sequenciaEvento),
      falhar: (erro) => falhas.push(erro),
      pronto: (sequencia) => prontos.push(sequencia),
    },
    { intervaloConsultaMs: 5 },
  );
  await aguardar(30);
  fechar();
  assert.deepEqual(recebidos, ['1', '2', '3']);
  assert.deepEqual(prontos, ['2']);
  assert.deepEqual(falhas, []);
});

test('cursor mobile retoma somente depois do último evento aplicado', async () => {
  const eventos = [evento(1), evento(2), evento(3)];
  const recebidos = [];
  const coordenador = new CoordenadorWebSocketMobileSemLacuna({
    obterMarcaDagua: async () => '3',
    sincronizar: async (_sessao, _audiencia, apos, limite) =>
      lote(eventos, apos, limite),
  });
  const fechar = coordenador.abrir(
    sessao,
    '1',
    {
      enviar: (item) => recebidos.push(item.sequenciaEvento),
      falhar: assert.fail,
      pronto: () => undefined,
    },
    { intervaloConsultaMs: 5 },
  );
  await aguardar(20);
  fechar();
  assert.deepEqual(recebidos, ['2', '3']);
});

test('confirmação é cumulativa, monotônica e limitada ao que foi enviado', () => {
  const controle = new ControleConfirmacaoWebSocketMobile('10');
  controle.registrarEnvio('11');
  controle.registrarEnvio('12');
  assert.equal(controle.confirmar('12'), '12');
  assert.equal(controle.confirmar('12'), '12');
  assert.throws(() => controle.confirmar('11'), /CONFIRMACAO/u);
  assert.throws(() => controle.confirmar('13'), /CONFIRMACAO/u);
  assert.throws(() => controle.registrarEnvio('12'), /ORDEM_ENVIO/u);
});

test('gateway exige sessão mobile vinculada e responde à confirmação explícita', async (t) => {
  const token = 'a'.repeat(43);
  const dispositivoId = randomUUID();
  const segredo = 'b'.repeat(43);
  const autenticacoes = [];
  const servidor = createServer();
  const gateway = new GatewayEventosMobile(
    {
      autenticar: async (...argumentos) => {
        autenticacoes.push(argumentos);
        return { contexto: sessao, dispositivoId, nomeExibicao: 'Operador' };
      },
    },
    {
      abrir: (_contexto, cursor, destino) => {
        assert.equal(cursor, '7');
        destino.enviar(evento(8));
        destino.pronto('8');
        return () => undefined;
      },
    },
  );
  gateway.anexar(servidor);
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  t.after(async () => {
    gateway.onModuleDestroy();
    await new Promise((resolver) => servidor.close(resolver));
  });
  const endereco = servidor.address();
  assert.ok(endereco !== null && typeof endereco === 'object');
  const cliente = new WebSocket(
    `ws://127.0.0.1:${endereco.port}/api/v1/sincronizacao/eventos-mobile?apos=7`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        'x-dispositivo-id': dispositivoId,
        'x-segredo-dispositivo': segredo,
      },
    },
  );
  const mensagens = [];
  await new Promise((resolver, rejeitar) => {
    cliente.on('error', rejeitar);
    cliente.on('message', (dados) => {
      const mensagem = JSON.parse(dados.toString());
      mensagens.push(mensagem);
      if (mensagem.tipo === 'EVENTO') {
        cliente.send(
          JSON.stringify({ tipo: 'CONFIRMAR', sequencia_evento: '8' }),
        );
      }
      if (mensagem.tipo === 'CONFIRMADO') resolver();
    });
  });
  cliente.close();
  await new Promise((resolver) => cliente.once('close', resolver));

  assert.deepEqual(autenticacoes, [
    [token, dispositivoId, segredo],
    [token, dispositivoId, segredo],
  ]);
  assert.deepEqual(
    mensagens.map(({ tipo }) => tipo).sort(),
    ['CONFIRMADO', 'EVENTO', 'PRONTO'],
  );
  assert.equal(mensagens.find(({ tipo }) => tipo === 'EVENTO').sequencia_evento, '8');
});

test('evento de permissão chega antes de o gateway encerrar o escopo mobile', async (t) => {
  const token = 'c'.repeat(43);
  const dispositivoId = randomUUID();
  const segredo = 'd'.repeat(43);
  const servidor = createServer();
  const gateway = new GatewayEventosMobile(
    {
      autenticar: async () => ({
        contexto: sessao,
        dispositivoId,
        nomeExibicao: 'Operador',
      }),
    },
    {
      abrir: (_contexto, _cursor, destino) => {
        destino.enviar({
          ...evento(9),
          dados: { tipo: 'ACESSO_FILA_REVOGADO', versaoPermissoes: 2 },
          entidadeId: sessao.usuarioId,
          entidadeTipo: 'USUARIO',
          tipo: 'PERMISSOES_ALTERADAS',
        });
        return () => undefined;
      },
    },
  );
  gateway.anexar(servidor);
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  t.after(async () => {
    gateway.onModuleDestroy();
    await new Promise((resolver) => servidor.close(resolver));
  });
  const endereco = servidor.address();
  assert.ok(endereco !== null && typeof endereco === 'object');
  const cliente = new WebSocket(
    `ws://127.0.0.1:${endereco.port}/api/v1/sincronizacao/eventos-mobile?apos=8`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        'x-dispositivo-id': dispositivoId,
        'x-segredo-dispositivo': segredo,
      },
    },
  );
  const mensagens = [];
  const fechamento = await new Promise((resolver, rejeitar) => {
    cliente.on('error', rejeitar);
    cliente.on('message', (dados) => mensagens.push(JSON.parse(dados.toString())));
    cliente.on('close', (codigo, motivo) =>
      resolver({ codigo, motivo: motivo.toString() }),
    );
  });

  assert.equal(fechamento.codigo, 4003);
  assert.equal(fechamento.motivo, 'ESCOPO_ALTERADO');
  assert.equal(mensagens.length, 1);
  assert.equal(mensagens[0].tipo, 'EVENTO');
  assert.equal(mensagens[0].evento.tipo, 'PERMISSOES_ALTERADAS');
});
