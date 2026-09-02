import * as SQLite from 'expo-sqlite';

import type {
  EventoSincronizacaoMobile,
  SnapshotMobileValidado,
} from '../sincronizacao/modelo-sincronizacao-mobile';
import { CofreReplicaLocal } from './cofre-replica-local';

const NOME_BANCO = 'vyntra-omni.db';
const CHAVE_HEXADECIMAL = /^[a-f0-9]{64}$/u;

export const FILTROS_ATENDIMENTOS_MOBILE = [
  'MEUS',
  'PENDENTES',
  'NAO_LIDOS',
  'SLA',
  'EXPIRANDO',
  'EM_AUTOMACAO',
] as const;
export type FiltroAtendimentosMobile =
  (typeof FILTROS_ATENDIMENTOS_MOBILE)[number];

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

interface LinhaResumoAtendimentoLocal {
  readonly atendimento_id: string;
  readonly contato_id: string;
  readonly conversa_id: string;
  readonly estado: string;
  readonly fila_id: string;
  readonly fila_nome: string;
  readonly identidade_secundaria: string | null;
  readonly janela_expira_em: string | null;
  readonly modo: string;
  readonly motivo_espera: string;
  readonly nome_contato: string;
  readonly quantidade_nao_lida: number;
  readonly sla_em: string | null;
  readonly ultima_atividade_em: string;
  readonly ultima_mensagem_direcao: 'ENTRADA' | 'SAIDA' | null;
  readonly ultima_mensagem_resumo: string;
  readonly usuario_responsavel_id: string | null;
}

export interface ResumoAtendimentoLocal {
  readonly atendimentoId: string;
  readonly contatoId: string;
  readonly conversaId: string;
  readonly estado: string;
  readonly filaId: string;
  readonly filaNome: string;
  readonly identidadeSecundaria?: string;
  readonly janelaExpiraEm?: string;
  readonly modo: string;
  readonly motivoEspera: string;
  readonly nomeContato: string;
  readonly quantidadeNaoLida: number;
  readonly slaEm?: string;
  readonly ultimaAtividadeEm: string;
  readonly ultimaMensagemDirecao?: 'ENTRADA' | 'SAIDA';
  readonly ultimaMensagemResumo: string;
  readonly usuarioResponsavelId?: string;
}

export interface EstadoReplicaLocal {
  readonly autorizacaoOfflineValidaAte: string;
  readonly precisaRessincronizar: boolean;
  readonly sequenciaEvento: string;
  readonly versaoPermissoes: number;
}

type ParametroSql = boolean | number | string | null;

async function executarPreparado(
  banco: SQLite.SQLiteDatabase,
  sql: string,
  linhas: readonly (readonly ParametroSql[])[],
): Promise<void> {
  const declaracao = await banco.prepareAsync(sql);
  try {
    for (const linha of linhas) await declaracao.executeAsync([...linha]);
  } finally {
    await declaracao.finalizeAsync();
  }
}

export class RepositorioReplicaLocal {
  private banco: Promise<SQLite.SQLiteDatabase> | undefined;
  private readonly observadores = new Set<() => void>();

  public constructor(public readonly cofre = new CofreReplicaLocal()) {}

