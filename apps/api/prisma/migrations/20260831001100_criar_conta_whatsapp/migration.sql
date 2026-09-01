CREATE TYPE "estado_conta_whatsapp" AS ENUM ('ATIVA', 'INATIVA');

CREATE TABLE "conta_whatsapp" (
  "id" UUID NOT NULL,
  "nome_exibicao" VARCHAR(100) NOT NULL,
  "portfolio_empresarial_externo_id" VARCHAR(256) NOT NULL,
  "identificador_canal_externo" VARCHAR(256) NOT NULL,
  "telefone_exibicao_e164" VARCHAR(16),
  "estado" "estado_conta_whatsapp" NOT NULL DEFAULT 'INATIVA',
  "versao" INTEGER NOT NULL DEFAULT 1,
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conta_whatsapp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conta_whatsapp_nome_check"
    CHECK (char_length(btrim("nome_exibicao")) BETWEEN 1 AND 100),
  CONSTRAINT "conta_whatsapp_portfolio_check"
    CHECK (char_length(btrim("portfolio_empresarial_externo_id")) BETWEEN 1 AND 256),
  CONSTRAINT "conta_whatsapp_identificador_check"
    CHECK (char_length(btrim("identificador_canal_externo")) BETWEEN 1 AND 256),
  CONSTRAINT "conta_whatsapp_telefone_check"
    CHECK ("telefone_exibicao_e164" IS NULL OR "telefone_exibicao_e164" ~ '^[+][1-9][0-9]{7,14}$'),
  CONSTRAINT "conta_whatsapp_versao_check" CHECK ("versao" >= 1)
);

CREATE UNIQUE INDEX "conta_whatsapp_identidade_externa_key"
  ON "conta_whatsapp"("portfolio_empresarial_externo_id", "identificador_canal_externo");
CREATE UNIQUE INDEX "conta_whatsapp_telefone_exibicao_e164_key"
  ON "conta_whatsapp"("telefone_exibicao_e164");
CREATE INDEX "conta_whatsapp_estado_nome_idx"
  ON "conta_whatsapp"("estado", "nome_exibicao", "id");
