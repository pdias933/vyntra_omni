import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ContextoSubmissaoFormulario,
  SubmissaoFormularioPersistida,
} from './modelo-formulario.js';

export const REPOSITORIO_FORMULARIOS = Symbol('REPOSITORIO_FORMULARIOS');

export interface RepositorioFormularios {
  bloquearSubmissao(
    mensagemId: string,
    formularioReferenciaCanal: string,
    referenciaCanal: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  formularioAtivoNoAtendimento(
    formularioId: string,
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  obterContextoSubmissao(
    mensagemId: string,
    formularioReferenciaCanal: string,
    transacao: TransacaoPrisma,
  ): Promise<ContextoSubmissaoFormulario | undefined>;
  obterSubmissaoPorMensagem(
    mensagemId: string,
    transacao: TransacaoPrisma,
  ): Promise<SubmissaoFormularioPersistida | undefined>;
  obterSubmissaoPorReferencia(
    formularioId: string,
    referenciaCanal: string,
    transacao: TransacaoPrisma,
  ): Promise<SubmissaoFormularioPersistida | undefined>;
  acrescentarSubmissao(
    submissao: SubmissaoFormularioPersistida,
    transacao: TransacaoPrisma,
  ): Promise<void>;
}
