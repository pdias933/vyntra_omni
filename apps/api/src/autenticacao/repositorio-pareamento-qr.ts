import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  DispositivoPareamentoQrNormalizado,
  PareamentoQrPersistido,
  RegistroTentativaResgateQr,
} from './modelo-pareamento-qr.js';

export const REPOSITORIO_PAREAMENTO_QR = Symbol('REPOSITORIO_PAREAMENTO_QR');

export interface RepositorioPareamentoQr {
  serializarGeracao(
    usuarioId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  contarGeracoesUsuario(
    usuarioId: string,
    desde: Date,
    transacao: TransacaoPrisma,
  ): Promise<number>;
  cancelarAtivosSessao(
    sessaoWebId: string,
    agora: Date,
    motivo: string,
    transacao: TransacaoPrisma,
  ): Promise<number>;
  criar(
    pareamento: {
      readonly id: string;
      readonly usuarioId: string;
      readonly sessaoWebId: string;
      readonly tokenQrHash: string;
      readonly expiraEm: Date;
      readonly criadoEm: Date;
    },
    transacao: TransacaoPrisma,
  ): Promise<void>;
  serializarResgate(
    tokenQrHash: string,
    enderecoIp: string,
    identificadorInstalacaoHash: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  contarTentativasResgate(
    enderecoIp: string,
    identificadorInstalacaoHash: string,
    desde: Date,
    transacao: TransacaoPrisma,
  ): Promise<{ readonly dispositivo: number; readonly ip: number }>;
  registrarTentativaResgate(
    tentativa: RegistroTentativaResgateQr,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  obterPorToken(
    tokenQrHash: string,
    transacao: TransacaoPrisma,
  ): Promise<PareamentoQrPersistido | undefined>;
  resgatar(
    pareamentoId: string,
    comprovanteResgateHash: string,
    dispositivo: DispositivoPareamentoQrNormalizado,
    enderecoIp: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  serializarPareamento(
    pareamentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void>;
  obterPorId(
    pareamentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<PareamentoQrPersistido | undefined>;
  obterPorComprovante(
    pareamentoId: string,
    comprovanteResgateHash: string,
    transacao: TransacaoPrisma,
  ): Promise<PareamentoQrPersistido | undefined>;
  confirmar(
    pareamentoId: string,
    sessaoWebId: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  concluir(
    pareamentoId: string,
    agora: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  finalizar(
    pareamentoId: string,
    estado: 'CANCELADO' | 'EXPIRADO',
    agora: Date,
    motivo: string,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
