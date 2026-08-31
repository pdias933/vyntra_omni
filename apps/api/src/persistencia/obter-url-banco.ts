import { readFile } from 'node:fs/promises';

async function lerArquivo(caminho: string | undefined): Promise<string | undefined> {
  if (caminho === undefined) {
    return undefined;
  }

  const valor = (await readFile(caminho, 'utf8')).trim();
  return valor.length > 0 ? valor : undefined;
}

function validarUrlBanco(valor: string): string {
  const url = new URL(valor);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname.length === 0) {
    throw new Error('CONFIGURACAO_POSTGRESQL_INVALIDA');
  }

  return valor;
}

export async function obterUrlBanco(): Promise<string> {
  const arquivoUrl = await lerArquivo(process.env.BANCO_URL_FILE);
  if (arquivoUrl !== undefined) {
    return validarUrlBanco(arquivoUrl);
  }

  const host = process.env.BANCO_HOST?.trim();
  const nome = process.env.BANCO_NOME?.trim();
  const usuario = process.env.BANCO_USUARIO?.trim();
  const senha = await lerArquivo(process.env.BANCO_SENHA_FILE);

  if (!host || !nome || !usuario || senha === undefined) {
    throw new Error('CONFIGURACAO_POSTGRESQL_AUSENTE');
  }

  const porta = Number(process.env.BANCO_PORTA ?? '5432');
  if (!Number.isInteger(porta) || porta < 1 || porta > 65_535) {
    throw new Error('PORTA_POSTGRESQL_INVALIDA');
  }

  return validarUrlBanco(
    `postgresql://${encodeURIComponent(usuario)}:${encodeURIComponent(senha)}@${host}:${porta}/${encodeURIComponent(nome)}?schema=public`,
  );
}
