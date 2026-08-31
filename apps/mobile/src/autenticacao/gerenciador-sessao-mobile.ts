import type {
  CofreSessaoMobile,
  CredencialPersistidaMobile,
} from './cofre-sessao-mobile';

export interface SessaoMobileRecebida extends CredencialPersistidaMobile {
  readonly acessoExpiraEm: string;
  readonly tokenAcesso: string;
}

export class GerenciadorSessaoMobile {
  private tokenAcesso: string | undefined;
  private acessoExpiraEm: Date | undefined;

  public constructor(private readonly cofre: CofreSessaoMobile) {}

  public async ativar(sessao: SessaoMobileRecebida): Promise<void> {
    this.tokenAcesso = sessao.tokenAcesso;
    this.acessoExpiraEm = new Date(sessao.acessoExpiraEm);
    await this.cofre.salvarCredencial(sessao);
  }

  public obterTokenAcesso(): string | undefined {
    if (
      this.tokenAcesso === undefined ||
      this.acessoExpiraEm === undefined ||
      this.acessoExpiraEm <= new Date()
    ) {
      return undefined;
    }
    return this.tokenAcesso;
  }

  public async prepararVinculoDispositivo(): Promise<{
    readonly dispositivoId: string;
    readonly segredoVinculo: string;
  } | undefined> {
    const [identidade, credencial] = await Promise.all([
      this.cofre.obterOuCriarIdentidadeInstalacao(),
      this.cofre.obterCredencial(),
    ]);
    return credencial === undefined
      ? undefined
      : {
          dispositivoId: credencial.dispositivoId,
          segredoVinculo: identidade.segredoVinculo,
        };
  }

  public async limparSessao(): Promise<void> {
    this.tokenAcesso = undefined;
    this.acessoExpiraEm = undefined;
    await this.cofre.limparCredencial();
  }
}
