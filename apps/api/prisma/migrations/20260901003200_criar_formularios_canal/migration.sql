CREATE TYPE "finalidade_formulario_canal" AS ENUM ('IDENTIFICACAO', 'CADASTRO_COMERCIAL');
CREATE TYPE "estado_formulario_canal" AS ENUM ('ATIVO', 'INATIVO');

CREATE TABLE "formulario_canal" (
  "id" UUID NOT NULL,
  "conta_whatsapp_id" UUID NOT NULL,
  "referencia_canal" VARCHAR(256) NOT NULL,
  "nome" VARCHAR(200) NOT NULL,
  "finalidade" "finalidade_formulario_canal" NOT NULL,
  "estado" "estado_formulario_canal" NOT NULL,
  "estrutura_protegida" JSONB NOT NULL,
  "estrutura_hash" CHAR(64) NOT NULL,
  "sincronizado_em" TIMESTAMPTZ(6) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "formulario_canal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "formulario_canal_conta_fkey" FOREIGN KEY ("conta_whatsapp_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "formulario_canal_limites_check" CHECK (char_length(btrim("referencia_canal")) BETWEEN 1 AND 256 AND char_length(btrim("nome")) BETWEEN 1 AND 200 AND jsonb_typeof("estrutura_protegida")='object' AND "estrutura_hash" ~ '^[0-9a-f]{64}$' AND "versao">=1)
);
CREATE UNIQUE INDEX "formulario_canal_conta_referencia_key" ON "formulario_canal"("conta_whatsapp_id", "referencia_canal");
CREATE INDEX "formulario_canal_catalogo_idx" ON "formulario_canal"("conta_whatsapp_id", "estado", "finalidade", "nome");

CREATE TABLE "submissao_formulario_canal" (
  "id" UUID NOT NULL,
  "formulario_id" UUID NOT NULL,
  "mensagem_id" UUID NOT NULL,
  "contato_id" UUID NOT NULL,
  "referencia_canal" VARCHAR(64) NOT NULL,
  "dados_protegidos" JSONB NOT NULL,
  "dados_hash" CHAR(64) NOT NULL,
  "recebida_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "submissao_formulario_canal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "submissao_formulario_canal_formulario_fkey" FOREIGN KEY ("formulario_id") REFERENCES "formulario_canal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "submissao_formulario_canal_mensagem_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "mensagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "submissao_formulario_canal_contato_fkey" FOREIGN KEY ("contato_id") REFERENCES "contato"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "submissao_formulario_canal_limites_check" CHECK ("referencia_canal" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("dados_protegidos")='object' AND "dados_hash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "submissao_formulario_canal_mensagem_key" ON "submissao_formulario_canal"("mensagem_id");
CREATE UNIQUE INDEX "submissao_formulario_canal_formulario_referencia_key" ON "submissao_formulario_canal"("formulario_id", "referencia_canal");
CREATE INDEX "submissao_formulario_canal_contato_recebida_idx" ON "submissao_formulario_canal"("contato_id", "recebida_em", "id");

CREATE FUNCTION proteger_submissao_formulario_canal() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'SUBMISSAO_FORMULARIO_IMUTAVEL' USING ERRCODE='55000'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "submissao_formulario_proteger_update" BEFORE UPDATE OR DELETE ON "submissao_formulario_canal" FOR EACH ROW EXECUTE FUNCTION proteger_submissao_formulario_canal();
