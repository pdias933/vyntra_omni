import * as SQLite from 'expo-sqlite';

import { CofreReplicaLocal } from './cofre-replica-local';

const NOME_BANCO = 'vyntra-omni.db';
const CHAVE_HEXADECIMAL = /^[a-f0-9]{64}$/u;

export interface AutorizacaoOfflineLocal {
  readonly sequenciaEvento: string;
  readonly token: string;
  readonly validaAte: string;
  readonly versaoPermissoes: number;
}

interface LinhaAutorizacaoOffline {
  readonly sequencia_evento: string;
  readonly token: string;
  readonly valida_ate: string;
  readonly versao_permissoes: number;
}

export class RepositorioReplicaLocal {
  private banco: Promise<SQLite.SQLiteDatabase> | undefined;

  public constructor(public readonly cofre = new CofreReplicaLocal()) {}

  public async obterAutorizacao(): Promise<AutorizacaoOfflineLocal | undefined> {
    const banco = await this.abrir();
    const linha = await banco.getFirstAsync<LinhaAutorizacaoOffline>(
      `SELECT autorizacao_offline AS token,
        autorizacao_offline_valida_ate AS valida_ate,
        sequencia_evento,
        versao_permissoes
       FROM estado_replica WHERE id = ?`,
      1,
    );
    return linha === null
      ? undefined
      : {
          sequenciaEvento: linha.sequencia_evento,
          token: linha.token,
          validaAte: linha.valida_ate,
          versaoPermissoes: linha.versao_permissoes,
        };
  }

  public async salvarAutorizacao(
    autorizacao: AutorizacaoOfflineLocal,
    sequenciaEvento: string,
    versaoPermissoes: number,
  ): Promise<void> {
    if (
      !/^(0|[1-9][0-9]{0,18})$/u.test(sequenciaEvento) ||
      !Number.isInteger(versaoPermissoes) ||
      versaoPermissoes < 1
    ) {
      throw new Error('ESTADO_REPLICA_LOCAL_INVALIDO');
    }
    const banco = await this.abrir();
    await banco.runAsync(
      `INSERT INTO estado_replica
        (id, sequencia_evento, versao_permissoes, autorizacao_offline, autorizacao_offline_valida_ate)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        sequencia_evento = excluded.sequencia_evento,
        versao_permissoes = excluded.versao_permissoes,
        autorizacao_offline = excluded.autorizacao_offline,
        autorizacao_offline_valida_ate = excluded.autorizacao_offline_valida_ate`,
      1,
      sequenciaEvento,
      versaoPermissoes,
      autorizacao.token,
      autorizacao.validaAte,
    );
  }

  public async limparReplicaAutenticada(): Promise<void> {
    const banco = await this.abrir();
    await banco.withExclusiveTransactionAsync(async (transacao) => {
      await transacao.execAsync(`
        DELETE FROM pendencia_saida_texto;
        DELETE FROM rascunho;
        DELETE FROM nota_interna;
        DELETE FROM mensagem;
        DELETE FROM atendimento;
        DELETE FROM conversa;
        DELETE FROM fila;
        DELETE FROM controle_recurso;
        DELETE FROM estado_replica;
      `);
    });
  }

  public async descartar(): Promise<void> {
    const banco = await this.banco;
    this.banco = undefined;
    await banco?.closeAsync();
    await SQLite.deleteDatabaseAsync(NOME_BANCO);
    await this.cofre.limpar();
  }

  private abrir(): Promise<SQLite.SQLiteDatabase> {
    return (this.banco ??= this.abrirProtegido().catch((erro: unknown) => {
      this.banco = undefined;
      throw erro;
    }));
  }

  private async abrirProtegido(): Promise<SQLite.SQLiteDatabase> {
    const chave = await this.cofre.obterOuCriarChaveBanco();
    if (!CHAVE_HEXADECIMAL.test(chave)) {
      throw new Error('CHAVE_REPLICA_LOCAL_INVALIDA');
    }
    const banco = await SQLite.openDatabaseAsync(NOME_BANCO);
    await banco.execAsync(`PRAGMA key = "x'${chave}'"`);
    await banco.execAsync('PRAGMA cipher_memory_security = ON');
    const integridade = await banco.getFirstAsync<Record<string, string>>(
      'PRAGMA cipher_integrity_check',
    );
    if (integridade === null || !Object.values(integridade).includes('ok')) {
      await banco.closeAsync();
      throw new Error('INTEGRIDADE_REPLICA_LOCAL_INVALIDA');
    }
    await banco.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    await this.migrar(banco);
    return banco;
  }

