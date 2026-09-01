CREATE TYPE "estado_aplicacao_integracao" AS ENUM ('ATIVA', 'INATIVA');
CREATE TYPE "finalidade_consentimento_canal" AS ENUM ('MENSAGEM_TRANSACIONAL');
CREATE TYPE "estado_consentimento_canal" AS ENUM ('CONCEDIDO', 'REVOGADO');

CREATE TABLE "aplicacao_integracao" (
  "id" UUID NOT NULL,
  "nome" VARCHAR(100) NOT NULL,
  "segredo_hash" CHAR(64) NOT NULL,
  "estado" "estado_aplicacao_integracao" NOT NULL DEFAULT 'ATIVA',
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "aplicacao_integracao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "aplicacao_integracao_limites_check" CHECK (char_length(btrim("nome")) BETWEEN 1 AND 100 AND char_length("segredo_hash")=64 AND "segredo_hash" ~ '^[0-9a-f]+$')
);
CREATE UNIQUE INDEX "aplicacao_integracao_nome_key" ON "aplicacao_integracao"("nome");
CREATE INDEX "aplicacao_integracao_estado_nome_idx" ON "aplicacao_integracao"("estado", "nome", "id");

CREATE TABLE "consentimento_contato_canal" (
  "id" UUID NOT NULL,
  "contato_id" UUID NOT NULL,
  "conta_whatsapp_id" UUID NOT NULL,
  "finalidade" "finalidade_consentimento_canal" NOT NULL,
  "estado" "estado_consentimento_canal" NOT NULL,
  "origem" VARCHAR(100) NOT NULL,
  "concedido_em" TIMESTAMPTZ(6) NOT NULL,
  "revogado_em" TIMESTAMPTZ(6),
  "versao" INTEGER NOT NULL DEFAULT 1,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "consentimento_contato_canal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consentimento_contato_canal_contato_fkey" FOREIGN KEY ("contato_id") REFERENCES "contato"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "consentimento_contato_canal_conta_fkey" FOREIGN KEY ("conta_whatsapp_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "consentimento_contato_canal_limites_check" CHECK (char_length(btrim("origem")) BETWEEN 1 AND 100 AND "versao">=1 AND (("estado"='CONCEDIDO' AND "revogado_em" IS NULL) OR ("estado"='REVOGADO' AND "revogado_em">="concedido_em")))
);
CREATE UNIQUE INDEX "consentimento_contato_canal_escopo_key" ON "consentimento_contato_canal"("contato_id", "conta_whatsapp_id", "finalidade");
CREATE INDEX "consentimento_contato_canal_estado_idx" ON "consentimento_contato_canal"("conta_whatsapp_id", "estado", "finalidade", "atualizado_em");

CREATE TABLE "disparo_transacional" (
  "id" UUID NOT NULL,
  "aplicacao_integracao_id" UUID NOT NULL,
  "consentimento_id" UUID NOT NULL,
  "mensagem_id" UUID NOT NULL,
  "chave_idempotencia_hash" CHAR(64) NOT NULL,
  "assinatura_comando_hash" CHAR(64) NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "disparo_transacional_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "disparo_transacional_aplicacao_fkey" FOREIGN KEY ("aplicacao_integracao_id") REFERENCES "aplicacao_integracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "disparo_transacional_consentimento_fkey" FOREIGN KEY ("consentimento_id") REFERENCES "consentimento_contato_canal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "disparo_transacional_mensagem_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "mensagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "disparo_transacional_hashes_check" CHECK (char_length("chave_idempotencia_hash")=64 AND "chave_idempotencia_hash" ~ '^[0-9a-f]+$' AND char_length("assinatura_comando_hash")=64 AND "assinatura_comando_hash" ~ '^[0-9a-f]+$')
);
CREATE UNIQUE INDEX "disparo_transacional_mensagem_key" ON "disparo_transacional"("mensagem_id");
CREATE UNIQUE INDEX "disparo_transacional_aplicacao_idempotencia_key" ON "disparo_transacional"("aplicacao_integracao_id", "chave_idempotencia_hash");
CREATE INDEX "disparo_transacional_consentimento_criado_idx" ON "disparo_transacional"("consentimento_id", "criado_em", "id");

CREATE FUNCTION validar_disparo_transacional() RETURNS trigger AS $$
DECLARE consentimento consentimento_contato_canal%ROWTYPE; mensagem_saida mensagem%ROWTYPE; contato_conversa UUID;
BEGIN
  SELECT * INTO consentimento FROM consentimento_contato_canal WHERE id=NEW.consentimento_id FOR SHARE;
  SELECT * INTO mensagem_saida FROM mensagem WHERE id=NEW.mensagem_id FOR SHARE;
  SELECT contato_id INTO contato_conversa FROM conversa WHERE id=mensagem_saida.conversa_id;
  IF NOT EXISTS (SELECT 1 FROM aplicacao_integracao WHERE id=NEW.aplicacao_integracao_id AND estado='ATIVA') OR
     consentimento.estado<>'CONCEDIDO' OR consentimento.finalidade<>'MENSAGEM_TRANSACIONAL' OR
     consentimento.contato_id<>contato_conversa OR consentimento.conta_whatsapp_id<>mensagem_saida.conta_whatsapp_id OR
     mensagem_saida.direcao<>'SAIDA' OR mensagem_saida.tipo<>'MODELO_APROVADO' OR mensagem_saida.estado_saida<>'NA_FILA' OR
     mensagem_saida.usuario_remetente_id IS NOT NULL OR mensagem_saida.contato_remetente_id IS NOT NULL THEN
    RAISE EXCEPTION 'DISPARO_TRANSACIONAL_INVALIDO' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "disparo_transacional_validar_insert" BEFORE INSERT ON "disparo_transacional" FOR EACH ROW EXECUTE FUNCTION validar_disparo_transacional();
CREATE FUNCTION proteger_disparo_transacional() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'DISPARO_TRANSACIONAL_IMUTAVEL' USING ERRCODE='55000'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "disparo_transacional_proteger_update" BEFORE UPDATE OR DELETE ON "disparo_transacional" FOR EACH ROW EXECUTE FUNCTION proteger_disparo_transacional();
