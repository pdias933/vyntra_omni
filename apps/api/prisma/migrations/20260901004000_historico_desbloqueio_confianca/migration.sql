CREATE TABLE "registro_desbloqueio_confianca" (
  "id" UUID NOT NULL,
  "atendimento_id" UUID NOT NULL,
  "operacao_recuperavel_id" UUID NOT NULL,
  "contrato_externo_id" VARCHAR(256) NOT NULL,
  "confirmado_em" TIMESTAMPTZ(6) NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "registro_desbloqueio_confianca_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "registro_desbloqueio_contrato_check" CHECK (char_length(btrim("contrato_externo_id")) BETWEEN 1 AND 256),
  CONSTRAINT "registro_desbloqueio_datas_check" CHECK ("confirmado_em" <= "criado_em"),
  CONSTRAINT "registro_desbloqueio_atendimento_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "registro_desbloqueio_operacao_fkey" FOREIGN KEY ("operacao_recuperavel_id") REFERENCES "operacao_recuperavel"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "registro_desbloqueio_operacao_key"
ON "registro_desbloqueio_confianca"("operacao_recuperavel_id");

CREATE INDEX "registro_desbloqueio_contrato_confirmado_idx"
ON "registro_desbloqueio_confianca"("contrato_externo_id", "confirmado_em", "id");

CREATE INDEX "registro_desbloqueio_atendimento_confirmado_idx"
ON "registro_desbloqueio_confianca"("atendimento_id", "confirmado_em", "id");

CREATE FUNCTION impedir_reescrita_registro_desbloqueio_confianca()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'registro de desbloqueio de confiança é imutável' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER registro_desbloqueio_confianca_imutavel
BEFORE UPDATE OR DELETE ON "registro_desbloqueio_confianca"
FOR EACH ROW EXECUTE FUNCTION impedir_reescrita_registro_desbloqueio_confianca();
