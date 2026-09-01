CREATE TYPE "tipo_acao_atendimento_erp" AS ENUM ('COMENTARIO', 'ENCERRAMENTO');

CREATE TABLE "registro_acao_atendimento_erp" (
  "id" UUID NOT NULL,
  "atendimento_id" UUID NOT NULL,
  "operacao_recuperavel_id" UUID NOT NULL,
  "tipo" "tipo_acao_atendimento_erp" NOT NULL,
  "protocolo_oficial" VARCHAR(256) NOT NULL,
  "conteudo_hash" CHAR(64) NOT NULL,
  "versao_estado_resultante" INTEGER,
  "versao_atribuicao_resultante" INTEGER,
  "confirmado_em" TIMESTAMPTZ(6) NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "registro_acao_atendimento_erp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "registro_acao_atendimento_erp_protocolo_check" CHECK (char_length(btrim("protocolo_oficial")) BETWEEN 1 AND 256),
  CONSTRAINT "registro_acao_atendimento_erp_hash_check" CHECK ("conteudo_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "registro_acao_atendimento_erp_resultado_check" CHECK (
    ("tipo" = 'COMENTARIO' AND "versao_estado_resultante" IS NULL AND "versao_atribuicao_resultante" IS NULL)
    OR
    ("tipo" = 'ENCERRAMENTO' AND "versao_estado_resultante" >= 1 AND "versao_atribuicao_resultante" >= 1)
  ),
  CONSTRAINT "registro_acao_atendimento_erp_datas_check" CHECK ("confirmado_em" <= "criado_em"),
  CONSTRAINT "registro_acao_atendimento_erp_atendimento_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "registro_acao_atendimento_erp_operacao_fkey" FOREIGN KEY ("operacao_recuperavel_id") REFERENCES "operacao_recuperavel"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "registro_acao_atendimento_erp_operacao_key" ON "registro_acao_atendimento_erp"("operacao_recuperavel_id");
CREATE INDEX "registro_acao_atendimento_erp_atendimento_idx" ON "registro_acao_atendimento_erp"("atendimento_id", "tipo", "confirmado_em", "id");

CREATE TABLE "reserva_encerramento_atendimento_erp" (
  "atendimento_id" UUID NOT NULL,
  "operacao_recuperavel_id" UUID NOT NULL,
  "versao_estado_esperada" INTEGER NOT NULL,
  "versao_atribuicao_esperada" INTEGER NOT NULL,
  "criada_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reserva_encerramento_atendimento_erp_pkey" PRIMARY KEY ("atendimento_id"),
  CONSTRAINT "reserva_encerramento_atendimento_erp_versoes_check" CHECK ("versao_estado_esperada" >= 1 AND "versao_atribuicao_esperada" >= 1),
  CONSTRAINT "reserva_encerramento_atendimento_erp_atendimento_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reserva_encerramento_atendimento_erp_operacao_fkey" FOREIGN KEY ("operacao_recuperavel_id") REFERENCES "operacao_recuperavel"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "reserva_encerramento_atendimento_erp_operacao_key" ON "reserva_encerramento_atendimento_erp"("operacao_recuperavel_id");

CREATE FUNCTION impedir_reescrita_registro_acao_atendimento_erp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'registro de ação ERP do atendimento é imutável' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER registro_acao_atendimento_erp_imutavel
BEFORE UPDATE OR DELETE ON "registro_acao_atendimento_erp"
FOR EACH ROW EXECUTE FUNCTION impedir_reescrita_registro_acao_atendimento_erp();

CREATE FUNCTION impedir_alteracao_reserva_encerramento_atendimento_erp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reserva de encerramento ERP não pode ser alterada' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER reserva_encerramento_atendimento_erp_sem_update
BEFORE UPDATE ON "reserva_encerramento_atendimento_erp"
FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_reserva_encerramento_atendimento_erp();
