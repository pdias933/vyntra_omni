import type { ServicoAutenticacaoAplicativo } from '../autenticacao/servico-autenticacao-aplicativo';
import type { EntradaResgateAtendimentoDto } from '@vyntra/api-client';
import type { EntradaNotaInternaDto } from '@vyntra/api-client';
import type { EntradaTransferenciaAtendimentoDto, EntradaDisponibilidadePropriaDto } from '@vyntra/api-client';
import {
  AdaptadorAtendimentosHttp,
  ErroAtendimentoMobile,
} from './adaptador-atendimentos-http';
import type { AcaoErpMobile } from './modelo-atendimento-mobile';

export class ServicoAtendimentosMobile {
  public adicionarNota(atendimentoId: string, entrada: EntradaNotaInternaDto) {
    return this.executar((credenciais) => this.adaptador.adicionarNota(credenciais, atendimentoId, entrada));
  }
  private sessaoTentativas?: string;
  private readonly tentativasTransferencia = new Map<string, EntradaTransferenciaAtendimentoDto>();
  private readonly tentativasResgate = new Map<string, EntradaResgateAtendimentoDto>();
  private readonly observadores = new Set<() => void>();
  public observarMudancas(observar: () => void) {
    this.observadores.add(observar);
    const remover = this.autenticacao.replica.observarMudancas(observar);
    return () => { remover(); this.observadores.delete(observar); };
  }
  private avisarTentativas() { for (const observar of this.observadores) observar(); }
  public async obterTentativaTransferencia(atendimentoId: string) {
    const { credencial } = await this.autenticacao.obterCredenciaisSincronizacao();
    if (this.sessaoTentativas !== credencial.sessaoId) {
      this.tentativasTransferencia.clear();
      this.tentativasResgate.clear();
      this.sessaoTentativas = credencial.sessaoId;
    }
    return this.tentativasTransferencia.get(atendimentoId);
  }
  public limparTentativaTransferencia(atendimentoId: string) { this.tentativasTransferencia.delete(atendimentoId); }
  public async obterTentativaResgate(atendimentoId: string) {
    await this.obterTentativaTransferencia(atendimentoId);
    return this.tentativasResgate.get(atendimentoId);
  }
  public async listarTentativasOperacionais() {
    await this.obterTentativaTransferencia('');
    return [
      ...[...this.tentativasTransferencia.keys()].map((atendimentoId) => ({ atendimentoId, tipo: 'TRANSFERENCIA' as const })),
      ...[...this.tentativasResgate.keys()].map((atendimentoId) => ({ atendimentoId, tipo: 'RESGATE' as const })),
    ];
  }
  public async repetirTentativaOperacional(atendimentoId: string, tipo: 'RESGATE' | 'TRANSFERENCIA') {
    await this.obterTentativaTransferencia(atendimentoId);
    if (tipo === 'RESGATE') {
      const entrada = this.tentativasResgate.get(atendimentoId);
      if (entrada === undefined) throw new Error('TENTATIVA_INDISPONIVEL');
      return this.resgatar(atendimentoId, entrada);
    }
    const entrada = this.tentativasTransferencia.get(atendimentoId);
    if (entrada === undefined) throw new Error('TENTATIVA_INDISPONIVEL');
    return this.transferir(atendimentoId, entrada);
  }
  public destinosTransferencia(atendimentoId: string) {
    return this.executar((credenciais) => this.adaptador.destinosTransferencia(credenciais, atendimentoId));
  }
  public async transferir(atendimentoId: string, entrada: EntradaTransferenciaAtendimentoDto) {
    const anterior = await this.obterTentativaTransferencia(atendimentoId);
    if (anterior !== undefined && JSON.stringify(anterior) !== JSON.stringify(entrada)) throw new Error('TENTATIVA_TRANSFERENCIA_PENDENTE');
    this.tentativasTransferencia.set(atendimentoId, entrada);
    try {
      const resultado = await this.executar((credenciais) => this.adaptador.transferir(credenciais, atendimentoId, entrada));
      if (resultado.situacao === 'CONFIRMADA') this.limparTentativaTransferencia(atendimentoId);
      return resultado;
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile && [401, 403, 409].includes(erro.statusHttp ?? 0)) this.limparTentativaTransferencia(atendimentoId);
      throw erro;
    } finally { this.avisarTentativas(); }
  }
  public consultarDisponibilidade() {
    return this.executar((credenciais) => this.adaptador.consultarDisponibilidade(credenciais));
  }
  public definirDisponibilidade(entrada: EntradaDisponibilidadePropriaDto) {
    return this.executar((credenciais) => this.adaptador.definirDisponibilidade(credenciais, entrada));
  }
  public consultarOperacao(atendimentoId: string) {
    return this.executar((credenciais) => this.adaptador.consultarOperacao(credenciais, atendimentoId));
  }

  public async resgatar(atendimentoId: string, entrada: EntradaResgateAtendimentoDto) {
    const anterior = await this.obterTentativaResgate(atendimentoId);
    if (anterior !== undefined && JSON.stringify(anterior) !== JSON.stringify(entrada)) throw new Error('TENTATIVA_RESGATE_PENDENTE');
    this.tentativasResgate.set(atendimentoId, entrada);
    try {
      const resultado = await this.executar((credenciais) => this.adaptador.resgatar(credenciais, atendimentoId, entrada));
      if (resultado.situacao === 'CONFIRMADA') this.tentativasResgate.delete(atendimentoId);
      return resultado;
    } catch (erro) {
      if (erro instanceof ErroAtendimentoMobile && [400, 401, 403, 409].includes(erro.statusHttp ?? 0)) this.tentativasResgate.delete(atendimentoId);
      throw erro;
    } finally { this.avisarTentativas(); }
  }
  public constructor(
    private readonly autenticacao: ServicoAutenticacaoAplicativo,
    private readonly adaptador = new AdaptadorAtendimentosHttp(),
  ) {}

  public enviarMidia(
    atendimentoId: string,
    arquivo: globalThis.File,
    mensagemClienteId: string,
  ) {
    return this.executar((credenciais) =>
      this.adaptador.enviarMidia(
        credenciais,
        atendimentoId,
        arquivo,
        mensagemClienteId,
      ),
    );
  }

  public prepararAcaoErp(atendimentoId: string, acao: AcaoErpMobile) {
    return this.executar((credenciais) =>
      this.adaptador.prepararAcaoErp(credenciais, atendimentoId, acao),
    );
  }

  public executarAcaoErp(
    atendimentoId: string,
    entrada: {
      readonly acao: AcaoErpMobile;
      readonly assunto?: string;
      readonly chaveIdempotencia: string;
      readonly descricao?: string;
    },
  ) {
    return this.executar((credenciais) =>
      this.adaptador.executarAcaoErp(credenciais, atendimentoId, entrada),
    );
  }

  public obterTimeline(atendimentoId: string, cursor?: string) {
    return this.executar((credenciais) =>
      this.adaptador.obterTimeline(credenciais, atendimentoId, cursor),
    );
  }

  public listarRespostasRapidas(atendimentoId: string, busca = '') {
    return this.executar((credenciais) =>
      this.adaptador.listarRespostasRapidas(
        credenciais,
        atendimentoId,
        busca,
      ),
    );
  }

  public enviarTexto(
    atendimentoId: string,
    entrada: {
      readonly mensagemClienteId: string;
      readonly respondeAMensagemId?: string;
      readonly texto: string;
    },
  ) {
    return this.executar((credenciais) =>
      this.adaptador.enviarTexto(credenciais, atendimentoId, entrada),
    );
  }

  public reconciliarTexto(
    atendimentoId: string,
    entrada: {
      readonly chaveIdempotencia: string;
      readonly criadaEm: string;
      readonly janelaObservada: string;
      readonly sequenciaObservada: string;
      readonly texto: string;
      readonly versaoAtribuicao: number;
      readonly versaoContexto: number;
      readonly versaoEstado: number;
    },
  ) {
    return this.executar((credenciais) =>
      this.adaptador.reconciliarTexto(credenciais, atendimentoId, entrada),
    );
  }

  public listarModelosAprovados(atendimentoId: string, busca = '') {
    return this.executar((credenciais) =>
      this.adaptador.listarModelosAprovados(
        credenciais,
        atendimentoId,
        busca,
      ),
    );
  }

  public enviarModeloAprovado(
    atendimentoId: string,
    entrada: {
      readonly mensagemClienteId: string;
      readonly modeloId: string;
      readonly parametros: readonly string[];
    },
  ) {
    return this.executar((credenciais) =>
      this.adaptador.enviarModeloAprovado(
        credenciais,
        atendimentoId,
        entrada,
      ),
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
