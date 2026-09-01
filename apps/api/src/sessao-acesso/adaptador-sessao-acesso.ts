import type {
  ComandoDesconectarSessaoAcesso,
  ComandoReconciliarDesconexaoSessaoAcesso,
  FiltroSessoesAcesso,
  ResultadoConsultaSessaoAcesso,
  ResultadoDesconexaoSessaoAcesso,
  ResultadoListaSessoesAcesso,
  ResultadoReconciliacaoDesconexaoSessaoAcesso,
} from './modelo-sessao-acesso.js';

export const ADAPTADOR_SESSAO_ACESSO = Symbol('ADAPTADOR_SESSAO_ACESSO');

export interface AdaptadorSessaoAcesso {
  listarSessoes(
    filtro: FiltroSessoesAcesso,
  ): Promise<ResultadoListaSessoesAcesso>;

  consultarSessao(
    sessaoId: string,
  ): Promise<ResultadoConsultaSessaoAcesso>;

  desconectarSessao(
    comando: ComandoDesconectarSessaoAcesso,
  ): Promise<ResultadoDesconexaoSessaoAcesso>;

  reconciliarDesconexao(
    comando: ComandoReconciliarDesconexaoSessaoAcesso,
  ): Promise<ResultadoReconciliacaoDesconexaoSessaoAcesso>;
}
