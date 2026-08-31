import type { PlataformaMobile } from '../autenticacao/modelo-autenticacao-mobile.js';
import type { PapelBaseAutorizacao } from '../autorizacao/modelo-autorizacao.js';

export type EstadoControleRecurso = 'ATIVADO' | 'DESATIVADO';

export interface ControleRecursoPersistido {
  readonly id: string;
  readonly codigo: string;
  readonly estado: EstadoControleRecurso;
  readonly desligadoEmergencialmente: boolean;
  readonly liberarAdministradores: boolean;
  readonly percentualLiberacao: number;
  readonly versao: number;
  readonly usuariosAlvo: readonly string[];
  readonly filasAlvo: readonly string[];
}

export interface ContextoControlesRecursoUsuario {
  readonly usuarioAtivo: boolean;
  readonly perfilAtivo: boolean;
  readonly papelBase: PapelBaseAutorizacao | undefined;
  readonly controles: readonly (ControleRecursoPersistido & {
    readonly usuarioAlvo: boolean;
    readonly filaAlvo: boolean;
  })[];
}

export interface PoliticaVersaoMobilePersistida {
  readonly plataforma: PlataformaMobile;
  readonly versaoMinima: string;
  readonly versaoRecomendada: string;
  readonly mensagem?: string;
  readonly urlLoja?: string;
  readonly versao: number;
}

export interface AvaliacaoPoliticaVersaoMobile {
  readonly plataforma: PlataformaMobile;
  readonly versaoInformada: string;
  readonly versaoMinima: string;
  readonly versaoRecomendada: string;
  readonly atualizacaoObrigatoria: boolean;
  readonly atualizacaoRecomendada: boolean;
  readonly mensagem?: string;
  readonly urlLoja?: string;
}

export interface ConfiguracaoClienteMobile {
  readonly politica: AvaliacaoPoliticaVersaoMobile;
  readonly controlesRecurso: Readonly<Record<string, boolean>>;
}

export interface EntradaAtualizacaoControleRecurso {
  readonly codigo: string;
  readonly estado: EstadoControleRecurso;
  readonly desligadoEmergencialmente: boolean;
  readonly liberarAdministradores: boolean;
  readonly percentualLiberacao: number;
  readonly usuariosAlvo: readonly string[];
  readonly filasAlvo: readonly string[];
  readonly versaoEsperada: number;
}

export interface EntradaAtualizacaoPoliticaVersaoMobile {
  readonly plataforma: PlataformaMobile;
  readonly versaoMinima: string;
  readonly versaoRecomendada: string;
  readonly mensagem?: string;
  readonly urlLoja?: string;
  readonly versaoEsperada: number;
}
