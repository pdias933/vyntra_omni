import { createHash } from 'node:crypto';

import type { AdaptadorErp } from '../adaptador-erp.js';
import {
  ErroChaveErpReutilizada,
  ErroComandoErpInvalido,
  ErroConsultaErpInvalida,
} from '../erros-erp.js';
import type {
  ClienteErpNormalizado,
  ComandoAdicionarComentarioAtendimentoErp,
  ComandoAtualizarOrdemServicoErp,
  ComandoCriarOrdemServicoErp,
  ComandoExecutarDesbloqueioConfiancaErp,
  ComandoEncerrarAtendimentoErp,
  ComandoCriarAtendimentoErp,
  ComandoReconciliarDesbloqueioConfiancaErp,
  ComandoReconciliarAtualizacaoOrdemServicoErp,
  ComandoReconciliarComentarioAtendimentoErp,
  ComandoReconciliarCriacaoOrdemServicoErp,
  ComandoReconciliarEncerramentoAtendimentoErp,
  ComandoReconciliarAtendimentoErp,
  ContratoErpNormalizado,
  ConexaoCadastradaErpNormalizada,
  ContextoConsultaContratoErp,
  ContextoConsultaFaturaErp,
  CriteriosLocalizacaoClienteErp,
  FaturaErpNormalizada,
  DadosPagamentoFaturaErpNormalizados,
  DocumentoFaturaErpNormalizado,
  ElegibilidadeDesbloqueioErpNormalizada,
  ResultadoComplementoFaturaErp,
  ResultadoConsultaErp,
  ResultadoConsultaFaturasErp,
  ResultadoConsultaUnicaErp,
  ResultadoCriacaoAtendimentoErp,
  ResultadoCriacaoOrdemServicoErp,
  ResultadoAtualizacaoOrdemServicoErp,
  ResultadoAcaoAtendimentoErp,
  ResultadoExecucaoDesbloqueioConfiancaErp,
  ResultadoElegibilidadeDesbloqueioErp,
  ResultadoReconciliacaoAtendimentoErp,
  ResultadoReconciliacaoAtualizacaoOrdemServicoErp,
  ResultadoReconciliacaoAcaoAtendimentoErp,
  ResultadoReconciliacaoCriacaoOrdemServicoErp,
  ResultadoReconciliacaoDesbloqueioConfiancaErp,
} from '../modelo-erp.js';

const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CHAVE_IDEMPOTENCIA = /^[A-Za-z0-9_-]{16,128}$/u;

export interface ClienteErpSimulado extends ClienteErpNormalizado {
  readonly documentoBusca?: string;
  readonly telefoneBusca?: string;
}

export interface DadosErpSimulados {
  readonly clientes?: readonly ClienteErpSimulado[];
  readonly contratos?: readonly ContratoErpNormalizado[];
  readonly conexoes?: readonly ConexaoCadastradaErpNormalizada[];
  readonly faturas?: readonly FaturaErpNormalizada[];
  readonly documentosFatura?: readonly DocumentoFaturaErpNormalizado[];
  readonly dadosPagamentoFatura?: readonly DadosPagamentoFaturaErpNormalizados[];
  readonly elegibilidadesDesbloqueio?: readonly ElegibilidadeDesbloqueioErpNormalizada[];
}

type CenarioCriacaoAtendimento =
  | 'CONFIRMAR'
  | 'ERP_INDISPONIVEL'
  | 'PERDER_RESPOSTA';

type CenarioDesbloqueioConfianca =
  | 'CONFIRMAR'
  | 'ERP_INDISPONIVEL'
  | 'PERDER_RESPOSTA';

type CenarioOrdemServico =
  | 'CONFIRMAR'
  | 'ERP_INDISPONIVEL'
  | 'PERDER_RESPOSTA';

type CenarioAcaoAtendimento =
  | 'CAPACIDADE_NAO_HABILITADA'
  | 'CONFIRMAR'
  | 'ERP_INDISPONIVEL'
  | 'PERDER_RESPOSTA';

interface EfeitoCriacaoAtendimento {
  readonly atendimentoId: string;
  readonly confirmadoEm: Date;
  readonly protocoloOficial: string;
}

interface ExecucaoCriacaoAtendimento {
  readonly assinatura: string;
  readonly resultado: ResultadoCriacaoAtendimentoErp;
}

interface ExecucaoDesbloqueioConfianca {
  readonly assinatura: string;
  readonly resultado: ResultadoExecucaoDesbloqueioConfiancaErp;
}

interface EfeitoDesbloqueioConfianca {
  readonly atendimentoId: string;
  readonly contratoExternoId: string;
}

interface EfeitoCriacaoOrdemServico {
  readonly atendimentoId: string;
  readonly clienteExternoId: string;
  readonly contratoExternoId: string;
  readonly ordemServicoExternaId: string;
  readonly protocoloOficial: string;
}

interface EfeitoAtualizacaoOrdemServico {
  readonly atendimentoId: string;
  readonly ordemServicoExternaId: string;
}

interface ExecucaoCriacaoOrdemServico {
  readonly assinatura: string;
  readonly resultado: ResultadoCriacaoOrdemServicoErp;
}

interface ExecucaoAtualizacaoOrdemServico {
  readonly assinatura: string;
  readonly resultado: ResultadoAtualizacaoOrdemServicoErp;
}

interface EfeitoAcaoAtendimento {
  readonly atendimentoId: string;
  readonly protocoloOficial: string;
}