  private async migrar(banco: SQLite.SQLiteDatabase): Promise<void> {
    const versao = await banco.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version',
    );
    if (versao?.user_version === 1) return;
    if (versao?.user_version !== 0) {
      throw new Error('VERSAO_REPLICA_LOCAL_INCOMPATIVEL');
    }
    await banco.withExclusiveTransactionAsync(async (transacao) => {
      await transacao.execAsync(`
        CREATE TABLE estado_replica (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          sequencia_evento TEXT NOT NULL CHECK (
            length(sequencia_evento) > 0
            AND sequencia_evento NOT GLOB '*[^0-9]*'
            AND (sequencia_evento = '0' OR substr(sequencia_evento, 1, 1) <> '0')
          ),
          versao_permissoes INTEGER NOT NULL CHECK (versao_permissoes >= 1),
          autorizacao_offline TEXT NOT NULL,
          autorizacao_offline_valida_ate TEXT NOT NULL
        );
        CREATE TABLE fila (
          id TEXT PRIMARY KEY,
          nome TEXT NOT NULL
        );
        CREATE TABLE conversa (
          id TEXT PRIMARY KEY,
          contato_id TEXT NOT NULL,
          ultima_atividade_em TEXT NOT NULL,
          versao INTEGER NOT NULL CHECK (versao >= 0)
        );
        CREATE TABLE atendimento (
          id TEXT PRIMARY KEY,
          conversa_id TEXT NOT NULL REFERENCES conversa(id) ON DELETE CASCADE,
          conta_origem_id TEXT NOT NULL,
          estado TEXT NOT NULL,
          fila_id TEXT NOT NULL REFERENCES fila(id) ON DELETE CASCADE,
          modo TEXT NOT NULL,
          motivo_espera TEXT NOT NULL,
          usuario_responsavel_id TEXT,
          versao_atribuicao INTEGER NOT NULL CHECK (versao_atribuicao >= 0),
          versao_estado INTEGER NOT NULL CHECK (versao_estado >= 0),
          atualizado_em TEXT NOT NULL
        );
        CREATE TABLE mensagem (
          id TEXT PRIMARY KEY,
          conversa_id TEXT NOT NULL REFERENCES conversa(id) ON DELETE CASCADE,
          atendimento_id TEXT NOT NULL REFERENCES atendimento(id) ON DELETE CASCADE,
          conta_origem_id TEXT NOT NULL,
          direcao TEXT NOT NULL,
          tipo TEXT NOT NULL,
          estado_saida TEXT,
          conteudo_json TEXT NOT NULL,
          responde_a_mensagem_id TEXT,
          mensagem_alvo_reacao_id TEXT,
          recebida_servidor_em TEXT NOT NULL,
          versao INTEGER NOT NULL CHECK (versao >= 0)
        );
        CREATE TABLE nota_interna (
          id TEXT PRIMARY KEY,
          conversa_id TEXT NOT NULL REFERENCES conversa(id) ON DELETE CASCADE,
          atendimento_id TEXT NOT NULL REFERENCES atendimento(id) ON DELETE CASCADE,
          autor_usuario_id TEXT NOT NULL,
          conteudo_json TEXT NOT NULL,
          criada_em TEXT NOT NULL,
          visibilidade TEXT NOT NULL CHECK (visibilidade = 'SOMENTE_EQUIPE')
        );
        CREATE TABLE controle_recurso (
          codigo TEXT PRIMARY KEY,
          ativado INTEGER NOT NULL CHECK (ativado IN (0, 1))
        );
        CREATE TABLE rascunho (
          conversa_id TEXT PRIMARY KEY,
          texto TEXT NOT NULL,
          atualizado_em TEXT NOT NULL
        );
        CREATE TABLE pendencia_saida_texto (
          id TEXT PRIMARY KEY,
          conversa_id TEXT NOT NULL,
          atendimento_id TEXT NOT NULL,
          texto TEXT NOT NULL,
          chave_idempotencia TEXT NOT NULL UNIQUE,
          versao_atribuicao INTEGER NOT NULL CHECK (versao_atribuicao >= 0),
          criada_em TEXT NOT NULL,
          estado TEXT NOT NULL CHECK (estado IN ('AGUARDANDO_CONEXAO', 'REVISAO_NECESSARIA'))
        );
        CREATE INDEX atendimento_fila_atualizado_idx
          ON atendimento(fila_id, atualizado_em DESC);
        CREATE INDEX mensagem_conversa_recebida_idx
          ON mensagem(conversa_id, recebida_servidor_em, id);
        CREATE INDEX nota_conversa_criada_idx
          ON nota_interna(conversa_id, criada_em, id);
        PRAGMA user_version = 1;
      `);
    });
  }
}
