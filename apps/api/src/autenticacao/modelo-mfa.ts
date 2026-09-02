import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';

export interface FatorMfaPersistido {
  readonly estado: 'ATIVO' | 'REVOGADO';
  readonly segredoProtegido: string;
  readonly ultimoContadorUsado: bigint | null;
  readonly codigosRecuperacaoAtivos: readonly string[];
}

export type ValidacaoMfaPreparada =
  | { readonly tipo: 'TOTP'; readonly contador: bigint }
  | { readonly tipo: 'RECUPERACAO'; readonly codigoHash: string };

export interface RepositorioMfa {
  obterFator(usuarioId: string): Promise<FatorMfaPersistido | undefined>;
  consumirContadorTotp(
    usuarioId: string,
    contador: bigint,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
  consumirCodigoRecuperacao(
    usuarioId: string,
    codigoHash: string,
    usadoEm: Date,
    transacao: TransacaoPrisma,
  ): Promise<boolean>;
}
