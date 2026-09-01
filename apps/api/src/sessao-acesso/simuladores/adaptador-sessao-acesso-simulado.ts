import { createHash } from 'node:crypto';

import type { AdaptadorSessaoAcesso } from '../adaptador-sessao-acesso.js';
import {
  ErroChaveSessaoAcessoReutilizada,
  ErroEntradaSessaoAcessoInvalida,
} from '../erros-sessao-acesso.js';
import type {
  ComandoDesconectarSessaoAcesso,
  ComandoReconciliarDesconexaoSessaoAcesso,
  EstadoFonteSessaoAcesso,
  EstadoSessaoAcesso,
  FiltroSessoesAcesso,
  ResultadoConsultaSessaoAcesso,
  ResultadoDesconexaoSessaoAcesso,
  ResultadoFonteSessaoAcesso,
  ResultadoListaSessoesAcesso,
  ResultadoReconciliacaoDesconexaoSessaoAcesso,
  SessaoAcessoNormalizada,
} from '../modelo-sessao-acesso.js';

const CHAVE_IDEMPOTENCIA = /^[A-Za-z0-9_-]{16,128}$/u;
const ESTADOS_SESSAO = new Set<EstadoSessaoAcesso>([
  'ATIVA',
  'DESCONHECIDA',
  'INATIVA',
]);

export interface SessaoAcessoSimulada {
  readonly sessaoId: string;
  readonly contratoExternoId: string;
  readonly estado: EstadoSessaoAcesso;
  readonly conexaoExternaId?: string;
  readonly nomeUsuario?: string;
  readonly enderecoIp?: string;
  readonly iniciadaEm?: Date;
  readonly duracaoSegundos?: number;
}

type CenarioDesconexao = 'CONFIRMAR' | 'FONTE_INDISPONIVEL' | 'PERDER_RESPOSTA';

interface ExecucaoDesconexao {
  readonly assinatura: string;
  readonly resultado: ResultadoDesconexaoSessaoAcesso;
}

interface EfeitoDesconexao {
  readonly sessaoId: string;
  readonly confirmadaEm: Date;
}

function textoValido(valor: string, limite: number): boolean {
  return valor.trim().length > 0 && valor.length <= limite;
}

