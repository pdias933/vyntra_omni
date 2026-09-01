CREATE TYPE "tipo_vinculo_cliente" AS ENUM ('VERIFICADO', 'MANUAL', 'TEMPORARIO');
CREATE TYPE "origem_contexto_atendimento" AS ENUM ('IDENTIFICACAO', 'USUARIO', 'FLUXO', 'SISTEMA');

CREATE TABLE "vinculo_cliente" (
  "id" UUID NOT NULL,
  "contato_id" UUID NOT NULL,
  "cliente_externo_id" VARCHAR(256) NOT NULL,
  "tipo" "tipo_vinculo_cliente" NOT NULL,
  "preferencial" BOOLEAN NOT NULL DEFAULT FALSE,
  "metodo_verificacao" VARCHAR(100) NOT NULL,
  "verificado_em" TIMESTAMPTZ(6),
  "verificado_por_usuario_id" UUID,
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revogado_em" TIMESTAMPTZ(6),
  CONSTRAINT "vinculo_cliente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vinculo_cliente_id_contato_key" UNIQUE ("id", "contato_id"),
  CONSTRAINT "vinculo_cliente_contato_fkey" FOREIGN KEY ("contato_id") REFERENCES "contato"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "vinculo_cliente_usuario_fkey" FOREIGN KEY ("verificado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "vinculo_cliente_cliente_check" CHECK (char_length(btrim("cliente_externo_id")) BETWEEN 1 AND 256),
  CONSTRAINT "vinculo_cliente_metodo_check" CHECK (char_length(btrim("metodo_verificacao")) BETWEEN 1 AND 100),
  CONSTRAINT "vinculo_cliente_verificacao_check" CHECK (
    ("tipo" = 'TEMPORARIO' AND "verificado_em" IS NULL AND "verificado_por_usuario_id" IS NULL AND "preferencial" = FALSE)
    OR
    ("tipo" IN ('VERIFICADO', 'MANUAL') AND "verificado_em" IS NOT NULL)
  ),
  CONSTRAINT "vinculo_cliente_revogacao_check" CHECK ("revogado_em" IS NULL OR "revogado_em" >= "criado_em")
);

CREATE TABLE "vinculo_contrato" (
  "id" UUID NOT NULL,
  "vinculo_cliente_id" UUID NOT NULL,
  "contrato_externo_id" VARCHAR(256) NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revogado_em" TIMESTAMPTZ(6),
  CONSTRAINT "vinculo_contrato_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vinculo_contrato_id_vinculo_key" UNIQUE ("id", "vinculo_cliente_id"),
  CONSTRAINT "vinculo_contrato_vinculo_fkey" FOREIGN KEY ("vinculo_cliente_id") REFERENCES "vinculo_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "vinculo_contrato_externo_check" CHECK (char_length(btrim("contrato_externo_id")) BETWEEN 1 AND 256),
  CONSTRAINT "vinculo_contrato_revogacao_check" CHECK ("revogado_em" IS NULL OR "revogado_em" >= "criado_em")
);

CREATE TABLE "contexto_atendimento" (
  "atendimento_id" UUID NOT NULL,
  "contato_id" UUID NOT NULL,
  "vinculo_cliente_id" UUID NOT NULL,
  "vinculo_contrato_id" UUID,
  "cliente_externo_ativo_id" VARCHAR(256) NOT NULL,
  "contrato_externo_ativo_id" VARCHAR(256),
  "origem_contexto" "origem_contexto_atendimento" NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  "alterado_em" TIMESTAMPTZ(6) NOT NULL,
  "alterado_por_usuario_id" UUID,
  CONSTRAINT "contexto_atendimento_pkey" PRIMARY KEY ("atendimento_id"),
  CONSTRAINT "contexto_atendimento_contato_fkey" FOREIGN KEY ("contato_id") REFERENCES "contato"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contexto_atendimento_vinculo_cliente_fkey" FOREIGN KEY ("vinculo_cliente_id", "contato_id") REFERENCES "vinculo_cliente"("id", "contato_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contexto_atendimento_vinculo_contrato_fkey" FOREIGN KEY ("vinculo_contrato_id", "vinculo_cliente_id") REFERENCES "vinculo_contrato"("id", "vinculo_cliente_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contexto_atendimento_usuario_fkey" FOREIGN KEY ("alterado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contexto_atendimento_cliente_check" CHECK (char_length(btrim("cliente_externo_ativo_id")) BETWEEN 1 AND 256),
  CONSTRAINT "contexto_atendimento_contrato_check" CHECK (("vinculo_contrato_id" IS NULL) = ("contrato_externo_ativo_id" IS NULL)),
  CONSTRAINT "contexto_atendimento_versao_check" CHECK ("versao" >= 1),
  CONSTRAINT "contexto_atendimento_origem_usuario_check" CHECK (("origem_contexto" = 'USUARIO') = ("alterado_por_usuario_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "vinculo_cliente_ativo_key"
  ON "vinculo_cliente"("contato_id", "cliente_externo_id") WHERE "revogado_em" IS NULL;
CREATE UNIQUE INDEX "vinculo_cliente_preferencial_key"
  ON "vinculo_cliente"("contato_id") WHERE "preferencial" = TRUE AND "revogado_em" IS NULL;
CREATE INDEX "vinculo_cliente_contato_estado_idx"
  ON "vinculo_cliente"("contato_id", "revogado_em", "preferencial", "criado_em");
CREATE INDEX "vinculo_cliente_cliente_idx"
  ON "vinculo_cliente"("cliente_externo_id", "revogado_em", "contato_id");
CREATE UNIQUE INDEX "vinculo_contrato_ativo_key"
  ON "vinculo_contrato"("vinculo_cliente_id", "contrato_externo_id") WHERE "revogado_em" IS NULL;
CREATE INDEX "vinculo_contrato_vinculo_estado_idx"
  ON "vinculo_contrato"("vinculo_cliente_id", "revogado_em", "criado_em");
CREATE INDEX "contexto_atendimento_contato_idx"
  ON "contexto_atendimento"("contato_id", "alterado_em", "atendimento_id");
CREATE INDEX "contexto_atendimento_vinculos_idx"
  ON "contexto_atendimento"("vinculo_cliente_id", "vinculo_contrato_id");
