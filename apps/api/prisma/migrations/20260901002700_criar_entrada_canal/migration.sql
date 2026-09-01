CREATE TYPE "estado_evento_entrada_canal" AS ENUM ('RECEBIDO', 'PERSISTIDO');

CREATE TABLE "evento_entrada_canal" (
  "id" UUID NOT NULL,
  "conta_whatsapp_id" UUID NOT NULL,
  "identificador_evento_externo" VARCHAR(256) NOT NULL,
  "corpo_hash" CHAR(64) NOT NULL,
  "estado" "estado_evento_entrada_canal" NOT NULL DEFAULT 'RECEBIDO',
  "recebido_em" TIMESTAMPTZ(6) NOT NULL,
  "persistido_em" TIMESTAMPTZ(6),
  "mensagem_id" UUID,
  CONSTRAINT "evento_entrada_canal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evento_entrada_canal_estado_check" CHECK (
    ("estado" = 'RECEBIDO' AND "persistido_em" IS NULL AND "mensagem_id" IS NULL)
    OR ("estado" = 'PERSISTIDO' AND "persistido_em" IS NOT NULL AND "mensagem_id" IS NOT NULL)
  ),
  CONSTRAINT "evento_entrada_canal_hash_check" CHECK ("corpo_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "evento_entrada_canal_conta_fkey" FOREIGN KEY ("conta_whatsapp_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "evento_entrada_canal_mensagem_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "mensagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "evento_entrada_canal_conta_evento_key" ON "evento_entrada_canal"("conta_whatsapp_id", "identificador_evento_externo");
CREATE UNIQUE INDEX "evento_entrada_canal_mensagem_key" ON "evento_entrada_canal"("mensagem_id") WHERE "mensagem_id" IS NOT NULL;
CREATE INDEX "evento_entrada_canal_estado_recebido_idx" ON "evento_entrada_canal"("estado", "recebido_em", "id");

CREATE FUNCTION proteger_evento_entrada_canal() RETURNS trigger AS $$
BEGIN
  IF OLD."estado" = 'PERSISTIDO'
    OR NEW."id" <> OLD."id"
    OR NEW."conta_whatsapp_id" <> OLD."conta_whatsapp_id"
    OR NEW."identificador_evento_externo" <> OLD."identificador_evento_externo"
    OR NEW."corpo_hash" <> OLD."corpo_hash"
    OR NEW."recebido_em" <> OLD."recebido_em"
    OR NOT (OLD."estado" = 'RECEBIDO' AND NEW."estado" = 'PERSISTIDO')
  THEN RAISE EXCEPTION 'EVENTO_ENTRADA_CANAL_IMUTAVEL' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "evento_entrada_canal_proteger_update" BEFORE UPDATE ON "evento_entrada_canal" FOR EACH ROW EXECUTE FUNCTION proteger_evento_entrada_canal();
CREATE TRIGGER "evento_entrada_canal_proteger_delete" BEFORE DELETE ON "evento_entrada_canal" FOR EACH ROW EXECUTE FUNCTION proteger_evento_entrada_canal();
