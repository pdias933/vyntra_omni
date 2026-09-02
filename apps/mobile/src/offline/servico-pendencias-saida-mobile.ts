import * as Crypto from 'expo-crypto';

import { ErroAtendimentoMobile } from '../atendimentos/adaptador-atendimentos-http';
import type { ServicoAtendimentosMobile } from '../atendimentos/servico-atendimentos-mobile';
import type { ServicoAutenticacaoAplicativo } from '../autenticacao/servico-autenticacao-aplicativo';
import type {
  PendenciaSaidaTextoLocal,
  RepositorioReplicaLocal,
} from './repositorio-replica-local';

export class ServicoPendenciasSaidaMobile {
  private reconciliacao: Promise<void> | undefined;

  public constructor(
    private readonly autenticacao: ServicoAutenticacaoAplicativo,
    private readonly atendimentos: ServicoAtendimentosMobile,
    private readonly repositorio: RepositorioReplicaLocal,
  ) {}

  public async criar(entrada: {
    readonly atendimentoId: string;
    readonly conversaId: string;
    readonly texto: string;
    readonly usuarioId: string;
  }): Promise<PendenciaSaidaTextoLocal> {
    const sessao = await this.autenticacao.restaurarOffline();
    if (sessao === undefined || sessao.usuarioId !== entrada.usuarioId) {
      throw new Error('AUTORIZACAO_OFFLINE_INDISPONIVEL');
    }
    return this.repositorio.criarPendenciaSaidaTexto({
      atendimentoId: entrada.atendimentoId,
      chaveIdempotencia: Crypto.randomUUID(),
      conversaId: entrada.conversaId,
      criadaEm: new Date().toISOString(),
      id: Crypto.randomUUID(),
      texto: entrada.texto,
      usuarioId: entrada.usuarioId,
    });
  }

  public reconciliarAguardando(): Promise<void> {
    if (this.reconciliacao !== undefined) return this.reconciliacao;
    this.reconciliacao = this.executarReconciliacao().finally(() => {
      this.reconciliacao = undefined;
    });
    return this.reconciliacao;
  }

  public async editarComoRascunho(id: string): Promise<string> {
    return this.repositorio.editarPendenciaComoRascunho(id);
  }

  public async descartar(id: string): Promise<void> {
    await this.repositorio.concluirPendenciaSaidaTexto(id);
  }

  public async enviarMesmoAssim(
    pendencia: PendenciaSaidaTextoLocal,
  ): Promise<void> {
    await this.atendimentos.enviarTexto(pendencia.atendimentoId, {
      mensagemClienteId: Crypto.randomUUID(),
      texto: pendencia.texto,
    });
    await this.repositorio.concluirPendenciaSaidaTexto(pendencia.id);
  }

  private async executarReconciliacao(): Promise<void> {
    const pendencias = await this.repositorio.listarPendenciasSaidaTexto();
    for (const pendencia of pendencias) {
      if (pendencia.estado !== 'AGUARDANDO_CONEXAO') continue;
      try {
        const resultado = await this.atendimentos.reconciliarTexto(
          pendencia.atendimentoId,
          {
            chaveIdempotencia: pendencia.chaveIdempotencia,
            criadaEm: pendencia.criadaEm,
            janelaObservada: pendencia.janelaObservada,
            sequenciaObservada: pendencia.sequenciaObservada,
            texto: pendencia.texto,
            versaoAtribuicao: pendencia.versaoAtribuicao,
            versaoContexto: pendencia.versaoContexto,
            versaoEstado: pendencia.versaoEstado,
          },
        );
        if (resultado.estado === 'ENVIADA_PARA_FILA') {
          await this.repositorio.concluirPendenciaSaidaTexto(pendencia.id);
        } else {
          await this.repositorio.marcarPendenciaParaRevisao(
            pendencia.id,
            resultado.motivos,
          );
        }
      } catch (erro) {
        const acessoAlterado =
          (erro instanceof ErroAtendimentoMobile &&
            (erro.statusHttp === 401 || erro.statusHttp === 403)) ||
          this.statusHttp(erro) === 401 ||
          this.statusHttp(erro) === 403;
        if (acessoAlterado) {
          await this.repositorio.marcarPendenciaParaRevisao(pendencia.id, [
            'ACESSO_ALTERADO',
          ]);
        } else if (
          erro instanceof ErroAtendimentoMobile &&
          erro.codigo === 'JANELA_META_EXPIRADA'
        ) {
          await this.repositorio.marcarPendenciaParaRevisao(pendencia.id, [
            'JANELA_EXPIRADA',
          ]);
        }
      }
    }
  }

  private statusHttp(erro: unknown): number | undefined {
    if (erro === null || typeof erro !== 'object') return undefined;
    const status = Reflect.get(erro, 'statusHttp');
    return typeof status === 'number' ? status : undefined;
  }
}
