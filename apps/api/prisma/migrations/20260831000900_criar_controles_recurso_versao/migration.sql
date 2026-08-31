CREATE TYPE "estado_controle_recurso" AS ENUM ('ATIVADO', 'DESATIVADO');

CREATE TABLE "controle_recurso" (
  "id" UUID NOT NULL,
  "codigo" VARCHAR(100) NOT NULL,
  "estado" "estado_controle_recurso" NOT NULL DEFAULT 'DESATIVADO',
  "desligado_emergencialmente" BOOLEAN NOT NULL DEFAULT FALSE,
  "liberar_administradores" BOOLEAN NOT NULL DEFAULT FALSE,
  "percentual_liberacao" INTEGER NOT NULL DEFAULT 0,
  "versao" INTEGER NOT NULL DEFAULT 0,
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "controle_recurso_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "controle_recurso_codigo_check"
    CHECK ("codigo" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
  CONSTRAINT "controle_recurso_percentual_check"
    CHECK ("percentual_liberacao" BETWEEN 0 AND 100),
  CONSTRAINT "controle_recurso_versao_check" CHECK ("versao" >= 0)
);

CREATE UNIQUE INDEX "controle_recurso_codigo_key" ON "controle_recurso"("codigo");
CREATE INDEX "controle_recurso_estado_emergencia_codigo_idx"
  ON "controle_recurso"("estado", "desligado_emergencialmente", "codigo");

CREATE TABLE "liberacao_controle_recurso_usuario" (
  "controle_recurso_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "liberacao_controle_recurso_usuario_pkey"
    PRIMARY KEY ("controle_recurso_id", "usuario_id"),
  CONSTRAINT "liberacao_controle_recurso_usuario_controle_fkey"
    FOREIGN KEY ("controle_recurso_id") REFERENCES "controle_recurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "liberacao_controle_recurso_usuario_usuario_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "liberacao_controle_recurso_usuario_idx"
  ON "liberacao_controle_recurso_usuario"("usuario_id", "controle_recurso_id");

CREATE TABLE "liberacao_controle_recurso_fila" (
  "controle_recurso_id" UUID NOT NULL,
  "fila_id" UUID NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "liberacao_controle_recurso_fila_pkey"
    PRIMARY KEY ("controle_recurso_id", "fila_id"),
  CONSTRAINT "liberacao_controle_recurso_fila_controle_fkey"
    FOREIGN KEY ("controle_recurso_id") REFERENCES "controle_recurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "liberacao_controle_recurso_fila_fila_fkey"
    FOREIGN KEY ("fila_id") REFERENCES "fila"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "liberacao_controle_recurso_fila_idx"
  ON "liberacao_controle_recurso_fila"("fila_id", "controle_recurso_id");

CREATE TABLE "politica_versao_mobile" (
  "plataforma" "plataforma_mobile" NOT NULL,
  "versao_minima" VARCHAR(40) NOT NULL DEFAULT '0.0.0',
  "versao_recomendada" VARCHAR(40) NOT NULL DEFAULT '0.0.0',
  "mensagem" VARCHAR(240),
  "url_loja" VARCHAR(500),
  "versao" INTEGER NOT NULL DEFAULT 0,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "politica_versao_mobile_pkey" PRIMARY KEY ("plataforma"),
  CONSTRAINT "politica_versao_mobile_minima_check"
    CHECK ("versao_minima" ~ '^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$'),
  CONSTRAINT "politica_versao_mobile_recomendada_check"
    CHECK ("versao_recomendada" ~ '^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$'),
  CONSTRAINT "politica_versao_mobile_ordem_check"
    CHECK (
      string_to_array("versao_recomendada", '.')::INTEGER[] >=
      string_to_array("versao_minima", '.')::INTEGER[]
    ),
  CONSTRAINT "politica_versao_mobile_mensagem_check"
    CHECK ("mensagem" IS NULL OR char_length(btrim("mensagem")) BETWEEN 1 AND 240),
  CONSTRAINT "politica_versao_mobile_url_check"
    CHECK ("url_loja" IS NULL OR "url_loja" ~ '^https://'),
  CONSTRAINT "politica_versao_mobile_url_obrigatoria_check"
    CHECK ("versao_minima" = '0.0.0' OR "url_loja" IS NOT NULL),
  CONSTRAINT "politica_versao_mobile_versao_check" CHECK ("versao" >= 0)
);

INSERT INTO "politica_versao_mobile" ("plataforma") VALUES ('IOS'), ('ANDROID');
