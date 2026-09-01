CREATE TABLE "resposta_rapida" (
  "id" UUID NOT NULL,
  "titulo" VARCHAR(120) NOT NULL,
  "atalho" VARCHAR(80) NOT NULL,
  "texto_protegido" JSONB NOT NULL,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "criado_por_usuario_id" UUID NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "resposta_rapida_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "resposta_rapida_atalho_key" UNIQUE ("atalho"),
  CONSTRAINT "resposta_rapida_criado_por_usuario_fkey"
    FOREIGN KEY ("criado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT,
  CONSTRAINT "resposta_rapida_atalho_canonico_check"
    CHECK ("atalho" = lower("atalho") AND "atalho" ~ '^[a-z0-9_-]{1,80}$'),
  CONSTRAINT "resposta_rapida_versao_check" CHECK ("versao" >= 1),
  CONSTRAINT "resposta_rapida_texto_objeto_check" CHECK (jsonb_typeof("texto_protegido") = 'object')
);

CREATE INDEX "resposta_rapida_ativa_atalho_idx"
  ON "resposta_rapida" ("ativa", "atalho", "id");
