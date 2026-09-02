CREATE TYPE "estado_copia_atendimento" AS ENUM ('ATIVA', 'CONSUMIDA', 'REVOGADA');

CREATE TABLE "copia_atendimento" (
    "id" UUID NOT NULL,
    "atendimento_id" UUID NOT NULL,
    "solicitado_por_usuario_id" UUID NOT NULL,
    "sessao_web_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "estado" "estado_copia_atendimento" NOT NULL DEFAULT 'ATIVA',
    "gerada_ate_em" TIMESTAMPTZ(6) NOT NULL,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "consumida_em" TIMESTAMPTZ(6),
    "revogada_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copia_atendimento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "copia_atendimento_intervalo_check" CHECK ("expira_em" > "gerada_ate_em"),
    CONSTRAINT "copia_atendimento_estado_datas_check" CHECK (
      ("estado" = 'ATIVA' AND "consumida_em" IS NULL AND "revogada_em" IS NULL)
      OR ("estado" = 'CONSUMIDA' AND "consumida_em" IS NOT NULL AND "revogada_em" IS NULL)
      OR ("estado" = 'REVOGADA' AND "consumida_em" IS NULL AND "revogada_em" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "copia_atendimento_token_hash_key" ON "copia_atendimento"("token_hash");
CREATE INDEX "copia_atendimento_atendimento_criado_idx" ON "copia_atendimento"("atendimento_id", "criado_em", "id");
CREATE INDEX "copia_atendimento_usuario_estado_expira_idx" ON "copia_atendimento"("solicitado_por_usuario_id", "estado", "expira_em");
CREATE INDEX "copia_atendimento_estado_expira_idx" ON "copia_atendimento"("estado", "expira_em");

ALTER TABLE "copia_atendimento"
  ADD CONSTRAINT "copia_atendimento_atendimento_id_fkey"
  FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "copia_atendimento"
  ADD CONSTRAINT "copia_atendimento_solicitado_por_usuario_id_fkey"
  FOREIGN KEY ("solicitado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION bloquear_mutacao_copia_atendimento_terminal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."estado" <> 'ATIVA' THEN
    RAISE EXCEPTION 'COPIA_ATENDIMENTO_TERMINAL_IMUTAVEL';
  END IF;

  IF NEW."id" <> OLD."id"
     OR NEW."atendimento_id" <> OLD."atendimento_id"
     OR NEW."solicitado_por_usuario_id" <> OLD."solicitado_por_usuario_id"
     OR NEW."sessao_web_id" <> OLD."sessao_web_id"
     OR NEW."token_hash" <> OLD."token_hash"
     OR NEW."gerada_ate_em" <> OLD."gerada_ate_em"
     OR NEW."expira_em" <> OLD."expira_em"
     OR NEW."criado_em" <> OLD."criado_em" THEN
    RAISE EXCEPTION 'COPIA_ATENDIMENTO_VINCULO_IMUTAVEL';
  END IF;

  IF NEW."estado" = 'ATIVA' THEN
    RAISE EXCEPTION 'COPIA_ATENDIMENTO_ATIVA_SEM_TRANSICAO';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "copia_atendimento_proteger_terminal"
BEFORE UPDATE ON "copia_atendimento"
FOR EACH ROW EXECUTE FUNCTION bloquear_mutacao_copia_atendimento_terminal();

CREATE OR REPLACE FUNCTION impedir_exclusao_copia_atendimento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'COPIA_ATENDIMENTO_NAO_PODE_SER_EXCLUIDA';
END;
$$;

CREATE TRIGGER "copia_atendimento_impedir_exclusao"
BEFORE DELETE OR TRUNCATE ON "copia_atendimento"
FOR EACH STATEMENT EXECUTE FUNCTION impedir_exclusao_copia_atendimento();
