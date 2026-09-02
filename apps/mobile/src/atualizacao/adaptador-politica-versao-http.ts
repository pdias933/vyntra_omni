import {
  avaliarVersaoMobile,
  client,
  type AvaliacaoPoliticaVersaoMobileDto,
} from '@vyntra/api-client';
import { Platform } from 'react-native';

import { CONFIGURACAO_APLICATIVO } from '../configuracao-aplicativo';

export type PlataformaAplicativo = 'ANDROID' | 'IOS';

export interface PoliticaVersaoAplicativo {
  readonly atualizacaoObrigatoria: boolean;
  readonly atualizacaoRecomendada: boolean;
  readonly mensagem?: string;
  readonly plataforma: PlataformaAplicativo;
  readonly urlLoja?: string;
  readonly versaoInformada: string;
  readonly versaoMinima: string;
  readonly versaoRecomendada: string;
}

export class ErroPoliticaVersaoAplicativo extends Error {
  public constructor(public readonly codigo: string) {
    super(codigo);
    this.name = 'ErroPoliticaVersaoAplicativo';
  }
}

interface RespostaSdk<T> {
  readonly data?: T | undefined;
}

const VERSAO_SEMANTICA = /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/u;
const plataforma: PlataformaAplicativo =
  Platform.OS === 'ios' ? 'IOS' : 'ANDROID';

function projetarPolitica(
  resposta: RespostaSdk<AvaliacaoPoliticaVersaoMobileDto>,
): PoliticaVersaoAplicativo {
  const dados = resposta.data;
  if (
    dados === undefined ||
    dados.plataforma !== plataforma ||
    dados.versao_informada !== CONFIGURACAO_APLICATIVO.versao ||
    !VERSAO_SEMANTICA.test(dados.versao_minima) ||
    !VERSAO_SEMANTICA.test(dados.versao_recomendada) ||
    typeof dados.atualizacao_obrigatoria !== 'boolean' ||
    typeof dados.atualizacao_recomendada !== 'boolean' ||
    (dados.mensagem !== undefined && typeof dados.mensagem !== 'string') ||
    (dados.url_loja !== undefined && typeof dados.url_loja !== 'string')
  ) {
    throw new ErroPoliticaVersaoAplicativo('POLITICA_VERSAO_INVALIDA');
  }

  return {
    atualizacaoObrigatoria: dados.atualizacao_obrigatoria,
    atualizacaoRecomendada: dados.atualizacao_recomendada,
    plataforma,
    versaoInformada: dados.versao_informada,
    versaoMinima: dados.versao_minima,
    versaoRecomendada: dados.versao_recomendada,
    ...(dados.mensagem === undefined ? {} : { mensagem: dados.mensagem }),
    ...(dados.url_loja === undefined ? {} : { urlLoja: dados.url_loja }),
  };
}

client.setConfig({ baseUrl: CONFIGURACAO_APLICATIVO.servidor });

export class AdaptadorPoliticaVersaoHttp {
  public async avaliar(): Promise<PoliticaVersaoAplicativo> {
    try {
      const resposta = await avaliarVersaoMobile({
        body: {
          plataforma,
          versao_aplicativo: CONFIGURACAO_APLICATIVO.versao,
        },
      });
      return projetarPolitica(resposta);
    } catch (erro) {
      if (erro instanceof ErroPoliticaVersaoAplicativo) throw erro;
      throw new ErroPoliticaVersaoAplicativo('POLITICA_VERSAO_INDISPONIVEL');
    }
  }
}