interface ExecucaoAcaoAtendimento {
  readonly assinatura: string;
  readonly resultado: ResultadoAcaoAtendimentoErp;
}

function textoValido(valor: string, limite: number): boolean {
  return valor.trim().length > 0 && valor.length <= limite;
}

function hashHex(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

function normalizarParaAssinatura(valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return valor.map(normalizarParaAssinatura);
  if (typeof valor !== 'object' || valor === null) return valor;
  return Object.fromEntries(
    Object.entries(valor)
      .filter(([, item]) => item !== undefined)
      .sort(([esquerda], [direita]) => esquerda.localeCompare(direita))
      .map(([chave, item]) => [chave, normalizarParaAssinatura(item)]),
  );
}

function assinaturaComando(comando: unknown): string {
  return hashHex(JSON.stringify(normalizarParaAssinatura(comando)));
}

function normalizarBusca(valor: string): string {
  return valor.trim().toLocaleLowerCase('pt-BR');
}

function clonarCliente(cliente: ClienteErpSimulado): ClienteErpNormalizado {
  return {
    clienteExternoId: cliente.clienteExternoId,
    nomeExibicao: cliente.nomeExibicao,
    ...(cliente.documentoMascarado === undefined
      ? {}
      : { documentoMascarado: cliente.documentoMascarado }),
    ...(cliente.telefoneMascarado === undefined
      ? {}
      : { telefoneMascarado: cliente.telefoneMascarado }),
  };
}

function clonarContrato(
  contrato: ContratoErpNormalizado,
): ContratoErpNormalizado {
  return { ...contrato };
}

export class AdaptadorErpSimulado implements AdaptadorErp {
  private consultasDisponiveis = true;
  private reconciliacaoDisponivel = true;
  private readonly cenariosCriacao = new Map<
    string,
    CenarioCriacaoAtendimento
  >();
  private readonly execucoesCriacao = new Map<
    string,
    ExecucaoCriacaoAtendimento
  >();
  private readonly efeitosCriacao = new Map<
    string,
    EfeitoCriacaoAtendimento
  >();
  private tentativasCriacao = 0;
  private readonly cenariosDesbloqueio = new Map<
    string,
    CenarioDesbloqueioConfianca
  >();
  private readonly execucoesDesbloqueio = new Map<
    string,
    ExecucaoDesbloqueioConfianca
  >();
  private readonly efeitosDesbloqueio = new Map<
    string,
    EfeitoDesbloqueioConfianca
  >();
  private tentativasDesbloqueio = 0;
  private readonly cenariosCriacaoOrdem = new Map<
    string,
    CenarioOrdemServico
  >();
  private readonly execucoesCriacaoOrdem = new Map<
    string,
    ExecucaoCriacaoOrdemServico
  >();
  private readonly efeitosCriacaoOrdem = new Map<
    string,
    EfeitoCriacaoOrdemServico
  >();
  private tentativasCriacaoOrdem = 0;
  private readonly cenariosAtualizacaoOrdem = new Map<
    string,
    CenarioOrdemServico
  >();
  private readonly execucoesAtualizacaoOrdem = new Map<
    string,
    ExecucaoAtualizacaoOrdemServico
  >();
  private readonly efeitosAtualizacaoOrdem = new Map<
    string,
    EfeitoAtualizacaoOrdemServico
  >();
  private tentativasAtualizacaoOrdem = 0;
  private readonly cenariosComentarioAtendimento = new Map<
    string,
    CenarioAcaoAtendimento
  >();
  private readonly execucoesComentarioAtendimento = new Map<
    string,
    ExecucaoAcaoAtendimento
  >();
  private readonly efeitosComentarioAtendimento = new Map<
    string,
    EfeitoAcaoAtendimento
  >();
  private tentativasComentarioAtendimento = 0;
  private readonly cenariosEncerramentoAtendimento = new Map<
    string,
    CenarioAcaoAtendimento
  >();
  private readonly execucoesEncerramentoAtendimento = new Map<
    string,
    ExecucaoAcaoAtendimento
  >();
  private readonly efeitosEncerramentoAtendimento = new Map<
    string,
    EfeitoAcaoAtendimento
  >();
  private tentativasEncerramentoAtendimento = 0;

  public constructor(
    private readonly dados: DadosErpSimulados = {},
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  public definirConsultasDisponiveis(disponiveis: boolean): void {
    this.consultasDisponiveis = disponiveis;
  }

  public definirReconciliacaoDisponivel(disponivel: boolean): void {
    this.reconciliacaoDisponivel = disponivel;
  }

  public programarCriacaoAtendimento(
    chaveIdempotencia: string,
    cenario: CenarioCriacaoAtendimento,
  ): void {
    if (
      !CHAVE_IDEMPOTENCIA.test(chaveIdempotencia) ||
      this.execucoesCriacao.has(chaveIdempotencia)
    ) {
      throw new ErroComandoErpInvalido();
    }
    this.cenariosCriacao.set(chaveIdempotencia, cenario);
  }

  public programarDesbloqueioConfianca(
    chaveIdempotencia: string,
    cenario: CenarioDesbloqueioConfianca,
  ): void {
    if (
      !CHAVE_IDEMPOTENCIA.test(chaveIdempotencia) ||
      this.execucoesDesbloqueio.has(chaveIdempotencia)
    ) {
      throw new ErroComandoErpInvalido();
    }
    this.cenariosDesbloqueio.set(chaveIdempotencia, cenario);
  }

  public programarCriacaoOrdemServico(
    chaveIdempotencia: string,
    cenario: CenarioOrdemServico,
  ): void {
    if (
      !CHAVE_IDEMPOTENCIA.test(chaveIdempotencia) ||
      this.execucoesCriacaoOrdem.has(chaveIdempotencia)
    ) {
      throw new ErroComandoErpInvalido();
    }
    this.cenariosCriacaoOrdem.set(chaveIdempotencia, cenario);
  }

  public programarAtualizacaoOrdemServico(
    chaveIdempotencia: string,
    cenario: CenarioOrdemServico,
  ): void {
    if (
      !CHAVE_IDEMPOTENCIA.test(chaveIdempotencia) ||
      this.execucoesAtualizacaoOrdem.has(chaveIdempotencia)
    ) {
      throw new ErroComandoErpInvalido();
    }
    this.cenariosAtualizacaoOrdem.set(chaveIdempotencia, cenario);
  }

  public programarComentarioAtendimento(
    chaveIdempotencia: string,
    cenario: CenarioAcaoAtendimento,
  ): void {
    this.programarAcao(
      chaveIdempotencia,
      cenario,
      this.execucoesComentarioAtendimento,
      this.cenariosComentarioAtendimento,
    );
  }

  public programarEncerramentoAtendimento(
    chaveIdempotencia: string,
    cenario: CenarioAcaoAtendimento,
  ): void {
    this.programarAcao(
      chaveIdempotencia,
      cenario,
      this.execucoesEncerramentoAtendimento,
      this.cenariosEncerramentoAtendimento,
    );
  }

  public async localizarClientes(
    criterios: CriteriosLocalizacaoClienteErp,
  ): Promise<ResultadoConsultaErp<ClienteErpNormalizado>> {
    this.validarCriterios(criterios);
    if (!this.consultasDisponiveis) return this.indisponivel();
    const itens = (this.dados.clientes ?? [])
      .filter((cliente) => this.clienteCorresponde(cliente, criterios))
      .map(clonarCliente);
    return { itens, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
  }

  public async listarContratos(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaErp<ContratoErpNormalizado>> {
    this.validarIdentificadorExterno(clienteExternoId);
    if (!this.consultasDisponiveis) return this.indisponivel();
    const itens = (this.dados.contratos ?? [])
      .filter((contrato) => contrato.clienteExternoId === clienteExternoId)
      .map(clonarContrato);
    return { itens, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
  }

  public async consultarCliente(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaUnicaErp<ClienteErpNormalizado>> {
    this.validarIdentificadorExterno(clienteExternoId);
    if (!this.consultasDisponiveis) return this.indisponivel();
    const cliente = (this.dados.clientes ?? []).find(
      (item) => item.clienteExternoId === clienteExternoId,
    );
    if (cliente === undefined) {
      return { origem: 'TEMPO_REAL', resultado: 'NAO_ENCONTRADO' };
    }
    return {
      item: clonarCliente(cliente),
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    };
  }

  public async consultarContrato(
    contexto: ContextoConsultaContratoErp,
  ): Promise<ResultadoConsultaUnicaErp<ContratoErpNormalizado>> {
    this.validarIdentificadorExterno(contexto.clienteExternoId);
    this.validarIdentificadorExterno(contexto.contratoExternoId);
    if (!this.consultasDisponiveis) return this.indisponivel();
    const contrato = (this.dados.contratos ?? []).find(
      (item) =>
        item.clienteExternoId === contexto.clienteExternoId &&
        item.contratoExternoId === contexto.contratoExternoId,
    );
    if (contrato === undefined) {
      return { origem: 'TEMPO_REAL', resultado: 'NAO_ENCONTRADO' };
    }
    return {
      item: clonarContrato(contrato),
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    };
  }

  public async listarConexoes(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaErp<ConexaoCadastradaErpNormalizada>> {
    this.validarIdentificadorExterno(clienteExternoId);
    if (!this.consultasDisponiveis) return this.indisponivel();
    const itens = (this.dados.conexoes ?? [])
      .filter((item) => item.clienteExternoId === clienteExternoId)
      .map((item) => ({ ...item }));
    return { itens, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
  }

  public async listarFaturas(
    contexto: ContextoConsultaContratoErp,
  ): Promise<ResultadoConsultaFaturasErp> {
    this.validarIdentificadorExterno(contexto.clienteExternoId);
    this.validarIdentificadorExterno(contexto.contratoExternoId);
    if (!this.consultasDisponiveis) return this.indisponivel();
    if (!this.contextoContratoUnivoco(contexto)) {
      return {
        cobertura: { tipo: 'INTEGRAL' },
        itens: [],
        origem: 'TEMPO_REAL',
        resultado: 'SUCESSO',
      };
    }
    const itens = (this.dados.faturas ?? [])
      .filter(
        (fatura) =>
          fatura.clienteExternoId === contexto.clienteExternoId &&
          fatura.contratoExternoId === contexto.contratoExternoId,
      )
      .map((fatura) => ({ ...fatura }));
    return {
      cobertura: { tipo: 'INTEGRAL' },
      itens,
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    };
  }

  public async consultarFatura(
    contexto: ContextoConsultaFaturaErp,
  ): Promise<ResultadoConsultaUnicaErp<FaturaErpNormalizada>> {
    this.validarContextoFatura(contexto);
    if (!this.consultasDisponiveis) return this.indisponivel();
    if (!this.contextoContratoUnivoco(contexto)) {
      return { origem: 'TEMPO_REAL', resultado: 'NAO_ENCONTRADO' };
    }
    const fatura = (this.dados.faturas ?? []).find(
      (item) =>
        item.clienteExternoId === contexto.clienteExternoId &&
        item.contratoExternoId === contexto.contratoExternoId &&
        item.faturaExternaId === contexto.faturaExternaId,
    );
    if (fatura === undefined) {
      return { origem: 'TEMPO_REAL', resultado: 'NAO_ENCONTRADO' };
    }
    return { item: { ...fatura }, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
  }

  public async obterDocumentoFatura(
    contexto: ContextoConsultaFaturaErp,
  ): Promise<ResultadoComplementoFaturaErp<DocumentoFaturaErpNormalizado>> {
    this.validarContextoFatura(contexto);
    if (!this.consultasDisponiveis) return this.indisponivel();
    const fatura = await this.consultarFatura(contexto);
    if (fatura.resultado !== 'SUCESSO') return fatura;
    const documento = (this.dados.documentosFatura ?? []).find(
      (item) =>
        item.clienteExternoId === contexto.clienteExternoId &&
        item.contratoExternoId === contexto.contratoExternoId &&
        item.faturaExternaId === contexto.faturaExternaId,
    );
    if (documento === undefined) {
      return { origem: 'TEMPO_REAL', resultado: 'NAO_ENCONTRADO' };
    }
    return {
      item: { ...documento, conteudo: new Uint8Array(documento.conteudo) },
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    };
  }

  public async obterDadosPagamentoFatura(
    contexto: ContextoConsultaFaturaErp,
  ): Promise<
    ResultadoComplementoFaturaErp<DadosPagamentoFaturaErpNormalizados>
  > {
    this.validarContextoFatura(contexto);
    if (!this.consultasDisponiveis) return this.indisponivel();
    const fatura = await this.consultarFatura(contexto);
    if (fatura.resultado !== 'SUCESSO') return fatura;
    const dados = (this.dados.dadosPagamentoFatura ?? []).find(
      (item) =>
        item.clienteExternoId === contexto.clienteExternoId &&
        item.contratoExternoId === contexto.contratoExternoId &&
        item.faturaExternaId === contexto.faturaExternaId,
    );
    if (dados === undefined) {
      return { origem: 'TEMPO_REAL', resultado: 'NAO_ENCONTRADO' };
    }
    return { item: { ...dados }, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
  }

  public async verificarElegibilidadeDesbloqueio(
    contratoExternoId: string,
  ): Promise<ResultadoElegibilidadeDesbloqueioErp> {
    this.validarIdentificadorExterno(contratoExternoId);
    if (!this.consultasDisponiveis) return this.indisponivel();
    const elegibilidade = (this.dados.elegibilidadesDesbloqueio ?? []).find(
      (item) => item.contratoExternoId === contratoExternoId,
    );
    if (elegibilidade === undefined) {
      return { origem: 'TEMPO_REAL', resultado: 'NAO_ENCONTRADO' };
    }
    return {
      item: { ...elegibilidade },
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    };
  }

  public async criarAtendimento(
    comando: ComandoCriarAtendimentoErp,
  ): Promise<ResultadoCriacaoAtendimentoErp> {
    this.validarComandoCriacao(comando);
    const assinatura = assinaturaComando(comando);
    const anterior = this.execucoesCriacao.get(comando.chaveIdempotencia);
    if (anterior !== undefined) {
      if (anterior.assinatura !== assinatura) {
        throw new ErroChaveErpReutilizada();
      }
      return this.clonarResultadoCriacao(anterior.resultado);
    }

    this.tentativasCriacao += 1;
    const cenario =
      this.cenariosCriacao.get(comando.chaveIdempotencia) ?? 'CONFIRMAR';
    const resultado = this.executarCenarioCriacao(comando, cenario);
    this.execucoesCriacao.set(comando.chaveIdempotencia, {
      assinatura,
      resultado,
    });
    return this.clonarResultadoCriacao(resultado);
  }

  public async executarDesbloqueioConfianca(
    comando: ComandoExecutarDesbloqueioConfiancaErp,
  ): Promise<ResultadoExecucaoDesbloqueioConfiancaErp> {
    this.validarComandoDesbloqueio(comando);
    const assinatura = hashHex(
      JSON.stringify(normalizarParaAssinatura(comando)),
    );
    const anterior = this.execucoesDesbloqueio.get(comando.chaveIdempotencia);
    if (anterior !== undefined) {
      if (anterior.assinatura !== assinatura) {
        throw new ErroChaveErpReutilizada();
      }
      return this.clonarResultadoDesbloqueio(anterior.resultado);
    }
    this.tentativasDesbloqueio += 1;
    const cenario =
      this.cenariosDesbloqueio.get(comando.chaveIdempotencia) ?? 'CONFIRMAR';
    const resultado = this.executarCenarioDesbloqueio(comando, cenario);
    this.execucoesDesbloqueio.set(comando.chaveIdempotencia, {
      assinatura,
      resultado,
    });
    return this.clonarResultadoDesbloqueio(resultado);
  }

  public async reconciliarDesbloqueioConfianca(
    comando: ComandoReconciliarDesbloqueioConfiancaErp,
  ): Promise<ResultadoReconciliacaoDesbloqueioConfiancaErp> {
    this.validarComandoDesbloqueio(comando);
    if (!this.reconciliacaoDisponivel) return this.indisponivel();
    const efeito = this.efeitosDesbloqueio.get(comando.chaveIdempotencia);
    if (efeito === undefined) return { resultado: 'EFEITO_AUSENTE' };
    if (
      efeito.atendimentoId !== comando.atendimentoId ||
      efeito.contratoExternoId !== comando.contratoExternoId
    ) {
      throw new ErroChaveErpReutilizada();
    }
    return {
      resultado: 'CONFIRMADO',
    };
  }

  public async criarOrdemServico(
    comando: ComandoCriarOrdemServicoErp,
  ): Promise<ResultadoCriacaoOrdemServicoErp> {
    this.validarComandoCriacaoOrdemServico(comando);
    const assinatura = assinaturaComando(comando);
    const anterior = this.execucoesCriacaoOrdem.get(
      comando.chaveIdempotencia,
    );
    if (anterior !== undefined) {
      if (anterior.assinatura !== assinatura) {
        throw new ErroChaveErpReutilizada();
      }
      return { ...anterior.resultado };
    }
    this.tentativasCriacaoOrdem += 1;
    const cenario =
      this.cenariosCriacaoOrdem.get(comando.chaveIdempotencia) ??
      'CONFIRMAR';
    const resultado = this.executarCenarioCriacaoOrdemServico(
      comando,
      cenario,
    );
    this.execucoesCriacaoOrdem.set(comando.chaveIdempotencia, {
      assinatura,
      resultado,
    });
    return { ...resultado };
  }

  public async reconciliarCriacaoOrdemServico(
    comando: ComandoReconciliarCriacaoOrdemServicoErp,
  ): Promise<ResultadoReconciliacaoCriacaoOrdemServicoErp> {
    this.validarContextoOrdemServico(comando);
    if (!this.reconciliacaoDisponivel) return this.indisponivel();
    const efeito = this.efeitosCriacaoOrdem.get(comando.chaveIdempotencia);
    if (efeito === undefined) return { resultado: 'EFEITO_AUSENTE' };
    if (
      efeito.atendimentoId !== comando.atendimentoId ||
      efeito.clienteExternoId !== comando.clienteExternoId ||
      efeito.contratoExternoId !== comando.contratoExternoId ||
      efeito.protocoloOficial !== comando.protocoloOficial
    ) {
      throw new ErroChaveErpReutilizada();
    }
    return {
      ordemServicoExternaId: efeito.ordemServicoExternaId,
      resultado: 'CONFIRMADO',
    };
  }

  public async atualizarOrdemServico(
    comando: ComandoAtualizarOrdemServicoErp,
  ): Promise<ResultadoAtualizacaoOrdemServicoErp> {
    this.validarComandoAtualizacaoOrdemServico(comando);
    const assinatura = assinaturaComando(comando);
    const anterior = this.execucoesAtualizacaoOrdem.get(
      comando.chaveIdempotencia,
    );
    if (anterior !== undefined) {
      if (anterior.assinatura !== assinatura) {
        throw new ErroChaveErpReutilizada();
      }
      return { ...anterior.resultado };
    }
    this.tentativasAtualizacaoOrdem += 1;
    const cenario =
      this.cenariosAtualizacaoOrdem.get(comando.chaveIdempotencia) ??
      'CONFIRMAR';
    const resultado = this.executarCenarioAtualizacaoOrdemServico(
      comando,
      cenario,
    );
    this.execucoesAtualizacaoOrdem.set(comando.chaveIdempotencia, {
      assinatura,
      resultado,
    });
    return { ...resultado };
  }

  public async reconciliarAtualizacaoOrdemServico(
    comando: ComandoReconciliarAtualizacaoOrdemServicoErp,
  ): Promise<ResultadoReconciliacaoAtualizacaoOrdemServicoErp> {
    this.validarContextoOrdemServico(comando);
    this.validarIdentificadorExterno(comando.ordemServicoExternaId);
    if (!this.reconciliacaoDisponivel) return this.indisponivel();
    const efeito = this.efeitosAtualizacaoOrdem.get(
      comando.chaveIdempotencia,
    );
    if (efeito === undefined) return { resultado: 'EFEITO_AUSENTE' };
    if (
      efeito.atendimentoId !== comando.atendimentoId ||
      efeito.ordemServicoExternaId !== comando.ordemServicoExternaId
    ) {
      throw new ErroChaveErpReutilizada();
    }
    return { resultado: 'CONFIRMADO' };
  }

  public async adicionarComentarioAtendimento(
    comando: ComandoAdicionarComentarioAtendimentoErp,
  ): Promise<ResultadoAcaoAtendimentoErp> {
    this.validarContextoAcaoAtendimento(comando);
    if (!textoValido(comando.comentario, 4_000)) {
      throw new ErroComandoErpInvalido();
    }
    const anterior = this.execucoesComentarioAtendimento.get(
      comando.chaveIdempotencia,
    );
    const assinatura = assinaturaComando(comando);
    if (anterior !== undefined) {
      if (anterior.assinatura !== assinatura) {
        throw new ErroChaveErpReutilizada();
      }
      return { ...anterior.resultado };
    }
    this.tentativasComentarioAtendimento += 1;
    const resultado = this.executarCenarioAcaoAtendimento(
      comando,
      this.cenariosComentarioAtendimento.get(comando.chaveIdempotencia) ??
        'CONFIRMAR',
      this.efeitosComentarioAtendimento,
    );
    this.execucoesComentarioAtendimento.set(comando.chaveIdempotencia, {
      assinatura,
      resultado,
    });
    return { ...resultado };
  }

  public async reconciliarComentarioAtendimento(
    comando: ComandoReconciliarComentarioAtendimentoErp,
  ): Promise<ResultadoReconciliacaoAcaoAtendimentoErp> {
    return this.reconciliarAcaoAtendimento(
      comando,
      this.efeitosComentarioAtendimento,
    );
  }

  public async encerrarAtendimento(
    comando: ComandoEncerrarAtendimentoErp,
  ): Promise<ResultadoAcaoAtendimentoErp> {
    this.validarContextoAcaoAtendimento(comando);
    if (!textoValido(comando.motivo, 500)) {
      throw new ErroComandoErpInvalido();
    }
    const anterior = this.execucoesEncerramentoAtendimento.get(
      comando.chaveIdempotencia,
    );
    const assinatura = assinaturaComando(comando);
    if (anterior !== undefined) {
      if (anterior.assinatura !== assinatura) {
        throw new ErroChaveErpReutilizada();
      }
      return { ...anterior.resultado };
    }
    this.tentativasEncerramentoAtendimento += 1;
    const resultado = this.executarCenarioAcaoAtendimento(
      comando,
      this.cenariosEncerramentoAtendimento.get(comando.chaveIdempotencia) ??
        'CONFIRMAR',
      this.efeitosEncerramentoAtendimento,
    );
    this.execucoesEncerramentoAtendimento.set(comando.chaveIdempotencia, {
      assinatura,
      resultado,
    });
    return { ...resultado };
  }

  public async reconciliarEncerramentoAtendimento(
    comando: ComandoReconciliarEncerramentoAtendimentoErp,
  ): Promise<ResultadoReconciliacaoAcaoAtendimentoErp> {
    return this.reconciliarAcaoAtendimento(
      comando,
      this.efeitosEncerramentoAtendimento,
    );
  }

  public async reconciliarCriacaoAtendimento(
    comando: ComandoReconciliarAtendimentoErp,
  ): Promise<ResultadoReconciliacaoAtendimentoErp> {
    if (
      !IDENTIFICADOR_UUID.test(comando.atendimentoId) ||
      !CHAVE_IDEMPOTENCIA.test(comando.chaveIdempotencia)
    ) {
      throw new ErroComandoErpInvalido();
    }
    if (!this.reconciliacaoDisponivel) return this.indisponivel();
    const efeito = this.efeitosCriacao.get(comando.chaveIdempotencia);
    if (efeito === undefined) return { resultado: 'EFEITO_AUSENTE' };
    if (efeito.atendimentoId !== comando.atendimentoId) {
      throw new ErroChaveErpReutilizada();
    }
    return {
      confirmadoEm: new Date(efeito.confirmadoEm),
      protocoloOficial: efeito.protocoloOficial,
      resultado: 'CONFIRMADO',
    };
  }

  public obterQuantidadeTentativasCriacao(): number {
    return this.tentativasCriacao;
  }

  public obterQuantidadeEfeitosCriacao(): number {
    return this.efeitosCriacao.size;
  }

  public obterQuantidadeTentativasDesbloqueio(): number {
    return this.tentativasDesbloqueio;
  }

  public obterQuantidadeEfeitosDesbloqueio(): number {
    return this.efeitosDesbloqueio.size;
  }

  public obterQuantidadeTentativasCriacaoOrdemServico(): number {
    return this.tentativasCriacaoOrdem;
  }

  public obterQuantidadeEfeitosCriacaoOrdemServico(): number {
    return this.efeitosCriacaoOrdem.size;
  }

  public obterQuantidadeTentativasAtualizacaoOrdemServico(): number {
    return this.tentativasAtualizacaoOrdem;
  }

  public obterQuantidadeEfeitosAtualizacaoOrdemServico(): number {
    return this.efeitosAtualizacaoOrdem.size;
  }

  public obterQuantidadeTentativasComentarioAtendimento(): number {
    return this.tentativasComentarioAtendimento;
  }

  public obterQuantidadeEfeitosComentarioAtendimento(): number {
    return this.efeitosComentarioAtendimento.size;
  }

  public obterQuantidadeTentativasEncerramentoAtendimento(): number {
    return this.tentativasEncerramentoAtendimento;
  }

  public obterQuantidadeEfeitosEncerramentoAtendimento(): number {
    return this.efeitosEncerramentoAtendimento.size;
  }

  private programarAcao(
    chaveIdempotencia: string,
    cenario: CenarioAcaoAtendimento,
    execucoes: ReadonlyMap<string, ExecucaoAcaoAtendimento>,
    cenarios: Map<string, CenarioAcaoAtendimento>,
  ): void {
    if (
      !CHAVE_IDEMPOTENCIA.test(chaveIdempotencia) ||
      execucoes.has(chaveIdempotencia)
    ) {
      throw new ErroComandoErpInvalido();
    }
    cenarios.set(chaveIdempotencia, cenario);
  }

  private async reconciliarAcaoAtendimento(
    comando:
      | ComandoReconciliarComentarioAtendimentoErp
      | ComandoReconciliarEncerramentoAtendimentoErp,
    efeitos: ReadonlyMap<string, EfeitoAcaoAtendimento>,
  ): Promise<ResultadoReconciliacaoAcaoAtendimentoErp> {
    this.validarContextoAcaoAtendimento(comando);
    if (!this.reconciliacaoDisponivel) return this.indisponivel();
    const efeito = efeitos.get(comando.chaveIdempotencia);
    if (efeito === undefined) return { resultado: 'EFEITO_AUSENTE' };
    if (
      efeito.atendimentoId !== comando.atendimentoId ||
      efeito.protocoloOficial !== comando.protocoloOficial
    ) {
      throw new ErroChaveErpReutilizada();
    }
    return { resultado: 'CONFIRMADO' };
  }

  private indisponivel(): {
    readonly resultado: 'INDISPONIVEL';
    readonly codigo: 'ERP_INDISPONIVEL';
  } {
    return { codigo: 'ERP_INDISPONIVEL', resultado: 'INDISPONIVEL' };
  }

  private clonarResultadoCriacao(
    resultado: ResultadoCriacaoAtendimentoErp,
  ): ResultadoCriacaoAtendimentoErp {
    if (resultado.resultado !== 'CONFIRMADO') return { ...resultado };
    return { ...resultado, confirmadoEm: new Date(resultado.confirmadoEm) };
  }

  private clonarResultadoDesbloqueio(
    resultado: ResultadoExecucaoDesbloqueioConfiancaErp,
  ): ResultadoExecucaoDesbloqueioConfiancaErp {
    return { ...resultado };
  }

  private executarCenarioCriacao(
    comando: ComandoCriarAtendimentoErp,
    cenario: CenarioCriacaoAtendimento,
  ): ResultadoCriacaoAtendimentoErp {
    if (cenario === 'ERP_INDISPONIVEL') {
      return {
        codigo: 'ERP_INDISPONIVEL',
        efeitoExternoPossivel: false,
        resultado: 'INDISPONIVEL',
      };
    }

    const efeito = this.criarEfeito(comando);
    this.efeitosCriacao.set(comando.chaveIdempotencia, efeito);
    if (cenario === 'PERDER_RESPOSTA') {
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    }
    return {
      confirmadoEm: new Date(efeito.confirmadoEm),
      protocoloOficial: efeito.protocoloOficial,
      resultado: 'CONFIRMADO',
    };
  }

  private executarCenarioDesbloqueio(
    comando: ComandoExecutarDesbloqueioConfiancaErp,
    cenario: CenarioDesbloqueioConfianca,
  ): ResultadoExecucaoDesbloqueioConfiancaErp {
    if (cenario === 'ERP_INDISPONIVEL') {
      return {
        codigo: 'ERP_INDISPONIVEL',
        efeitoExternoPossivel: false,
        resultado: 'INDISPONIVEL',
      };
    }
    const efeito: EfeitoDesbloqueioConfianca = {
      atendimentoId: comando.atendimentoId,
      contratoExternoId: comando.contratoExternoId,
    };
    this.efeitosDesbloqueio.set(comando.chaveIdempotencia, efeito);
    if (cenario === 'PERDER_RESPOSTA') {
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    }
    return {
      resultado: 'CONFIRMADO',
    };
  }

  private executarCenarioCriacaoOrdemServico(
    comando: ComandoCriarOrdemServicoErp,
    cenario: CenarioOrdemServico,
  ): ResultadoCriacaoOrdemServicoErp {
    if (cenario === 'ERP_INDISPONIVEL') {
      return {
        codigo: 'ERP_INDISPONIVEL',
        efeitoExternoPossivel: false,
        resultado: 'INDISPONIVEL',
      };
    }
    const efeito: EfeitoCriacaoOrdemServico = {
      atendimentoId: comando.atendimentoId,
      clienteExternoId: comando.clienteExternoId,
      contratoExternoId: comando.contratoExternoId,
      ordemServicoExternaId: `OS-SIM-${hashHex(
        `${comando.atendimentoId}:${comando.chaveIdempotencia}`,
      )
        .slice(0, 16)
        .toUpperCase()}`,
      protocoloOficial: comando.protocoloOficial,
    };
    this.efeitosCriacaoOrdem.set(comando.chaveIdempotencia, efeito);
    if (cenario === 'PERDER_RESPOSTA') {
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    }
    return {
      ordemServicoExternaId: efeito.ordemServicoExternaId,
      resultado: 'CONFIRMADO',
    };
  }

  private executarCenarioAtualizacaoOrdemServico(
    comando: ComandoAtualizarOrdemServicoErp,
    cenario: CenarioOrdemServico,
  ): ResultadoAtualizacaoOrdemServicoErp {
    if (cenario === 'ERP_INDISPONIVEL') {
      return {
        codigo: 'ERP_INDISPONIVEL',
        efeitoExternoPossivel: false,
        resultado: 'INDISPONIVEL',
      };
    }
    const efeito: EfeitoAtualizacaoOrdemServico = {
      atendimentoId: comando.atendimentoId,
      ordemServicoExternaId: comando.ordemServicoExternaId,
    };
    this.efeitosAtualizacaoOrdem.set(comando.chaveIdempotencia, efeito);
    if (cenario === 'PERDER_RESPOSTA') {
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    }
    return { resultado: 'CONFIRMADO' };
  }

  private executarCenarioAcaoAtendimento(
    comando:
      | ComandoAdicionarComentarioAtendimentoErp
      | ComandoEncerrarAtendimentoErp,
    cenario: CenarioAcaoAtendimento,
    efeitos: Map<string, EfeitoAcaoAtendimento>,
  ): ResultadoAcaoAtendimentoErp {
    if (
      cenario === 'ERP_INDISPONIVEL' ||
      cenario === 'CAPACIDADE_NAO_HABILITADA'
    ) {
      return {
        codigo: cenario,
        efeitoExternoPossivel: false,
        resultado: 'INDISPONIVEL',
      };
    }
    efeitos.set(comando.chaveIdempotencia, {
      atendimentoId: comando.atendimentoId,
      protocoloOficial: comando.protocoloOficial,
    });
    if (cenario === 'PERDER_RESPOSTA') {
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    }
    return { resultado: 'CONFIRMADO' };
  }

  private criarEfeito(
    comando: ComandoCriarAtendimentoErp,
  ): EfeitoCriacaoAtendimento {
    return {
      atendimentoId: comando.atendimentoId,
      confirmadoEm: this.relogio(),
      protocoloOficial: `SIM-${hashHex(
        `${comando.atendimentoId}:${comando.chaveIdempotencia}`,
      )
        .slice(0, 16)
        .toUpperCase()}`,
    };
  }

  private validarCriterios(criterios: CriteriosLocalizacaoClienteErp): void {
    const valores = [
      criterios.clienteExternoId,
      criterios.documento,
      criterios.nome,
      criterios.telefone,
    ];
    if (
      valores.every((valor) => valor === undefined) ||
      valores.some(
        (valor) => valor !== undefined && !textoValido(valor, 256),
      )
    ) {
      throw new ErroConsultaErpInvalida();
    }
  }

  private validarIdentificadorExterno(identificador: string): void {
    if (!textoValido(identificador, 256)) {
      throw new ErroConsultaErpInvalida();
    }
  }

  private validarContextoFatura(contexto: ContextoConsultaFaturaErp): void {
    this.validarIdentificadorExterno(contexto.clienteExternoId);
    this.validarIdentificadorExterno(contexto.contratoExternoId);
    this.validarIdentificadorExterno(contexto.faturaExternaId);
  }

  private contextoContratoUnivoco(
    contexto: ContextoConsultaContratoErp,
  ): boolean {
    const contratos = (this.dados.contratos ?? []).filter(
      ({ clienteExternoId, contratoExternoId }) =>
        clienteExternoId === contexto.clienteExternoId &&
        contratoExternoId === contexto.contratoExternoId,
    );
    return contratos.length === 1;
  }

  private validarComandoCriacao(comando: ComandoCriarAtendimentoErp): void {
    if (
      !IDENTIFICADOR_UUID.test(comando.atendimentoId) ||
      !CHAVE_IDEMPOTENCIA.test(comando.chaveIdempotencia) ||
      Number.isNaN(comando.iniciadoEm.getTime()) ||
      !textoValido(comando.assunto, 1_000) ||
      (comando.clienteExternoId !== undefined &&
        !textoValido(comando.clienteExternoId, 256)) ||
      (comando.contratoExternoId !== undefined &&
        !textoValido(comando.contratoExternoId, 256))
    ) {
      throw new ErroComandoErpInvalido();
    }
  }

  private validarComandoDesbloqueio(
    comando:
      | ComandoExecutarDesbloqueioConfiancaErp
      | ComandoReconciliarDesbloqueioConfiancaErp,
  ): void {
    if (
      !IDENTIFICADOR_UUID.test(comando.atendimentoId) ||
      !CHAVE_IDEMPOTENCIA.test(comando.chaveIdempotencia) ||
      !textoValido(comando.contratoExternoId, 256)
    ) {
      throw new ErroComandoErpInvalido();
    }
  }

  private validarContextoOrdemServico(
    comando: ComandoReconciliarCriacaoOrdemServicoErp,
  ): void {
    if (
      !IDENTIFICADOR_UUID.test(comando.atendimentoId) ||
      !CHAVE_IDEMPOTENCIA.test(comando.chaveIdempotencia) ||
      !textoValido(comando.clienteExternoId, 256) ||
      !textoValido(comando.contratoExternoId, 256) ||
      !textoValido(comando.protocoloOficial, 256)
    ) {
      throw new ErroComandoErpInvalido();
    }
  }

  private validarComandoCriacaoOrdemServico(
    comando: ComandoCriarOrdemServicoErp,
  ): void {
    this.validarContextoOrdemServico(comando);
    if (
      !textoValido(comando.assunto, 200) ||
      !textoValido(comando.descricao, 4_000)
    ) {
      throw new ErroComandoErpInvalido();
    }
  }

  private validarComandoAtualizacaoOrdemServico(
    comando: ComandoAtualizarOrdemServicoErp,
  ): void {
    this.validarComandoCriacaoOrdemServico(comando);
    this.validarIdentificadorExterno(comando.ordemServicoExternaId);
  }

  private validarContextoAcaoAtendimento(
    comando:
      | ComandoAdicionarComentarioAtendimentoErp
      | ComandoEncerrarAtendimentoErp
      | ComandoReconciliarComentarioAtendimentoErp
      | ComandoReconciliarEncerramentoAtendimentoErp,
  ): void {
    if (
      !IDENTIFICADOR_UUID.test(comando.atendimentoId) ||
      !CHAVE_IDEMPOTENCIA.test(comando.chaveIdempotencia) ||
      !textoValido(comando.protocoloOficial, 256)
    ) {
      throw new ErroComandoErpInvalido();
    }
  }

  private clienteCorresponde(
    cliente: ClienteErpSimulado,
    criterios: CriteriosLocalizacaoClienteErp,
  ): boolean {
    return (
      (criterios.clienteExternoId === undefined ||
        cliente.clienteExternoId === criterios.clienteExternoId) &&
      (criterios.documento === undefined ||
        cliente.documentoBusca === criterios.documento) &&
      (criterios.telefone === undefined ||
        cliente.telefoneBusca === criterios.telefone) &&
      (criterios.nome === undefined ||
        normalizarBusca(cliente.nomeExibicao).includes(
          normalizarBusca(criterios.nome),
        ))
    );
  }
}
