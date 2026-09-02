CREATE TYPE "estado_fator_mfa_totp" AS ENUM ('ATIVO', 'REVOGADO');

CREATE TABLE "fator_mfa_totp" (
  "usuario_id" UUID NOT NULL,
  "segredo_protegido" VARCHAR(512) NOT NULL,
  "ultimo_contador_usado" BIGINT,
  "estado" "estado_fator_mfa_totp" NOT NULL DEFAULT 'ATIVO',
  "ativado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revogado_em" TIMESTAMPTZ(6),
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fator_mfa_totp_pkey" PRIMARY KEY ("usuario_id"),
  CONSTRAINT "fator_mfa_totp_segredo_protegido_check" CHECK (
    "segredo_protegido" ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'
  ),
  CONSTRAINT "fator_mfa_totp_contador_check" CHECK (
    "ultimo_contador_usado" IS NULL OR "ultimo_contador_usado" >= 0
  ),
  CONSTRAINT "fator_mfa_totp_estado_check" CHECK (
    ("estado" = 'ATIVO' AND "revogado_em" IS NULL)
    OR ("estado" = 'REVOGADO' AND "revogado_em" IS NOT NULL)
  )
);

CREATE INDEX "fator_mfa_totp_estado_usuario_idx"
  ON "fator_mfa_totp"("estado", "usuario_id");

ALTER TABLE "fator_mfa_totp"
  ADD CONSTRAINT "fator_mfa_totp_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "codigo_recuperacao_mfa" (
  "id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "codigo_hash" CHAR(64) NOT NULL,
  "usado_em" TIMESTAMPTZ(6),
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "codigo_recuperacao_mfa_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "codigo_recuperacao_mfa_hash_check" CHECK (
    "codigo_hash" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "codigo_recuperacao_mfa_uso_check" CHECK (
    "usado_em" IS NULL OR "usado_em" >= "criado_em"
  )
);

CREATE UNIQUE INDEX "codigo_recuperacao_mfa_usuario_hash_key"
  ON "codigo_recuperacao_mfa"("usuario_id", "codigo_hash");
CREATE INDEX "codigo_recuperacao_mfa_usuario_uso_idx"
  ON "codigo_recuperacao_mfa"("usuario_id", "usado_em");

ALTER TABLE "codigo_recuperacao_mfa"
  ADD CONSTRAINT "codigo_recuperacao_mfa_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "fator_mfa_totp"("usuario_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
