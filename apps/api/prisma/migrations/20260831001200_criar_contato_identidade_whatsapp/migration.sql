CREATE TYPE "estado_contato" AS ENUM ('NORMAL', 'BLOQUEADO');

CREATE TABLE "contato" (
  "id" UUID NOT NULL,
  "nome_exibicao" VARCHAR(200),
  "estado" "estado_contato" NOT NULL DEFAULT 'NORMAL',
  "bloqueado_em" TIMESTAMPTZ(6),
  "bloqueado_ate" TIMESTAMPTZ(6),
  "motivo_bloqueio" VARCHAR(500),
  "ultima_interacao_em" TIMESTAMPTZ(6),
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contato_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contato_nome_check"
    CHECK ("nome_exibicao" IS NULL OR char_length(btrim("nome_exibicao")) BETWEEN 1 AND 200),
  CONSTRAINT "contato_bloqueio_check" CHECK (
    ("estado" = 'NORMAL' AND "bloqueado_em" IS NULL AND "bloqueado_ate" IS NULL AND "motivo_bloqueio" IS NULL)
    OR
    ("estado" = 'BLOQUEADO' AND "bloqueado_em" IS NOT NULL AND char_length(btrim("motivo_bloqueio")) BETWEEN 1 AND 500)
  )
);

CREATE TABLE "identidade_whatsapp" (
  "id" UUID NOT NULL,
  "contato_id" UUID NOT NULL,
  "portfolio_empresarial_externo_id" VARCHAR(256) NOT NULL,
  "identificador_externo_estavel" VARCHAR(256) NOT NULL,
  "nome_usuario" VARCHAR(100),
  "telefone_e164" VARCHAR(16),
  "nome_perfil" VARCHAR(200),
  "conta_whatsapp_ultima_observacao_id" UUID NOT NULL,
  "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identidade_whatsapp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identidade_whatsapp_contato_fkey" FOREIGN KEY ("contato_id") REFERENCES "contato"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "identidade_whatsapp_conta_fkey" FOREIGN KEY ("conta_whatsapp_ultima_observacao_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "identidade_whatsapp_portfolio_check" CHECK (char_length(btrim("portfolio_empresarial_externo_id")) BETWEEN 1 AND 256),
  CONSTRAINT "identidade_whatsapp_estavel_check" CHECK (char_length(btrim("identificador_externo_estavel")) BETWEEN 1 AND 256),
  CONSTRAINT "identidade_whatsapp_nome_usuario_check" CHECK ("nome_usuario" IS NULL OR char_length(btrim("nome_usuario")) BETWEEN 1 AND 100),
  CONSTRAINT "identidade_whatsapp_telefone_check" CHECK ("telefone_e164" IS NULL OR "telefone_e164" ~ '^[+][1-9][0-9]{7,14}$'),
  CONSTRAINT "identidade_whatsapp_nome_perfil_check" CHECK ("nome_perfil" IS NULL OR char_length(btrim("nome_perfil")) BETWEEN 1 AND 200)
);

CREATE INDEX "contato_estado_ultima_interacao_idx"
  ON "contato"("estado", "ultima_interacao_em", "id");
CREATE UNIQUE INDEX "identidade_whatsapp_estavel_key"
  ON "identidade_whatsapp"("portfolio_empresarial_externo_id", "identificador_externo_estavel");
CREATE INDEX "identidade_whatsapp_contato_idx"
  ON "identidade_whatsapp"("contato_id", "criada_em", "id");
CREATE INDEX "identidade_whatsapp_nome_usuario_idx"
  ON "identidade_whatsapp"("nome_usuario", "id");
CREATE INDEX "identidade_whatsapp_telefone_idx"
  ON "identidade_whatsapp"("telefone_e164", "id");
