CREATE TYPE "plataforma_mobile" AS ENUM ('IOS', 'ANDROID');
CREATE TYPE "estado_dispositivo_mobile" AS ENUM ('ATIVO', 'REVOGADO');
CREATE TYPE "estado_sessao_mobile" AS ENUM ('ATIVA', 'REVOGADA');
CREATE TYPE "resultado_tentativa_login_mobile" AS ENUM ('SUCESSO', 'FALHA', 'BLOQUEADA');

CREATE TABLE "dispositivo_mobile" (
  "id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "identificador_instalacao_hash" CHAR(64) NOT NULL,
  "segredo_vinculo_hash" CHAR(64) NOT NULL,
  "estado" "estado_dispositivo_mobile" NOT NULL DEFAULT 'ATIVO',
  "plataforma" "plataforma_mobile" NOT NULL,
  "modelo_sanitizado" VARCHAR(120),
  "versao_aplicativo" VARCHAR(40) NOT NULL,
  "ultimo_acesso_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revogado_em" TIMESTAMPTZ(6),
  "motivo_revogacao" VARCHAR(80),
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispositivo_mobile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dispositivo_mobile_revogacao_check" CHECK (
    ("estado" = 'ATIVO' AND "revogado_em" IS NULL AND "motivo_revogacao" IS NULL)
    OR ("estado" = 'REVOGADO' AND "revogado_em" IS NOT NULL AND "motivo_revogacao" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "dispositivo_mobile_usuario_instalacao_key"
  ON "dispositivo_mobile"("usuario_id", "identificador_instalacao_hash");
CREATE UNIQUE INDEX "dispositivo_mobile_id_usuario_key"
  ON "dispositivo_mobile"("id", "usuario_id");
CREATE INDEX "dispositivo_mobile_usuario_estado_acesso_idx"
  ON "dispositivo_mobile"("usuario_id", "estado", "ultimo_acesso_em");

ALTER TABLE "dispositivo_mobile"
  ADD CONSTRAINT "dispositivo_mobile_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sessao_mobile" (
  "id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "dispositivo_id" UUID NOT NULL,
  "token_acesso_hash" CHAR(64) NOT NULL,
  "token_refresh_hash" CHAR(64) NOT NULL,
  "estado" "estado_sessao_mobile" NOT NULL DEFAULT 'ATIVA',
  "versao" INTEGER NOT NULL DEFAULT 0,
  "autenticada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acesso_expira_em" TIMESTAMPTZ(6) NOT NULL,
  "refresh_expira_em" TIMESTAMPTZ(6) NOT NULL,
  "rotacionada_em" TIMESTAMPTZ(6),
  "revogada_em" TIMESTAMPTZ(6),
  "motivo_revogacao" VARCHAR(80),
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessao_mobile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessao_mobile_versao_check" CHECK ("versao" >= 0),
  CONSTRAINT "sessao_mobile_expiracao_check" CHECK (
    "acesso_expira_em" > "autenticada_em"
    AND "refresh_expira_em" > "acesso_expira_em"
  ),
  CONSTRAINT "sessao_mobile_revogacao_check" CHECK (
    ("estado" = 'ATIVA' AND "revogada_em" IS NULL AND "motivo_revogacao" IS NULL)
    OR ("estado" = 'REVOGADA' AND "revogada_em" IS NOT NULL AND "motivo_revogacao" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "sessao_mobile_token_acesso_hash_key" ON "sessao_mobile"("token_acesso_hash");
CREATE UNIQUE INDEX "sessao_mobile_token_refresh_hash_key" ON "sessao_mobile"("token_refresh_hash");
CREATE INDEX "sessao_mobile_usuario_estado_refresh_idx"
  ON "sessao_mobile"("usuario_id", "estado", "refresh_expira_em");
CREATE INDEX "sessao_mobile_dispositivo_estado_refresh_idx"
  ON "sessao_mobile"("dispositivo_id", "estado", "refresh_expira_em");

ALTER TABLE "sessao_mobile"
  ADD CONSTRAINT "sessao_mobile_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "sessao_mobile_dispositivo_id_fkey"
  FOREIGN KEY ("dispositivo_id", "usuario_id") REFERENCES "dispositivo_mobile"("id", "usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "token_refresh_mobile_usado" (
  "token_hash" CHAR(64) NOT NULL,
  "sessao_id" UUID NOT NULL,
  "usado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "token_refresh_mobile_usado_pkey" PRIMARY KEY ("token_hash")
);

CREATE INDEX "token_refresh_mobile_usado_sessao_idx"
  ON "token_refresh_mobile_usado"("sessao_id", "usado_em");

ALTER TABLE "token_refresh_mobile_usado"
  ADD CONSTRAINT "token_refresh_mobile_usado_sessao_id_fkey"
  FOREIGN KEY ("sessao_id") REFERENCES "sessao_mobile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "tentativa_login_mobile" (
  "id" UUID NOT NULL,
  "identificador_hash" CHAR(64) NOT NULL,
  "endereco_ip" INET NOT NULL,
  "identificador_instalacao_hash" CHAR(64) NOT NULL,
  "resultado" "resultado_tentativa_login_mobile" NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tentativa_login_mobile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tentativa_login_mobile_identificador_ip_dispositivo_idx"
  ON "tentativa_login_mobile"("identificador_hash", "endereco_ip", "identificador_instalacao_hash", "criado_em");
CREATE INDEX "tentativa_login_mobile_ip_idx"
  ON "tentativa_login_mobile"("endereco_ip", "criado_em");
