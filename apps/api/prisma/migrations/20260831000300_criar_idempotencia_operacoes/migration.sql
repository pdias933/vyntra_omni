-- CreateEnum
CREATE TYPE "estado_operacao_recuperavel" AS ENUM (
  'PENDENTE',
  'EM_EXECUCAO',
  'AGUARDANDO_NOVA_TENTATIVA',
  'RESULTADO_INCERTO',
  'EM_RECONCILIACAO',
  'CONCLUIDA',
  'FALHA_DEFINITIVA'
);

-- CreateEnum
CREATE TYPE "tipo_tentativa_operacao" AS ENUM ('EXECUCAO', 'RECONCILIACAO');

-- CreateEnum
CREATE TYPE "resultado_tentativa_operacao" AS ENUM (
  'EM_ANDAMENTO',
  'SUCESSO',
  'FALHA_TEMPORARIA',
  'RESULTADO_INCERTO',
  'EFEITO_AUSENTE',
  'FALHA_DEFINITIVA'
);

-- CreateTable
CREATE TABLE "registro_idempotencia" (
    "id" UUID NOT NULL,
    "escopo_tipo" VARCHAR(100) NOT NULL,
    "escopo_id" UUID NOT NULL,
    "chave_hash" CHAR(64) NOT NULL,
    "assinatura_requisicao_hash" CHAR(64) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_idempotencia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "registro_idempotencia_escopo_tipo_check"
      CHECK ("escopo_tipo" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "registro_idempotencia_chave_hash_check"
      CHECK ("chave_hash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "registro_idempotencia_assinatura_hash_check"
      CHECK ("assinatura_requisicao_hash" ~ '^[a-f0-9]{64}$')
);

-- CreateTable
CREATE TABLE "operacao_recuperavel" (
    "id" UUID NOT NULL,
    "registro_idempotencia_id" UUID NOT NULL,
    "tipo" VARCHAR(100) NOT NULL,
    "entidade_tipo" VARCHAR(100),
    "entidade_id" UUID,
    "estado" "estado_operacao_recuperavel" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "versao" INTEGER NOT NULL DEFAULT 0,
    "concessao_token_hash" CHAR(64),
    "concessao_ate" TIMESTAMPTZ(6),
    "proxima_acao_em" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "codigo_ultimo_erro" VARCHAR(100),
    "resultado_protegido" JSONB,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,
    "concluido_em" TIMESTAMPTZ(6),

    CONSTRAINT "operacao_recuperavel_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operacao_recuperavel_tipo_check"
      CHECK ("tipo" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "operacao_recuperavel_entidade_check"
      CHECK (("entidade_tipo" IS NULL) = ("entidade_id" IS NULL)),
    CONSTRAINT "operacao_recuperavel_entidade_tipo_check"
      CHECK ("entidade_tipo" IS NULL OR "entidade_tipo" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "operacao_recuperavel_contadores_check"
      CHECK ("tentativas" >= 0 AND "versao" >= 0),
    CONSTRAINT "operacao_recuperavel_concessao_hash_check"
      CHECK ("concessao_token_hash" IS NULL OR "concessao_token_hash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "operacao_recuperavel_erro_check"
      CHECK ("codigo_ultimo_erro" IS NULL OR "codigo_ultimo_erro" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "operacao_recuperavel_resultado_check"
      CHECK ("resultado_protegido" IS NULL OR jsonb_typeof("resultado_protegido") = 'object'),
    CONSTRAINT "operacao_recuperavel_estado_check"
      CHECK (
        (
          "estado" IN ('EM_EXECUCAO', 'EM_RECONCILIACAO')
          AND "concessao_token_hash" IS NOT NULL
          AND "concessao_ate" IS NOT NULL
          AND "proxima_acao_em" IS NULL
          AND "concluido_em" IS NULL
        )
        OR (
          "estado" IN ('PENDENTE', 'AGUARDANDO_NOVA_TENTATIVA', 'RESULTADO_INCERTO')
          AND "concessao_token_hash" IS NULL
          AND "concessao_ate" IS NULL
          AND "proxima_acao_em" IS NOT NULL
          AND "concluido_em" IS NULL
        )
        OR (
          "estado" IN ('CONCLUIDA', 'FALHA_DEFINITIVA')
          AND "concessao_token_hash" IS NULL
          AND "concessao_ate" IS NULL
          AND "proxima_acao_em" IS NULL
          AND "concluido_em" IS NOT NULL
        )
      )
);

-- CreateTable
CREATE TABLE "tentativa_operacao" (
    "id" UUID NOT NULL,
    "operacao_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "tipo_tentativa_operacao" NOT NULL,
    "resultado" "resultado_tentativa_operacao" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "concessao_token_hash" CHAR(64) NOT NULL,
    "codigo_resultado" VARCHAR(100),
    "dados_protegidos" JSONB,
    "iniciada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerrada_em" TIMESTAMPTZ(6),

    CONSTRAINT "tentativa_operacao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tentativa_operacao_numero_check" CHECK ("numero" > 0),
    CONSTRAINT "tentativa_operacao_concessao_hash_check"
      CHECK ("concessao_token_hash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "tentativa_operacao_codigo_check"
      CHECK ("codigo_resultado" IS NULL OR "codigo_resultado" ~ '^[A-Z][A-Z0-9_]{2,99}$'),
    CONSTRAINT "tentativa_operacao_dados_check"
      CHECK ("dados_protegidos" IS NULL OR jsonb_typeof("dados_protegidos") = 'object'),
    CONSTRAINT "tentativa_operacao_resultado_check"
      CHECK (
        ("resultado" = 'EM_ANDAMENTO' AND "encerrada_em" IS NULL)
        OR ("resultado" <> 'EM_ANDAMENTO' AND "encerrada_em" IS NOT NULL)
      )
);

-- CreateIndex
CREATE UNIQUE INDEX "registro_idempotencia_escopo_chave_key"
ON "registro_idempotencia"("escopo_tipo", "escopo_id", "chave_hash");

-- CreateIndex
CREATE INDEX "registro_idempotencia_criado_em_idx" ON "registro_idempotencia"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "operacao_recuperavel_registro_idempotencia_id_key"
ON "operacao_recuperavel"("registro_idempotencia_id");

-- CreateIndex
CREATE INDEX "operacao_recuperavel_pendente_idx"
ON "operacao_recuperavel"("estado", "proxima_acao_em", "criado_em");

-- CreateIndex
CREATE INDEX "operacao_recuperavel_entidade_idx"
ON "operacao_recuperavel"("entidade_tipo", "entidade_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "tentativa_operacao_numero_key"
ON "tentativa_operacao"("operacao_id", "numero");

-- CreateIndex
CREATE INDEX "tentativa_operacao_resultado_idx"
ON "tentativa_operacao"("resultado", "iniciada_em");

-- AddForeignKey
ALTER TABLE "operacao_recuperavel"
ADD CONSTRAINT "operacao_recuperavel_registro_idempotencia_id_fkey"
FOREIGN KEY ("registro_idempotencia_id") REFERENCES "registro_idempotencia"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tentativa_operacao"
ADD CONSTRAINT "tentativa_operacao_operacao_id_fkey"
FOREIGN KEY ("operacao_id") REFERENCES "operacao_recuperavel"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
