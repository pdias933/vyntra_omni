CREATE TYPE "origem_snapshot_cliente" AS ENUM ('INTEGRACAO_ERP');

CREATE TABLE "snapshot_cliente" (
  "id" UUID NOT NULL,
  "vinculo_cliente_id" UUID NOT NULL,
  "origem" "origem_snapshot_cliente" NOT NULL DEFAULT 'INTEGRACAO_ERP',
  "dados_protegidos" JSONB NOT NULL,
  "conteudo_hash" CHAR(64) NOT NULL,
  "capturado_em" TIMESTAMPTZ(6) NOT NULL,
  "persistido_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "snapshot_cliente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "snapshot_cliente_vinculo_key" UNIQUE ("vinculo_cliente_id"),
  CONSTRAINT "snapshot_cliente_vinculo_fkey" FOREIGN KEY ("vinculo_cliente_id") REFERENCES "vinculo_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "snapshot_cliente_dados_check" CHECK (jsonb_typeof("dados_protegidos") = 'object' AND "dados_protegidos" <> '{}'::jsonb),
  CONSTRAINT "snapshot_cliente_hash_check" CHECK ("conteudo_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "snapshot_cliente_versao_check" CHECK ("versao" >= 1),
  CONSTRAINT "snapshot_cliente_datas_check" CHECK ("atualizado_em" >= "persistido_em")
);

CREATE INDEX "snapshot_cliente_capturado_idx"
  ON "snapshot_cliente"("capturado_em", "vinculo_cliente_id");
