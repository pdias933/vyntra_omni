import { Inject, Injectable } from '@nestjs/common';

import type {
  CodigoPermissaoAutorizacao,
  ContextoSessaoAutorizacao,
} from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ErroFluxoInvalido } from './erros-fluxo.js';
import type { FluxoEditorPersistido } from './modelo-editor-fluxo.js';
import type {
  EntradaArquivamentoFluxo,
  EntradaCriacaoFluxo,
  EntradaNovaVersaoFluxo,
  EntradaPublicacaoFluxo,
  EntradaReversaoFluxo,
  FluxoComVersaoInicial,
  ResultadoMudancaPublicacaoFluxo,
  VersaoFluxoPersistida,
} from './modelo-fluxo.js';
import type {
  CenarioSimulacaoFluxo,
  ResultadoSimulacaoFluxo,
} from './modelo-simulacao-fluxo.js';
import type {
  EntradaPreparacaoPublicacaoFluxo,
  ResultadoPreparacaoPublicacaoFluxo,
} from './modelo-validacao-fluxo.js';
import {
  REPOSITORIO_FLUXOS,
  type RepositorioFluxos,
} from './repositorio-fluxos.js';
import { ServicoCatalogoFluxos } from './servico-catalogo-fluxos.js';
import { ServicoPublicacaoFluxos } from './servico-publicacao-fluxos.js';
import { ServicoValidacaoPublicacaoFluxos } from './servico-validacao-publicacao-fluxos.js';
import { SimuladorFluxos } from './simulador-fluxos.js';
import { ValidadorPublicacaoFluxo } from './validador-publicacao-fluxo.js';

const RECURSO_CATALOGO_FLUXOS = '11111111-1111-4111-8111-111111111169';

interface EntradaAlteracaoEditor {
  readonly fluxoId: unknown;
  readonly versaoFluxoId: unknown;
  readonly revisaoEsperada: unknown;
  readonly definicao: unknown;
  readonly versaoSchemaDefinicao?: unknown;
}

