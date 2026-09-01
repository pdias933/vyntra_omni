CREATE TYPE "marco_alerta_janela_canal" AS ENUM ('UMA_HORA', 'TRINTA_MINUTOS', 'DEZ_MINUTOS');

CREATE TABLE "janela_atendimento_canal" (
  "id" UUID NOT NULL,
  "contato_id" UUID NOT NULL,
  "conta_whatsapp_id" UUID NOT NULL,
  "ultima_entrada_contato_em" TIMESTAMPTZ(6) NOT NULL,
  "expira_em" TIMESTAMPTZ(6) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  "criada_em" TIMESTAMPTZ(6) NOT NULL,
  "atualizada_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "janela_atendimento_canal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "janela_canal_contato_conta_key" UNIQUE ("contato_id", "conta_whatsapp_id"),
  CONSTRAINT "janela_canal_vigencia_check" CHECK (
    "expira_em" = "ultima_entrada_contato_em" + INTERVAL '24 hours'
    AND "versao" >= 1
    AND "atualizada_em" >= "criada_em"
  ),
  CONSTRAINT "janela_canal_contato_fkey" FOREIGN KEY ("contato_id") REFERENCES "contato"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "janela_canal_conta_fkey" FOREIGN KEY ("conta_whatsapp_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "janela_canal_expiracao_idx" ON "janela_atendimento_canal"("expira_em", "id");

CREATE TABLE "alerta_janela_canal" (
  "id" UUID NOT NULL,
  "janela_canal_id" UUID NOT NULL,
  "versao_janela" INTEGER NOT NULL,
  "marco" "marco_alerta_janela_canal" NOT NULL,
  "previsto_em" TIMESTAMPTZ(6) NOT NULL,
  "emitido_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "alerta_janela_canal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alerta_janela_canal_versao_marco_key" UNIQUE ("janela_canal_id", "versao_janela", "marco"),
  CONSTRAINT "alerta_janela_canal_emissao_check" CHECK (
    "versao_janela" >= 1 AND "emitido_em" >= "previsto_em"
  ),
  CONSTRAINT "alerta_janela_canal_janela_fkey" FOREIGN KEY ("janela_canal_id") REFERENCES "janela_atendimento_canal"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "alerta_janela_canal_marco_emitido_idx" ON "alerta_janela_canal"("marco", "emitido_em", "id");
