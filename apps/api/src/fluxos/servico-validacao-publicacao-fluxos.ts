import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroConflitoVersaoFluxo,
  ErroFluxoIndisponivel,
  ErroFluxoInvalido,
  ErroFluxoNaoPublicavel,
  ErroVersaoFluxoIndisponivel,
  ErroVersaoFluxoNaoValidavel,
} from './erros-fluxo.js';
import type {
  EntradaPreparacaoPublicacaoFluxo,
  ProblemaValidacaoFluxo,
  ResultadoPreparacaoPublicacaoFluxo,
} from './modelo-validacao-fluxo.js';
import {
  REPOSITORIO_FLUXOS,
  type RepositorioFluxos,
} from './repositorio-fluxos.js';
import {
  PROVEDOR_CONTEXTO_VALIDACAO_FLUXO,
  type ProvedorContextoValidacaoFluxo,
} from './provedor-contexto-validacao-fluxo.js';
import { ValidadorPublicacaoFluxo } from './validador-publicacao-fluxo.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoValidacaoPublicacaoFluxos {
  public constructor(
    @Inject(REPOSITORIO_FLUXOS)
    private readonly repositorio: RepositorioFluxos,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
    @Inject(ValidadorPublicacaoFluxo)
    private readonly validador: ValidadorPublicacaoFluxo,
    @Inject(PROVEDOR_CONTEXTO_VALIDACAO_FLUXO)
    private readonly provedorContexto: ProvedorContextoValidacaoFluxo,
  ) {}

  public async prepararParaPublicacao(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaPreparacaoPublicacaoFluxo,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoPreparacaoPublicacaoFluxo> {
    const versaoFluxoId = this.validarId(entrada.versaoFluxoId);
    const revisaoEsperada = this.validarRevisao(entrada.revisaoVersaoEsperada);
    await this.autorizar(sessao, versaoFluxoId, transacao);
    const observada = await this.repositorio.obterVersao(
      versaoFluxoId,
      transacao,
    );
    if (observada === undefined) throw new ErroVersaoFluxoIndisponivel();
    await this.repositorio.bloquearFluxo(observada.fluxoId, transacao);
    const [fluxo, versao] = await Promise.all([
      this.repositorio.obterFluxo(observada.fluxoId, transacao),
      this.repositorio.obterVersao(versaoFluxoId, transacao),
    ]);
    if (fluxo?.ativo !== true) throw new ErroFluxoIndisponivel();
    if (versao === undefined || versao.fluxoId !== fluxo.id) {
      throw new ErroVersaoFluxoIndisponivel();
    }
    if (versao.estado !== 'RASCUNHO') {
      throw new ErroVersaoFluxoNaoValidavel();
    }
    if (versao.revisao !== revisaoEsperada) {
      throw new ErroConflitoVersaoFluxo();
    }
    const contexto = await this.provedorContexto.obter(
      versao.definicao,
      transacao,
    );
    const relatorio = this.validador.validar(versao.definicao, contexto);
    if (!relatorio.valido) {
      throw new ErroFluxoNaoPublicavel(
        relatorio.problemas.map((problema) => this.sanitizarProblema(problema)),
      );
    }
    const agora = this.obterAgora(relogio);
    if (
      !(await this.repositorio.marcarVersaoEmTeste(
        versao.id,
        fluxo.id,
        revisaoEsperada,
        agora,
        transacao,
      ))
    ) {
      throw new ErroConflitoVersaoFluxo();
    }
    const revisaoVersao = revisaoEsperada + 1;
    await this.auditoria.registrar(
      {
        acao: 'VALIDAR_FLUXO_PUBLICACAO',
        dadosNovos: {
          estado: 'EM_TESTE',
          fluxoId: fluxo.id,
          quantidadeConexoes: relatorio.quantidadeConexoes,
          quantidadeNos: relatorio.quantidadeNos,
          revisaoVersao,
        },
        entidadeId: versao.id,
        entidadeTipo: 'VERSAO_FLUXO',
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: 'VERSAO_FLUXO_VALIDADA',
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
    return {
      estado: 'EM_TESTE',
      fluxoId: fluxo.id,
      relatorio,
      revisaoVersao,
      versaoFluxoId: versao.id,
    };
  }

  private async autorizar(
    sessao: ContextoSessaoAutorizacao,
    versaoFluxoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.autorizacao.autorizar(
      {
        permissao: 'PUBLICAR_FLUXO',
        recurso: { id: versaoFluxoId, tipo: 'VERSAO_FLUXO' },
        sessao,
      },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
      transacao,
    );
  }

  private sanitizarProblema(
    problema: ProblemaValidacaoFluxo,
  ): Readonly<Record<string, string>> {
    return {
      codigo: problema.codigo,
      ...(problema.noId === undefined ? {} : { noId: problema.noId }),
      ...(problema.referenciaId === undefined
        ? {}
        : { referenciaId: problema.referenciaId }),
      ...(problema.variavel === undefined
        ? {}
        : { variavel: problema.variavel }),
    };
  }

  private validarId(valor: unknown): string {
    if (typeof valor !== 'string' || !UUID.test(valor)) {
      throw new ErroFluxoInvalido();
    }
    return valor;
  }

  private validarRevisao(valor: unknown): number {
    if (!Number.isInteger(valor) || typeof valor !== 'number' || valor < 1) {
      throw new ErroFluxoInvalido();
    }
    return valor;
  }

  private obterAgora(relogio: () => Date): Date {
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) throw new ErroFluxoInvalido();
    return agora;
  }
}
