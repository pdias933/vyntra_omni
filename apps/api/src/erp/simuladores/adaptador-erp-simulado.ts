import { createHash } from 'node:crypto';

import type { AdaptadorErp } from '../adaptador-erp.js';
import {
  ErroChaveErpReutilizada,
  ErroComandoErpInvalido,
  ErroConsultaErpInvalida,
} from '../erros-erp.js';
import type {
  ClienteErpNormalizado,
  ComandoCriarAtendimentoErp,
  ComandoReconciliarAtendimentoErp,
  ContratoErpNormalizado,
  CriteriosLocalizacaoClienteErp,
  FaturaErpNormalizada,
  ResultadoConsultaErp,
  ResultadoCriacaoAtendimentoErp,
  ResultadoReconciliacaoAtendimentoErp,
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
  readonly faturas?: readonly FaturaErpNormalizada[];
}

type CenarioCriacaoAtendimento =
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

function assinaturaComando(comando: ComandoCriarAtendimentoErp): string {
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
      .map((contrato) => ({ ...contrato }));
    return { itens, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
  }

  public async listarFaturas(
    contratoExternoId: string,
  ): Promise<ResultadoConsultaErp<FaturaErpNormalizada>> {
    this.validarIdentificadorExterno(contratoExternoId);
    if (!this.consultasDisponiveis) return this.indisponivel();
    const itens = (this.dados.faturas ?? [])
      .filter((fatura) => fatura.contratoExternoId === contratoExternoId)
      .map((fatura) => ({ ...fatura }));
    return { itens, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
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
