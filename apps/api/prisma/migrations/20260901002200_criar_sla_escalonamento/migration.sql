CREATE TYPE "nivel_alerta_sla" AS ENUM ('ATENDENTE', 'SUPERVISOR', 'ADMINISTRADOR');

CREATE TABLE "politica_sla" (
  "id" UUID NOT NULL,
  "fila_id" UUID NOT NULL,
  "alerta_atendente_apos_minutos" INTEGER NOT NULL,
  "alerta_supervisor_apos_minutos" INTEGER NOT NULL,
  "alerta_administrador_apos_minutos" INTEGER NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  "criado_em" TIMESTAMPTZ(6) NOT NULL,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "politica_sla_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "politica_sla_fila_key" UNIQUE ("fila_id"),
  CONSTRAINT "politica_sla_limites_check" CHECK (
    "alerta_atendente_apos_minutos" >= 0
    AND "alerta_atendente_apos_minutos" < "alerta_supervisor_apos_minutos"
    AND "alerta_supervisor_apos_minutos" < "alerta_administrador_apos_minutos"
    AND "versao" >= 1
  ),
  CONSTRAINT "politica_sla_fila_fkey" FOREIGN KEY ("fila_id") REFERENCES "fila"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "politica_sla_atualizado_idx" ON "politica_sla"("atualizado_em", "id");

CREATE TABLE "relogio_sla_atendimento" (
  "id" UUID NOT NULL,
  "atendimento_id" UUID NOT NULL,
  "politica_sla_id" UUID NOT NULL,
  "numero_ciclo" INTEGER NOT NULL,
  "obrigacao_humana_em" TIMESTAMPTZ(6) NOT NULL,
  "alerta_atendente_em" TIMESTAMPTZ(6) NOT NULL,
  "alerta_supervisor_em" TIMESTAMPTZ(6) NOT NULL,
  "alerta_administrador_em" TIMESTAMPTZ(6) NOT NULL,
  "finalizado_em" TIMESTAMPTZ(6),
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "relogio_sla_atendimento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "relogio_sla_atendimento_ciclo_key" UNIQUE ("atendimento_id", "numero_ciclo"),
  CONSTRAINT "relogio_sla_tempos_check" CHECK (
    "numero_ciclo" >= 1 AND "versao" >= 1
    AND "obrigacao_humana_em" <= "alerta_atendente_em"
    AND "alerta_atendente_em" < "alerta_supervisor_em"
    AND "alerta_supervisor_em" < "alerta_administrador_em"
    AND ("finalizado_em" IS NULL OR "finalizado_em" >= "obrigacao_humana_em")
  ),
  CONSTRAINT "relogio_sla_atendimento_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "relogio_sla_politica_fkey" FOREIGN KEY ("politica_sla_id") REFERENCES "politica_sla"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "relogio_sla_atendimento_ativo_key" ON "relogio_sla_atendimento"("atendimento_id") WHERE "finalizado_em" IS NULL;
CREATE INDEX "relogio_sla_pendencias_idx" ON "relogio_sla_atendimento"("finalizado_em", "alerta_atendente_em", "alerta_supervisor_em", "alerta_administrador_em");

CREATE TABLE "alerta_sla" (
  "id" UUID NOT NULL,
  "relogio_sla_id" UUID NOT NULL,
  "nivel" "nivel_alerta_sla" NOT NULL,
  "previsto_em" TIMESTAMPTZ(6) NOT NULL,
  "emitido_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "alerta_sla_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alerta_sla_relogio_nivel_key" UNIQUE ("relogio_sla_id", "nivel"),
  CONSTRAINT "alerta_sla_emissao_check" CHECK ("emitido_em" >= "previsto_em"),
  CONSTRAINT "alerta_sla_relogio_fkey" FOREIGN KEY ("relogio_sla_id") REFERENCES "relogio_sla_atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "alerta_sla_nivel_emitido_idx" ON "alerta_sla"("nivel", "emitido_em", "id");
