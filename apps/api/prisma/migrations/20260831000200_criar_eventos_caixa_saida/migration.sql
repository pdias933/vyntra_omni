-- CreateEnum
CREATE TYPE "classificacao_dados_evento" AS ENUM ('OPERACIONAL', 'DADO_PESSOAL', 'DADO_SENSIVEL');

-- CreateEnum
CREATE TYPE "estado_item_caixa_saida" AS ENUM ('PENDENTE', 'PROCESSADO');

-- CreateTable
CREATE TABLE "evento_dominio" (
    "id" UUID NOT NULL,
    "sequencia_evento" BIGSERIAL NOT NULL,
    "tipo" VARCHAR(100) NOT NULL,
    "entidade_tipo" VARCHAR(100) NOT NULL,
    "entidade_id" UUID NOT NULL,
    "atendimento_id" UUID,
    "conversa_id" UUID,
    "usuario_ator_id" UUID,
    "classificacao_dados" "classificacao_dados_evento" NOT NULL,
    "dados_protegidos_minimizados" JSONB NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_dominio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "evento_dominio_tipo_check"
      CHECK ("tipo" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "evento_dominio_entidade_tipo_check"
      CHECK ("entidade_tipo" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "evento_dominio_dados_check"
      CHECK (jsonb_typeof("dados_protegidos_minimizados") = 'object')
);

-- CreateTable
CREATE TABLE "item_caixa_saida" (
    "id" UUID NOT NULL,
    "evento_dominio_id" UUID NOT NULL,
    "tipo" VARCHAR(100) NOT NULL,
    "destino" VARCHAR(100) NOT NULL,
    "estado" "estado_item_caixa_saida" NOT NULL DEFAULT 'PENDENTE',
    "dados_protegidos_minimizados" JSONB NOT NULL,
    "disponivel_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processado_em" TIMESTAMPTZ(6),

    CONSTRAINT "item_caixa_saida_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "item_caixa_saida_tipo_check"
      CHECK ("tipo" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "item_caixa_saida_destino_check"
      CHECK ("destino" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "item_caixa_saida_dados_check"
      CHECK (jsonb_typeof("dados_protegidos_minimizados") = 'object'),
    CONSTRAINT "item_caixa_saida_estado_check"
      CHECK (
        ("estado" = 'PENDENTE' AND "processado_em" IS NULL)
        OR ("estado" = 'PROCESSADO' AND "processado_em" IS NOT NULL)
      )
);

-- CreateIndex
CREATE UNIQUE INDEX "evento_dominio_sequencia_evento_key" ON "evento_dominio"("sequencia_evento");

-- CreateIndex
CREATE INDEX "evento_dominio_criado_em_idx" ON "evento_dominio"("criado_em");

-- CreateIndex
CREATE INDEX "evento_dominio_entidade_sequencia_idx" ON "evento_dominio"("entidade_tipo", "entidade_id", "sequencia_evento");

-- CreateIndex
CREATE INDEX "evento_dominio_atendimento_sequencia_idx" ON "evento_dominio"("atendimento_id", "sequencia_evento");

-- CreateIndex
CREATE INDEX "evento_dominio_conversa_sequencia_idx" ON "evento_dominio"("conversa_id", "sequencia_evento");

-- CreateIndex
CREATE INDEX "item_caixa_saida_pendente_idx" ON "item_caixa_saida"("estado", "disponivel_em", "criado_em");

-- CreateIndex
CREATE INDEX "item_caixa_saida_evento_idx" ON "item_caixa_saida"("evento_dominio_id");

-- AddForeignKey
ALTER TABLE "item_caixa_saida"
ADD CONSTRAINT "item_caixa_saida_evento_dominio_id_fkey"
FOREIGN KEY ("evento_dominio_id") REFERENCES "evento_dominio"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
