CREATE TYPE "estado_credencial_senha" AS ENUM ('ATIVA', 'REVOGADA');
CREATE TYPE "estado_sessao_web" AS ENUM ('ATIVA', 'REVOGADA');
CREATE TYPE "resultado_tentativa_login_web" AS ENUM ('SUCESSO', 'FALHA', 'BLOQUEADA');

CREATE TABLE "credencial_senha" (
  "usuario_id" UUID NOT NULL,
  "identificador_normalizado" VARCHAR(120) NOT NULL,
  "senha_hash" VARCHAR(255) NOT NULL,
  "estado" "estado_credencial_senha" NOT NULL DEFAULT 'ATIVA',
  "senha_alterada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revogada_em" TIMESTAMPTZ(6),
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credencial_senha_pkey" PRIMARY KEY ("usuario_id"),
  CONSTRAINT "credencial_senha_hash_argon2id_check" CHECK ("senha_hash" LIKE '$argon2id$v=19$m=%'),
  CONSTRAINT "credencial_senha_revogacao_check" CHECK (
    ("estado" = 'ATIVA' AND "revogada_em" IS NULL)
    OR ("estado" = 'REVOGADA' AND "revogada_em" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "credencial_senha_identificador_normalizado_key"
  ON "credencial_senha"("identificador_normalizado");
CREATE INDEX "credencial_senha_estado_identificador_idx"
  ON "credencial_senha"("estado", "identificador_normalizado");

ALTER TABLE "credencial_senha"
  ADD CONSTRAINT "credencial_senha_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sessao_web" (
  "id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "csrf_hash" CHAR(64) NOT NULL,
  "estado" "estado_sessao_web" NOT NULL DEFAULT 'ATIVA',
  "versao" INTEGER NOT NULL DEFAULT 0,
  "endereco_ip" INET NOT NULL,
  "agente_usuario_hash" CHAR(64) NOT NULL,
  "autenticada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expira_em" TIMESTAMPTZ(6) NOT NULL,
  "rotacionada_em" TIMESTAMPTZ(6),
  "revogada_em" TIMESTAMPTZ(6),
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessao_web_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessao_web_versao_check" CHECK ("versao" >= 0),
  CONSTRAINT "sessao_web_expiracao_check" CHECK ("expira_em" > "autenticada_em"),
  CONSTRAINT "sessao_web_revogacao_check" CHECK (
    ("estado" = 'ATIVA' AND "revogada_em" IS NULL)
    OR ("estado" = 'REVOGADA' AND "revogada_em" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "sessao_web_token_hash_key" ON "sessao_web"("token_hash");
CREATE INDEX "sessao_web_usuario_estado_expira_idx"
  ON "sessao_web"("usuario_id", "estado", "expira_em");
CREATE INDEX "sessao_web_estado_expira_idx" ON "sessao_web"("estado", "expira_em");

ALTER TABLE "sessao_web"
  ADD CONSTRAINT "sessao_web_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "tentativa_login_web" (
  "id" UUID NOT NULL,
  "identificador_hash" CHAR(64) NOT NULL,
  "endereco_ip" INET NOT NULL,
  "resultado" "resultado_tentativa_login_web" NOT NULL,
  "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tentativa_login_web_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tentativa_login_web_identificador_ip_idx"
  ON "tentativa_login_web"("identificador_hash", "endereco_ip", "criado_em");
CREATE INDEX "tentativa_login_web_ip_idx"
  ON "tentativa_login_web"("endereco_ip", "criado_em");
