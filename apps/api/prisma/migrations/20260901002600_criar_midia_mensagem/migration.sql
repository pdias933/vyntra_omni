CREATE TYPE "categoria_midia_mensagem" AS ENUM ('IMAGEM', 'AUDIO', 'VIDEO', 'PDF');

CREATE TABLE "midia_mensagem" (
  "mensagem_id" UUID NOT NULL,
  "categoria" "categoria_midia_mensagem" NOT NULL,
  "bucket_privado" VARCHAR(100) NOT NULL,
  "chave_objeto" VARCHAR(500) NOT NULL,
  "mime_declarado" VARCHAR(100) NOT NULL,
  "mime_detectado" VARCHAR(100) NOT NULL,
  "tamanho_bytes" BIGINT NOT NULL,
  "conteudo_hash" CHAR(64) NOT NULL,
  "armazenada_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "midia_mensagem_pkey" PRIMARY KEY ("mensagem_id"),
  CONSTRAINT "midia_mensagem_limites_check" CHECK (
    "bucket_privado" ~ '^[a-z0-9][a-z0-9.-]{1,98}[a-z0-9]$'
    AND "chave_objeto" ~ '^midias/[0-9a-f]{2}/[0-9a-f-]{36}$'
    AND "chave_objeto" NOT LIKE 'http%'
    AND "mime_declarado" = "mime_detectado"
    AND "tamanho_bytes" > 0
    AND "conteudo_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "midia_mensagem_mensagem_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "mensagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "midia_mensagem_bucket_chave_key" ON "midia_mensagem"("bucket_privado", "chave_objeto");
CREATE INDEX "midia_mensagem_hash_tamanho_idx" ON "midia_mensagem"("conteudo_hash", "tamanho_bytes");

CREATE FUNCTION validar_tipo_midia_mensagem() RETURNS trigger AS $$
DECLARE tipo_mensagem_atual "tipo_mensagem";
BEGIN
  SELECT "tipo" INTO tipo_mensagem_atual FROM "mensagem" WHERE "id" = NEW."mensagem_id" FOR KEY SHARE;
  IF tipo_mensagem_atual::text <> NEW."categoria"::text THEN
    RAISE EXCEPTION 'TIPO_MIDIA_MENSAGEM_INCOMPATIVEL' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "midia_mensagem_validar_tipo" BEFORE INSERT OR UPDATE ON "midia_mensagem" FOR EACH ROW EXECUTE FUNCTION validar_tipo_midia_mensagem();

CREATE FUNCTION proteger_midia_mensagem() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'MIDIA_MENSAGEM_IMUTAVEL' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "midia_mensagem_proteger_update" BEFORE UPDATE ON "midia_mensagem" FOR EACH ROW EXECUTE FUNCTION proteger_midia_mensagem();
CREATE TRIGGER "midia_mensagem_proteger_delete" BEFORE DELETE ON "midia_mensagem" FOR EACH ROW EXECUTE FUNCTION proteger_midia_mensagem();
