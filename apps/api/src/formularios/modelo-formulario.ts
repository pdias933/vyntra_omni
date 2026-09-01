import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export interface CampoFormularioCanal {
  readonly chave: string;
  readonly rotulo: string;
  readonly classificacao: 'OPERACIONAL' | 'PESSOAL' | 'SENSIVEL';
}

export interface FormularioCanalDefinido {
  readonly id: string;
  readonly contaWhatsAppId: string;
  readonly nome: string;
  readonly finalidade: 'IDENTIFICACAO' | 'CADASTRO_COMERCIAL';
  readonly campos: readonly CampoFormularioCanal[];
}

export interface SubmissaoFormularioNormalizada {
  readonly formularioReferenciaCanal: string;
  readonly referenciaCanal: string;
  readonly dadosProtegidos: ObjetoJsonProtegido;
}

export interface SubmissaoFormularioPersistida
  extends SubmissaoFormularioNormalizada {
  readonly id: string;
  readonly formularioId: string;
  readonly mensagemId: string;
  readonly contatoId: string;
  readonly dadosHash: string;
  readonly recebidaEm: Date;
}

export interface ContextoSubmissaoFormulario {
  readonly atendimentoId: string;
  readonly contatoId: string;
  readonly conversaId: string;
  readonly formularioId: string;
  readonly recebidaEm: Date;
}

export type ResultadoRegistroSubmissaoFormulario =
  | {
      readonly resultado: 'PERSISTIDA';
      readonly submissao: SubmissaoFormularioPersistida;
      readonly sequenciaEvento: bigint;
    }
  | {
      readonly resultado: 'DUPLICADA';
      readonly submissao: SubmissaoFormularioPersistida;
    };
