import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  CredencialLoginWeb,
  RegistroTentativaLoginWeb,
  SessaoWebPersistida,
} from './modelo-autenticacao.js';

export const REPOSITORIO_AUTENTICACAO = Symbol('REPOSITORIO_AUTENTICACAO');

export interface RepositorioAutenticacao {
  obterCredencial(identificadorNormalizado: string): Promise<CredencialLoginWeb | undefined>;
  serializarLimiteLogin(
    identificadorHash: string,
    enderecoIp: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  contarFalhasRecentes(
    identificadorHash: string,
    enderecoIp: string,
    desde: Date,
    transacao?: TransacaoPrisma,
  ): Promise<{ readonly contaIp: number; readonly ip: number }>;
  registrarTentativa(
    tentativa: RegistroTentativaLoginWeb,
    transacao?: TransacaoPrisma,
  ): Promise<void>;
  atualizarResultadoTentativa(
    tentativaId: string,
    resultado: 'FALHA' | 'SUCESSO',
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  criarSessao(
    sessao: {
      readonly id: string;
      readonly usuarioId: string;
      readonly tokenHash: string;
      readonly csrfHash: string;
      readonly enderecoIp: string;
      readonly agenteUsuarioHash: string;
      readonly autenticadaEm: Date;
      readonly expiraEm: Date;
    },
    transacao?: TransacaoPrisma,
  ): Promise<void>;
  obterSessao(
    tokenHash: string,
    transacao?: TransacaoPrisma,
  ): Promise<SessaoWebPersistida | undefined>;
  rotacionarSessao(
    sessaoId: string,
    tokenHashAtual: string,
    tokenHashNovo: string,
    csrfHashNovo: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  revogarSessao(
    sessaoId: string,
    tokenHashAtual: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
