-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "origem_auditoria" AS ENUM ('USUARIO', 'FLUXO', 'SISTEMA', 'INTEGRACAO');

-- CreateTable
CREATE TABLE "registro_auditoria" (
    "id" UUID NOT NULL,
    "tipo_evento" VARCHAR(100) NOT NULL,
    "origem" "origem_auditoria" NOT NULL,
    "usuario_id" UUID,
    "fluxo_id" UUID,
    "versao_fluxo_id" UUID,
    "atendimento_id" UUID,
    "contato_id" UUID,
    "fila_id" UUID,
    "acao" VARCHAR(100) NOT NULL,
    "entidade_tipo" VARCHAR(100),
    "entidade_id" UUID,
    "dados_anteriores_sanitizados" JSONB,
    "dados_novos_sanitizados" JSONB,
    "endereco_ip" INET,
    "dispositivo_id" UUID,
    "sessao_id" UUID,
    "correlacao_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_auditoria_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "registro_auditoria_tipo_evento_check"
      CHECK ("tipo_evento" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "registro_auditoria_acao_check"
      CHECK ("acao" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "registro_auditoria_entidade_check"
      CHECK (("entidade_tipo" IS NULL) = ("entidade_id" IS NULL)),
    CONSTRAINT "registro_auditoria_entidade_tipo_check"
      CHECK ("entidade_tipo" IS NULL OR "entidade_tipo" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "registro_auditoria_dados_anteriores_check"
      CHECK ("dados_anteriores_sanitizados" IS NULL OR jsonb_typeof("dados_anteriores_sanitizados") = 'object'),
    CONSTRAINT "registro_auditoria_dados_novos_check"
      CHECK ("dados_novos_sanitizados" IS NULL OR jsonb_typeof("dados_novos_sanitizados") = 'object'),
    CONSTRAINT "registro_auditoria_origem_ator_check"
      CHECK (
        ("origem" = 'USUARIO' AND "usuario_id" IS NOT NULL AND "fluxo_id" IS NULL AND "versao_fluxo_id" IS NULL)
        OR ("origem" = 'FLUXO' AND "usuario_id" IS NULL AND "fluxo_id" IS NOT NULL AND "versao_fluxo_id" IS NOT NULL)
        OR ("origem" IN ('SISTEMA', 'INTEGRACAO') AND "usuario_id" IS NULL AND "fluxo_id" IS NULL AND "versao_fluxo_id" IS NULL)
      )
);

-- CreateIndex
CREATE INDEX "registro_auditoria_criado_em_idx" ON "registro_auditoria"("criado_em");

-- CreateIndex
CREATE INDEX "registro_auditoria_usuario_criado_em_idx" ON "registro_auditoria"("usuario_id", "criado_em");

-- CreateIndex
CREATE INDEX "registro_auditoria_atendimento_criado_em_idx" ON "registro_auditoria"("atendimento_id", "criado_em");

-- CreateIndex
CREATE INDEX "registro_auditoria_entidade_criado_em_idx" ON "registro_auditoria"("entidade_tipo", "entidade_id", "criado_em");

-- A tabela é somente de acréscimo. Prisma não representa triggers; este SQL bruto
-- é estreito, não recebe entrada e materializa a imutabilidade no PostgreSQL.
CREATE FUNCTION "impedir_mutacao_registro_auditoria"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'REGISTRO_AUDITORIA_IMUTAVEL' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "registro_auditoria_bloquear_update_delete"
BEFORE UPDATE OR DELETE ON "registro_auditoria"
FOR EACH ROW
EXECUTE FUNCTION "impedir_mutacao_registro_auditoria"();

CREATE TRIGGER "registro_auditoria_bloquear_truncate"
BEFORE TRUNCATE ON "registro_auditoria"
FOR EACH STATEMENT
EXECUTE FUNCTION "impedir_mutacao_registro_auditoria"();

REVOKE UPDATE, DELETE, TRUNCATE ON "registro_auditoria" FROM PUBLIC;
