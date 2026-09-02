import type { ServicoAutenticacaoAplicativo } from '../autenticacao/servico-autenticacao-aplicativo';
import {
  AdaptadorAtendimentosHttp,
  ErroAtendimentoMobile,
} from './adaptador-atendimentos-http';

export class ServicoAtendimentosMobile {
  public constructor(
    private readonly autenticacao: ServicoAutenticacaoAplicativo,
    private readonly adaptador = new AdaptadorAtendimentosHttp(),
  ) {}

  public obterTimeline(atendimentoId: string, cursor?: string) {
    return this.executar((credenciais) =>
      this.adaptador.obterTimeline(credenciais, atendimentoId, cursor),
    );
  }

  public obterDetalhes(atendimentoId: string) {
    return this.executar((credenciais) =>
      this.adaptador.obterDetalhes(credenciais, atendimentoId),
    );
  }

  public confirmarLeitura(
    atendimentoId: string,
    mensagemId: string,
    versaoEsperada: number,
  ) {
    return this.executar((credenciais) =>
      this.adaptador.confirmarLeitura(
        credenciais,
        atendimentoId,
        mensagemId,
        versaoEsperada,
      ),
    );
  }

  public consultarFinanceiro(atendimentoId: string) {
    return this.executar((credenciais) =>
      this.adaptador.consultarFinanceiro(credenciais, atendimentoId),
    );
  }

  public alterarContexto(
    atendimentoId: string,
    entrada: {
      readonly versaoEsperada: number;
      readonly vinculoClienteId: string;
      readonly vinculoContratoId?: string;
    },
  ) {
    return this.executar((credenciais) =>
      this.adaptador.alterarContexto(credenciais, atendimentoId, entrada),
    );
  }

  private async executar<Resultado>(
    operacao: (
      credenciais: Awaited<
        ReturnType<ServicoAutenticacaoAplicativo['obterCredenciaisSincronizacao']>
      >,
    ) => Promise<Resultado>,
  ): Promise<Resultado> {
    try {
      return await operacao(
        await this.autenticacao.obterCredenciaisSincronizacao(),
      );
    } catch (erro) {
      if (!(erro instanceof ErroAtendimentoMobile) || erro.statusHttp !== 401) {
        throw erro;
      }
      return operacao(
        await this.autenticacao.obterCredenciaisSincronizacao(true),
      );
    }
  }
}
