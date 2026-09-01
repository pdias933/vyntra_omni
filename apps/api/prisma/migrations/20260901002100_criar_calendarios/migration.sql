ALTER TYPE "codigo_permissao" ADD VALUE IF NOT EXISTS 'ADMINISTRAR_CALENDARIOS';

CREATE TYPE "modo_calendario_atendimento" AS ENUM ('PERIODOS', 'VINTE_QUATRO_SETE');
CREATE TYPE "estado_override_calendario" AS ENUM ('ABERTO', 'FECHADO');

CREATE TABLE "calendario_atendimento" (
  "id" UUID NOT NULL,
  "nome" VARCHAR(120) NOT NULL,
  "fuso_horario" VARCHAR(100) NOT NULL,
  "modo" "modo_calendario_atendimento" NOT NULL,
  "conta_whatsapp_id" UUID,
  "fila_id" UUID,
  "versao" INTEGER NOT NULL DEFAULT 1,
  "criado_em" TIMESTAMPTZ(6) NOT NULL,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "calendario_atendimento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendario_atendimento_alvo_check" CHECK (("conta_whatsapp_id" IS NULL) <> ("fila_id" IS NULL)),
  CONSTRAINT "calendario_atendimento_versao_check" CHECK ("versao" >= 1),
  CONSTRAINT "calendario_atendimento_conta_fkey" FOREIGN KEY ("conta_whatsapp_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "calendario_atendimento_fila_fkey" FOREIGN KEY ("fila_id") REFERENCES "fila"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "calendario_conta_whatsapp_key" ON "calendario_atendimento"("conta_whatsapp_id") WHERE "conta_whatsapp_id" IS NOT NULL;
CREATE UNIQUE INDEX "calendario_fila_key" ON "calendario_atendimento"("fila_id") WHERE "fila_id" IS NOT NULL;
CREATE INDEX "calendario_atendimento_modo_idx" ON "calendario_atendimento"("modo", "atualizado_em", "id");

CREATE TABLE "periodo_semanal_calendario" (
  "id" UUID NOT NULL,
  "calendario_id" UUID NOT NULL,
  "dia_semana" INTEGER NOT NULL,
  "minuto_inicio" INTEGER NOT NULL,
  "minuto_fim" INTEGER NOT NULL,
  CONSTRAINT "periodo_semanal_calendario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "periodo_semanal_calendario_limites_check" CHECK ("dia_semana" BETWEEN 0 AND 6 AND "minuto_inicio" >= 0 AND "minuto_fim" <= 1440 AND "minuto_inicio" < "minuto_fim"),
  CONSTRAINT "periodo_semanal_calendario_calendario_fkey" FOREIGN KEY ("calendario_id") REFERENCES "calendario_atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "periodo_semanal_calendario_intervalo_key" UNIQUE ("calendario_id", "dia_semana", "minuto_inicio", "minuto_fim")
);
CREATE INDEX "periodo_semanal_calendario_busca_idx" ON "periodo_semanal_calendario"("calendario_id", "dia_semana", "minuto_inicio");

CREATE TABLE "feriado_calendario" (
  "id" UUID NOT NULL,
  "calendario_id" UUID NOT NULL,
  "data_local" DATE NOT NULL,
  "nome" VARCHAR(120) NOT NULL,
  CONSTRAINT "feriado_calendario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "feriado_calendario_calendario_fkey" FOREIGN KEY ("calendario_id") REFERENCES "calendario_atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "feriado_calendario_data_key" UNIQUE ("calendario_id", "data_local")
);

CREATE TABLE "excecao_calendario" (
  "id" UUID NOT NULL,
  "calendario_id" UUID NOT NULL,
  "data_local" DATE NOT NULL,
  "estado" "estado_override_calendario" NOT NULL,
  "dia_inteiro" BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT "excecao_calendario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "excecao_calendario_calendario_fkey" FOREIGN KEY ("calendario_id") REFERENCES "calendario_atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "excecao_calendario_data_key" UNIQUE ("calendario_id", "data_local"),
  CONSTRAINT "excecao_calendario_fechado_check" CHECK ("estado" = 'ABERTO' OR "dia_inteiro" = TRUE)
);

CREATE TABLE "periodo_excecao_calendario" (
  "id" UUID NOT NULL,
  "excecao_id" UUID NOT NULL,
  "minuto_inicio" INTEGER NOT NULL,
  "minuto_fim" INTEGER NOT NULL,
  CONSTRAINT "periodo_excecao_calendario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "periodo_excecao_calendario_limites_check" CHECK ("minuto_inicio" >= 0 AND "minuto_fim" <= 1440 AND "minuto_inicio" < "minuto_fim"),
  CONSTRAINT "periodo_excecao_calendario_excecao_fkey" FOREIGN KEY ("excecao_id") REFERENCES "excecao_calendario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "periodo_excecao_calendario_intervalo_key" UNIQUE ("excecao_id", "minuto_inicio", "minuto_fim")
);

CREATE TABLE "override_calendario" (
  "id" UUID NOT NULL,
  "calendario_id" UUID NOT NULL,
  "estado" "estado_override_calendario" NOT NULL,
  "motivo" VARCHAR(500) NOT NULL,
  "vigente_de" TIMESTAMPTZ(6) NOT NULL,
  "vigente_ate" TIMESTAMPTZ(6) NOT NULL,
  "executado_por_usuario_id" UUID NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "override_calendario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "override_calendario_vigencia_check" CHECK ("vigente_de" < "vigente_ate" AND char_length(btrim("motivo")) BETWEEN 1 AND 500),
  CONSTRAINT "override_calendario_calendario_fkey" FOREIGN KEY ("calendario_id") REFERENCES "calendario_atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "override_calendario_executor_fkey" FOREIGN KEY ("executado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "override_calendario_vigencia_idx" ON "override_calendario"("calendario_id", "vigente_de", "vigente_ate");

CREATE FUNCTION validar_intervalo_calendario() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'periodo_semanal_calendario' AND EXISTS (
    SELECT 1 FROM "periodo_semanal_calendario" p
    WHERE p."calendario_id" = NEW."calendario_id" AND p."dia_semana" = NEW."dia_semana"
      AND p."id" <> NEW."id" AND p."minuto_inicio" < NEW."minuto_fim" AND NEW."minuto_inicio" < p."minuto_fim"
  ) THEN RAISE EXCEPTION 'PERIODO_CALENDARIO_SOBREPOSTO' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'periodo_excecao_calendario' AND EXISTS (
    SELECT 1 FROM "periodo_excecao_calendario" p
    WHERE p."excecao_id" = NEW."excecao_id" AND p."id" <> NEW."id"
      AND p."minuto_inicio" < NEW."minuto_fim" AND NEW."minuto_inicio" < p."minuto_fim"
  ) THEN RAISE EXCEPTION 'PERIODO_EXCECAO_SOBREPOSTO' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "periodo_semanal_calendario_validar" BEFORE INSERT OR UPDATE ON "periodo_semanal_calendario" FOR EACH ROW EXECUTE FUNCTION validar_intervalo_calendario();
CREATE TRIGGER "periodo_excecao_calendario_validar" BEFORE INSERT OR UPDATE ON "periodo_excecao_calendario" FOR EACH ROW EXECUTE FUNCTION validar_intervalo_calendario();

CREATE FUNCTION proteger_override_calendario() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'OVERRIDE_CALENDARIO_IMUTAVEL' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "override_calendario_proteger_alteracao" BEFORE UPDATE OR DELETE ON "override_calendario" FOR EACH ROW EXECUTE FUNCTION proteger_override_calendario();
CREATE TRIGGER "override_calendario_proteger_truncate" BEFORE TRUNCATE ON "override_calendario" FOR EACH STATEMENT EXECUTE FUNCTION proteger_override_calendario();
