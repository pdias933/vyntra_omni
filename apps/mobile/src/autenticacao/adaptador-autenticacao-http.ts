import {
  client,
  concluirPareamentoQrMobile,
  consultarPareamentoQrMobile,
  entrarSessaoMobile,
  renovarSessaoMobile,
  resgatarPareamentoQrMobile,
  sairSessaoMobile,
  type EstadoPareamentoQrMobileDto,
  type ResgatePareamentoQrDto,
  type SessaoMobileDto,
} from '@vyntra/api-client';
import { Platform } from 'react-native';

import { CONFIGURACAO_APLICATIVO } from '../configuracao-aplicativo';
import type { IdentidadeInstalacaoMobile } from './cofre-sessao-mobile';

export class ErroAutenticacaoMobile extends Error {
  public constructor(
    public readonly codigo: string,
    public readonly statusHttp?: number,
  ) {
    super(codigo);
    this.name = 'ErroAutenticacaoMobile';
  }
}

export interface ComprovantePareamentoMobile {
  readonly comprovanteResgate: string;
  readonly expiraEm: string;
  readonly pareamentoId: string;
}

interface RespostaSdk<T> {
  readonly data?: T | undefined;
  readonly error?: unknown | undefined;
  readonly response?: Response | undefined;
}

const plataforma = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';

function codigoErro(valor: unknown): string {
  if (typeof valor === 'object' && valor !== null) {
    const codigo = Reflect.get(valor, 'codigo');
    if (typeof codigo === 'string' && codigo.length > 0) return codigo;
  }
  return 'SERVICO_INDISPONIVEL';
}

function exigirDado<T>(resposta: RespostaSdk<T>): T {
  if (resposta.data !== undefined) return resposta.data;
  throw new ErroAutenticacaoMobile(
    codigoErro(resposta.error),
    resposta.response?.status,
  );
}

function dadosAparelho(identidade: IdentidadeInstalacaoMobile) {
  return {
    identificador_instalacao: identidade.identificadorInstalacao,
    plataforma,
    segredo_vinculo: identidade.segredoVinculo,
    versao_aplicativo: CONFIGURACAO_APLICATIVO.versao,
  } as const;
}

client.setConfig({ baseUrl: CONFIGURACAO_APLICATIVO.servidor });

export class AdaptadorAutenticacaoHttp {
  public async entrar(
    identificador: string,
    senha: string,
    identidade: IdentidadeInstalacaoMobile,
    codigoMfa?: string,
  ): Promise<SessaoMobileDto> {
    const resposta = await entrarSessaoMobile({
      body: {
        ...(codigoMfa === undefined ? {} : { codigo_mfa: codigoMfa }),
        identificador: identificador.trim(),
        senha,
        ...dadosAparelho(identidade),
      },
    });
    return exigirDado<SessaoMobileDto>(resposta);
  }

  public async renovar(
    dispositivoId: string,
    tokenRefresh: string,
    identidade: IdentidadeInstalacaoMobile,
  ): Promise<SessaoMobileDto> {
    const resposta = await renovarSessaoMobile({
      body: { token_refresh: tokenRefresh },
      headers: {
        'x-dispositivo-id': dispositivoId,
        'x-segredo-dispositivo': identidade.segredoVinculo,
      },
    });
    return exigirDado<SessaoMobileDto>(resposta);
  }

  public async sair(
    dispositivoId: string,
    segredoVinculo: string,
    tokenAcesso: string,
  ): Promise<void> {
    const resposta = await sairSessaoMobile({
      auth: tokenAcesso,
      headers: {
        'x-dispositivo-id': dispositivoId,
        'x-segredo-dispositivo': segredoVinculo,
      },
    });
    if (resposta.error !== undefined) {
      throw new ErroAutenticacaoMobile(
        codigoErro(resposta.error),
        resposta.response?.status,
      );
    }
  }

  public async resgatarPareamento(
    tokenQr: string,
    identidade: IdentidadeInstalacaoMobile,
  ): Promise<ComprovantePareamentoMobile> {
    const resposta = await resgatarPareamentoQrMobile({
      body: { token_qr: tokenQr, ...dadosAparelho(identidade) },
    });
    const dados = exigirDado<ResgatePareamentoQrDto>(resposta);
    return {
      comprovanteResgate: dados.comprovante_resgate,
      expiraEm: dados.expira_em,
      pareamentoId: dados.pareamento_id,
    };
  }

  public async consultarPareamento(
    comprovante: ComprovantePareamentoMobile,
    identidade: IdentidadeInstalacaoMobile,
  ): Promise<'AGUARDANDO_CONFIRMACAO' | 'CONFIRMADO'> {
    const resposta = await consultarPareamentoQrMobile({
      body: {
        comprovante_resgate: comprovante.comprovanteResgate,
        pareamento_id: comprovante.pareamentoId,
        ...dadosAparelho(identidade),
      },
    });
    return exigirDado<EstadoPareamentoQrMobileDto>(resposta).estado;
  }

  public async concluirPareamento(
    comprovante: ComprovantePareamentoMobile,
    identidade: IdentidadeInstalacaoMobile,
  ): Promise<SessaoMobileDto> {
    const resposta = await concluirPareamentoQrMobile({
      body: {
        comprovante_resgate: comprovante.comprovanteResgate,
        pareamento_id: comprovante.pareamentoId,
        ...dadosAparelho(identidade),
      },
    });
    return exigirDado<SessaoMobileDto>(resposta);
  }
}