  public async obterAutorizacao(): Promise<AutorizacaoOfflineLocal | undefined> {
    const banco = await this.abrir();
    const linha = await banco.getFirstAsync<LinhaAutorizacaoOffline>(
      `SELECT autorizacao_offline AS token,
        autorizacao_offline_valida_ate AS valida_ate,
        sequencia_evento,
        versao_permissoes
       FROM estado_replica WHERE id = ? AND precisa_ressincronizar = 0`,
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

  public async obterEstado(): Promise<EstadoReplicaLocal | undefined> {
    const banco = await this.abrir();
    const linha = await banco.getFirstAsync<{
      autorizacao_offline_valida_ate: string;
      precisa_ressincronizar: number;
      sequencia_evento: string;
      versao_permissoes: number;
    }>(
      `SELECT autorizacao_offline_valida_ate, precisa_ressincronizar,
        sequencia_evento, versao_permissoes
       FROM estado_replica WHERE id = ?`,
      1,
    );
    return linha === null
      ? undefined
      : {
          autorizacaoOfflineValidaAte: linha.autorizacao_offline_valida_ate,
          precisaRessincronizar: linha.precisa_ressincronizar === 1,
          sequenciaEvento: linha.sequencia_evento,
          versaoPermissoes: linha.versao_permissoes,
        };
  }

  public observarMudancas(observador: () => void): () => void {
    this.observadores.add(observador);
    return () => {
      this.observadores.delete(observador);
    };
  }

  public async listarAtendimentos(
    filtro: FiltroAtendimentosMobile,
    usuarioId: string,
    agora = new Date(),
  ): Promise<readonly ResumoAtendimentoLocal[]> {
    const banco = await this.abrir();
    const limiteSla = new Date(agora.getTime() + 15 * 60 * 1_000).toISOString();
    const limiteJanela = new Date(agora.getTime() + 30 * 60 * 1_000).toISOString();
    const condicoes: Readonly<Record<FiltroAtendimentosMobile, string>> = {
      EM_AUTOMACAO: `modo = 'BOT'`,
      EXPIRANDO: 'janela_expira_em > ? AND janela_expira_em <= ?',
      MEUS: 'usuario_responsavel_id = ?',
      NAO_LIDOS: 'quantidade_nao_lida > 0',
      PENDENTES: `estado = 'AGUARDANDO' AND usuario_responsavel_id IS NULL`,
      SLA: 'sla_em <= ?',
    };
    const parametros: Readonly<Record<FiltroAtendimentosMobile, readonly string[]>> = {
      EM_AUTOMACAO: [],
      EXPIRANDO: [agora.toISOString(), limiteJanela],
      MEUS: [usuarioId],
      NAO_LIDOS: [],
      PENDENTES: [],
      SLA: [limiteSla],
    };
    const linhas = await banco.getAllAsync<LinhaResumoAtendimentoLocal>(
      `SELECT atendimento_id, contato_id, conversa_id, estado, fila_id,
        fila_nome, identidade_secundaria, janela_expira_em, modo,
        motivo_espera, nome_contato, quantidade_nao_lida, sla_em,
        ultima_atividade_em, ultima_mensagem_direcao,
        ultima_mensagem_resumo, usuario_responsavel_id
       FROM resumo_atendimento
       WHERE estado IN ('AGUARDANDO', 'EM_ATENDIMENTO')
         AND ${condicoes[filtro]}
       ORDER BY ultima_atividade_em DESC, atendimento_id DESC
       LIMIT 60`,
      ...parametros[filtro],
    );
    return linhas.map((linha) => ({
      atendimentoId: linha.atendimento_id,
      contatoId: linha.contato_id,
      conversaId: linha.conversa_id,
      estado: linha.estado,
      filaId: linha.fila_id,
      filaNome: linha.fila_nome,
      ...(linha.identidade_secundaria === null
        ? {}
        : { identidadeSecundaria: linha.identidade_secundaria }),
      ...(linha.janela_expira_em === null
        ? {}
        : { janelaExpiraEm: linha.janela_expira_em }),
      modo: linha.modo,
      motivoEspera: linha.motivo_espera,
      nomeContato: linha.nome_contato,
      quantidadeNaoLida: linha.quantidade_nao_lida,
      ...(linha.sla_em === null ? {} : { slaEm: linha.sla_em }),
      ultimaAtividadeEm: linha.ultima_atividade_em,
      ...(linha.ultima_mensagem_direcao === null
        ? {}
        : { ultimaMensagemDirecao: linha.ultima_mensagem_direcao }),
      ultimaMensagemResumo: linha.ultima_mensagem_resumo,
      ...(linha.usuario_responsavel_id === null
        ? {}
        : { usuarioResponsavelId: linha.usuario_responsavel_id }),
    }));
  }

  public async contarFiltrosAtendimentos(
    usuarioId: string,
    agora = new Date(),
  ): Promise<Readonly<Record<FiltroAtendimentosMobile, number>>> {
    const banco = await this.abrir();
    const linha = await banco.getFirstAsync<{
      em_automacao: number;
      expirando: number;
      meus: number;
      nao_lidos: number;
      pendentes: number;
      sla: number;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN usuario_responsavel_id = ? THEN 1 ELSE 0 END), 0) AS meus,
        COALESCE(SUM(CASE WHEN estado = 'AGUARDANDO' AND usuario_responsavel_id IS NULL THEN 1 ELSE 0 END), 0) AS pendentes,
        COALESCE(SUM(CASE WHEN quantidade_nao_lida > 0 THEN 1 ELSE 0 END), 0) AS nao_lidos,
        COALESCE(SUM(CASE WHEN sla_em <= ? THEN 1 ELSE 0 END), 0) AS sla,
        COALESCE(SUM(CASE WHEN janela_expira_em > ? AND janela_expira_em <= ? THEN 1 ELSE 0 END), 0) AS expirando,
        COALESCE(SUM(CASE WHEN modo = 'BOT' THEN 1 ELSE 0 END), 0) AS em_automacao
       FROM resumo_atendimento
       WHERE estado IN ('AGUARDANDO', 'EM_ATENDIMENTO')`,
      usuarioId,
      new Date(agora.getTime() + 15 * 60 * 1_000).toISOString(),
      agora.toISOString(),
      new Date(agora.getTime() + 30 * 60 * 1_000).toISOString(),
    );
    return {
      EM_AUTOMACAO: linha?.em_automacao ?? 0,
      EXPIRANDO: linha?.expirando ?? 0,
      MEUS: linha?.meus ?? 0,
      NAO_LIDOS: linha?.nao_lidos ?? 0,
      PENDENTES: linha?.pendentes ?? 0,
      SLA: linha?.sla ?? 0,
    };
  }

  public async aplicarSnapshot(snapshot: SnapshotMobileValidado): Promise<void> {
    const banco = await this.abrir();
    await banco.withExclusiveTransactionAsync(async (transacao) => {
      await transacao.execAsync(`
        DELETE FROM evento_sincronizacao;
        DELETE FROM resumo_atendimento;
        DELETE FROM nota_interna;
        DELETE FROM mensagem;
        DELETE FROM atendimento;
        DELETE FROM conversa;
        DELETE FROM fila;
        DELETE FROM controle_recurso;
        DELETE FROM permissao;
        DELETE FROM politica_versao;
        DELETE FROM estado_replica;
      `);
      await executarPreparado(
        transacao,
        'INSERT INTO fila (id, nome) VALUES (?, ?)',
        snapshot.filas.map(({ id, nome }) => [id, nome]),
      );
      await executarPreparado(
        transacao,
        `INSERT INTO conversa
          (id, contato_id, ultima_atividade_em, versao) VALUES (?, ?, ?, ?)`,
        snapshot.conversas.map((item) => [
          item.id,
          item.contatoId,
          item.ultimaAtividadeEm,
          item.versao,
        ]),
      );
      await executarPreparado(
        transacao,
        `INSERT INTO atendimento
          (id, conversa_id, conta_origem_id, estado, fila_id, modo,
           motivo_espera, usuario_responsavel_id, versao_atribuicao,
           versao_estado, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        snapshot.atendimentos.map((item) => [
          item.id,
          item.conversaId,
          item.contaOrigemId,
          item.estado,
          item.filaId,
          item.modo,
          item.motivoEspera,
          item.usuarioResponsavelId ?? null,
          item.versaoAtribuicao,
          item.versaoEstado,
          item.atualizadoEm,
        ]),
      );
      await executarPreparado(
        transacao,
        `INSERT INTO resumo_atendimento
          (atendimento_id, conversa_id, contato_id, estado, fila_id, fila_nome,
           modo, motivo_espera, usuario_responsavel_id, nome_contato,
           identidade_secundaria, ultima_atividade_em, ultima_mensagem_resumo,
           ultima_mensagem_direcao, quantidade_nao_lida, sla_em,
           janela_expira_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        snapshot.atendimentos.map((item) => [
          item.id,
          item.conversaId,
          item.contatoId,
          item.estado,
          item.filaId,
          item.filaNome,
          item.modo,
          item.motivoEspera,
          item.usuarioResponsavelId ?? null,
          item.nomeContato,
          item.identidadeSecundaria ?? null,
          item.ultimaAtividadeEm,
          item.ultimaMensagemResumo,
          item.ultimaMensagemDirecao ?? null,
          item.quantidadeNaoLida,
          item.slaEm ?? null,
          item.janelaExpiraEm ?? null,
        ]),
      );
      await executarPreparado(
        transacao,
        `INSERT INTO mensagem
          (id, conversa_id, atendimento_id, conta_origem_id, direcao, tipo,
           estado_saida, conteudo_json, responde_a_mensagem_id,
           mensagem_alvo_reacao_id, recebida_servidor_em, versao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        snapshot.mensagensRecentes.map((item) => [
          item.id,
          item.conversaId,
          item.atendimentoId,
          item.contaOrigemId,
          item.direcao,
          item.tipo,
          item.estadoSaida ?? null,
          JSON.stringify(item.conteudo),
          item.respondeAMensagemId ?? null,
          item.mensagemAlvoReacaoId ?? null,
          item.recebidaServidorEm,
          item.versao,
        ]),
      );
      await executarPreparado(
        transacao,
        `INSERT INTO nota_interna
          (id, conversa_id, atendimento_id, autor_usuario_id, conteudo_json,
           criada_em, visibilidade) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        snapshot.notasInternasRecentes.map((item) => [
          item.id,
          item.conversaId,
          item.atendimentoId,
          item.autorUsuarioId,
          JSON.stringify(item.conteudo),
          item.criadaEm,
          item.visibilidade,
        ]),
      );
      await executarPreparado(
        transacao,
        'INSERT INTO controle_recurso (codigo, ativado) VALUES (?, ?)',
        Object.entries(snapshot.controlesRecurso).map(([codigo, ativado]) => [
          codigo,
          ativado ? 1 : 0,
        ]),
      );
      await executarPreparado(
        transacao,
        'INSERT INTO permissao (codigo) VALUES (?)',
        snapshot.permissoes.map((codigo) => [codigo]),
      );
      await executarPreparado(
        transacao,
        `INSERT INTO politica_versao
          (plataforma, versao_minima, versao_recomendada, versao)
         VALUES (?, ?, ?, ?)`,
        snapshot.politicasVersao.map((item) => [
          item.plataforma,
          item.versaoMinima,
          item.versaoRecomendada,
          item.versao,
        ]),
      );
      await transacao.runAsync(
        `INSERT INTO estado_replica
          (id, sequencia_evento, versao_permissoes, autorizacao_offline,
           autorizacao_offline_valida_ate, precisa_ressincronizar)
         VALUES (?, ?, ?, ?, ?, ?)`,
        1,
        snapshot.sequenciaBase,
        snapshot.versaoPermissoes,
        snapshot.autorizacaoOffline,
        snapshot.autorizacaoOfflineValidaAte,
        0,
      );
    });
    this.publicarMudanca();
  }

  public async aplicarLote(
    cursorEsperado: string,
    eventos: readonly EventoSincronizacaoMobile[],
    sequenciaFinal: string,
  ): Promise<void> {
    const banco = await this.abrir();
    await banco.withExclusiveTransactionAsync(async (transacao) => {
      const estado = await transacao.getFirstAsync<{
        precisa_ressincronizar: number;
        sequencia_evento: string;
      }>(
        `SELECT precisa_ressincronizar, sequencia_evento
         FROM estado_replica WHERE id = ?`,
        1,
      );
      if (estado === null || estado.sequencia_evento !== cursorEsperado) {
        throw new Error('CURSOR_REPLICA_LOCAL_DIVERGENTE');
      }
      await executarPreparado(
        transacao,
        `INSERT OR IGNORE INTO evento_sincronizacao
          (sequencia_evento, tipo, entidade_tipo, entidade_id, atendimento_id,
           conversa_id, ocorrido_em, politica_cache, dados_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        eventos.map((evento) => [
          evento.sequenciaEvento,
          evento.tipo,
          evento.entidadeTipo,
          evento.entidadeId,
          evento.atendimentoId ?? null,
          evento.conversaId ?? null,
          evento.ocorridoEm,
          evento.politicaCache,
          JSON.stringify(evento.dados),
        ]),
      );
      const precisaRessincronizar =
        sequenciaFinal !== cursorEsperado || estado.precisa_ressincronizar === 1
          ? 1
          : 0;
      const resultado = await transacao.runAsync(
        `UPDATE estado_replica SET
          sequencia_evento = ?, precisa_ressincronizar = ?
         WHERE id = ? AND sequencia_evento = ?`,
        sequenciaFinal,
        precisaRessincronizar,
        1,
        cursorEsperado,
      );
      if (resultado.changes !== 1) {
        throw new Error('CURSOR_REPLICA_LOCAL_DIVERGENTE');
      }
    });
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
        DELETE FROM resumo_atendimento;
        DELETE FROM nota_interna;
        DELETE FROM mensagem;
        DELETE FROM atendimento;
        DELETE FROM conversa;
        DELETE FROM fila;
        DELETE FROM controle_recurso;
        DELETE FROM permissao;
        DELETE FROM politica_versao;
        DELETE FROM evento_sincronizacao;
        DELETE FROM estado_replica;
      `);
    });
    this.publicarMudanca();
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
    let atual = versao?.user_version;
    if (atual !== 0 && atual !== 1 && atual !== 2 && atual !== 3) {
      throw new Error('VERSAO_REPLICA_LOCAL_INCOMPATIVEL');
    }
    if (atual === 0) {
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
      atual = 1;
    }
    if (atual === 1) {
      await banco.withExclusiveTransactionAsync(async (transacao) => {
        await transacao.execAsync(`
          ALTER TABLE estado_replica ADD COLUMN precisa_ressincronizar INTEGER
            NOT NULL DEFAULT 0 CHECK (precisa_ressincronizar IN (0, 1));

          ALTER TABLE mensagem RENAME TO mensagem_v1;
          CREATE TABLE mensagem (
            id TEXT PRIMARY KEY,
            conversa_id TEXT NOT NULL REFERENCES conversa(id) ON DELETE CASCADE,
            atendimento_id TEXT NOT NULL,
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
          INSERT INTO mensagem SELECT * FROM mensagem_v1;
          DROP TABLE mensagem_v1;

          ALTER TABLE nota_interna RENAME TO nota_interna_v1;
          CREATE TABLE nota_interna (
            id TEXT PRIMARY KEY,
            conversa_id TEXT NOT NULL REFERENCES conversa(id) ON DELETE CASCADE,
            atendimento_id TEXT NOT NULL,
            autor_usuario_id TEXT NOT NULL,
            conteudo_json TEXT NOT NULL,
            criada_em TEXT NOT NULL,
            visibilidade TEXT NOT NULL CHECK (visibilidade = 'SOMENTE_EQUIPE')
          );
          INSERT INTO nota_interna SELECT * FROM nota_interna_v1;
          DROP TABLE nota_interna_v1;

          CREATE TABLE permissao (
            codigo TEXT PRIMARY KEY
          );
          CREATE TABLE politica_versao (
            plataforma TEXT PRIMARY KEY CHECK (plataforma IN ('ANDROID', 'IOS')),
            versao_minima TEXT NOT NULL,
            versao_recomendada TEXT NOT NULL,
            versao INTEGER NOT NULL CHECK (versao >= 0)
          );
          CREATE TABLE evento_sincronizacao (
            sequencia_evento TEXT PRIMARY KEY,
            tipo TEXT NOT NULL,
            entidade_tipo TEXT NOT NULL,
            entidade_id TEXT NOT NULL,
            atendimento_id TEXT,
            conversa_id TEXT,
            ocorrido_em TEXT NOT NULL,
            politica_cache TEXT NOT NULL CHECK (politica_cache IN ('OPERACIONAL', 'PROTEGIDO')),
            dados_json TEXT NOT NULL
          );
          CREATE INDEX mensagem_conversa_recebida_v2_idx
            ON mensagem(conversa_id, recebida_servidor_em, id);
          CREATE INDEX nota_conversa_criada_v2_idx
            ON nota_interna(conversa_id, criada_em, id);
          PRAGMA user_version = 2;
        `);
      });
      atual = 2;
    }
    if (atual === 2) {
      await banco.withExclusiveTransactionAsync(async (transacao) => {
        await transacao.execAsync(`
          CREATE TABLE resumo_atendimento (
            atendimento_id TEXT PRIMARY KEY REFERENCES atendimento(id) ON DELETE CASCADE,
            conversa_id TEXT NOT NULL REFERENCES conversa(id) ON DELETE CASCADE,
            contato_id TEXT NOT NULL,
            estado TEXT NOT NULL,
            fila_id TEXT NOT NULL REFERENCES fila(id) ON DELETE CASCADE,
            fila_nome TEXT NOT NULL,
            modo TEXT NOT NULL,
            motivo_espera TEXT NOT NULL,
            usuario_responsavel_id TEXT,
            nome_contato TEXT NOT NULL,
            identidade_secundaria TEXT,
            ultima_atividade_em TEXT NOT NULL,
            ultima_mensagem_resumo TEXT NOT NULL,
            ultima_mensagem_direcao TEXT CHECK (
              ultima_mensagem_direcao IS NULL OR ultima_mensagem_direcao IN ('ENTRADA', 'SAIDA')
            ),
            quantidade_nao_lida INTEGER NOT NULL CHECK (quantidade_nao_lida >= 0),
            sla_em TEXT,
            janela_expira_em TEXT
          );
          CREATE INDEX resumo_atendimento_ordem_idx
            ON resumo_atendimento(ultima_atividade_em DESC, atendimento_id DESC);
          CREATE INDEX resumo_atendimento_filtros_idx
            ON resumo_atendimento(estado, usuario_responsavel_id, modo);
          UPDATE estado_replica SET precisa_ressincronizar = 1;
          PRAGMA user_version = 3;
        `);
      });
    }
  }

  private publicarMudanca(): void {
    for (const observador of this.observadores) observador();
  }
}
