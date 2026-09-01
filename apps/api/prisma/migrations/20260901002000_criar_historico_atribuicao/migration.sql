CREATE TYPE "tipo_historico_atribuicao" AS ENUM (
  'ENTRADA_FILA',
  'RESGATE',
  'TRANSFERENCIA_FILA',
  'TRANSFERENCIA_USUARIO',
  'ASSUNCAO_SUPERVISOR',
  'REABERTURA'
);

CREATE TABLE "historico_atribuicao" (
  "id" UUID NOT NULL,
  "atendimento_id" UUID NOT NULL,
  "fila_id" UUID,
  "usuario_responsavel_id" UUID,
  "tipo" "tipo_historico_atribuicao" NOT NULL,
  "iniciado_em" TIMESTAMPTZ(6) NOT NULL,
  "finalizado_em" TIMESTAMPTZ(6),
  "executado_por_usuario_id" UUID,
  CONSTRAINT "historico_atribuicao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "historico_atribuicao_atendimento_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "historico_atribuicao_fila_fkey" FOREIGN KEY ("fila_id") REFERENCES "fila"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "historico_atribuicao_responsavel_fkey" FOREIGN KEY ("usuario_responsavel_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "historico_atribuicao_executor_fkey" FOREIGN KEY ("executado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "historico_atribuicao_intervalo_check" CHECK ("finalizado_em" IS NULL OR "finalizado_em" >= "iniciado_em"),
  CONSTRAINT "historico_atribuicao_destino_check" CHECK (
    ("tipo" IN ('ENTRADA_FILA', 'TRANSFERENCIA_FILA') AND "fila_id" IS NOT NULL AND "usuario_responsavel_id" IS NULL)
    OR ("tipo" IN ('RESGATE', 'TRANSFERENCIA_USUARIO', 'ASSUNCAO_SUPERVISOR') AND "fila_id" IS NOT NULL AND "usuario_responsavel_id" IS NOT NULL)
    OR ("tipo" = 'REABERTURA' AND "fila_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "historico_atribuicao_um_aberto_por_atendimento_key"
  ON "historico_atribuicao" ("atendimento_id") WHERE "finalizado_em" IS NULL;
CREATE INDEX "historico_atribuicao_atendimento_inicio_idx" ON "historico_atribuicao" ("atendimento_id", "iniciado_em", "id");
CREATE INDEX "historico_atribuicao_fila_intervalo_idx" ON "historico_atribuicao" ("fila_id", "iniciado_em", "finalizado_em");
CREATE INDEX "historico_atribuicao_responsavel_intervalo_idx" ON "historico_atribuicao" ("usuario_responsavel_id", "iniciado_em", "finalizado_em");

CREATE FUNCTION proteger_historico_atribuicao() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD."id" = NEW."id"
    AND OLD."atendimento_id" = NEW."atendimento_id"
    AND OLD."fila_id" IS NOT DISTINCT FROM NEW."fila_id"
    AND OLD."usuario_responsavel_id" IS NOT DISTINCT FROM NEW."usuario_responsavel_id"
    AND OLD."tipo" = NEW."tipo"
    AND OLD."iniciado_em" = NEW."iniciado_em"
    AND OLD."executado_por_usuario_id" IS NOT DISTINCT FROM NEW."executado_por_usuario_id"
    AND OLD."finalizado_em" IS NULL
    AND NEW."finalizado_em" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'HISTORICO_ATRIBUICAO_IMUTAVEL' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "historico_atribuicao_proteger_alteracao"
BEFORE UPDATE OR DELETE ON "historico_atribuicao"
FOR EACH ROW EXECUTE FUNCTION proteger_historico_atribuicao();

CREATE TRIGGER "historico_atribuicao_proteger_truncate"
BEFORE TRUNCATE ON "historico_atribuicao"
FOR EACH STATEMENT EXECUTE FUNCTION proteger_historico_atribuicao();
