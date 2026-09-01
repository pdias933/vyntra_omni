import { Inject, Injectable } from '@nestjs/common';

import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import type { ConsultasErp } from '../erp/adaptador-erp.js';
import type {
  ElegibilidadeDesbloqueioErpNormalizada,
  ResultadoElegibilidadeDesbloqueioErp,
} from '../erp/modelo-erp.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import {
  ErroEntradaDesbloqueioConfiancaInvalida,
  ErroRespostaElegibilidadeDesbloqueioInvalida,
} from './erros-desbloqueio-confianca.js';
import type {
  EntradaVerificacaoDesbloqueioConfianca,
  ResultadoVerificacaoDesbloqueioConfianca,
  UltimoDesbloqueioConfianca,
} from './modelo-desbloqueio-confianca.js';
import {
  REPOSITORIO_DESBLOQUEIOS_CONFIANCA,
  type RepositorioDesbloqueiosConfianca,
} from './repositorio-desbloqueios-confianca.js';

const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INTERVALO_TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1_000;

@Injectable()
export class ServicoElegibilidadeDesbloqueioConfianca {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(REPOSITORIO_DESBLOQUEIOS_CONFIANCA)
    private readonly repositorio: RepositorioDesbloqueiosConfianca,
  ) {}

  public async verificar(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaVerificacaoDesbloqueioConfianca,
    consultasErp: ConsultasErp,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoVerificacaoDesbloqueioConfianca> {
    this.validarEntrada(entrada);
    const ultimo = await this.prisma.executarLeituraConsistente(
      async (transacao) => {
        await this.autorizacao.autorizar(
          {
            filaId: entrada.filaId,
            permissao: 'VERIFICAR_DESBLOQUEIO_CONFIANCA',
            recurso: {
              id: entrada.atendimentoId,
              tipo: 'ATENDIMENTO',
            },
            sessao,
          },
          async (_autorizacao, transacaoAutorizada) => ({
            acessivel:
              transacaoAutorizada !== undefined &&
              (await this.repositorio.contextoAtivoCorresponde(
                entrada.atendimentoId,
                entrada.filaId,
                entrada.contratoExternoId,
                transacaoAutorizada,
              )),
            estadoPermiteAcao: true,
          }),
          transacao,
        );
        return this.repositorio.obterUltimoConfirmado(
          entrada.contratoExternoId,
          transacao,
        );
      },
    );

    const resultadoErp = this.validarResultadoErp(
      await consultasErp.verificarElegibilidadeDesbloqueio(
        entrada.contratoExternoId,
      ),
      entrada.contratoExternoId,
    );
    if (resultadoErp.resultado !== 'SUCESSO') return { ...resultadoErp };
    const consultadoEm = relogio();
    if (Number.isNaN(consultadoEm.getTime())) {
      throw new ErroRespostaElegibilidadeDesbloqueioInvalida();
    }
    return this.combinar(resultadoErp.item, ultimo, consultadoEm);
  }

  private combinar(
    erp: ElegibilidadeDesbloqueioErpNormalizada,
    ultimo: UltimoDesbloqueioConfianca | undefined,
    consultadoEm: Date,
  ): ResultadoVerificacaoDesbloqueioConfianca {
    const proximoDesbloqueioEm =
      ultimo === undefined
        ? undefined
        : new Date(ultimo.confirmadoEm.getTime() + INTERVALO_TRINTA_DIAS_MS);
    const intervaloVigente =
      proximoDesbloqueioEm !== undefined &&
      proximoDesbloqueioEm > consultadoEm;
    const motivos = [
      ...(erp.elegivel ? [] : (['ERP_NAO_AUTORIZOU'] as const)),
      ...(intervaloVigente ? (['INTERVALO_30_DIAS'] as const) : []),
    ];
    return {
      consultadoEm,
      elegivel: motivos.length === 0,
      motivos,
      origem: 'TEMPO_REAL',
      resultado: 'SUCESSO',
      ...(ultimo === undefined
        ? {}
        : { ultimoDesbloqueioConfirmadoEm: ultimo.confirmadoEm }),
      ...(proximoDesbloqueioEm === undefined
        ? {}
        : { proximoDesbloqueioEm }),
    };
  }

  private validarResultadoErp(
    resultado: ResultadoElegibilidadeDesbloqueioErp,
    contratoExternoId: string,
  ): ResultadoElegibilidadeDesbloqueioErp {
    if (resultado.resultado === 'SUCESSO') {
      const chavesResultado = Object.keys(resultado);
      const chavesItem = Object.keys(resultado.item);
      if (
        chavesResultado.length !== 3 ||
        !['item', 'origem', 'resultado'].every((chave) =>
          chavesResultado.includes(chave),
        ) ||
        resultado.origem !== 'TEMPO_REAL' ||
        chavesItem.length !== 2 ||
        !chavesItem.includes('contratoExternoId') ||
        !chavesItem.includes('elegivel') ||
        resultado.item.contratoExternoId !== contratoExternoId ||
        typeof resultado.item.elegivel !== 'boolean'
      ) {
        throw new ErroRespostaElegibilidadeDesbloqueioInvalida();
      }
      return { ...resultado, item: { ...resultado.item } };
    }
    if (resultado.resultado === 'NAO_ENCONTRADO') {
      if (
        Object.keys(resultado).length !== 2 ||
        resultado.origem !== 'TEMPO_REAL'
      ) {
        throw new ErroRespostaElegibilidadeDesbloqueioInvalida();
      }
      return { ...resultado };
    }
    if (
      Object.keys(resultado).length !== 2 ||
      !['CAPACIDADE_NAO_HABILITADA', 'ERP_INDISPONIVEL'].includes(
        resultado.codigo,
      )
    ) {
      throw new ErroRespostaElegibilidadeDesbloqueioInvalida();
    }
    return { ...resultado };
  }

  private validarEntrada(
    entrada: EntradaVerificacaoDesbloqueioConfianca,
  ): void {
    if (
      !IDENTIFICADOR_UUID.test(entrada.atendimentoId) ||
      !IDENTIFICADOR_UUID.test(entrada.filaId) ||
      entrada.contratoExternoId.trim().length < 1 ||
      entrada.contratoExternoId.length > 256
    ) {
      throw new ErroEntradaDesbloqueioConfiancaInvalida();
    }
  }
}
