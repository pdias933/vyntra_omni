import 'reflect-metadata';

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { criarAplicacao } from './configurar-aplicacao.js';
import { criarDocumentoOpenApi } from './openapi/configurar-openapi.js';

const arquivoSaida = resolve(
  process.env.ARQUIVO_OPENAPI ?? 'openapi/openapi.json',
);
const aplicacao = await criarAplicacao({
  documentarOpenApi: false,
  logger: false,
});

try {
  await aplicacao.init();
  const documento = criarDocumentoOpenApi(aplicacao);
  await mkdir(dirname(arquivoSaida), { recursive: true });
  await writeFile(arquivoSaida, `${JSON.stringify(documento, null, 2)}\n`, 'utf8');
} finally {
  await aplicacao.close();
}