function hashHex(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

function assinaturaComando(comando: ComandoDesconectarSessaoAcesso): string {
  return hashHex(
    JSON.stringify({
      chaveIdempotencia: comando.chaveIdempotencia,
      motivo: comando.motivo,
      sessaoId: comando.sessaoId,
    }),
  );
}

export class AdaptadorSessaoAcessoSimulado
  implements AdaptadorSessaoAcesso
{
  private estadoFonte: EstadoFonteSessaoAcesso = 'DESATIVADO';
  private readonly sessoes = new Map<string, SessaoAcessoSimulada>();
  private readonly cenarios = new Map<string, CenarioDesconexao>();
  private readonly execucoes = new Map<string, ExecucaoDesconexao>();
  private readonly efeitos = new Map<string, EfeitoDesconexao>();
  private tentativasDesconexao = 0;

  public constructor(
    sessoes: readonly SessaoAcessoSimulada[] = [],
    private readonly relogio: () => Date = () => new Date(),
  ) {
    for (const sessao of sessoes) {
      this.validarSessao(sessao);
      if (this.sessoes.has(sessao.sessaoId)) {
        throw new ErroEntradaSessaoAcessoInvalida();
      }
      this.sessoes.set(sessao.sessaoId, this.clonarFixture(sessao));
    }
  }

  public definirEstadoFonte(estado: EstadoFonteSessaoAcesso): void {
    if (
      !['DESATIVADO', 'DISPONIVEL', 'INDISPONIVEL', 'NAO_CONFIGURADO'].includes(
        estado,
      )
    ) {
      throw new ErroEntradaSessaoAcessoInvalida();
    }
    this.estadoFonte = estado;
  }

  public programarDesconexao(
    chaveIdempotencia: string,
    cenario: CenarioDesconexao,
  ): void {
    if (
      !CHAVE_IDEMPOTENCIA.test(chaveIdempotencia) ||
      this.execucoes.has(chaveIdempotencia)
    ) {
      throw new ErroEntradaSessaoAcessoInvalida();
    }
    this.cenarios.set(chaveIdempotencia, cenario);
  }

  public async listarSessoes(
    filtro: FiltroSessoesAcesso,
  ): Promise<ResultadoListaSessoesAcesso> {
    this.validarFiltro(filtro);
    const fonte = this.resultadoFonte();
    if (fonte !== undefined) return fonte;
    const obtidaEm = this.relogio();
    const sessoes = [...this.sessoes.values()]
      .filter(
        (sessao) =>
          sessao.contratoExternoId === filtro.contratoExternoId &&
          (filtro.conexaoExternaId === undefined ||
            sessao.conexaoExternaId === filtro.conexaoExternaId) &&
          (filtro.nomeUsuario === undefined ||
            sessao.nomeUsuario === filtro.nomeUsuario),
      )
      .map((sessao) => this.normalizarSessao(sessao, obtidaEm));
    return { resultado: 'SUCESSO', sessoes };
  }

  public async consultarSessao(
    sessaoId: string,
  ): Promise<ResultadoConsultaSessaoAcesso> {
    this.validarIdentificador(sessaoId);
    const fonte = this.resultadoFonte();
    if (fonte !== undefined) return fonte;
    const sessao = this.sessoes.get(sessaoId);
    return {
      resultado: 'SUCESSO',
      ...(sessao === undefined
        ? {}
        : { sessao: this.normalizarSessao(sessao, this.relogio()) }),
    };
  }

  public async desconectarSessao(
    comando: ComandoDesconectarSessaoAcesso,
  ): Promise<ResultadoDesconexaoSessaoAcesso> {
    this.validarComando(comando);
    const fonte = this.resultadoFonte();
    if (fonte !== undefined) return fonte;
    const assinatura = assinaturaComando(comando);
    const anterior = this.execucoes.get(comando.chaveIdempotencia);
    if (anterior !== undefined) {
      if (anterior.assinatura !== assinatura) {
        throw new ErroChaveSessaoAcessoReutilizada();
      }
      return this.clonarResultado(anterior.resultado);
    }

    this.tentativasDesconexao += 1;
    const resultado = this.executarDesconexao(
      comando,
      this.cenarios.get(comando.chaveIdempotencia) ?? 'CONFIRMAR',
    );
    this.execucoes.set(comando.chaveIdempotencia, { assinatura, resultado });
    return this.clonarResultado(resultado);
  }

  public async reconciliarDesconexao(
    comando: ComandoReconciliarDesconexaoSessaoAcesso,
  ): Promise<ResultadoReconciliacaoDesconexaoSessaoAcesso> {
    this.validarIdentificador(comando.sessaoId);
    if (!CHAVE_IDEMPOTENCIA.test(comando.chaveIdempotencia)) {
      throw new ErroEntradaSessaoAcessoInvalida();
    }
    const fonte = this.resultadoFonte();
    if (fonte !== undefined) return fonte;
    const efeito = this.efeitos.get(comando.chaveIdempotencia);
    if (efeito === undefined) return { resultado: 'EFEITO_AUSENTE' };
    if (efeito.sessaoId !== comando.sessaoId) {
      throw new ErroChaveSessaoAcessoReutilizada();
    }
    return {
      confirmadaEm: new Date(efeito.confirmadaEm),
      resultado: 'CONFIRMADA',
    };
  }

  public obterQuantidadeTentativasDesconexao(): number {
    return this.tentativasDesconexao;
  }

  public obterQuantidadeEfeitosDesconexao(): number {
    return this.efeitos.size;
  }

  private executarDesconexao(
    comando: ComandoDesconectarSessaoAcesso,
    cenario: CenarioDesconexao,
  ): ResultadoDesconexaoSessaoAcesso {
    if (cenario === 'FONTE_INDISPONIVEL') {
      return {
        codigo: 'FONTE_SESSAO_ACESSO_INDISPONIVEL',
        resultado: 'INDISPONIVEL',
      };
    }
    const sessao = this.sessoes.get(comando.sessaoId);
    if (sessao === undefined) return { resultado: 'SESSAO_NAO_ENCONTRADA' };
    if (sessao.estado === 'INATIVA') return { resultado: 'JA_INATIVA' };
    if (sessao.estado === 'DESCONHECIDA') {
      return { resultado: 'ESTADO_NAO_PERMITE' };
    }

    const efeito = {
      confirmadaEm: this.relogio(),
      sessaoId: sessao.sessaoId,
    };
    this.sessoes.set(sessao.sessaoId, { ...sessao, estado: 'INATIVA' });
    this.efeitos.set(comando.chaveIdempotencia, efeito);
    if (cenario === 'PERDER_RESPOSTA') {
      return {
        codigo: 'RESPOSTA_PERDIDA',
        requerReconciliacao: true,
        resultado: 'RESULTADO_INCERTO',
      };
    }
    return {
      confirmadaEm: new Date(efeito.confirmadaEm),
      resultado: 'CONFIRMADA',
    };
  }

  private resultadoFonte(): ResultadoFonteSessaoAcesso | undefined {
    switch (this.estadoFonte) {
      case 'DISPONIVEL':
        return undefined;
      case 'DESATIVADO':
        return { resultado: 'DESATIVADO' };
      case 'NAO_CONFIGURADO':
        return { resultado: 'NAO_CONFIGURADO' };
      case 'INDISPONIVEL':
        return {
          codigo: 'FONTE_SESSAO_ACESSO_INDISPONIVEL',
          resultado: 'INDISPONIVEL',
        };
    }
  }

  private normalizarSessao(
    sessao: SessaoAcessoSimulada,
    obtidaEm: Date,
  ): SessaoAcessoNormalizada {
    return {
      contratoExternoId: sessao.contratoExternoId,
      estado: sessao.estado,
      obtidaEm: new Date(obtidaEm),
      origemDado: 'TEMPO_REAL',
      sessaoId: sessao.sessaoId,
      ...(sessao.conexaoExternaId === undefined
        ? {}
        : { conexaoExternaId: sessao.conexaoExternaId }),
      ...(sessao.nomeUsuario === undefined
        ? {}
        : { nomeUsuario: sessao.nomeUsuario }),
      ...(sessao.enderecoIp === undefined
        ? {}
        : { enderecoIp: sessao.enderecoIp }),
      ...(sessao.iniciadaEm === undefined
        ? {}
        : { iniciadaEm: new Date(sessao.iniciadaEm) }),
      ...(sessao.duracaoSegundos === undefined
        ? {}
        : { duracaoSegundos: sessao.duracaoSegundos }),
    };
  }

  private clonarFixture(sessao: SessaoAcessoSimulada): SessaoAcessoSimulada {
    return {
      ...sessao,
      ...(sessao.iniciadaEm === undefined
        ? {}
        : { iniciadaEm: new Date(sessao.iniciadaEm) }),
    };
  }

  private clonarResultado(
    resultado: ResultadoDesconexaoSessaoAcesso,
  ): ResultadoDesconexaoSessaoAcesso {
    if (resultado.resultado !== 'CONFIRMADA') return { ...resultado };
    return { ...resultado, confirmadaEm: new Date(resultado.confirmadaEm) };
  }

  private validarFiltro(filtro: FiltroSessoesAcesso): void {
    if (
      !textoValido(filtro.contratoExternoId, 256) ||
      (filtro.conexaoExternaId !== undefined &&
        !textoValido(filtro.conexaoExternaId, 256)) ||
      (filtro.nomeUsuario !== undefined &&
        !textoValido(filtro.nomeUsuario, 256))
    ) {
      throw new ErroEntradaSessaoAcessoInvalida();
    }
  }

  private validarComando(comando: ComandoDesconectarSessaoAcesso): void {
    this.validarIdentificador(comando.sessaoId);
    if (
      !CHAVE_IDEMPOTENCIA.test(comando.chaveIdempotencia) ||
      !textoValido(comando.motivo, 500)
    ) {
      throw new ErroEntradaSessaoAcessoInvalida();
    }
  }

  private validarIdentificador(identificador: string): void {
    if (!textoValido(identificador, 256)) {
      throw new ErroEntradaSessaoAcessoInvalida();
    }
  }

  private validarSessao(sessao: SessaoAcessoSimulada): void {
    if (
      !textoValido(sessao.sessaoId, 256) ||
      !textoValido(sessao.contratoExternoId, 256) ||
      !ESTADOS_SESSAO.has(sessao.estado) ||
      (sessao.conexaoExternaId !== undefined &&
        !textoValido(sessao.conexaoExternaId, 256)) ||
      (sessao.nomeUsuario !== undefined &&
        !textoValido(sessao.nomeUsuario, 256)) ||
      (sessao.enderecoIp !== undefined &&
        !textoValido(sessao.enderecoIp, 64)) ||
      (sessao.iniciadaEm !== undefined &&
        Number.isNaN(sessao.iniciadaEm.getTime())) ||
      (sessao.duracaoSegundos !== undefined &&
        (!Number.isSafeInteger(sessao.duracaoSegundos) ||
          sessao.duracaoSegundos < 0))
    ) {
      throw new ErroEntradaSessaoAcessoInvalida();
    }
  }
}
