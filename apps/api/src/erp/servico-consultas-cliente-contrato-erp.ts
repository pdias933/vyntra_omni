import type { ConsultasErp } from './adaptador-erp.js';
import { ErroConsultaErpInvalida } from './erros-erp.js';
import type {
  ClienteErpNormalizado,
  ContratoErpNormalizado,
  CriteriosLocalizacaoClienteErp,
  ResultadoConsultaErp,
  ResultadoConsultaUnicaErp,
} from './modelo-erp.js';

const LIMITE_RESULTADOS_BUSCA = 50;

export class ErroRespostaConsultaErpInvalida extends Error {
  public readonly codigo = 'RESPOSTA_CONSULTA_ERP_INVALIDA';

  public constructor() {
    super('RESPOSTA_CONSULTA_ERP_INVALIDA');
    this.name = 'ErroRespostaConsultaErpInvalida';
  }
}

export class ServicoConsultasClienteContratoErp {
  public constructor(private readonly consultas: ConsultasErp) {}

  public async localizarClientes(
    criterios: CriteriosLocalizacaoClienteErp,
  ): Promise<ResultadoConsultaErp<ClienteErpNormalizado>> {
    this.validarCriterios(criterios);
    const resultado = await this.consultas.localizarClientes(criterios);
    if (resultado.resultado !== 'SUCESSO') return { ...resultado };
    if (resultado.itens.length > LIMITE_RESULTADOS_BUSCA) {
      throw new ErroRespostaConsultaErpInvalida();
    }
    return {
      itens: resultado.itens.map((item) => this.validarCliente(item)),
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    };
  }

  public async consultarCliente(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaUnicaErp<ClienteErpNormalizado>> {
    this.validarIdentificador(clienteExternoId);
    const resultado = await this.consultas.consultarCliente(clienteExternoId);
    if (resultado.resultado !== 'SUCESSO') return { ...resultado };
    const item = this.validarCliente(resultado.item);
    if (item.clienteExternoId !== clienteExternoId) {
      throw new ErroRespostaConsultaErpInvalida();
    }
    return { item, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
  }

  public async listarContratos(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaErp<ContratoErpNormalizado>> {
    this.validarIdentificador(clienteExternoId);
    const resultado = await this.consultas.listarContratos(clienteExternoId);
    if (resultado.resultado !== 'SUCESSO') return { ...resultado };
    const itens = resultado.itens.map((item) => this.validarContrato(item));
    if (
      itens.length > LIMITE_RESULTADOS_BUSCA ||
      itens.some((item) => item.clienteExternoId !== clienteExternoId)
    ) {
      throw new ErroRespostaConsultaErpInvalida();
    }
    return { itens, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
  }

  public async consultarContrato(
    contratoExternoId: string,
  ): Promise<ResultadoConsultaUnicaErp<ContratoErpNormalizado>> {
    this.validarIdentificador(contratoExternoId);
    const resultado = await this.consultas.consultarContrato(contratoExternoId);
    if (resultado.resultado !== 'SUCESSO') return { ...resultado };
    const item = this.validarContrato(resultado.item);
    if (item.contratoExternoId !== contratoExternoId) {
      throw new ErroRespostaConsultaErpInvalida();
    }
    return { item, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
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
        (valor) =>
          valor !== undefined &&
          (valor.trim().length === 0 || valor.length > 256),
      )
    ) {
      throw new ErroConsultaErpInvalida();
    }
  }

  private validarIdentificador(valor: string): void {
    if (valor.trim().length === 0 || valor.length > 256) {
      throw new ErroConsultaErpInvalida();
    }
  }

  private validarCliente(
    item: ClienteErpNormalizado,
  ): ClienteErpNormalizado {
    if (
      !this.chavesConhecidas(item, [
        'clienteExternoId',
        'documentoMascarado',
        'nomeExibicao',
        'telefoneMascarado',
      ]) ||
      !this.textoValido(item.clienteExternoId, 256) ||
      !this.textoValido(item.nomeExibicao, 512) ||
      !this.opcionalValido(item.documentoMascarado, 64) ||
      !this.opcionalValido(item.telefoneMascarado, 64)
    ) {
      throw new ErroRespostaConsultaErpInvalida();
    }
    return {
      clienteExternoId: item.clienteExternoId,
      nomeExibicao: item.nomeExibicao,
      ...(item.documentoMascarado === undefined
        ? {}
        : { documentoMascarado: item.documentoMascarado }),
      ...(item.telefoneMascarado === undefined
        ? {}
        : { telefoneMascarado: item.telefoneMascarado }),
    };
  }

  private validarContrato(
    item: ContratoErpNormalizado,
  ): ContratoErpNormalizado {
    if (
      !this.chavesConhecidas(item, [
        'clienteExternoId',
        'contratoExternoId',
        'enderecoResumido',
        'servico',
        'situacao',
      ]) ||
      !this.textoValido(item.contratoExternoId, 256) ||
      !this.textoValido(item.clienteExternoId, 256) ||
      !['ATIVO', 'ENCERRADO', 'SUSPENSO', 'DESCONHECIDO'].includes(
        item.situacao,
      ) ||
      !this.opcionalValido(item.servico, 512) ||
      !this.opcionalValido(item.enderecoResumido, 1_000)
    ) {
      throw new ErroRespostaConsultaErpInvalida();
    }
    return {
      clienteExternoId: item.clienteExternoId,
      contratoExternoId: item.contratoExternoId,
      ...(item.enderecoResumido === undefined
        ? {}
        : { enderecoResumido: item.enderecoResumido }),
      ...(item.servico === undefined ? {} : { servico: item.servico }),
      situacao: item.situacao,
    };
  }

  private chavesConhecidas(
    valor: object,
    permitidas: readonly string[],
  ): boolean {
    const conjunto = new Set(permitidas);
    return Object.keys(valor).every((chave) => conjunto.has(chave));
  }

  private textoValido(valor: string, limite: number): boolean {
    return valor.trim().length > 0 && valor.length <= limite;
  }

  private opcionalValido(valor: string | undefined, limite: number): boolean {
    return valor === undefined || this.textoValido(valor, limite);
  }
}
