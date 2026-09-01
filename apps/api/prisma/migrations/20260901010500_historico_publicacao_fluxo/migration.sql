CREATE TYPE "tipo_mudanca_publicacao_fluxo" AS ENUM (
  'PUBLICACAO',
  'ARQUIVAMENTO',
  'REVERSAO'
);

CREATE TABLE "historico_publicacao_fluxo" (
  "id" UUID NOT NULL,
  "fluxo_id" UUID NOT NULL,
  "tipo" "tipo_mudanca_publicacao_fluxo" NOT NULL,
  "versao_anterior_id" UUID,
  "versao_nova_id" UUID,
  "revisao_fluxo_resultante" INTEGER NOT NULL,
  "executado_por_usuario_id" UUID NOT NULL,
  "executado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "historico_publicacao_fluxo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "historico_publicacao_fluxo_revisao_check" CHECK ("revisao_fluxo_resultante" >= 2),
  CONSTRAINT "historico_publicacao_fluxo_tipo_check" CHECK (
    ("tipo" = 'PUBLICACAO' AND "versao_nova_id" IS NOT NULL)
    OR ("tipo" = 'ARQUIVAMENTO' AND "versao_anterior_id" IS NOT NULL AND "versao_nova_id" IS NULL)
    OR ("tipo" = 'REVERSAO' AND "versao_nova_id" IS NOT NULL)
  ),
  CONSTRAINT "historico_publicacao_fluxo_fluxo_fkey" FOREIGN KEY ("fluxo_id") REFERENCES "fluxo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "historico_publicacao_fluxo_anterior_fkey" FOREIGN KEY ("versao_anterior_id") REFERENCES "versao_fluxo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "historico_publicacao_fluxo_nova_fkey" FOREIGN KEY ("versao_nova_id") REFERENCES "versao_fluxo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "historico_publicacao_fluxo_usuario_fkey" FOREIGN KEY ("executado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "historico_publicacao_fluxo_revisao_key"
  ON "historico_publicacao_fluxo"("fluxo_id", "revisao_fluxo_resultante");
CREATE INDEX "historico_publicacao_fluxo_data_idx"
  ON "historico_publicacao_fluxo"("fluxo_id", "executado_em", "id");

CREATE FUNCTION proteger_historico_publicacao_fluxo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'HISTORICO_PUBLICACAO_FLUXO_IMUTAVEL';
END;
$$;

CREATE TRIGGER "historico_publicacao_fluxo_proteger_alteracao"
BEFORE UPDATE OR DELETE ON "historico_publicacao_fluxo"
FOR EACH ROW EXECUTE FUNCTION proteger_historico_publicacao_fluxo();

CREATE TRIGGER "historico_publicacao_fluxo_proteger_truncate"
BEFORE TRUNCATE ON "historico_publicacao_fluxo"
FOR EACH STATEMENT EXECUTE FUNCTION proteger_historico_publicacao_fluxo();

CREATE FUNCTION validar_historico_publicacao_fluxo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."versao_anterior_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "versao_fluxo"
    WHERE "id" = NEW."versao_anterior_id" AND "fluxo_id" = NEW."fluxo_id"
  ) THEN
    RAISE EXCEPTION 'VERSAO_ANTERIOR_HISTORICO_FLUXO_INVALIDA';
  END IF;
  IF NEW."versao_nova_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "versao_fluxo"
    WHERE "id" = NEW."versao_nova_id" AND "fluxo_id" = NEW."fluxo_id"
  ) THEN
    RAISE EXCEPTION 'VERSAO_NOVA_HISTORICO_FLUXO_INVALIDA';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "historico_publicacao_fluxo_validar_versoes"
BEFORE INSERT ON "historico_publicacao_fluxo"
FOR EACH ROW EXECUTE FUNCTION validar_historico_publicacao_fluxo();
