import { readFile } from 'node:fs/promises';

import { defineConfig } from 'prisma/config';

async function lerArquivo(caminho: string | undefined): Promise<string | undefined> {
  if (caminho === undefined) {
    return undefined;
  }

  const valor = (await readFile(caminho, 'utf8')).trim();
  return valor.length > 0 ? valor : undefined;
}

async function obterUrlBanco(): Promise<string> {
  const arquivoUrl = await lerArquivo(process.env.BANCO_URL_FILE);
  if (arquivoUrl !== undefined) {
    return arquivoUrl;
  }

  const host = process.env.BANCO_HOST;
  const nome = process.env.BANCO_NOME;
  const usuario = process.env.BANCO_USUARIO;
  const senha = await lerArquivo(process.env.BANCO_SENHA_FILE);

  if (host !== undefined && nome !== undefined && usuario !== undefined && senha !== undefined) {
    const porta = Number(process.env.BANCO_PORTA ?? '5432');
    if (!Number.isInteger(porta) || porta < 1 || porta > 65_535) {
      throw new Error('PORTA_POSTGRESQL_INVALIDA');
    }

    return `postgresql://${encodeURIComponent(usuario)}:${encodeURIComponent(senha)}@${host}:${porta}/${encodeURIComponent(nome)}?schema=public`;
  }

  if (['diff', 'format', 'generate', 'validate'].some((comando) => process.argv.includes(comando))) {
    return 'postgresql://geracao@127.0.0.1:5432/contrato';
  }

  throw new Error('CONFIGURACAO_POSTGRESQL_AUSENTE');
}

export default defineConfig({
  datasource: { url: await obterUrlBanco() },
  migrations: { path: 'prisma/migrations' },
  schema: 'prisma/schema.prisma',
});
