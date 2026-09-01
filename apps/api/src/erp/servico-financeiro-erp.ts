import type { ConsultasErp } from './adaptador-erp.js';
import { ErroConsultaErpInvalida } from './erros-erp.js';
import { ErroRespostaConsultaErpInvalida } from './servico-consultas-cliente-contrato-erp.js';
import type {
  DadosPagamentoFaturaErpNormalizados,
  DocumentoFaturaErpNormalizado,
  FaturaErpNormalizada,
  ResultadoConsultaErp,
  ResultadoConsultaUnicaErp,
} from './modelo-erp.js';

const DATA = /^\d{4}-\d{2}-\d{2}$/u;
const PIX = /^[\x20-\x7E]{16,1024}$/u;
const LINHA_DIGITAVEL = /^\d{36,64}$/u;
const ASSINATURA_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

type CampoComplementarFatura<T> =
  | { readonly estado: 'DISPONIVEL'; readonly item: T }
  | {
      readonly estado: 'INDISPONIVEL';
      readonly motivo:
        | 'CAPACIDADE_NAO_HABILITADA'
        | 'ERP_INDISPONIVEL'
        | 'NAO_FORNECIDO';
    };

export type ResultadoDetalhesFaturaErp =
  | {
      readonly resultado: 'SUCESSO';
      readonly origem: 'TEMPO_REAL';
      readonly completude: 'COMPLETA' | 'PARCIAL';
      readonly fatura: FaturaErpNormalizada;
      readonly documento: CampoComplementarFatura<DocumentoFaturaErpNormalizado>;
      readonly dadosPagamento: CampoComplementarFatura<DadosPagamentoFaturaErpNormalizados>;
    }
  | Exclude<
      ResultadoConsultaUnicaErp<FaturaErpNormalizada>,
      { readonly resultado: 'SUCESSO' }
    >;

export class ServicoFinanceiroErp {
  public constructor(private readonly consultas: ConsultasErp) {}