@Injectable()
export class ServicoEditorFluxos {
  public constructor(
    @Inject(REPOSITORIO_FLUXOS)
    private readonly repositorio: RepositorioFluxos,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoCatalogoFluxos)
    private readonly catalogo: ServicoCatalogoFluxos,
    @Inject(ServicoValidacaoPublicacaoFluxos)
    private readonly validacao: ServicoValidacaoPublicacaoFluxos,
    @Inject(ServicoPublicacaoFluxos)
    private readonly publicacao: ServicoPublicacaoFluxos,
    @Inject(ValidadorPublicacaoFluxo)
    private readonly validador: ValidadorPublicacaoFluxo,
    @Inject(SimuladorFluxos)
    private readonly simulador: SimuladorFluxos,
  ) {}

  public async listar(
    sessao: ContextoSessaoAutorizacao,
    transacao: TransacaoPrisma,
  ): Promise<readonly FluxoEditorPersistido[]> {
    await this.autorizarCatalogo(sessao, 'VISUALIZAR_FLUXO', transacao);
    return this.repositorio.listarFluxos(transacao);
  }

  public async simular(
    sessao: ContextoSessaoAutorizacao,
    definicaoRecebida: unknown,
    cenario: CenarioSimulacaoFluxo,
    transacao: TransacaoPrisma,
  ): Promise<ResultadoSimulacaoFluxo> {
    await this.autorizarCatalogo(sessao, 'TESTAR_FLUXO', transacao);
    const definicao = this.validador.interpretarRascunho(definicaoRecebida);
    if (definicao === undefined) throw new ErroFluxoInvalido();
    return this.simulador.simular(definicao, cenario);
  }

  public async obter(
    sessao: ContextoSessaoAutorizacao,
    fluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<FluxoEditorPersistido> {
    await this.autorizarFluxo(
      sessao,
      'VISUALIZAR_FLUXO',
      fluxoId,
      undefined,
      transacao,
    );
    const fluxo = await this.repositorio.obterFluxoComVersoes(
      fluxoId,
      transacao,
    );
    if (fluxo === undefined) throw new ErroFluxoInvalido();
    return fluxo;
  }

  public async criar(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaCriacaoFluxo,
    transacao: TransacaoPrisma,
  ): Promise<FluxoComVersaoInicial> {
    this.validarDefinicao(entrada.definicaoInicial);
    return this.catalogo.criarFluxo(sessao, entrada, transacao);
  }

  public async criarVersao(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaNovaVersaoFluxo,
    transacao: TransacaoPrisma,
  ): Promise<VersaoFluxoPersistida> {
    this.validarDefinicao(entrada.definicao);
    return this.catalogo.criarVersaoRascunho(sessao, entrada, transacao);
  }

  public async salvarRascunho(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaAlteracaoEditor,
    transacao: TransacaoPrisma,
  ): Promise<VersaoFluxoPersistida> {
    const fluxoId = this.validarId(entrada.fluxoId);
    const versaoFluxoId = this.validarId(entrada.versaoFluxoId);
    this.validarDefinicao(entrada.definicao);
    await this.autorizarFluxo(
      sessao,
      'EDITAR_FLUXO',
      fluxoId,
      versaoFluxoId,
      transacao,
    );
    return this.catalogo.alterarDefinicaoRascunho(
      sessao,
      {
        definicao: entrada.definicao,
        revisaoEsperada: entrada.revisaoEsperada,
        versaoFluxoId,
        ...(entrada.versaoSchemaDefinicao === undefined
          ? {}
          : { versaoSchemaDefinicao: entrada.versaoSchemaDefinicao }),
      },
      transacao,
    );
  }

  public async prepararParaPublicacao(
    sessao: ContextoSessaoAutorizacao,
    fluxoIdRecebido: unknown,
    entrada: EntradaPreparacaoPublicacaoFluxo,
    transacao: TransacaoPrisma,
  ): Promise<ResultadoPreparacaoPublicacaoFluxo> {
    const fluxoId = this.validarId(fluxoIdRecebido);
    const versaoFluxoId = this.validarId(entrada.versaoFluxoId);
    await this.autorizarFluxo(
      sessao,
      'PUBLICAR_FLUXO',
      fluxoId,
      versaoFluxoId,
      transacao,
    );
    return this.validacao.prepararParaPublicacao(sessao, entrada, transacao);
  }

  public publicar(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaPublicacaoFluxo,
    transacao: TransacaoPrisma,
  ): Promise<ResultadoMudancaPublicacaoFluxo> {
    return this.publicacao.publicar(sessao, entrada, transacao);
  }

  public arquivar(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaArquivamentoFluxo,
    transacao: TransacaoPrisma,
  ): Promise<ResultadoMudancaPublicacaoFluxo> {
    return this.publicacao.arquivarPublicacaoAtual(sessao, entrada, transacao);
  }

  public reverter(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaReversaoFluxo,
    transacao: TransacaoPrisma,
  ): Promise<ResultadoMudancaPublicacaoFluxo> {
    return this.publicacao.reverter(sessao, entrada, transacao);
  }

  private validarDefinicao(definicao: unknown): void {
    if (!this.validador.validarRascunho(definicao).valido) {
      throw new ErroFluxoInvalido();
    }
  }

  private async autorizarCatalogo(
    sessao: ContextoSessaoAutorizacao,
    permissao: Extract<
      CodigoPermissaoAutorizacao,
      'TESTAR_FLUXO' | 'VISUALIZAR_FLUXO'
    >,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.autorizacao.autorizar(
      {
        permissao,
        recurso: { id: RECURSO_CATALOGO_FLUXOS, tipo: 'CATALOGO_FLUXOS' },
        sessao,
      },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
      transacao,
    );
  }

  private async autorizarFluxo(
    sessao: ContextoSessaoAutorizacao,
    permissao: CodigoPermissaoAutorizacao,
    fluxoId: string,
    versaoFluxoId: string | undefined,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.autorizacao.autorizar(
      {
        permissao,
        recurso: { id: fluxoId, tipo: 'FLUXO' },
        sessao,
      },
      async () => {
        const [fluxo, versao] = await Promise.all([
          this.repositorio.obterFluxo(fluxoId, transacao),
          versaoFluxoId === undefined
            ? Promise.resolve(undefined)
            : this.repositorio.obterVersao(versaoFluxoId, transacao),
        ]);
        return {
          acessivel:
            fluxo !== undefined &&
            (versaoFluxoId === undefined || versao?.fluxoId === fluxoId),
          estadoPermiteAcao: fluxo?.ativo === true,
        };
      },
      transacao,
    );
  }

  private validarId(valor: unknown): string {
    if (
      typeof valor !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        valor,
      )
    ) {
      throw new ErroFluxoInvalido();
    }
    return valor;
  }
}
