CREATE TYPE "estado_protocolo_erp" AS ENUM ('PENDENTE', 'OFICIAL');

CREATE TABLE "protocolo_erp" (
  "atendimento_id" UUID NOT NULL,
  "estado" "estado_protocolo_erp" NOT NULL DEFAULT 'PENDENTE',
  "protocolo_oficial" VARCHAR(256),
  "confirmado_em" TIMESTAMPTZ(6),
  "versao" INTEGER NOT NULL DEFAULT 1,
  "criado_em" TIMESTAMPTZ(6) NOT NULL,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "protocolo_erp_pkey" PRIMARY KEY ("atendimento_id"),
  CONSTRAINT "protocolo_erp_atendimento_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "protocolo_erp_estado_check" CHECK (
    ("estado" = 'PENDENTE' AND "protocolo_oficial" IS NULL AND "confirmado_em" IS NULL)
    OR
    ("estado" = 'OFICIAL' AND char_length(btrim("protocolo_oficial")) BETWEEN 1 AND 256 AND "protocolo_oficial" <> "atendimento_id"::text AND "confirmado_em" IS NOT NULL)
  ),
  CONSTRAINT "protocolo_erp_versao_check" CHECK ("versao" >= 1),
  CONSTRAINT "protocolo_erp_datas_check" CHECK ("atualizado_em" >= "criado_em" AND ("confirmado_em" IS NULL OR "confirmado_em" >= "criado_em"))
);

CREATE UNIQUE INDEX "protocolo_erp_oficial_key" ON "protocolo_erp"("protocolo_oficial");
CREATE INDEX "protocolo_erp_estado_criado_idx" ON "protocolo_erp"("estado", "criado_em", "atendimento_id");

CREATE FUNCTION impedir_alteracao_protocolo_erp_oficial()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."estado" = 'OFICIAL' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'protocolo ERP oficial é imutável' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protocolo_erp_oficial_imutavel
BEFORE UPDATE ON "protocolo_erp"
FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_protocolo_erp_oficial();

