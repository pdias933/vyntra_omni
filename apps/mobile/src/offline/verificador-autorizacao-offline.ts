import { hashes, verify } from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import * as Crypto from 'expo-crypto';

import type {
  CredencialPersistidaMobile,
  IdentidadeInstalacaoMobile,
} from '../autenticacao/cofre-sessao-mobile';
import { CONFIGURACAO_APLICATIVO } from '../configuracao-aplicativo';
import type {
  AutorizacaoOfflineLocal,
  RepositorioReplicaLocal,
} from './repositorio-replica-local';

hashes.sha512 = sha512;

const DURACAO_MAXIMA_MS = 4 * 60 * 60 * 1_000;
const TOLERANCIA_RELOGIO_MS = 5 * 60 * 1_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ESCOPOS = new Set([
  'CRIAR_PENDENCIA_TEXTO',
  'CRIAR_RASCUNHO',
  'LER_NOTA_INTERNA',
  'LER_REPLICA',
]);

export interface AutoridadeOfflineLocal {
  readonly escopos: readonly string[];
  readonly filas: readonly string[];
  readonly validaAte: string;
  readonly versaoPermissoes: number;
}

type ResultadoAcessoOffline =
  | { readonly estado: 'AUTORIZADO'; readonly autoridade: AutoridadeOfflineLocal }
  | { readonly estado: 'AUSENTE' | 'EXPIRADA' | 'INVALIDA' };

interface ConteudoOffline {
  readonly dispositivo_id: string;
  readonly emitida_em: string;
  readonly escopos: readonly string[];
  readonly filas: readonly string[];
  readonly instalacao_hash: string;
  readonly sequencia_base: string;
  readonly sessao_id: string;
  readonly usuario_id: string;
  readonly valida_ate: string;
  readonly versao: number;
  readonly versao_permissoes: number;
}

function decodificarBase64Url(valor: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(valor)) throw new Error('BASE64URL_INVALIDO');
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes: number[] = [];
  let acumulador = 0;
  let bits = 0;
  for (const caractere of valor) {
    const indice = alfabeto.indexOf(caractere);
    if (indice < 0) throw new Error('BASE64URL_INVALIDO');
    acumulador = (acumulador << 6) | indice;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acumulador >>> bits) & 0xff);
      acumulador &= (1 << bits) - 1;
    }
  }
  if (bits > 0 && acumulador !== 0) throw new Error('BASE64URL_INVALIDO');
  return Uint8Array.from(bytes);
}

function lerConteudo(payload: Uint8Array): ConteudoOffline {
  const valor: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload));
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('AUTORIZACAO_OFFLINE_INVALIDA');
  }
  const conteudo = valor as Partial<ConteudoOffline>;
  const chavesEsperadas = [
    'dispositivo_id',
    'emitida_em',
    'escopos',
    'filas',
    'instalacao_hash',
    'sequencia_base',
    'sessao_id',
    'usuario_id',
    'valida_ate',
    'versao',
    'versao_permissoes',
  ];
  if (
    JSON.stringify(Object.keys(valor).sort()) !== JSON.stringify(chavesEsperadas) ||
    conteudo.versao !== 1 ||
    !UUID.test(conteudo.usuario_id ?? '') ||
    !UUID.test(conteudo.sessao_id ?? '') ||
    !UUID.test(conteudo.dispositivo_id ?? '') ||
    !/^[a-f0-9]{64}$/u.test(conteudo.instalacao_hash ?? '') ||
    !/^(0|[1-9][0-9]{0,18})$/u.test(conteudo.sequencia_base ?? '') ||
    !Array.isArray(conteudo.filas) ||
    conteudo.filas.some((item) => typeof item !== 'string' || !UUID.test(item)) ||
    new Set(conteudo.filas).size !== conteudo.filas.length ||
    !Array.isArray(conteudo.escopos) ||
    conteudo.escopos.some((item) => typeof item !== 'string' || !ESCOPOS.has(item)) ||
    new Set(conteudo.escopos).size !== conteudo.escopos.length ||
    !Number.isInteger(conteudo.versao_permissoes) ||
    (conteudo.versao_permissoes ?? 0) < 1 ||
    typeof conteudo.emitida_em !== 'string' ||
    typeof conteudo.valida_ate !== 'string'
  ) {
    throw new Error('AUTORIZACAO_OFFLINE_INVALIDA');
  }
  return conteudo as ConteudoOffline;
}

