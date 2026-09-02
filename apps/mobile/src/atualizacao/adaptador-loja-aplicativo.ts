import { Linking } from 'react-native';

import type { PlataformaAplicativo } from './adaptador-politica-versao-http';

const HOST_LOJA: Readonly<Record<PlataformaAplicativo, string>> = {
  ANDROID: 'play.google.com',
  IOS: 'apps.apple.com',
};

export class AdaptadorLojaAplicativo {
  public async abrir(
    urlInformada: string | undefined,
    plataforma: PlataformaAplicativo,
  ): Promise<void> {
    if (urlInformada === undefined) throw new Error('URL_LOJA_AUSENTE');

    let url: URL;
    try {
      url = new URL(urlInformada);
    } catch {
      throw new Error('URL_LOJA_INVALIDA');
    }

    if (
      url.protocol !== 'https:' ||
      url.hostname !== HOST_LOJA[plataforma] ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new Error('URL_LOJA_NAO_PERMITIDA');
    }

    const disponivel = await Linking.canOpenURL(url.toString());
    if (!disponivel) throw new Error('LOJA_INDISPONIVEL');
    await Linking.openURL(url.toString());
  }
}
