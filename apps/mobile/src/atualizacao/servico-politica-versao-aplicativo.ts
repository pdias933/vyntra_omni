import {
  AdaptadorPoliticaVersaoHttp,
  type PoliticaVersaoAplicativo,
} from './adaptador-politica-versao-http';
import { AdaptadorLojaAplicativo } from './adaptador-loja-aplicativo';

export class ServicoPoliticaVersaoAplicativo {
  public constructor(
    private readonly politica = new AdaptadorPoliticaVersaoHttp(),
    private readonly loja = new AdaptadorLojaAplicativo(),
  ) {}

  public avaliar(): Promise<PoliticaVersaoAplicativo> {
    return this.politica.avaliar();
  }

  public abrirLoja(politica: PoliticaVersaoAplicativo): Promise<void> {
    return this.loja.abrir(politica.urlLoja, politica.plataforma);
  }
}
