CREATE TYPE "estado_modelo_mensagem_canal" AS ENUM ('APROVADO', 'REJEITADO', 'PAUSADO', 'DESATIVADO');

CREATE TABLE "modelo_mensagem_canal" (
  "id" UUID NOT NULL,
  "conta_whatsapp_id" UUID NOT NULL,
  "referencia_canal" VARCHAR(256) NOT NULL,
  "nome" VARCHAR(512) NOT NULL,
  "idioma" VARCHAR(20) NOT NULL,
  "estado" "estado_modelo_mensagem_canal" NOT NULL,
  "quantidade_parametros" INTEGER NOT NULL,
  "componentes_protegidos" JSONB NOT NULL,
  "componentes_hash" CHAR(64) NOT NULL,
  "sincronizado_em" TIMESTAMPTZ(6) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "modelo_mensagem_canal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "modelo_mensagem_canal_conta_fkey" FOREIGN KEY ("conta_whatsapp_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "modelo_mensagem_canal_limites_check" CHECK (
    "nome" ~ '^[a-z0-9_]{1,512}$'
    AND "idioma" ~ '^[a-z]{2,3}(_[A-Z]{2})?$'
    AND char_length(btrim("referencia_canal")) BETWEEN 1 AND 256
    AND "quantidade_parametros" BETWEEN 0 AND 100
    AND "componentes_hash" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("componentes_protegidos") = 'object'
    AND "versao" >= 1
  )
);
CREATE UNIQUE INDEX "modelo_mensagem_canal_conta_nome_idioma_key" ON "modelo_mensagem_canal"("conta_whatsapp_id", "nome", "idioma");
CREATE UNIQUE INDEX "modelo_mensagem_canal_conta_referencia_key" ON "modelo_mensagem_canal"("conta_whatsapp_id", "referencia_canal");
CREATE INDEX "modelo_mensagem_canal_catalogo_idx" ON "modelo_mensagem_canal"("conta_whatsapp_id", "estado", "nome", "idioma");
