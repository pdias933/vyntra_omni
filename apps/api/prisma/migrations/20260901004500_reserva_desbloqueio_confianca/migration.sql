CREATE TABLE "reserva_desbloqueio_confianca" (
  "contrato_externo_id" VARCHAR(256) NOT NULL,
  "atendimento_id" UUID NOT NULL,
  "operacao_recuperavel_id" UUID NOT NULL,
  "criada_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reserva_desbloqueio_confianca_pkey" PRIMARY KEY ("contrato_externo_id"),
  CONSTRAINT "reserva_desbloqueio_contrato_check" CHECK (char_length(btrim("contrato_externo_id")) BETWEEN 1 AND 256),
  CONSTRAINT "reserva_desbloqueio_atendimento_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reserva_desbloqueio_operacao_fkey" FOREIGN KEY ("operacao_recuperavel_id") REFERENCES "operacao_recuperavel"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "reserva_desbloqueio_operacao_key"
ON "reserva_desbloqueio_confianca"("operacao_recuperavel_id");

CREATE INDEX "reserva_desbloqueio_atendimento_criada_idx"
ON "reserva_desbloqueio_confianca"("atendimento_id", "criada_em");

CREATE FUNCTION impedir_alteracao_reserva_desbloqueio_confianca()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reserva de desbloqueio de confiança não pode ser alterada' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER reserva_desbloqueio_confianca_sem_update
BEFORE UPDATE ON "reserva_desbloqueio_confianca"
FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_reserva_desbloqueio_confianca();
