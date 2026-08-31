import {
  argon2,
  randomBytes,
  timingSafeEqual,
  type Argon2Parameters,
} from 'node:crypto';

import { Injectable } from '@nestjs/common';

const MEMORIA_KIB = 65_536;
const ITERACOES = 3;
const PARALELISMO = 1;
const TAMANHO_SALT = 16;
const TAMANHO_HASH = 32;
const SENHAS_COMUNS = new Set([
  '123456789012',
  'administrador',
  'admin12345678',
  'qwerty123456',
  'senha12345678',
  'vyntra123456',
]);

interface ComponentesHash {
  readonly memoria: number;
  readonly iteracoes: number;
  readonly paralelismo: number;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

@Injectable()
export class ServicoSenha {
  public validarNovaSenha(senha: string): void {
    const tamanho = Array.from(senha).length;
    if (
      tamanho < 12 ||
      tamanho > 128 ||
      SENHAS_COMUNS.has(senha.trim().toLocaleLowerCase('pt-BR'))
    ) {
      throw new Error('SENHA_NAO_ATENDE_POLITICA');
    }
  }

  public async criarHash(senha: string): Promise<string> {
    this.validarNovaSenha(senha);
    const salt = randomBytes(TAMANHO_SALT);
    const hash = await this.derivar(senha, {
      memoria: MEMORIA_KIB,
      iteracoes: ITERACOES,
      paralelismo: PARALELISMO,
      salt,
      tamanhoHash: TAMANHO_HASH,
    });

    return `$argon2id$v=19$m=${MEMORIA_KIB},t=${ITERACOES},p=${PARALELISMO}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
  }

  public async verificar(senha: string, senhaHash: string): Promise<boolean> {
    const componentes = this.lerHash(senhaHash);
    const calculado = await this.derivar(senha, {
      memoria: componentes.memoria,
      iteracoes: componentes.iteracoes,
      paralelismo: componentes.paralelismo,
      salt: componentes.salt,
      tamanhoHash: componentes.hash.length,
    });

    return timingSafeEqual(calculado, componentes.hash);
  }

  public async simularVerificacao(senha: string): Promise<void> {
    await this.derivar(senha, {
      memoria: MEMORIA_KIB,
      iteracoes: ITERACOES,
      paralelismo: PARALELISMO,
      salt: Buffer.from('vyntra-login-falso', 'utf8'),
      tamanhoHash: TAMANHO_HASH,
    });
  }

  private lerHash(senhaHash: string): ComponentesHash {
    const correspondencia =
      /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/u.exec(
        senhaHash,
      );
    if (correspondencia === null) {
      throw new Error('HASH_SENHA_INVALIDO');
    }
    const memoriaTexto = correspondencia[1];
    const iteracoesTexto = correspondencia[2];
    const paralelismoTexto = correspondencia[3];
    const saltTexto = correspondencia[4];
    const hashTexto = correspondencia[5];
    if (
      memoriaTexto === undefined ||
      iteracoesTexto === undefined ||
      paralelismoTexto === undefined ||
      saltTexto === undefined ||
      hashTexto === undefined
    ) {
      throw new Error('HASH_SENHA_INVALIDO');
    }
    const memoria = Number(memoriaTexto);
    const iteracoes = Number(iteracoesTexto);
    const paralelismo = Number(paralelismoTexto);
    const salt = Buffer.from(saltTexto, 'base64url');
    const hash = Buffer.from(hashTexto, 'base64url');
    if (
      memoria !== MEMORIA_KIB ||
      iteracoes !== ITERACOES ||
      paralelismo !== PARALELISMO ||
      salt.length !== TAMANHO_SALT ||
      hash.length !== TAMANHO_HASH
    ) {
      throw new Error('PARAMETROS_HASH_SENHA_INVALIDOS');
    }
    return { hash, iteracoes, memoria, paralelismo, salt };
  }

  private async derivar(
    senha: string,
    opcoes: {
      readonly memoria: number;
      readonly iteracoes: number;
      readonly paralelismo: number;
      readonly salt: Buffer;
      readonly tamanhoHash: number;
    },
  ): Promise<Buffer> {
    const parametros: Argon2Parameters = {
      memory: opcoes.memoria,
      message: Buffer.from(senha, 'utf8'),
      nonce: opcoes.salt,
      parallelism: opcoes.paralelismo,
      passes: opcoes.iteracoes,
      tagLength: opcoes.tamanhoHash,
    };
    return new Promise((resolver, rejeitar) => {
      argon2('argon2id', parametros, (erro, hash) => {
        if (erro === null) {
          resolver(hash);
        } else {
          rejeitar(erro);
        }
      });
    });
  }
}
