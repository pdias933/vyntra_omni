import type { SessaoMobileDto } from '@vyntra/api-client';

import {
  AdaptadorAutenticacaoHttp,
  ErroAutenticacaoMobile,
  type ComprovantePareamentoMobile,
} from './adaptador-autenticacao-http';
import {
  CofreSessaoMobile,
  type CredencialPersistidaMobile,
  type IdentidadeInstalacaoMobile,
} from './cofre-sessao-mobile';
import { GerenciadorSessaoMobile } from './gerenciador-sessao-mobile';
import { RepositorioReplicaLocal } from '../offline/repositorio-replica-local';
import { VerificadorAutorizacaoOffline } from '../offline/verificador-autorizacao-offline';

export interface SessaoAplicativo {
  readonly acessoOffline: boolean;
  readonly dispositivoId: string;
  readonly dispositivoSubstituido: boolean;
  readonly nomeExibicao: string;
  readonly offlineValidaAte?: string;
  readonly sessaoId: string;
  readonly usuarioId: string;
}

export interface CredenciaisSincronizacaoAplicativo {
  readonly credencial: CredencialPersistidaMobile;
  readonly dispositivoId: string;
  readonly identidade: IdentidadeInstalacaoMobile;
  readonly segredoDispositivo: string;
  readonly tokenAcesso: string;
}

function projetarSessao(sessao: SessaoMobileDto): SessaoAplicativo {
  return {
    acessoOffline: false,
    dispositivoId: sessao.dispositivo_id,
    dispositivoSubstituido: sessao.dispositivo_substituido,
    nomeExibicao: sessao.nome_exibicao,
    sessaoId: sessao.sessao_id,
    usuarioId: sessao.usuario_id,
  };
}

function aguardarIntervalo(sinal?: AbortSignal): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const aoAbortar = () => {
      clearTimeout(temporizador);
      rejeitar(new ErroAutenticacaoMobile('PAREAMENTO_CANCELADO'));
    };
    const temporizador = setTimeout(() => {
      sinal?.removeEventListener('abort', aoAbortar);
      resolver();
    }, 1_500);
    sinal?.addEventListener('abort', aoAbortar, { once: true });
  });
}

export class ServicoAutenticacaoAplicativo {
  public readonly cofre = new CofreSessaoMobile();
  public readonly gerenciador = new GerenciadorSessaoMobile(this.cofre);
  public readonly replica = new RepositorioReplicaLocal();
  public readonly autorizacaoOffline = new VerificadorAutorizacaoOffline(
    this.replica,
  );

  public constructor(
    private readonly adaptador = new AdaptadorAutenticacaoHttp(),
  ) {}

  public async possuiSessaoPersistida(): Promise<boolean> {
    return (await this.cofre.obterCredencial()) !== undefined;
  }

  public async obterCredenciaisSincronizacao(
    forcarRenovacao = false,
  ): Promise<CredenciaisSincronizacaoAplicativo> {
    let tokenAcesso = this.gerenciador.obterTokenAcesso();
    if (forcarRenovacao || tokenAcesso === undefined) {
      const sessao = await this.restaurar();
      if (sessao === undefined) {
        throw new ErroAutenticacaoMobile('NAO_AUTENTICADO', 401);
      }
      tokenAcesso = this.gerenciador.obterTokenAcesso();
    }
    const [credencial, identidade] = await Promise.all([
      this.cofre.obterCredencial(),
      this.cofre.obterOuCriarIdentidadeInstalacao(),
    ]);
    if (tokenAcesso === undefined || credencial === undefined) {
      throw new ErroAutenticacaoMobile('NAO_AUTENTICADO', 401);
    }
    return {
      credencial,
      dispositivoId: credencial.dispositivoId,
      identidade,
      segredoDispositivo: identidade.segredoVinculo,
      tokenAcesso,
    };
  }

  public async entrar(
    identificador: string,
    senha: string,
    codigoMfa?: string,
  ): Promise<SessaoAplicativo> {
    const identidade = await this.cofre.obterOuCriarIdentidadeInstalacao();
    const sessao = await this.adaptador.entrar(
      identificador,
      senha,
      identidade,
      codigoMfa,
    );
    await this.replica.limparReplicaAutenticada();
    await this.gerenciador.ativar({
      acessoExpiraEm: sessao.acesso_expira_em,
      dispositivoId: sessao.dispositivo_id,
      nomeExibicao: sessao.nome_exibicao,
      sessaoId: sessao.sessao_id,
      tokenAcesso: sessao.token_acesso,
      tokenRefresh: sessao.token_refresh,
      usuarioId: sessao.usuario_id,
    });
    return projetarSessao(sessao);
  }

