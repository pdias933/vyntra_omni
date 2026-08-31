import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  CredencialLoginMobile,
  DispositivoMobileListado,
  DispositivoMobilePersistido,
  EntradaDispositivoMobile,
  RegistroTentativaLoginMobile,
  SessaoMobilePersistida,
} from './modelo-autenticacao-mobile.js';

export const REPOSITORIO_AUTENTICACAO_MOBILE = Symbol(
  'REPOSITORIO_AUTENTICACAO_MOBILE',
);

export interface RepositorioAutenticacaoMobile {
  obterCredencial(
    identificadorNormalizado: string,
  ): Promise<CredencialLoginMobile | undefined>;
  serializarLimiteLogin(
    identificadorHash: string,
    enderecoIp: string,
    identificadorInstalacaoHash: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  contarFalhasRecentes(
    identificadorHash: string,
    enderecoIp: string,
    identificadorInstalacaoHash: string,
    desde: Date,
    transacao: TransacaoPrisma,
  ): Promise<{ readonly contaIpDispositivo: number; readonly ip: number }>;
  registrarTentativa(
    tentativa: RegistroTentativaLoginMobile,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  atualizarResultadoTentativa(
    tentativaId: string,
    resultado: 'FALHA' | 'SUCESSO',
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  serializarDispositivosUsuario(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  listarDispositivosAtivosUsuario(
    usuarioId: string,
    transacao?: TransacaoPrisma,
  ): Promise<readonly DispositivoMobileListado[]>;
  obterDispositivo(
    usuarioId: string,
    identificadorInstalacaoHash: string,
    transacao: TransacaoPrisma,
  ): Promise<DispositivoMobilePersistido | undefined>;
  criarDispositivo(
    dispositivo: EntradaDispositivoMobile & {
      readonly id: string;
      readonly usuarioId: string;
      readonly agora: Date;
    },
    transacao: TransacaoPrisma,
  ): Promise<void>;
  atualizarDispositivo(
    dispositivoId: string,
    entrada: EntradaDispositivoMobile,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  revogarSessoesAtivasDispositivo(
    dispositivoId: string,
    agora: Date,
    motivo: string,
    transacao: TransacaoPrisma,
  ): Promise<number>;
  revogarDispositivos(
    usuarioId: string,
    dispositivosIds: readonly string[],
    agora: Date,
    motivo: string,
    transacao: TransacaoPrisma,
  ): Promise<number>;
  revogarSessoesAtivasDispositivos(
    usuarioId: string,
    dispositivosIds: readonly string[],
    agora: Date,
    motivo: string,
    transacao: TransacaoPrisma,
  ): Promise<number>;
  criarSessao(
    sessao: {
      readonly id: string;
      readonly usuarioId: string;
      readonly dispositivoId: string;
      readonly tokenAcessoHash: string;
      readonly tokenRefreshHash: string;
      readonly autenticadaEm: Date;
      readonly acessoExpiraEm: Date;
      readonly refreshExpiraEm: Date;
    },
    transacao: TransacaoPrisma,
  ): Promise<void>;
  obterSessaoPorAcesso(
    tokenAcessoHash: string,
    transacao?: TransacaoPrisma,
  ): Promise<SessaoMobilePersistida | undefined>;
  serializarTokenRefresh(
    tokenRefreshHash: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  obterSessaoPorRefreshAtual(
    tokenRefreshHash: string,
    transacao: TransacaoPrisma,
  ): Promise<SessaoMobilePersistida | undefined>;
  obterSessaoPorRefreshUsado(
    tokenRefreshHash: string,
    transacao: TransacaoPrisma,
  ): Promise<SessaoMobilePersistida | undefined>;
  rotacionarSessao(
    sessaoId: string,
    tokenRefreshHashAtual: string,
    tokenAcessoHashNovo: string,
    tokenRefreshHashNovo: string,
    acessoExpiraEm: Date,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  revogarSessao(
    sessaoId: string,
    agora: Date,
    motivo: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  usuarioAtivo(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