export class VerificadorAutorizacaoOffline {
  public constructor(
    private readonly repositorio: RepositorioReplicaLocal,
    private readonly chaves = CONFIGURACAO_APLICATIVO.chavesPublicasAutorizacaoOffline,
  ) {}

  public async avaliar(
    credencial: CredencialPersistidaMobile,
    identidade: IdentidadeInstalacaoMobile,
    agora = new Date(),
  ): Promise<ResultadoAcessoOffline> {
    const autorizacao = await this.repositorio.obterAutorizacao();
    if (autorizacao === undefined) return { estado: 'AUSENTE' };
    try {
      const autoridade = await this.verificar(
        autorizacao,
        credencial,
        identidade,
        agora,
      );
      await this.repositorio.cofre.registrarRelogioConfiavel(agora);
      return { autoridade, estado: 'AUTORIZADO' };
    } catch (erro) {
      if (erro instanceof Error && erro.message === 'AUTORIZACAO_OFFLINE_EXPIRADA') {
        return { estado: 'EXPIRADA' };
      }
      return { estado: 'INVALIDA' };
    }
  }

  private async verificar(
    autorizacao: AutorizacaoOfflineLocal,
    credencial: CredencialPersistidaMobile,
    identidade: IdentidadeInstalacaoMobile,
    agora: Date,
  ): Promise<AutoridadeOfflineLocal> {
    const partes = autorizacao.token.split('.');
    if (partes.length !== 4 || partes[0] !== 'v1') {
      throw new Error('AUTORIZACAO_OFFLINE_INVALIDA');
    }
    const [, chaveId = '', payloadCodificado = '', assinaturaCodificada = ''] = partes;
    const chaveCodificada = this.chaves[chaveId];
    if (chaveCodificada === undefined) throw new Error('AUTORIZACAO_OFFLINE_INVALIDA');
    const payload = decodificarBase64Url(payloadCodificado);
    const assinatura = decodificarBase64Url(assinaturaCodificada);
    const chave = decodificarBase64Url(chaveCodificada);
    const parteAssinada = new TextEncoder().encode(`v1.${chaveId}.${payloadCodificado}`);
    if (
      assinatura.length !== 64 ||
      chave.length !== 32 ||
      !verify(assinatura, parteAssinada, chave, { zip215: false })
    ) {
      throw new Error('AUTORIZACAO_OFFLINE_INVALIDA');
    }
    const conteudo = lerConteudo(payload);
    const emitidaEm = new Date(conteudo.emitida_em);
    const validaAte = new Date(conteudo.valida_ate);
    const ultimoRelogio = await this.repositorio.cofre.obterUltimoRelogioConfiavel();
    const instalacaoHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      identidade.identificadorInstalacao,
    );
    if (
      !Number.isFinite(agora.getTime()) ||
      !Number.isFinite(emitidaEm.getTime()) ||
      !Number.isFinite(validaAte.getTime()) ||
      emitidaEm.toISOString() !== conteudo.emitida_em ||
      validaAte.toISOString() !== conteudo.valida_ate ||
      validaAte.getTime() - emitidaEm.getTime() > DURACAO_MAXIMA_MS ||
      validaAte <= emitidaEm ||
      conteudo.valida_ate !== autorizacao.validaAte ||
      conteudo.sequencia_base !== autorizacao.sequenciaEvento ||
      conteudo.versao_permissoes !== autorizacao.versaoPermissoes ||
      conteudo.usuario_id !== credencial.usuarioId ||
      conteudo.sessao_id !== credencial.sessaoId ||
      conteudo.dispositivo_id !== credencial.dispositivoId ||
      conteudo.instalacao_hash !== instalacaoHash ||
      (ultimoRelogio !== undefined &&
        agora.getTime() + TOLERANCIA_RELOGIO_MS < ultimoRelogio.getTime())
    ) {
      throw new Error('AUTORIZACAO_OFFLINE_INVALIDA');
    }
    if (agora >= validaAte) throw new Error('AUTORIZACAO_OFFLINE_EXPIRADA');
    return {
      escopos: conteudo.escopos,
      filas: conteudo.filas,
      validaAte: conteudo.valida_ate,
      versaoPermissoes: conteudo.versao_permissoes,
    };
  }
}
