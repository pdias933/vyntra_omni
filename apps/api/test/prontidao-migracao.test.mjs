import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';

import { ServicoProntidao } from '../dist/saude/servico-prontidao.js';

const variaveis = [
  'AMBIENTE_APLICACAO',
  'BANCO_HOST',
  'BANCO_PORTA',
  'BANCO_URL_FILE',
  'REDIS_HOST',
  'REDIS_PORTA',
  'REDIS_URL_FILE',
  'STORAGE_ENDPOINT',
];

test('readiness exige a migration obrigatória depois de alcançar o PostgreSQL', async (t) => {
  const anteriores = new Map(variaveis.map((nome) => [nome, process.env[nome]]));
  const servidor = createServer((socket) => socket.end());
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const endereco = servidor.address();
  assert.equal(typeof endereco, 'object');
  const porta = endereco.port;

  t.after(async () => {
    for (const [nome, valor] of anteriores) {
      if (valor === undefined) {
        delete process.env[nome];
      } else {
        process.env[nome] = valor;
      }
    }
    await new Promise((resolver, rejeitar) =>
      servidor.close((erro) => (erro === undefined ? resolver() : rejeitar(erro))),
    );
  });

  delete process.env.BANCO_URL_FILE;
  delete process.env.REDIS_URL_FILE;
  process.env.AMBIENTE_APLICACAO = 'staging';
  process.env.BANCO_HOST = '127.0.0.1';
  process.env.BANCO_PORTA = String(porta);
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORTA = String(porta);
  process.env.STORAGE_ENDPOINT = `http://127.0.0.1:${porta}`;

  const ausente = new ServicoProntidao({
    verificarMigracaoObrigatoria: async () => false,
  });
  const aplicada = new ServicoProntidao({
    verificarMigracaoObrigatoria: async () => true,
  });

  assert.deepEqual(await ausente.verificar(), {
    falhas: ['MIGRACAO_POSTGRESQL'],
    pronto: false,
  });
  assert.deepEqual(await aplicada.verificar(), { falhas: [], pronto: true });
});
