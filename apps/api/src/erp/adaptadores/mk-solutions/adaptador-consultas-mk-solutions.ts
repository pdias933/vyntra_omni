import type { ConsultasErp } from '../../adaptador-erp.js';
import { ErroConsultaErpInvalida } from '../../erros-erp.js';
import type {
  ClienteErpNormalizado,
  ConexaoCadastradaErpNormalizada,
  ContextoConsultaContratoErp,
  ContextoConsultaFaturaErp,
  ContratoErpNormalizado,
  CriteriosLocalizacaoClienteErp,
  DadosPagamentoFaturaErpNormalizados,
  DocumentoFaturaErpNormalizado,
  FaturaErpNormalizada,
  ResultadoComplementoFaturaErp,
  ResultadoConsultaErp,
  ResultadoConsultaFaturasErp,
  ResultadoConsultaUnicaErp,
  ResultadoElegibilidadeDesbloqueioErp,
} from '../../modelo-erp.js';
import { ClienteHttpMkSolutions, type TransporteMkSolutions } from './cliente-http-mk-solutions.js';
import type { ConfiguracaoMkSolutions } from './configuracao-mk-solutions.js';

const IDENTIFICADOR_NUMERICO = /^[1-9][0-9]{0,17}$/u;
const DATA = /^\d{4}-\d{2}-\d{2}$/u;
const SERVICO_CONSULTA_DOCUMENTO = 6;
const SERVICO_CONSULTA_CONTRATOS = 8;
const SERVICO_CONSULTA_CONEXOES = 9;
const SERVICO_CONSULTA_FATURAS = 22;

interface FaturaComPagamento {
  readonly fatura: FaturaErpNormalizada;
  readonly linhaDigitavel?: string;
}

export class AdaptadorConsultasMkSolutions implements ConsultasErp {
  public constructor(
    private readonly configuracao: ConfiguracaoMkSolutions,
    private readonly transporte: TransporteMkSolutions = new ClienteHttpMkSolutions(
      configuracao,
    ),
  ) {}

