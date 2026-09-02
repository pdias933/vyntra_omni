import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  calcularCodigoTotp,
  ServicoMfa,
} from '../dist/autenticacao/servico-mfa.js';
import { ServicoProtecaoMfa } from '../dist/autenticacao/servico-protecao-mfa.js';

test('TOTP segue RFC 6238, protege segredo e bloqueia replay', async () => {
  assert.equal(
    calcularCodigoTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1n),
    '287082',
  );

  const diretorio = await mkdtemp(join(tmpdir(), 'vyntra-mfa-'));
  const caminhoChave = join(diretorio, 'chave');
  const anterior = process.env.MFA_CHAVE_PROTECAO_FILE;
  await writeFile(
    caminhoChave,
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n',
    { mode: 0o600 },
  );
  process.env.MFA_CHAVE_PROTECAO_FILE = caminhoChave;
  try {
    const protecao = new ServicoProtecaoMfa();
    const segredo = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const protegido = await protecao.protegerSegredoTotp(segredo);
    assert.match(protegido, /^v1\./u);
    assert.equal(protegido.includes(segredo), false);
    assert.equal(await protecao.revelarSegredoTotp(protegido), segredo);

    const hashRecuperacao = await protecao.calcularHashCodigoRecuperacao(
      '23456-789AB-CDEFG-HJKLM',
    );
    const fator = {
      codigosRecuperacaoAtivos: [hashRecuperacao],
      estado: 'ATIVO',
      segredoProtegido: protegido,
      ultimoContadorUsado: undefined,
    };
    const repositorio = {
      consumirCodigoRecuperacao: async () => true,
      consumirContadorTotp: async () => true,
      obterFator: async () => fator,
    };
    const servico = new ServicoMfa(repositorio, protecao);
    const agora = new Date(30_000);
    const codigo = calcularCodigoTotp(segredo, 1n);
    assert.deepEqual(await servico.prepararValidacao('usuario', codigo, agora), {
      contador: 1n,
      tipo: 'TOTP',
    });
    fator.ultimoContadorUsado = 1n;
    assert.equal(
      await servico.prepararValidacao('usuario', codigo, agora),
      undefined,
    );
    assert.deepEqual(
      await servico.prepararValidacao(
        'usuario',
        '23456-789AB-CDEFG-HJKLM',
        agora,
      ),
      { codigoHash: hashRecuperacao, tipo: 'RECUPERACAO' },
    );
  } finally {
    if (anterior === undefined) delete process.env.MFA_CHAVE_PROTECAO_FILE;
    else process.env.MFA_CHAVE_PROTECAO_FILE = anterior;
    await rm(diretorio, { force: true, recursive: true });
  }
});
