import { Injectable } from '@nestjs/common';

import { ErroRequisicaoWebNaoConfiavel } from './erros-autenticacao.js';

const ORIGEM_DESENVOLVIMENTO = 'https://localhost:5173';

@Injectable()
export class ServicoOrigemWeb {
  private readonly origensPermitidas: ReadonlySet<string>;

  public constructor() {
    const configuradas =
      process.env.ORIGENS_WEB_PERMITIDAS ?? ORIGEM_DESENVOLVIMENTO;
    const origens = configuradas.split(',').map((origem) => origem.trim());
    if (origens.length === 0 || origens.some((origem) => !this.origemValida(origem))) {
      throw new Error('ORIGENS_WEB_PERMITIDAS_INVALIDAS');
    }
    this.origensPermitidas = new Set(origens);
  }

  public validar(origem: string | undefined): void {
    if (origem === undefined || !this.origensPermitidas.has(origem)) {
      throw new ErroRequisicaoWebNaoConfiavel();
    }
  }

  public permiteCors(origem: string | undefined): boolean {
    return origem === undefined || this.origensPermitidas.has(origem);
  }

  private origemValida(origem: string): boolean {
    try {
      const url = new URL(origem);
      return (
        url.protocol === 'https:' &&
        url.origin === origem &&
        url.username === '' &&
        url.password === '' &&
        url.pathname === '/' &&
        url.search === '' &&
        url.hash === ''
      );
    } catch {
      return false;
    }
  }
}
