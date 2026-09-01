CREATE TYPE "estado_atendimento" AS ENUM ('AGUARDANDO', 'EM_ATENDIMENTO', 'ENCERRADO_REABRIVEL', 'ENCERRADO');
CREATE TYPE "modo_atendimento" AS ENUM ('BOT', 'FILA_HUMANA', 'HUMANO');
CREATE TYPE "motivo_espera_atendimento" AS ENUM ('PROCESSANDO_BOT', 'AGUARDANDO_HUMANO', 'FORA_DO_HORARIO', 'AGUARDANDO_CLIENTE', 'NENHUM');
CREATE TYPE "origem_encerramento_atendimento" AS ENUM ('USUARIO', 'FLUXO');

CREATE TABLE "atendimento" (
  "id" UUID NOT NULL,
  "conversa_id" UUID NOT NULL,
  "conta_whatsapp_origem_id" UUID NOT NULL,
  "estado" "estado_atendimento" NOT NULL DEFAULT 'AGUARDANDO',
  "modo" "modo_atendimento" NOT NULL,
  "motivo_espera" "motivo_espera_atendimento" NOT NULL,
  "fila_atual_id" UUID,
  "usuario_responsavel_id" UUID,
  "versao_estado" INTEGER NOT NULL DEFAULT 1,
  "versao_atribuicao" INTEGER NOT NULL DEFAULT 1,
  "iniciado_em" TIMESTAMPTZ(6) NOT NULL,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL,
  "encerrado_em" TIMESTAMPTZ(6),
  "encerrado_por_tipo" "origem_encerramento_atendimento",
  "encerrado_por_id" UUID,
  "motivo_encerramento" VARCHAR(500),
  "pode_reabrir_ate" TIMESTAMPTZ(6),
  "fila_fallback_reabertura_id" UUID,
  "finalizado_definitivamente_em" TIMESTAMPTZ(6),
  CONSTRAINT "atendimento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "atendimento_conversa_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversa"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "atendimento_conta_origem_fkey" FOREIGN KEY ("conta_whatsapp_origem_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "atendimento_participacao_origem_fkey" FOREIGN KEY ("conversa_id", "conta_whatsapp_origem_id") REFERENCES "participacao_conta_conversa"("conversa_id", "conta_whatsapp_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "atendimento_fila_atual_fkey" FOREIGN KEY ("fila_atual_id") REFERENCES "fila"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "atendimento_usuario_responsavel_fkey" FOREIGN KEY ("usuario_responsavel_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "atendimento_fila_fallback_fkey" FOREIGN KEY ("fila_fallback_reabertura_id") REFERENCES "fila"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "atendimento_versoes_check" CHECK ("versao_estado" >= 1 AND "versao_atribuicao" >= 1),
  CONSTRAINT "atendimento_datas_check" CHECK ("atualizado_em" >= "iniciado_em"),
  CONSTRAINT "atendimento_configuracao_aberta_check" CHECK (
    ("estado" = 'AGUARDANDO' AND "modo" = 'BOT' AND "fila_atual_id" IS NULL AND "usuario_responsavel_id" IS NULL AND "motivo_espera" IN ('PROCESSANDO_BOT', 'FORA_DO_HORARIO', 'AGUARDANDO_CLIENTE'))
    OR
    ("estado" = 'AGUARDANDO' AND "modo" = 'FILA_HUMANA' AND "fila_atual_id" IS NOT NULL AND "usuario_responsavel_id" IS NULL AND "motivo_espera" IN ('AGUARDANDO_HUMANO', 'FORA_DO_HORARIO'))
    OR
    ("estado" = 'EM_ATENDIMENTO' AND "modo" = 'HUMANO' AND "fila_atual_id" IS NOT NULL AND "usuario_responsavel_id" IS NOT NULL AND "motivo_espera" IN ('NENHUM', 'AGUARDANDO_CLIENTE'))
    OR "estado" IN ('ENCERRADO_REABRIVEL', 'ENCERRADO')
  ),
  CONSTRAINT "atendimento_encerramento_check" CHECK (
    ("estado" IN ('AGUARDANDO', 'EM_ATENDIMENTO') AND "encerrado_em" IS NULL AND "encerrado_por_tipo" IS NULL AND "encerrado_por_id" IS NULL AND "motivo_encerramento" IS NULL AND "pode_reabrir_ate" IS NULL AND "fila_fallback_reabertura_id" IS NULL AND "finalizado_definitivamente_em" IS NULL)
    OR
    ("estado" = 'ENCERRADO_REABRIVEL' AND "encerrado_em" IS NOT NULL AND "encerrado_por_tipo" IS NOT NULL AND "encerrado_por_id" IS NOT NULL AND char_length(btrim("motivo_encerramento")) BETWEEN 1 AND 500 AND "pode_reabrir_ate" = "encerrado_em" + INTERVAL '30 minutes' AND "usuario_responsavel_id" IS NULL AND "finalizado_definitivamente_em" IS NULL)
    OR
    ("estado" = 'ENCERRADO' AND "encerrado_em" IS NOT NULL AND "encerrado_por_tipo" IS NOT NULL AND "encerrado_por_id" IS NOT NULL AND char_length(btrim("motivo_encerramento")) BETWEEN 1 AND 500 AND "pode_reabrir_ate" = "encerrado_em" + INTERVAL '30 minutes' AND "usuario_responsavel_id" IS NULL AND "finalizado_definitivamente_em" >= "pode_reabrir_ate")
  ),
  CONSTRAINT "atendimento_fallback_check" CHECK (
    ("encerrado_por_tipo" = 'FLUXO' AND "fila_fallback_reabertura_id" IS NOT NULL)
    OR ("encerrado_por_tipo" IS DISTINCT FROM 'FLUXO' AND "fila_fallback_reabertura_id" IS NULL)
  )
);

ALTER TABLE "contexto_atendimento"
  ADD CONSTRAINT "contexto_atendimento_atendimento_fkey"
  FOREIGN KEY ("atendimento_id") REFERENCES "atendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "atendimento_conversa_inicio_idx" ON "atendimento"("conversa_id", "iniciado_em", "id");
CREATE INDEX "atendimento_origem_estado_idx" ON "atendimento"("conta_whatsapp_origem_id", "estado", "iniciado_em");
CREATE INDEX "atendimento_fila_estado_idx" ON "atendimento"("fila_atual_id", "estado", "atualizado_em");
CREATE INDEX "atendimento_responsavel_estado_idx" ON "atendimento"("usuario_responsavel_id", "estado", "atualizado_em");

