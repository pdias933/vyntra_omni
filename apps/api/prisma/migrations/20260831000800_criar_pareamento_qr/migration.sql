CREATE TYPE "estado_pareamento_qr" AS ENUM (
  'AGUARDANDO_RESGATE',
  'AGUARDANDO_CONFIRMACAO',
  'CONFIRMADO',
  'CONCLUIDO',
  'CANCELADO',
  'EXPIRADO'
);

CREATE TYPE "resultado_tentativa_resgate_qr" AS ENUM ('SUCESSO', 'FALHA', 'BLOQUEADA');

CREATE TABLE "pareamento_qr" (
  "id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "sessao_web_id" UUID NOT NULL,
  "token_qr_hash" CHAR(64) NOT NULL,
  "comprovante_resgate_hash" CHAR(64),
  "estado" "estado_pareamento_qr" NOT NULL DEFAULT 'AGUARDANDO_RESGATE',
  "identificador_instalacao_hash" CHAR(64),
  "segredo_vinculo_hash" CHAR(64),
  "plataforma" "plataforma_mobile",
  "modelo_sanitizado" VARCHAR(120),
  "versao_aplicativo" VARCHAR(40),
  "endereco_ip_resgate" INET,
  "expira_em" TIMESTAMPTZ(6) NOT NULL,
  "resgatado_em" TIMESTAMPTZ(6),
  "confirmado_em" TIMESTAMPTZ(6),
  "concluido_em" TIMESTAMPTZ(6),
  "finalizado_em" TIMESTAMPTZ(6),
  "motivo_finalizacao" VARCHAR(80),
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pareamento_qr_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pareamento_qr_expiracao_check" CHECK ("expira_em" > "criado_em"),
  CONSTRAINT "pareamento_qr_resgate_check" CHECK (
    ("comprovante_resgate_hash" IS NULL
      AND "identificador_instalacao_hash" IS NULL
      AND "segredo_vinculo_hash" IS NULL
      AND "plataforma" IS NULL
      AND "versao_aplicativo" IS NULL
      AND "endereco_ip_resgate" IS NULL
      AND "resgatado_em" IS NULL)
    OR
    ("comprovante_resgate_hash" IS NOT NULL
      AND "identificador_instalacao_hash" IS NOT NULL
      AND "segredo_vinculo_hash" IS NOT NULL
      AND "plataforma" IS NOT NULL
      AND "versao_aplicativo" IS NOT NULL
      AND "endereco_ip_resgate" IS NOT NULL
      AND "resgatado_em" IS NOT NULL)
  ),
  CONSTRAINT "pareamento_qr_estado_check" CHECK (
    ("estado" = 'AGUARDANDO_RESGATE'
      AND "resgatado_em" IS NULL AND "confirmado_em" IS NULL
      AND "concluido_em" IS NULL AND "finalizado_em" IS NULL AND "motivo_finalizacao" IS NULL)
    OR
    ("estado" = 'AGUARDANDO_CONFIRMACAO'
      AND "resgatado_em" IS NOT NULL AND "confirmado_em" IS NULL
      AND "concluido_em" IS NULL AND "finalizado_em" IS NULL AND "motivo_finalizacao" IS NULL)
    OR
    ("estado" = 'CONFIRMADO'
      AND "resgatado_em" IS NOT NULL AND "confirmado_em" IS NOT NULL
      AND "concluido_em" IS NULL AND "finalizado_em" IS NULL AND "motivo_finalizacao" IS NULL)
    OR
    ("estado" = 'CONCLUIDO'
      AND "resgatado_em" IS NOT NULL AND "confirmado_em" IS NOT NULL
      AND "concluido_em" IS NOT NULL AND "finalizado_em" IS NULL AND "motivo_finalizacao" IS NULL)
    OR
    ("estado" IN ('CANCELADO', 'EXPIRADO')
      AND "finalizado_em" IS NOT NULL AND "motivo_finalizacao" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "pareamento_qr_token_qr_hash_key" ON "pareamento_qr"("token_qr_hash");
CREATE UNIQUE INDEX "pareamento_qr_comprovante_resgate_hash_key"
  ON "pareamento_qr"("comprovante_resgate_hash")
  WHERE "comprovante_resgate_hash" IS NOT NULL;
CREATE UNIQUE INDEX "pareamento_qr_sessao_web_ativo_key"
  ON "pareamento_qr"("sessao_web_id")
  WHERE "estado" IN ('AGUARDANDO_RESGATE', 'AGUARDANDO_CONFIRMACAO', 'CONFIRMADO');
CREATE INDEX "pareamento_qr_usuario_criado_idx" ON "pareamento_qr"("usuario_id", "criado_em");
CREATE INDEX "pareamento_qr_sessao_estado_expira_idx" ON "pareamento_qr"("sessao_web_id", "estado", "expira_em");
CREATE INDEX "pareamento_qr_estado_expira_idx" ON "pareamento_qr"("estado", "expira_em");

ALTER TABLE "pareamento_qr"
  ADD CONSTRAINT "pareamento_qr_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pareamento_qr_sessao_web_id_fkey"
  FOREIGN KEY ("sessao_web_id") REFERENCES "sessao_web"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "tentativa_resgate_pareamento_qr" (
  "id" UUID NOT NULL,
  "endereco_ip" INET NOT NULL,
  "identificador_instalacao_hash" CHAR(64) NOT NULL,
  "resultado" "resultado_tentativa_resgate_qr" NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tentativa_resgate_pareamento_qr_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tentativa_resgate_qr_ip_criado_idx"
  ON "tentativa_resgate_pareamento_qr"("endereco_ip", "criado_em");
CREATE INDEX "tentativa_resgate_qr_dispositivo_criado_idx"
  ON "tentativa_resgate_pareamento_qr"("identificador_instalacao_hash", "criado_em");
