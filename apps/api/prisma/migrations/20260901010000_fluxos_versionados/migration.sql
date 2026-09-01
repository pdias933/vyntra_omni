CREATE TYPE "tipo_fluxo" AS ENUM (
  'ATENDIMENTO',
  'AUTENTICACAO',
  'FINANCEIRO',
  'COMERCIAL',
  'SUPORTE',
  'OUTRO'
);

CREATE TYPE "estado_versao_fluxo" AS ENUM (
  'RASCUNHO',
  'EM_TESTE',
  'PUBLICADA',
  'ARQUIVADA'
);

CREATE TABLE "fluxo" (
  "id" UUID NOT NULL,
  "nome" VARCHAR(120) NOT NULL,
  "nome_normalizado" VARCHAR(120) NOT NULL,
  "descricao" VARCHAR(500),
  "tipo" "tipo_fluxo" NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "versao_publicada_id" UUID,
  "revisao" INTEGER NOT NULL DEFAULT 1,
  "criado_por_usuario_id" UUID NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fluxo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fluxo_nome_check" CHECK (
    char_length(btrim("nome")) BETWEEN 1 AND 120
    AND char_length("nome_normalizado") BETWEEN 1 AND 120
  ),
  CONSTRAINT "fluxo_descricao_check" CHECK (
    "descricao" IS NULL OR char_length(btrim("descricao")) BETWEEN 1 AND 500
  ),
  CONSTRAINT "fluxo_revisao_check" CHECK ("revisao" >= 1),
  CONSTRAINT "fluxo_datas_check" CHECK ("criado_em" <= "atualizado_em"),
  CONSTRAINT "fluxo_criado_por_fkey" FOREIGN KEY ("criado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "versao_fluxo" (
  "id" UUID NOT NULL,
  "fluxo_id" UUID NOT NULL,
  "numero_versao" INTEGER NOT NULL,
  "estado" "estado_versao_fluxo" NOT NULL DEFAULT 'RASCUNHO',
  "versao_schema_definicao" INTEGER NOT NULL DEFAULT 1,
  "definicao" JSONB NOT NULL,
  "revisao" INTEGER NOT NULL DEFAULT 1,
  "criada_por_usuario_id" UUID NOT NULL,
  "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publicada_por_usuario_id" UUID,
  "publicada_em" TIMESTAMPTZ(6),
  CONSTRAINT "versao_fluxo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "versao_fluxo_numeros_check" CHECK (
    "numero_versao" >= 1 AND "versao_schema_definicao" >= 1 AND "revisao" >= 1
  ),
  CONSTRAINT "versao_fluxo_definicao_check" CHECK (
    jsonb_typeof("definicao") = 'object'
    AND pg_column_size("definicao") <= 262144
  ),
  CONSTRAINT "versao_fluxo_publicacao_check" CHECK (
    ("estado" IN ('RASCUNHO', 'EM_TESTE') AND "publicada_por_usuario_id" IS NULL AND "publicada_em" IS NULL)
    OR
    ("estado" IN ('PUBLICADA', 'ARQUIVADA') AND "publicada_por_usuario_id" IS NOT NULL AND "publicada_em" IS NOT NULL)
  ),
  CONSTRAINT "versao_fluxo_datas_check" CHECK (
    "criada_em" <= "atualizada_em"
    AND ("publicada_em" IS NULL OR "criada_em" <= "publicada_em")
  ),
  CONSTRAINT "versao_fluxo_fluxo_fkey" FOREIGN KEY ("fluxo_id") REFERENCES "fluxo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "versao_fluxo_criada_por_fkey" FOREIGN KEY ("criada_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "versao_fluxo_publicada_por_fkey" FOREIGN KEY ("publicada_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "fluxo_nome_normalizado_key" ON "fluxo"("nome_normalizado");
CREATE UNIQUE INDEX "fluxo_versao_publicada_id_id_key" ON "fluxo"("versao_publicada_id", "id");
CREATE INDEX "fluxo_ativo_tipo_nome_idx" ON "fluxo"("ativo", "tipo", "nome", "id");
CREATE INDEX "fluxo_versao_publicada_idx" ON "fluxo"("versao_publicada_id");
CREATE UNIQUE INDEX "versao_fluxo_numero_key" ON "versao_fluxo"("fluxo_id", "numero_versao");
CREATE UNIQUE INDEX "versao_fluxo_id_fluxo_key" ON "versao_fluxo"("id", "fluxo_id");
CREATE INDEX "versao_fluxo_estado_numero_idx" ON "versao_fluxo"("fluxo_id", "estado", "numero_versao");
CREATE UNIQUE INDEX "versao_fluxo_publicada_unica_por_fluxo_idx"
  ON "versao_fluxo"("fluxo_id") WHERE "estado" = 'PUBLICADA';

ALTER TABLE "fluxo"
  ADD CONSTRAINT "fluxo_versao_publicada_fkey"
  FOREIGN KEY ("versao_publicada_id", "id")
  REFERENCES "versao_fluxo"("id", "fluxo_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION proteger_historico_versao_fluxo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'VERSAO_FLUXO_NAO_PODE_SER_EXCLUIDA';
  END IF;

  IF OLD."estado" IN ('PUBLICADA', 'ARQUIVADA') AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."fluxo_id" IS DISTINCT FROM OLD."fluxo_id"
    OR NEW."numero_versao" IS DISTINCT FROM OLD."numero_versao"
    OR NEW."versao_schema_definicao" IS DISTINCT FROM OLD."versao_schema_definicao"
    OR NEW."definicao" IS DISTINCT FROM OLD."definicao"
    OR NEW."criada_por_usuario_id" IS DISTINCT FROM OLD."criada_por_usuario_id"
    OR NEW."criada_em" IS DISTINCT FROM OLD."criada_em"
    OR NEW."publicada_por_usuario_id" IS DISTINCT FROM OLD."publicada_por_usuario_id"
    OR NEW."publicada_em" IS DISTINCT FROM OLD."publicada_em"
  ) THEN
    RAISE EXCEPTION 'VERSAO_FLUXO_PUBLICADA_IMUTAVEL';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "versao_fluxo_proteger_historico"
BEFORE UPDATE OR DELETE ON "versao_fluxo"
FOR EACH ROW EXECUTE FUNCTION proteger_historico_versao_fluxo();

CREATE FUNCTION validar_ponteiro_versao_publicada_fluxo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."versao_publicada_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "versao_fluxo" vf
    WHERE vf."id" = NEW."versao_publicada_id"
      AND vf."fluxo_id" = NEW."id"
      AND vf."estado" = 'PUBLICADA'
  ) THEN
    RAISE EXCEPTION 'PONTEIRO_VERSAO_PUBLICADA_INVALIDO';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "fluxo_validar_ponteiro_publicado"
AFTER INSERT OR UPDATE OF "versao_publicada_id" ON "fluxo"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validar_ponteiro_versao_publicada_fluxo();
