CREATE TABLE "marcador_leitura_conversa_usuario" (
  "usuario_id" UUID NOT NULL,
  "conversa_id" UUID NOT NULL,
  "ultima_mensagem_lida_id" UUID,
  "lida_ate_em" TIMESTAMPTZ(6),
  "marcada_nao_lida" BOOLEAN NOT NULL DEFAULT false,
  "versao" INTEGER NOT NULL DEFAULT 1,
  "atualizada_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "marcador_leitura_conversa_usuario_pkey" PRIMARY KEY ("usuario_id", "conversa_id"),
  CONSTRAINT "marcador_leitura_usuario_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT,
  CONSTRAINT "marcador_leitura_conversa_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversa"("id") ON DELETE RESTRICT,
  CONSTRAINT "marcador_leitura_ultima_mensagem_fkey" FOREIGN KEY ("ultima_mensagem_lida_id") REFERENCES "mensagem"("id") ON DELETE RESTRICT,
  CONSTRAINT "marcador_leitura_versao_check" CHECK ("versao" >= 1),
  CONSTRAINT "marcador_leitura_coerencia_check" CHECK (
    ("ultima_mensagem_lida_id" IS NULL AND "lida_ate_em" IS NULL)
    OR ("ultima_mensagem_lida_id" IS NOT NULL AND "lida_ate_em" IS NOT NULL)
  )
);

CREATE INDEX "marcador_leitura_conversa_estado_idx"
  ON "marcador_leitura_conversa_usuario" ("conversa_id", "marcada_nao_lida", "atualizada_em");

CREATE INDEX "marcador_leitura_ultima_mensagem_idx"
  ON "marcador_leitura_conversa_usuario" ("ultima_mensagem_lida_id");
