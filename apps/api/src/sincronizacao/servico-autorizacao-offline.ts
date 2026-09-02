import {
  createPrivateKey,
  sign,
  type KeyObject,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';

import type { SessaoMobileAutenticada } from '../autenticacao/modelo-autenticacao-mobile.js';
import type { SnapshotSincronizacaoCompleta } from './modelo-sincronizacao.js';

const DURACAO_MAXIMA_MS = 4 * 60 * 60 * 1_000;
const HASH_HEXADECIMAL = /^[a-f0-9]{64}$/u;
const IDENTIFICADOR_CHAVE = /^[a-z0-9][a-z0-9_-]{0,31}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type EscopoAutorizacaoOffline =
  | 'CRIAR_PENDENCIA_TEXTO'
  | 'CRIAR_RASCUNHO'
  | 'LER_NOTA_INTERNA'
  | 'LER_REPLICA';

export interface AutorizacaoOfflineEmitida {
  readonly token: string;
  readonly validaAte: string;
}

export interface MaterialAssinaturaOffline {
  readonly chaveId: string;
  readonly chavePrivada: KeyObject;
}

interface ConteudoAutorizacaoOffline {
  readonly dispositivo_id: string;
  readonly emitida_em: string;
  readonly escopos: readonly EscopoAutorizacaoOffline[];
  readonly filas: readonly string[];
  readonly instalacao_hash: string;
  readonly sequencia_base: string;
  readonly sessao_id: string;
  readonly usuario_id: string;
  readonly valida_ate: string;
  readonly versao: 1;
  readonly versao_permissoes: number;
}

async function carregarMaterialDoAmbiente(): Promise<MaterialAssinaturaOffline> {
  const caminho = process.env.AUTORIZACAO_OFFLINE_CHAVE_PRIVADA_FILE;
  const chaveId = process.env.AUTORIZACAO_OFFLINE_CHAVE_ID?.trim();
  if (caminho === undefined || chaveId === undefined || !IDENTIFICADOR_CHAVE.test(chaveId)) {
    throw new Error('CHAVE_AUTORIZACAO_OFFLINE_AUSENTE');
  }
  const pem = await readFile(caminho, 'utf8');
  if (pem.length < 100 || pem.length > 4_096) {
    throw new Error('CHAVE_AUTORIZACAO_OFFLINE_INVALIDA');
  }
  let chavePrivada: KeyObject;
  try {
    chavePrivada = createPrivateKey(pem);
  } catch {
    throw new Error('CHAVE_AUTORIZACAO_OFFLINE_INVALIDA');
  }
  if (chavePrivada.asymmetricKeyType !== 'ed25519') {
    throw new Error('CHAVE_AUTORIZACAO_OFFLINE_INVALIDA');
  }
  return { chaveId, chavePrivada };
}

function calcularEscopos(
  snapshot: SnapshotSincronizacaoCompleta,
): readonly EscopoAutorizacaoOffline[] {
  const escopos = new Set<EscopoAutorizacaoOffline>([
    'CRIAR_RASCUNHO',
    'LER_REPLICA',
  ]);
  if (snapshot.permissoes.includes('ENVIAR_MENSAGEM')) {
    escopos.add('CRIAR_PENDENCIA_TEXTO');
  }
  if (snapshot.permissoes.includes('VISUALIZAR_NOTA_INTERNA')) {
    escopos.add('LER_NOTA_INTERNA');
  }
  return [...escopos].sort();
}

@Injectable()
export class ServicoAutorizacaoOffline {
  private material?: Promise<MaterialAssinaturaOffline>;

  public async emitir(
    sessao: SessaoMobileAutenticada,
    snapshot: SnapshotSincronizacaoCompleta,
    relogio: () => Date = () => new Date(),
    materialInformado?: MaterialAssinaturaOffline,
  ): Promise<AutorizacaoOfflineEmitida> {
    const agora = relogio();
    const expiraEm = new Date(
      Math.min(agora.getTime() + DURACAO_MAXIMA_MS, sessao.refreshExpiraEm.getTime()),
    );
    const filas = snapshot.filas.map(({ id }) => id).sort();
    if (
      !Number.isFinite(agora.getTime()) ||
      !Number.isFinite(expiraEm.getTime()) ||
      expiraEm <= agora ||
      !UUID.test(sessao.contexto.sessaoId) ||
      !UUID.test(sessao.contexto.usuarioId) ||
      !UUID.test(sessao.dispositivoId) ||
      !HASH_HEXADECIMAL.test(sessao.identificadorInstalacaoHash) ||
      !/^(0|[1-9][0-9]{0,18})$/u.test(snapshot.sequenciaBase) ||
      !Number.isInteger(snapshot.versaoPermissoes) ||
      snapshot.versaoPermissoes < 1 ||
      filas.some((filaId) => !UUID.test(filaId))
    ) {
      throw new Error('AUTORIZACAO_OFFLINE_INVALIDA');
    }

    const conteudo: ConteudoAutorizacaoOffline = {
      dispositivo_id: sessao.dispositivoId,
      emitida_em: agora.toISOString(),
      escopos: calcularEscopos(snapshot),
      filas,
      instalacao_hash: sessao.identificadorInstalacaoHash,
      sequencia_base: snapshot.sequenciaBase,
      sessao_id: sessao.contexto.sessaoId,
      usuario_id: sessao.contexto.usuarioId,
      valida_ate: expiraEm.toISOString(),
      versao: 1,
      versao_permissoes: snapshot.versaoPermissoes,
    };
    const material =
      materialInformado ?? (await (this.material ??= carregarMaterialDoAmbiente()));
    if (
      !IDENTIFICADOR_CHAVE.test(material.chaveId) ||
      material.chavePrivada.type !== 'private' ||
      material.chavePrivada.asymmetricKeyType !== 'ed25519'
    ) {
      throw new Error('CHAVE_AUTORIZACAO_OFFLINE_INVALIDA');
    }
    const payload = Buffer.from(JSON.stringify(conteudo), 'utf8').toString('base64url');
    const parteAssinada = `v1.${material.chaveId}.${payload}`;
    const assinatura = sign(null, Buffer.from(parteAssinada, 'utf8'), material.chavePrivada)
      .toString('base64url');
    return {
      token: `${parteAssinada}.${assinatura}`,
      validaAte: conteudo.valida_ate,
    };
  }
}
