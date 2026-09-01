CREATE TYPE "resultado_alteracao_identidade_whatsapp" AS ENUM ('PRESERVADA', 'SEPARADA_INCERTA');

CREATE TABLE "alias_identidade_whatsapp" (
  "id" UUID NOT NULL,
  "identidade_whatsapp_id" UUID NOT NULL,
  "portfolio_empresarial_externo_id" VARCHAR(256) NOT NULL,
  "identificador_externo_anterior" VARCHAR(256) NOT NULL,
  "substituido_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "alias_identidade_whatsapp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alias_identidade_whatsapp_identidade_fkey" FOREIGN KEY ("identidade_whatsapp_id") REFERENCES "identidade_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "alias_identidade_whatsapp_portfolio_check" CHECK (char_length(btrim("portfolio_empresarial_externo_id")) BETWEEN 1 AND 256),
  CONSTRAINT "alias_identidade_whatsapp_anterior_check" CHECK (char_length(btrim("identificador_externo_anterior")) BETWEEN 1 AND 256)
);

CREATE TABLE "evento_alteracao_identidade_whatsapp" (
  "id" UUID NOT NULL,
  "identidade_whatsapp_id" UUID NOT NULL,
  "conta_whatsapp_observacao_id" UUID NOT NULL,
  "portfolio_empresarial_externo_id" VARCHAR(256) NOT NULL,
  "identificador_externo_anterior" VARCHAR(256) NOT NULL,
  "identificador_externo_atual" VARCHAR(256) NOT NULL,
  "resultado" "resultado_alteracao_identidade_whatsapp" NOT NULL,
  "observado_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "evento_alteracao_identidade_whatsapp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evento_alteracao_identidade_identidade_fkey" FOREIGN KEY ("identidade_whatsapp_id") REFERENCES "identidade_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "evento_alteracao_identidade_conta_fkey" FOREIGN KEY ("conta_whatsapp_observacao_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "evento_alteracao_identidade_anterior_check" CHECK (char_length(btrim("identificador_externo_anterior")) BETWEEN 1 AND 256),
  CONSTRAINT "evento_alteracao_identidade_atual_check" CHECK (char_length(btrim("identificador_externo_atual")) BETWEEN 1 AND 256),
  CONSTRAINT "evento_alteracao_identidade_distinta_check" CHECK ("identificador_externo_anterior" <> "identificador_externo_atual")
);

CREATE UNIQUE INDEX "alias_identidade_whatsapp_anterior_key"
  ON "alias_identidade_whatsapp"("portfolio_empresarial_externo_id", "identificador_externo_anterior");
CREATE INDEX "alias_identidade_whatsapp_identidade_idx"
  ON "alias_identidade_whatsapp"("identidade_whatsapp_id", "substituido_em", "id");
CREATE UNIQUE INDEX "evento_alteracao_identidade_par_key"
  ON "evento_alteracao_identidade_whatsapp"("portfolio_empresarial_externo_id", "identificador_externo_anterior", "identificador_externo_atual");
CREATE INDEX "evento_alteracao_identidade_identidade_idx"
  ON "evento_alteracao_identidade_whatsapp"("identidade_whatsapp_id", "observado_em", "id");
