import 'reflect-metadata';

import { readFile } from 'node:fs/promises';

import { NestFactory } from '@nestjs/core';

import { ModuloProvisionamentoStaging } from './provisionamento/modulo-provisionamento-staging.js';
import { ServicoProvisionamentoAdministradorStaging } from './provisionamento/servico-provisionamento-administrador-staging.js';

async function lerSegredo(caminho: string | undefined): Promise<string> {
  if (caminho === undefined || caminho.trim().length === 0) {
    throw new Error('ARQUIVO_PROVISIONAMENTO_STAGING_AUSENTE');
  }
  const valor = (await readFile(caminho, 'utf8')).trim();
  if (valor.length === 0) {
    throw new Error('SEGREDO_PROVISIONAMENTO_STAGING_VAZIO');
  }
  return valor;
}

const aplicacao = await NestFactory.createApplicationContext(
  ModuloProvisionamentoStaging,
  { logger: false },
);
try {
  const provisionador = aplicacao.get(
    ServicoProvisionamentoAdministradorStaging,
  );
  const resultado = await provisionador.provisionar({
    codigosRecuperacao: (
      await lerSegredo(process.env.ADMIN_CODIGOS_RECUPERACAO_FILE)
    )
      .split('\n')
      .map((codigo) => codigo.trim())
      .filter((codigo) => codigo.length > 0),
    identificador: process.env.ADMIN_IDENTIFICADOR ?? '',
    nomeExibicao: process.env.ADMIN_NOME_EXIBICAO ?? '',
    segredoTotp: await lerSegredo(process.env.ADMIN_TOTP_FILE),
    senha: await lerSegredo(process.env.ADMIN_SENHA_FILE),
  });
  console.log(
    resultado === 'CRIADO'
      ? 'Administrador de staging provisionado com segurança.'
      : 'Administrador de staging já estava provisionado com os mesmos segredos.',
  );
} finally {
  await aplicacao.close();
}