  public async listarFaturas(
    contratoExternoId: string,
  ): Promise<ResultadoConsultaErp<FaturaErpNormalizada>> {
    this.validarIdentificador(contratoExternoId);
    const resultado = await this.consultas.listarFaturas(contratoExternoId);
    if (resultado.resultado !== 'SUCESSO') return { ...resultado };
    const itens = resultado.itens.map((item) => this.validarFatura(item));
    if (
      itens.length > 100 ||
      itens.some((item) => item.contratoExternoId !== contratoExternoId)
    ) {
      throw new ErroRespostaConsultaErpInvalida();
    }
    return { itens, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
  }

  public async consultarDetalhesFatura(
    faturaExternaId: string,
  ): Promise<ResultadoDetalhesFaturaErp> {
    this.validarIdentificador(faturaExternaId);
    const base = await this.consultas.consultarFatura(faturaExternaId);
    if (base.resultado !== 'SUCESSO') return { ...base };
    const fatura = this.validarFatura(base.item);
    if (fatura.faturaExternaId !== faturaExternaId) {
      throw new ErroRespostaConsultaErpInvalida();
    }

    const [resultadoDocumento, resultadoPagamento] = await Promise.all([
      this.consultas.obterDocumentoFatura(faturaExternaId),
      this.consultas.obterDadosPagamentoFatura(faturaExternaId),
    ]);
    const documento =
      resultadoDocumento.resultado === 'SUCESSO'
        ? {
            estado: 'DISPONIVEL' as const,
            item: this.validarDocumento(resultadoDocumento.item, faturaExternaId),
          }
        : {
            estado: 'INDISPONIVEL' as const,
            motivo:
              resultadoDocumento.resultado === 'NAO_ENCONTRADO'
                ? ('NAO_FORNECIDO' as const)
                : resultadoDocumento.codigo,
          };
    const dadosPagamento =
      resultadoPagamento.resultado === 'SUCESSO'
        ? {
            estado: 'DISPONIVEL' as const,
            item: this.validarDadosPagamento(
              resultadoPagamento.item,
              faturaExternaId,
            ),
          }
        : {
            estado: 'INDISPONIVEL' as const,
            motivo:
              resultadoPagamento.resultado === 'NAO_ENCONTRADO'
                ? ('NAO_FORNECIDO' as const)
                : resultadoPagamento.codigo,
          };
    return {
      completude:
        documento.estado === 'DISPONIVEL' &&
        dadosPagamento.estado === 'DISPONIVEL'
          ? 'COMPLETA'
          : 'PARCIAL',
      dadosPagamento,
      documento,
      fatura,
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
    };
  }

  private validarFatura(item: FaturaErpNormalizada): FaturaErpNormalizada {
    if (
      !this.chavesConhecidas(item, [
        'contratoExternoId',
        'faturaExternaId',
        'situacao',
        'valorCentavos',
        'vencimento',
      ]) ||
      !this.textoValido(item.faturaExternaId, 256) ||
      !this.textoValido(item.contratoExternoId, 256) ||
      !['ABERTA', 'CANCELADA', 'PAGA', 'VENCIDA'].includes(item.situacao) ||
      !Number.isSafeInteger(item.valorCentavos) ||
      item.valorCentavos < 0 ||
      !DATA.test(item.vencimento)
    ) {
      throw new ErroRespostaConsultaErpInvalida();
    }
    return { ...item };
  }

  private validarDocumento(
    item: DocumentoFaturaErpNormalizado,
    faturaExternaId: string,
  ): DocumentoFaturaErpNormalizado {
    if (
      !this.chavesConhecidas(item, [
        'conteudo',
        'faturaExternaId',
        'nomeArquivo',
        'tipoArquivo',
      ]) ||
      item.faturaExternaId !== faturaExternaId ||
      item.tipoArquivo !== 'PDF' ||
      !this.textoValido(item.nomeArquivo, 255) ||
      !(item.conteudo instanceof Uint8Array) ||
      item.conteudo.byteLength < ASSINATURA_PDF.length ||
      item.conteudo.byteLength > 20 * 1024 * 1024 ||
      !ASSINATURA_PDF.every((byte, indice) => item.conteudo[indice] === byte)
    ) {
      throw new ErroRespostaConsultaErpInvalida();
    }
    return { ...item, conteudo: new Uint8Array(item.conteudo) };
  }

  private validarDadosPagamento(
    item: DadosPagamentoFaturaErpNormalizados,
    faturaExternaId: string,
  ): DadosPagamentoFaturaErpNormalizados {
    if (
      !this.chavesConhecidas(item, [
        'faturaExternaId',
        'linhaDigitavel',
        'pixCopiaCola',
      ]) ||
      item.faturaExternaId !== faturaExternaId ||
      (item.pixCopiaCola === undefined && item.linhaDigitavel === undefined) ||
      (item.pixCopiaCola !== undefined && !PIX.test(item.pixCopiaCola)) ||
      (item.linhaDigitavel !== undefined && !LINHA_DIGITAVEL.test(item.linhaDigitavel))
    ) {
      throw new ErroRespostaConsultaErpInvalida();
    }
    return {
      faturaExternaId: item.faturaExternaId,
      ...(item.linhaDigitavel === undefined
        ? {}
        : { linhaDigitavel: item.linhaDigitavel }),
      ...(item.pixCopiaCola === undefined
        ? {}
        : { pixCopiaCola: item.pixCopiaCola }),
    };
  }

  private validarIdentificador(valor: string): void {
    if (!this.textoValido(valor, 256)) throw new ErroConsultaErpInvalida();
  }

  private textoValido(valor: string, limite: number): boolean {
    return valor.trim().length > 0 && valor.length <= limite;
  }

  private chavesConhecidas(
    valor: object,
    permitidas: readonly string[],
  ): boolean {
    const conjunto = new Set(permitidas);
    return Object.keys(valor).every((chave) => conjunto.has(chave));
  }
}