  public async restaurar(): Promise<SessaoAplicativo | undefined> {
    const [identidade, credencial] = await Promise.all([
      this.cofre.obterOuCriarIdentidadeInstalacao(),
      this.cofre.obterCredencial(),
    ]);
    if (credencial === undefined) return undefined;

    try {
      const sessao = await this.adaptador.renovar(
        credencial.dispositivoId,
        credencial.tokenRefresh,
        identidade,
      );
      await this.gerenciador.ativar({
        acessoExpiraEm: sessao.acesso_expira_em,
        dispositivoId: sessao.dispositivo_id,
        nomeExibicao: sessao.nome_exibicao,
        sessaoId: sessao.sessao_id,
        tokenAcesso: sessao.token_acesso,
        tokenRefresh: sessao.token_refresh,
        usuarioId: sessao.usuario_id,
      });
      return projetarSessao(sessao);
    } catch (erro) {
      if (
        erro instanceof ErroAutenticacaoMobile &&
        erro.codigo === 'DISPOSITIVO_NAO_CONFIAVEL'
      ) {
        await this.gerenciador.tratarDispositivoNaoConfiavel(
          erro.statusHttp ?? 403,
          erro.codigo,
        );
      } else if (
        erro instanceof ErroAutenticacaoMobile &&
        (erro.statusHttp === 401 || erro.codigo === 'NAO_AUTENTICADO')
      ) {
        await this.gerenciador.tratarRespostaNaoAutorizada(
          erro.statusHttp ?? 401,
        );
      }
      throw erro;
    }
  }

  public async restaurarOffline(): Promise<SessaoAplicativo | undefined> {
    const [identidade, credencial] = await Promise.all([
      this.cofre.obterOuCriarIdentidadeInstalacao(),
      this.cofre.obterCredencial(),
    ]);
    if (credencial === undefined) return undefined;
    const resultado = await this.autorizacaoOffline.avaliar(
      credencial,
      identidade,
    );
    if (resultado.estado !== 'AUTORIZADO') return undefined;
    return {
      acessoOffline: true,
      dispositivoId: credencial.dispositivoId,
      dispositivoSubstituido: false,
      nomeExibicao: credencial.nomeExibicao,
      offlineValidaAte: resultado.autoridade.validaAte,
      sessaoId: credencial.sessaoId,
      usuarioId: credencial.usuarioId,
    };
  }

  public async sair(): Promise<void> {
    const [tokenAcesso, vinculo] = await Promise.all([
      Promise.resolve(this.gerenciador.obterTokenAcesso()),
      this.gerenciador.prepararVinculoDispositivo(),
    ]);

    try {
      if (tokenAcesso !== undefined && vinculo !== undefined) {
        await this.adaptador.sair(
          vinculo.dispositivoId,
          vinculo.segredoVinculo,
          tokenAcesso,
        );
      }
    } finally {
      await Promise.all([
        this.gerenciador.limparSessao(),
        this.replica.limparReplicaAutenticada(),
      ]);
    }
  }

  public async resgatarPareamento(
    tokenQr: string,
  ): Promise<ComprovantePareamentoMobile> {
    const identidade = await this.cofre.obterOuCriarIdentidadeInstalacao();
    return this.adaptador.resgatarPareamento(tokenQr, identidade);
  }

  public async aguardarEConcluirPareamento(
    comprovante: ComprovantePareamentoMobile,
    aoAguardar: (expiraEm: string) => void,
    sinal?: AbortSignal,
  ): Promise<SessaoAplicativo> {
    const identidade = await this.cofre.obterOuCriarIdentidadeInstalacao();
    aoAguardar(comprovante.expiraEm);

    while (new Date(comprovante.expiraEm) > new Date()) {
      if (sinal?.aborted === true) {
        throw new ErroAutenticacaoMobile('PAREAMENTO_CANCELADO');
      }
      const estado = await this.adaptador.consultarPareamento(
        comprovante,
        identidade,
      );
      if (estado === 'CONFIRMADO') {
        const sessao = await this.adaptador.concluirPareamento(
          comprovante,
          identidade,
        );
        await this.replica.limparReplicaAutenticada();
        await this.gerenciador.ativar({
          acessoExpiraEm: sessao.acesso_expira_em,
          dispositivoId: sessao.dispositivo_id,
          nomeExibicao: sessao.nome_exibicao,
          sessaoId: sessao.sessao_id,
          tokenAcesso: sessao.token_acesso,
          tokenRefresh: sessao.token_refresh,
          usuarioId: sessao.usuario_id,
        });
        return projetarSessao(sessao);
      }
      await aguardarIntervalo(sinal);
    }

    throw new ErroAutenticacaoMobile('PAREAMENTO_QR_EXPIRADO');
  }
}

export function mensagemAutenticacao(erro: unknown): string {
  const codigo =
    erro instanceof ErroAutenticacaoMobile ? erro.codigo : 'SERVICO_INDISPONIVEL';
  const mensagens: Readonly<Record<string, string>> = {
    CREDENCIAIS_INVALIDAS: 'Usuário ou senha inválidos.',
    DISPOSITIVO_NAO_CONFIAVEL:
      'Este aparelho não é mais confiável. Entre novamente.',
    LIMITE_LOGIN_EXCEDIDO: 'Aguarde alguns minutos antes de tentar novamente.',
    MFA_INVALIDO: 'Código inválido, expirado ou já utilizado.',
    MFA_NECESSARIO: 'Confirme o segundo fator para continuar.',
    PAREAMENTO_QR_EXPIRADO: 'O QR expirou. Gere um novo código na web.',
    PAREAMENTO_QR_INVALIDO: 'Este QR não é válido ou já foi utilizado.',
  };
  return (
    mensagens[codigo] ??
    'Não foi possível conectar agora. Confira sua internet e tente novamente.'
  );
}