  public async localizarClientes(
    criterios: CriteriosLocalizacaoClienteErp,
  ): Promise<ResultadoConsultaErp<ClienteErpNormalizado>> {
    const informados = Object.values(criterios).filter(
      (valor) => valor !== undefined,
    );
    if (informados.length !== 1) throw new ErroConsultaErpInvalida();
    if (criterios.documento !== undefined) {
      const documento = somenteDigitos(criterios.documento);
      if (documento.length !== 11 && documento.length !== 14) {
        throw new ErroConsultaErpInvalida();
      }
      const resposta = await this.consultarProtegido(
        SERVICO_CONSULTA_DOCUMENTO,
        '/mk/WSMKConsultaDoc.rule',
        { doc: documento },
      );
      if (erroNaoEncontrado(resposta)) {
        return { itens: [], origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
      }
      try {
        return {
          itens: [this.normalizarConsultaDocumento(resposta, documento)],
          origem: 'TEMPO_REAL',
          resultado: 'SUCESSO',
        };
      } catch {
        return indisponivel();
      }
    }
    if (criterios.clienteExternoId !== undefined) {
      validarIdentificador(criterios.clienteExternoId);
      return capacidadeNaoHabilitada();
    }
    return capacidadeNaoHabilitada();
  }

  public async consultarCliente(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaUnicaErp<ClienteErpNormalizado>> {
    validarIdentificador(clienteExternoId);
    return capacidadeNaoHabilitada();
  }

  public async listarContratos(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaErp<ContratoErpNormalizado>> {
    validarIdentificador(clienteExternoId);
    const resposta = await this.consultarProtegido(
      SERVICO_CONSULTA_CONTRATOS,
      '/mk/WSMKContratosPorCliente.rule',
      { cd_cliente: clienteExternoId },
    );
    try {
      const envelope = objetoComChaves(resposta, [
        'CodigoPessoa',
        'ContratosAtivos',
        'Nome',
        'status',
      ]);
      validarStatusOk(envelope);
      if (String(inteiroIdentificadorPositivo(envelope.CodigoPessoa)) !== clienteExternoId) {
        throw new Error('RESPOSTA_MK_DIVERGENTE');
      }
      const itens = lista(envelope.ContratosAtivos).map((valor) => {
        const item = objetoComChaves(valor, [
          'adesao',
          'cd_empresa',
          'codcontrato',
          'nome_empresa',
          'plano_acesso',
          'previsao_vencimento',
        ]);
        return {
          clienteExternoId,
          contratoExternoId: String(inteiroIdentificadorPositivo(item.codcontrato)),
          servico: texto(item.plano_acesso, 512),
          situacao: 'ATIVO' as const,
        };
      });
      validarIdentificadoresUnicos(
        itens.map(({ contratoExternoId }) => contratoExternoId),
      );
      return { itens, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
    } catch {
      return indisponivel();
    }
  }

  public async consultarContrato(
    contexto: ContextoConsultaContratoErp,
  ): Promise<ResultadoConsultaUnicaErp<ContratoErpNormalizado>> {
    validarContextoContrato(contexto);
    const resultado = await this.listarContratos(contexto.clienteExternoId);
    if (resultado.resultado !== 'SUCESSO') return resultado;
    const itens = resultado.itens.filter(
      (contrato) =>
        contrato.contratoExternoId === contexto.contratoExternoId,
    );
    if (itens.length === 0) {
      return { origem: 'TEMPO_REAL', resultado: 'NAO_ENCONTRADO' };
    }
    return itens.length === 1
      ? { item: itens[0]!, origem: 'TEMPO_REAL', resultado: 'SUCESSO' }
      : indisponivel();
  }

  public async listarConexoes(
    clienteExternoId: string,
  ): Promise<ResultadoConsultaErp<ConexaoCadastradaErpNormalizada>> {
    validarIdentificador(clienteExternoId);
    const resposta = await this.consultarProtegido(
      SERVICO_CONSULTA_CONEXOES,
      '/mk/WSMKConexoesPorCliente.rule',
      { cd_cliente: clienteExternoId },
    );
    try {
      const envelope = objetoComChaves(resposta, [
        'CodigoPessoa',
        'Conexoes',
        'Nome',
        'status',
      ]);
      validarStatusOk(envelope);
      if (String(inteiroIdentificadorPositivo(envelope.CodigoPessoa)) !== clienteExternoId) {
        throw new Error('RESPOSTA_MK_DIVERGENTE');
      }
      const itens = lista(envelope.Conexoes).map((valor) => {
        const item = objetoComChaves(valor, [
          'bloqueada',
          'cadastro',
          'cep',
          'codconexao',
          'contrato',
          'endereco',
          'esta_reduzida',
          'latitude',
          'longitude',
          'mac_address',
          'motivo_bloqueio',
          'tecnologia',
          'username',
        ]);
        const bloqueada = simNao(item.bloqueada);
        const reduzida = simNao(item.esta_reduzida);
        return {
          clienteExternoId,
          conexaoExternaId: String(inteiroIdentificadorPositivo(item.codconexao)),
          contratoExternoId: String(inteiroIdentificadorPositivo(item.contrato)),
          enderecoResumido: texto(item.endereco, 1_000),
          ...(reduzida === undefined ? {} : { reduzida }),
          situacaoCadastro:
            bloqueada === undefined
              ? ('DESCONHECIDA' as const)
              : bloqueada
                ? ('BLOQUEADA' as const)
                : ('LIBERADA' as const),
          tecnologia: texto(item.tecnologia, 256),
        };
      });
      validarIdentificadoresUnicos(
        itens.map(({ conexaoExternaId }) => conexaoExternaId),
      );
      return { itens, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
    } catch {
      return indisponivel();
    }
  }

  public async listarFaturas(
    contexto: ContextoConsultaContratoErp,
  ): Promise<ResultadoConsultaFaturasErp> {
    validarContextoContrato(contexto);
    const itens = await this.obterTodasFaturas(contexto);
    return itens === undefined
      ? indisponivel()
      : {
          cobertura: { quantidadeMeses: 1, tipo: 'JANELA_LIMITADA' },
          itens: itens.map(({ fatura }) => fatura),
          origem: 'TEMPO_REAL',
          resultado: 'SUCESSO',
        };
  }

  public async consultarFatura(
    contexto: ContextoConsultaFaturaErp,
  ): Promise<ResultadoConsultaUnicaErp<FaturaErpNormalizada>> {
    validarContextoFatura(contexto);
    const itens = await this.obterTodasFaturas(contexto);
    if (itens === undefined) return indisponivel();
    const item = itens.find(
      ({ fatura }) =>
        fatura.faturaExternaId === contexto.faturaExternaId,
    )?.fatura;
    return item === undefined
      ? { origem: 'TEMPO_REAL', resultado: 'NAO_ENCONTRADO' }
      : { item, origem: 'TEMPO_REAL', resultado: 'SUCESSO' };
  }

  public async obterDocumentoFatura(
    contexto: ContextoConsultaFaturaErp,
  ): Promise<ResultadoComplementoFaturaErp<DocumentoFaturaErpNormalizado>> {
    validarContextoFatura(contexto);
    return capacidadeNaoHabilitada();
  }

  public async obterDadosPagamentoFatura(
    contexto: ContextoConsultaFaturaErp,
  ): Promise<
    ResultadoComplementoFaturaErp<DadosPagamentoFaturaErpNormalizados>
  > {
    validarContextoFatura(contexto);
    const itens = await this.obterTodasFaturas(contexto);
    if (itens === undefined) return indisponivel();
    const item = itens.find(
      ({ fatura }) =>
        fatura.faturaExternaId === contexto.faturaExternaId,
    );
    const linhaDigitavel = item?.fatura.situacao === 'ABERTA'
      ? item.linhaDigitavel
      : undefined;
    return linhaDigitavel === undefined
      ? { origem: 'TEMPO_REAL', resultado: 'NAO_ENCONTRADO' }
      : {
          item: {
            clienteExternoId: contexto.clienteExternoId,
            contratoExternoId: contexto.contratoExternoId,
            faturaExternaId: contexto.faturaExternaId,
            linhaDigitavel,
          },
          origem: 'TEMPO_REAL',
          resultado: 'SUCESSO',
        };
  }

  public async verificarElegibilidadeDesbloqueio(
    contratoExternoId: string,
  ): Promise<ResultadoElegibilidadeDesbloqueioErp> {
    validarIdentificador(contratoExternoId);
    return capacidadeNaoHabilitada();
  }

  private async obterTodasFaturas(
    contexto: ContextoConsultaContratoErp,
  ): Promise<readonly FaturaComPagamento[] | undefined> {
    const contrato = await this.consultarContrato(contexto);
    if (contrato.resultado === 'INDISPONIVEL') return undefined;
    if (contrato.resultado === 'NAO_ENCONTRADO') return [];
    const abertas = await this.obterFaturasPorLiquidacao(contexto, 'N');
    if (abertas === undefined) return undefined;
    const pagas = await this.obterFaturasPorLiquidacao(contexto, 'S');
    if (pagas === undefined) return undefined;
    const faturas = [...abertas, ...pagas];
    try {
      validarIdentificadoresUnicos(
        faturas.map(({ fatura }) => fatura.faturaExternaId),
      );
      return faturas;
    } catch {
      return undefined;
    }
  }

  private async obterFaturasPorLiquidacao(
    contexto: ContextoConsultaContratoErp,
    liquidado: 'N' | 'S',
  ): Promise<readonly FaturaComPagamento[] | undefined> {
    const resposta = await this.consultarProtegido(
      SERVICO_CONSULTA_FATURAS,
      '/mk/WSMKFaturas.rule',
      {
        codigo_cliente: contexto.clienteExternoId,
        codigo_contrato: contexto.contratoExternoId,
        liquidado,
        quantidade_meses: '1',
      },
    );
    if (erroNaoEncontrado(resposta)) return [];
    try {
      const faturas = lista(resposta).map((valor) => {
        const item = objetoComChaves(valor, [
          'banco',
          'codfatura',
          'codigo_profile',
          'contas',
          'contratos',
          'cpf_cnpj',
          'data_lancamento',
          'data_liquidacao',
          'data_vencimento',
          'data_vencimento_original',
          'descricao',
          'forma_pagamento',
          'inscricao_estadual',
          'inscricao_municipal',
          'linha_digitavel_boleto',
          'nome_razaosocial',
          'nosso_numero',
          'status',
          'tipo_documento_descricao',
          'valor_pago',
          'valor_total_faturas',
        ]);
        const contratos = lista(item.contratos).map((relacao) =>
          objetoComChaves(relacao, [
            'adesao',
            'codigo_contrato',
            'data_referencia_final',
            'data_referencia_inicial',
            'plano',
            'tipo_plano',
            'tipo_utilizacao_servico',
            'tributacao',
          ]),
        );
        const contratosExternos = contratos.map((relacao) =>
          String(inteiroIdentificadorPositivo(relacao.codigo_contrato)),
        );
        validarIdentificadoresUnicos(contratosExternos);
        if (
          contratosExternos.filter(
            (identificador) => identificador === contexto.contratoExternoId,
          ).length !== 1
        ) {
          throw new Error('RELACAO_FATURA_MK_DIVERGENTE');
        }
        lista(item.contas).forEach((valorConta) => {
          objetoComChaves(valorConta, [
            'codconta',
            'data_referencia_final',
            'data_referencia_inicial',
            'descricao_conta',
            'nomenclatura_integracao',
            'tipo_documento',
            'valor_lancamento',
          ]);
        });
        const vencimento = texto(item.data_vencimento, 10);
        if (!dataIsoValida(vencimento)) throw new Error('DATA_MK_INVALIDA');
        const status = texto(item.status, 64).toLocaleLowerCase('pt-BR');
        const situacao = status === 'aberta' && liquidado === 'N'
          ? 'ABERTA' as const
          : status === 'pago' && liquidado === 'S'
            ? 'PAGA' as const
            : undefined;
        if (situacao === undefined) {
          throw new Error('STATUS_MK_NAO_CARACTERIZADO');
        }
        if (situacao === 'PAGA') {
          const dataLiquidacao = texto(item.data_liquidacao, 10);
          if (!dataIsoValida(dataLiquidacao) || centavos(item.valor_pago) <= 0) {
            throw new Error('LIQUIDACAO_MK_INVALIDA');
          }
        } else if (
          textoPossivelmenteVazio(item.data_liquidacao, 10) !== '' ||
          centavos(item.valor_pago) !== 0
        ) {
          throw new Error('LIQUIDACAO_MK_DIVERGENTE');
        }
        const linhaBruta = textoPossivelmenteVazio(
          item.linha_digitavel_boleto,
          128,
        );
        if (!/^[0-9 .-]*$/u.test(linhaBruta)) {
          throw new Error('LINHA_DIGITAVEL_MK_INVALIDA');
        }
        const linha = somenteDigitos(linhaBruta);
        return {
          fatura: {
            clienteExternoId: contexto.clienteExternoId,
            contratoExternoId: contexto.contratoExternoId,
            faturaExternaId: String(inteiroIdentificadorPositivo(item.codfatura)),
            situacao,
            valorCentavos: centavos(item.valor_total_faturas),
            vencimento,
          },
          ...(situacao === 'ABERTA' && linha.length >= 36 && linha.length <= 64
            ? { linhaDigitavel: linha }
            : {}),
        };
      });
      validarIdentificadoresUnicos(
        faturas.map(({ fatura }) => fatura.faturaExternaId),
      );
      return faturas;
    } catch {
      return undefined;
    }
  }

  private async consultarProtegido(
    codigoServico: number,
    caminho: string,
    parametros: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    try {
      const resposta = await this.executarComToken(
        codigoServico,
        caminho,
        parametros,
      );
      if (erroNaoEncontrado(resposta)) return resposta;
      if (erroMk(resposta)) throw new Error('RESPOSTA_MK_COM_ERRO');
      return resposta;
    } catch {
      return undefined;
    }
  }

  private async executarComToken(
    codigoServico: number,
    caminho: string,
    parametros: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    const token = await this.autenticar(codigoServico);
    if ('sys' in parametros || 'token' in parametros) {
      throw new Error('PARAMETRO_MK_RESERVADO');
    }
    return this.transporte.obterJson(caminho, {
      ...parametros,
      sys: this.configuracao.identificacaoSistema,
      token,
    });
  }

  private async autenticar(codigoServico: number): Promise<string> {
    const resposta = await this.transporte.obterJson(
      '/mk/WSAutenticacao.rule',
      {
        cd_servico: String(codigoServico),
        password: this.configuracao.contraSenha,
        sys: this.configuracao.identificacaoSistema,
        token: this.configuracao.tokenCadastroUsuario,
      },
    );
    const envelope = objetoComChaves(resposta, [
      'Expire',
      'LimiteUso',
      'ServicosAutorizados',
      'Token',
      'status',
    ]);
    validarStatusOk(envelope);
    texto(envelope.Expire, 64);
    inteiroIdentificadorPositivo(envelope.LimiteUso);
    const servicosAutorizados = lista(envelope.ServicosAutorizados).map(
      inteiroIdentificadorPositivo,
    );
    if (
      servicosAutorizados.length !== 1 ||
      servicosAutorizados[0] !== codigoServico
    ) {
      throw new Error('PRIVILEGIO_MK_EXCESSIVO');
    }
    const valor = texto(envelope.Token, 4_096);
    return valor;
  }

  private normalizarConsultaDocumento(
    resposta: unknown,
    documento: string,
  ): ClienteErpNormalizado {
    const item = objetoComChaves(resposta, [
      'CEP',
      'CodigoPessoa',
      'Email',
      'Endereco',
      'Fone',
      'Latitude',
      'Longitude',
      'Nome',
      'Outros',
      'Situacao',
      'status',
    ]);
    validarStatusOk(item);
    lista(item.Outros);
    return {
      clienteExternoId: String(inteiroIdentificadorPositivo(item.CodigoPessoa)),
      documentoMascarado: mascararDocumento(documento),
      nomeExibicao: texto(item.Nome, 512),
      telefoneMascarado: mascararTelefone(texto(item.Fone, 64)),
    };
  }
}

function validarContextoContrato(contexto: ContextoConsultaContratoErp): void {
  validarIdentificador(contexto.clienteExternoId);
  validarIdentificador(contexto.contratoExternoId);
}

function validarContextoFatura(contexto: ContextoConsultaFaturaErp): void {
  validarContextoContrato(contexto);
  validarIdentificador(contexto.faturaExternaId);
}

function validarIdentificador(valor: string): void {
  if (!IDENTIFICADOR_NUMERICO.test(valor)) throw new ErroConsultaErpInvalida();
}

function validarIdentificadoresUnicos(identificadores: readonly string[]): void {
  if (new Set(identificadores).size !== identificadores.length) {
    throw new Error('IDENTIFICADOR_MK_DUPLICADO');
  }
}

function dataIsoValida(valor: string): boolean {
  if (!DATA.test(valor)) return false;
  const [ano = 0, mes = 0, dia = 0] = valor.split('-').map(Number);
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1) return false;
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const diasNoMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dia <= diasNoMes[mes - 1]!;
}

function objetoComChaves(
  valor: unknown,
  chaves: readonly string[],
): Readonly<Record<string, unknown>> {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('OBJETO_MK_INVALIDO');
  }
  const objeto = valor as Readonly<Record<string, unknown>>;
  const atuais = Object.keys(objeto).sort();
  const esperadas = [...chaves].sort();
  if (
    atuais.length !== esperadas.length ||
    atuais.some((chave, indice) => chave !== esperadas[indice])
  ) {
    throw new Error('CAMPOS_MK_INVALIDOS');
  }
  return objeto;
}

function lista(valor: unknown): readonly unknown[] {
  if (!Array.isArray(valor) || valor.length > 1_000) {
    throw new Error('LISTA_MK_INVALIDA');
  }
  return valor;
}

function texto(valor: unknown, limite: number): string {
  if (
    typeof valor !== 'string' ||
    valor.trim().length === 0 ||
    valor.length > limite
  ) {
    throw new Error('TEXTO_MK_INVALIDO');
  }
  return valor;
}

function textoPossivelmenteVazio(valor: unknown, limite: number): string {
  if (typeof valor !== 'string' || valor.length > limite) {
    throw new Error('TEXTO_MK_INVALIDO');
  }
  return valor;
}

function inteiroSeguro(valor: unknown): number {
  if (!Number.isSafeInteger(valor) || Number(valor) < 0) {
    throw new Error('INTEIRO_MK_INVALIDO');
  }
  return Number(valor);
}

function inteiroIdentificadorPositivo(valor: unknown): number {
  const inteiro = inteiroSeguro(valor);
  if (inteiro === 0) throw new Error('IDENTIFICADOR_MK_INVALIDO');
  return inteiro;
}

function validarStatusOk(valor: Readonly<Record<string, unknown>>): void {
  if (valor.status !== 'OK') throw new Error('STATUS_MK_INVALIDO');
}

function erroMk(valor: unknown): boolean {
  return (
    valor !== null &&
    typeof valor === 'object' &&
    !Array.isArray(valor) &&
    (valor as Readonly<Record<string, unknown>>).status === 'ERRO'
  );
}

function erroNaoEncontrado(valor: unknown): boolean {
  return (
    erroMk(valor) &&
    Object.keys(valor as Readonly<Record<string, unknown>>).sort().join('|') ===
      'Mensagem|Num. ERRO|status' &&
    (valor as Readonly<Record<string, unknown>>)['Num. ERRO'] === '003' &&
    typeof (valor as Readonly<Record<string, unknown>>).Mensagem === 'string' &&
    String((valor as Readonly<Record<string, unknown>>).Mensagem).length > 0 &&
    String((valor as Readonly<Record<string, unknown>>).Mensagem).length <= 1_000
  );
}

function simNao(valor: unknown): boolean | undefined {
  if (typeof valor !== 'string') throw new Error('BOOLEANO_MK_INVALIDO');
  const normalizado = valor.trim().toLocaleLowerCase('pt-BR');
  if (normalizado === 'sim' || normalizado === 's') return true;
  if (normalizado === 'não' || normalizado === 'nao' || normalizado === 'n') {
    return false;
  }
  return undefined;
}

function somenteDigitos(valor: string): string {
  return valor.replace(/\D/gu, '');
}

function mascararDocumento(valor: string): string {
  const digitos = somenteDigitos(valor);
  if (digitos.length !== 11 && digitos.length !== 14) {
    throw new Error('DOCUMENTO_MK_INVALIDO');
  }
  return `${'•'.repeat(digitos.length - 4)}${digitos.slice(-4)}`;
}

function mascararTelefone(valor: string): string {
  const digitos = somenteDigitos(valor);
  if (digitos.length < 8 || digitos.length > 15) {
    throw new Error('TELEFONE_MK_INVALIDO');
  }
  return `${digitos.slice(0, Math.min(2, digitos.length - 4))} ••••••-${digitos.slice(-4)}`;
}

function centavos(valor: unknown): number {
  if (typeof valor !== 'string') throw new Error('VALOR_MK_INVALIDO');
  const normalizado = valor.trim();
  const correspondencia = /^(?:R\$\s*)?([0-9]{1,12})(?:[.,]([0-9]{2}))?$/u.exec(
    normalizado,
  );
  if (correspondencia === null) throw new Error('VALOR_MK_INVALIDO');
  const total = Number(correspondencia[1]) * 100 + Number(correspondencia[2] ?? '00');
  if (!Number.isSafeInteger(total)) throw new Error('VALOR_MK_INVALIDO');
  return total;
}

function indisponivel(): {
  readonly codigo: 'ERP_INDISPONIVEL';
  readonly resultado: 'INDISPONIVEL';
} {
  return { codigo: 'ERP_INDISPONIVEL', resultado: 'INDISPONIVEL' };
}

function capacidadeNaoHabilitada(): {
  readonly codigo: 'CAPACIDADE_NAO_HABILITADA';
  readonly resultado: 'INDISPONIVEL';
} {
  return {
    codigo: 'CAPACIDADE_NAO_HABILITADA',
    resultado: 'INDISPONIVEL',
  };
}
