CREATE TYPE "estado_passo_execucao_fluxo" AS ENUM (
  'INICIADO',
  'CONCLUIDO',
  'FALHOU'
);

CREATE TABLE "passo_execucao_fluxo" (
  "id" UUID NOT NULL,
  "execucao_fluxo_id" UUID NOT NULL,
  "revisao_execucao" INTEGER NOT NULL,
  "no_id" VARCHAR(64) NOT NULL,
  "tipo_no" VARCHAR(64) NOT NULL,
  "estado" "estado_passo_execucao_fluxo" NOT NULL DEFAULT 'INICIADO',
  "entrada_sanitizada" JSONB NOT NULL,
  "saida_sanitizada" JSONB,
  "codigo_erro" VARCHAR(100),
  "iniciado_em" TIMESTAMPTZ(6) NOT NULL,
  "finalizado_em" TIMESTAMPTZ(6),
  CONSTRAINT "passo_execucao_fluxo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "passo_execucao_fluxo_execucao_fkey"
    FOREIGN KEY ("execucao_fluxo_id") REFERENCES "execucao_fluxo"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "passo_execucao_fluxo_revisao_check" CHECK ("revisao_execucao" >= 1),
  CONSTRAINT "passo_execucao_fluxo_no_check" CHECK (
    "no_id" ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'
    AND "tipo_no" ~ '^[A-Z][A-Z0-9_]{1,63}$'
  ),
  CONSTRAINT "passo_execucao_fluxo_json_check" CHECK (
    jsonb_typeof("entrada_sanitizada") = 'object'
    AND pg_column_size("entrada_sanitizada") <= 16384
    AND (
      "saida_sanitizada" IS NULL
      OR (
        jsonb_typeof("saida_sanitizada") = 'object'
        AND pg_column_size("saida_sanitizada") <= 16384
      )
    )
  ),
  CONSTRAINT "passo_execucao_fluxo_terminal_check" CHECK (
    (
      "estado" = 'INICIADO'
      AND "saida_sanitizada" IS NULL
      AND "codigo_erro" IS NULL
      AND "finalizado_em" IS NULL
    ) OR (
      "estado" = 'CONCLUIDO'
      AND "saida_sanitizada" IS NOT NULL
      AND "codigo_erro" IS NULL
      AND "finalizado_em" IS NOT NULL
      AND "finalizado_em" >= "iniciado_em"
    ) OR (
      "estado" = 'FALHOU'
      AND "saida_sanitizada" IS NOT NULL
      AND "codigo_erro" ~ '^[A-Z][A-Z0-9_]{2,99}$'
      AND "finalizado_em" IS NOT NULL
      AND "finalizado_em" >= "iniciado_em"
    )
  )
);

CREATE UNIQUE INDEX "passo_execucao_fluxo_revisao_key"
  ON "passo_execucao_fluxo"("execucao_fluxo_id", "revisao_execucao");
CREATE INDEX "passo_execucao_fluxo_execucao_inicio_idx"
  ON "passo_execucao_fluxo"("execucao_fluxo_id", "iniciado_em", "id");
CREATE INDEX "passo_execucao_fluxo_estado_inicio_idx"
  ON "passo_execucao_fluxo"("estado", "iniciado_em", "id");

CREATE FUNCTION proteger_passo_execucao_fluxo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PASSO_EXECUCAO_FLUXO_NAO_PODE_SER_EXCLUIDO';
  END IF;

  IF OLD."estado" <> 'INICIADO' THEN
    RAISE EXCEPTION 'PASSO_EXECUCAO_FLUXO_TERMINAL_IMUTAVEL';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."execucao_fluxo_id" IS DISTINCT FROM OLD."execucao_fluxo_id"
    OR NEW."revisao_execucao" IS DISTINCT FROM OLD."revisao_execucao"
    OR NEW."no_id" IS DISTINCT FROM OLD."no_id"
    OR NEW."tipo_no" IS DISTINCT FROM OLD."tipo_no"
    OR NEW."entrada_sanitizada" IS DISTINCT FROM OLD."entrada_sanitizada"
    OR NEW."iniciado_em" IS DISTINCT FROM OLD."iniciado_em"
  THEN
    RAISE EXCEPTION 'IDENTIDADE_PASSO_EXECUCAO_FLUXO_IMUTAVEL';
  END IF;

  IF NEW."estado" NOT IN ('CONCLUIDO', 'FALHOU') THEN
    RAISE EXCEPTION 'TRANSICAO_PASSO_EXECUCAO_FLUXO_INVALIDA';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "passo_execucao_fluxo_proteger"
BEFORE UPDATE OR DELETE ON "passo_execucao_fluxo"
FOR EACH ROW EXECUTE FUNCTION proteger_passo_execucao_fluxo();
