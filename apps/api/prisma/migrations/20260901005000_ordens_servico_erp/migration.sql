CREATE TABLE "ordem_servico_erp" (
  "id" UUID NOT NULL,
  "atendimento_id" UUID NOT NULL,
  "operacao_criacao_id" UUID NOT NULL,
  "ordem_servico_externa_id" VARCHAR(256) NOT NULL,
  "protocolo_oficial" VARCHAR(256) NOT NULL,
  "cliente_externo_id" VARCHAR(256) NOT NULL,
  "contrato_externo_id" VARCHAR(256) NOT NULL,
  "assunto" VARCHAR(200) NOT NULL,
  "descricao_protegida" JSONB NOT NULL,
  "descricao_hash" CHAR(64) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  "confirmado_em" TIMESTAMPTZ(6) NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ordem_servico_erp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ordem_servico_erp_identificadores_check" CHECK (
    char_length(btrim("ordem_servico_externa_id")) BETWEEN 1 AND 256
    AND char_length(btrim("protocolo_oficial")) BETWEEN 1 AND 256
    AND char_length(btrim("cliente_externo_id")) BETWEEN 1 AND 256
    AND char_length(btrim("contrato_externo_id")) BETWEEN 1 AND 256
  ),
  CONSTRAINT "ordem_servico_erp_assunto_check" CHECK (char_length(btrim("assunto")) BETWEEN 1 AND 200),
  CONSTRAINT "ordem_servico_erp_descricao_hash_check" CHECK ("descricao_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "ordem_servico_erp_versao_check" CHECK ("versao" >= 1),
  CONSTRAINT "ordem_servico_erp_datas_check" CHECK ("confirmado_em" <= "criado_em" AND "criado_em" <= "atualizado_em"),
  CONSTRAINT "ordem_servico_erp_atendimento_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ordem_servico_erp_operacao_criacao_fkey" FOREIGN KEY ("operacao_criacao_id") REFERENCES "operacao_recuperavel"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ordem_servico_erp_operacao_criacao_key" ON "ordem_servico_erp"("operacao_criacao_id");
CREATE UNIQUE INDEX "ordem_servico_erp_externa_key" ON "ordem_servico_erp"("ordem_servico_externa_id");
CREATE INDEX "ordem_servico_erp_atendimento_criada_idx" ON "ordem_servico_erp"("atendimento_id", "criado_em", "id");
CREATE INDEX "ordem_servico_erp_contrato_criada_idx" ON "ordem_servico_erp"("contrato_externo_id", "criado_em", "id");

CREATE TABLE "historico_atualizacao_ordem_servico_erp" (
  "id" UUID NOT NULL,
  "ordem_servico_id" UUID NOT NULL,
  "operacao_recuperavel_id" UUID NOT NULL,
  "versao_anterior" INTEGER NOT NULL,
  "versao_resultante" INTEGER NOT NULL,
  "conteudo_hash" CHAR(64) NOT NULL,
  "confirmado_em" TIMESTAMPTZ(6) NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "historico_atualizacao_ordem_servico_erp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "historico_atualizacao_ordem_versoes_check" CHECK ("versao_anterior" >= 1 AND "versao_resultante" = "versao_anterior" + 1),
  CONSTRAINT "historico_atualizacao_ordem_hash_check" CHECK ("conteudo_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "historico_atualizacao_ordem_datas_check" CHECK ("confirmado_em" <= "criado_em"),
  CONSTRAINT "historico_atualizacao_ordem_servico_fkey" FOREIGN KEY ("ordem_servico_id") REFERENCES "ordem_servico_erp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "historico_atualizacao_ordem_operacao_fkey" FOREIGN KEY ("operacao_recuperavel_id") REFERENCES "operacao_recuperavel"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "historico_atualizacao_ordem_operacao_key" ON "historico_atualizacao_ordem_servico_erp"("operacao_recuperavel_id");
CREATE UNIQUE INDEX "historico_atualizacao_ordem_versao_key" ON "historico_atualizacao_ordem_servico_erp"("ordem_servico_id", "versao_resultante");
CREATE INDEX "historico_atualizacao_ordem_confirmada_idx" ON "historico_atualizacao_ordem_servico_erp"("ordem_servico_id", "confirmado_em", "id");

CREATE TABLE "reserva_atualizacao_ordem_servico_erp" (
  "ordem_servico_id" UUID NOT NULL,
  "operacao_recuperavel_id" UUID NOT NULL,
  "versao_esperada" INTEGER NOT NULL,
  "criada_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reserva_atualizacao_ordem_servico_erp_pkey" PRIMARY KEY ("ordem_servico_id"),
  CONSTRAINT "reserva_atualizacao_ordem_versao_check" CHECK ("versao_esperada" >= 1),
  CONSTRAINT "reserva_atualizacao_ordem_servico_fkey" FOREIGN KEY ("ordem_servico_id") REFERENCES "ordem_servico_erp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reserva_atualizacao_ordem_operacao_fkey" FOREIGN KEY ("operacao_recuperavel_id") REFERENCES "operacao_recuperavel"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "reserva_atualizacao_ordem_operacao_key" ON "reserva_atualizacao_ordem_servico_erp"("operacao_recuperavel_id");

CREATE FUNCTION validar_atualizacao_ordem_servico_erp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."atendimento_id" <> OLD."atendimento_id"
    OR NEW."operacao_criacao_id" <> OLD."operacao_criacao_id"
    OR NEW."ordem_servico_externa_id" <> OLD."ordem_servico_externa_id"
    OR NEW."protocolo_oficial" <> OLD."protocolo_oficial"
    OR NEW."cliente_externo_id" <> OLD."cliente_externo_id"
    OR NEW."contrato_externo_id" <> OLD."contrato_externo_id"
    OR NEW."confirmado_em" <> OLD."confirmado_em"
    OR NEW."criado_em" <> OLD."criado_em"
    OR NEW."versao" <> OLD."versao" + 1
    OR NEW."atualizado_em" < OLD."atualizado_em"
  THEN
    RAISE EXCEPTION 'atualização inválida da ordem de serviço' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ordem_servico_erp_atualizacao_controlada
BEFORE UPDATE ON "ordem_servico_erp"
FOR EACH ROW EXECUTE FUNCTION validar_atualizacao_ordem_servico_erp();

CREATE FUNCTION impedir_reescrita_historico_atualizacao_ordem_servico()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'histórico de atualização de ordem de serviço é imutável' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER historico_atualizacao_ordem_servico_imutavel
BEFORE UPDATE OR DELETE ON "historico_atualizacao_ordem_servico_erp"
FOR EACH ROW EXECUTE FUNCTION impedir_reescrita_historico_atualizacao_ordem_servico();

CREATE FUNCTION impedir_alteracao_reserva_atualizacao_ordem_servico()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reserva de atualização de ordem de serviço não pode ser alterada' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER reserva_atualizacao_ordem_servico_sem_update
BEFORE UPDATE ON "reserva_atualizacao_ordem_servico_erp"
FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_reserva_atualizacao_ordem_servico();
