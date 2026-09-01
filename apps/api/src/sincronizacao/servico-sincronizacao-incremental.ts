import { Inject, Injectable } from '@nestjs/common';

import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import {
  ErroCursorSincronizacaoInvalido,
  ErroRessincronizacaoCompletaNecessaria,
} from './erros-sincronizacao.js';
import type { LoteSincronizacaoIncremental } from './modelo-sincronizacao.js';
import { ProjetorEventoCliente } from './projetor-evento-cliente.js';
import {
  REPOSITORIO_SINCRONIZACAO,
  type RepositorioSincronizacao,
} from './repositorio-sincronizacao.js';

const DURACAO_RETENCAO_MS = 30 * 24 * 60 * 60 * 1_000;
const LIMITE_MAXIMO = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoSincronizacaoIncremental {
  private readonly projetor = new ProjetorEventoCliente();

  public constructor(
    @Inject(REPOSITORIO_SINCRONIZACAO)
    private readonly repositorio: RepositorioSincronizacao,
  ) {}

  public async sincronizar(
    sessao: ContextoSessaoAutorizacao,
    audiencia: 'MOBILE' | 'WEB',
    aposRecebido: string,
    limiteRecebido: string | undefined,
    relogio: () => Date = () => new Date(),
  ): Promise<LoteSincronizacaoIncremental> {
    const agora = relogio();
    this.validarSessao(sessao, agora);
    const apos = this.lerCursor(aposRecebido);
    const limite = this.lerLimite(limiteRecebido);
    const corteRetencao = new Date(agora.getTime() - DURACAO_RETENCAO_MS);
    const limites = await this.repositorio.obterLimitesRetencao(corteRetencao);
    if (apos > limites.maiorSequencia) throw new ErroCursorSincronizacaoInvalido();
    if (
      apos > 0n &&
      (limites.menorSequenciaRetida === undefined ||
        apos + 1n < limites.menorSequenciaRetida)
    ) {
      throw new ErroRessincronizacaoCompletaNecessaria();
    }
    const varridos = await this.repositorio.listarEventos(
      sessao.usuarioId,
      apos,
      corteRetencao,
      limite + 1,
    );
    const pagina = varridos.slice(0, limite);
    const eventos = pagina.flatMap((item) => {
      if (!item.autorizado) return [];
      const payload = this.projetor.projetar(item.evento, audiencia, {
        podeReceberPush: false,
        podeVerDadoPessoal: true,
        podeVerDadoSensivel: item.podeVerDadoSensivel,
        recursoAcessivel: true,
        sessaoValida: true,
        usuarioId: sessao.usuarioId,
      });
      return payload?.audiencia === audiencia ? [payload] : [];
    });
    return {
      eventos,
      sequenciaFinal: (pagina.at(-1)?.evento.sequenciaEvento ?? apos).toString(),
      temMais: varridos.length > limite,
    };
  }

  private lerCursor(valor: string): bigint {
    if (!/^(0|[1-9][0-9]{0,18})$/u.test(valor)) {
      throw new ErroCursorSincronizacaoInvalido();
    }
    const cursor = BigInt(valor);
    if (cursor > 9_223_372_036_854_775_807n) {
      throw new ErroCursorSincronizacaoInvalido();
    }
    return cursor;
  }

  private lerLimite(valor: string | undefined): number {
    if (valor === undefined) return LIMITE_MAXIMO;
    if (!/^[1-9][0-9]{0,2}$/u.test(valor)) throw new ErroCursorSincronizacaoInvalido();
    const limite = Number(valor);
    if (limite > LIMITE_MAXIMO) throw new ErroCursorSincronizacaoInvalido();
    return limite;
  }

  private validarSessao(sessao: ContextoSessaoAutorizacao, agora: Date): void {
    if (
      !UUID.test(sessao.sessaoId) ||
      !UUID.test(sessao.usuarioId) ||
      sessao.estado !== 'ATIVA' ||
      !Number.isFinite(agora.getTime()) ||
      !Number.isFinite(sessao.expiraEm.getTime()) ||
      sessao.expiraEm <= agora
    ) {
      throw new ErroCursorSincronizacaoInvalido();
    }
  }
}
