CREATE TYPE "estado_execucao_fluxo" AS ENUM (
  'EXECUTANDO',
  'AGUARDANDO_RESPOSTA',
  'AGUARDANDO_SISTEMA',
  'AGUARDANDO_ATENDENTE',
  'SUSPENSA_POR_ATENDIMENTO_HUMANO',
  'CONCLUIDA',
  'FALHOU',
  'CANCELADA'
);

CREATE TABLE "execucao_fluxo" (
  "id" UUID NOT NULL,
  "atendimento_id" UUID NOT NULL,
  "fluxo_id" UUID NOT NULL,
  "versao_fluxo_id" UUID NOT NULL,
  "estado" "estado_execucao_fluxo" NOT NULL DEFAULT 'EXECUTANDO',
  "no_atual_id" VARCHAR(64) NOT NULL,
  "contexto_protegido" JSONB NOT NULL,
  "retomar_em" TIMESTAMPTZ(6),
  "revisao" INTEGER NOT NULL DEFAULT 1,
  "codigo_finalizacao" VARCHAR(100),
  "iniciada_em" TIMESTAMPTZ(6) NOT NULL,
  "atualizada_em" TIMESTAMPTZ(6) NOT NULL,
  "finalizada_em" TIMESTAMPTZ(6),
  CONSTRAINT "execucao_fluxo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "execucao_fluxo_identificador_no_check" CHECK (
    "no_atual_id" ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'
  ),
  CONSTRAINT "execucao_fluxo_contexto_check" CHECK (
    jsonb_typeof("contexto_protegido") = 'object'
    AND pg_column_size("contexto_protegido") <= 131072
  ),
  CONSTRAINT "execucao_fluxo_revisao_check" CHECK ("revisao" >= 1),
  CONSTRAINT "execucao_fluxo_datas_check" CHECK (
    "iniciada_em" <= "atualizada_em"
    AND ("finalizada_em" IS NULL OR "atualizada_em" <= "finalizada_em")
  ),
  CONSTRAINT "execucao_fluxo_finalizacao_check" CHECK (
    (
      "estado" IN (
        'SUSPENSA_POR_ATENDIMENTO_HUMANO',
        'CONCLUIDA',
        'FALHOU',
        'CANCELADA'
      )
      AND "finalizada_em" IS NOT NULL
      AND "codigo_finalizacao" IS NOT NULL
      AND "codigo_finalizacao" ~ '^[A-Z][A-Z0-9_]{2,99}$'
      AND "retomar_em" IS NULL
    ) OR (
      "estado" IN (
        'EXECUTANDO',
        'AGUARDANDO_RESPOSTA',
        'AGUARDANDO_SISTEMA',
        'AGUARDANDO_ATENDENTE'
      )
      AND "finalizada_em" IS NULL
      AND "codigo_finalizacao" IS NULL
    )
  ),
  CONSTRAINT "execucao_fluxo_atendimento_fkey"
    FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "execucao_fluxo_fluxo_fkey"
    FOREIGN KEY ("fluxo_id") REFERENCES "fluxo"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "execucao_fluxo_versao_fluxo_fkey"
    FOREIGN KEY ("versao_fluxo_id", "fluxo_id")
    REFERENCES "versao_fluxo"("id", "fluxo_id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "execucao_fluxo_ativa_atendimento_key"
  ON "execucao_fluxo"("atendimento_id")
  WHERE "estado" IN (
    'EXECUTANDO',
    'AGUARDANDO_RESPOSTA',
    'AGUARDANDO_SISTEMA',
    'AGUARDANDO_ATENDENTE'
  );
CREATE INDEX "execucao_fluxo_atendimento_inicio_idx"
  ON "execucao_fluxo"("atendimento_id", "iniciada_em", "id");
CREATE INDEX "execucao_fluxo_recuperacao_idx"
  ON "execucao_fluxo"("estado", "retomar_em", "atualizada_em", "id");
CREATE INDEX "execucao_fluxo_versao_estado_idx"
  ON "execucao_fluxo"("versao_fluxo_id", "estado", "atualizada_em");

CREATE FUNCTION proteger_maquina_execucao_fluxo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EXECUCAO_FLUXO_NAO_PODE_SER_EXCLUIDA';
  END IF;

  IF OLD."estado" IN (
    'SUSPENSA_POR_ATENDIMENTO_HUMANO',
    'CONCLUIDA',
    'FALHOU',
    'CANCELADA'
  ) THEN
    RAISE EXCEPTION 'EXECUCAO_FLUXO_TERMINAL_IMUTAVEL';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."atendimento_id" IS DISTINCT FROM OLD."atendimento_id"
    OR NEW."fluxo_id" IS DISTINCT FROM OLD."fluxo_id"
    OR NEW."versao_fluxo_id" IS DISTINCT FROM OLD."versao_fluxo_id"
    OR NEW."iniciada_em" IS DISTINCT FROM OLD."iniciada_em"
  THEN
    RAISE EXCEPTION 'IDENTIDADE_EXECUCAO_FLUXO_IMUTAVEL';
  END IF;

  IF NEW."revisao" <> OLD."revisao" + 1
    OR NEW."atualizada_em" < OLD."atualizada_em"
  THEN
    RAISE EXCEPTION 'REVISAO_EXECUCAO_FLUXO_INVALIDA';
  END IF;

  IF (OLD."estado" = 'EXECUTANDO' AND NEW."estado" NOT IN (
      'EXECUTANDO',
      'AGUARDANDO_RESPOSTA',
      'AGUARDANDO_SISTEMA',
      'AGUARDANDO_ATENDENTE',
      'SUSPENSA_POR_ATENDIMENTO_HUMANO',
      'CONCLUIDA',
      'FALHOU',
      'CANCELADA'
    )) OR (OLD."estado" = 'AGUARDANDO_RESPOSTA' AND NEW."estado" NOT IN (
      'EXECUTANDO',
      'SUSPENSA_POR_ATENDIMENTO_HUMANO',
      'CANCELADA'
    )) OR (OLD."estado" = 'AGUARDANDO_SISTEMA' AND NEW."estado" NOT IN (
      'EXECUTANDO',
      'SUSPENSA_POR_ATENDIMENTO_HUMANO',
      'FALHOU',
      'CANCELADA'
    )) OR (OLD."estado" = 'AGUARDANDO_ATENDENTE' AND NEW."estado" NOT IN (
      'SUSPENSA_POR_ATENDIMENTO_HUMANO',
      'CANCELADA'
    ))
  THEN
    RAISE EXCEPTION 'TRANSICAO_EXECUCAO_FLUXO_INVALIDA';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "execucao_fluxo_proteger_maquina"
BEFORE UPDATE OR DELETE ON "execucao_fluxo"
FOR EACH ROW EXECUTE FUNCTION proteger_maquina_execucao_fluxo();
