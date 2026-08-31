-- CreateEnum
CREATE TYPE "estado_usuario" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "papel_base" AS ENUM ('ADMINISTRADOR', 'SUPERVISOR', 'ATENDENTE');

-- CreateEnum
CREATE TYPE "estado_perfil_acesso" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "efeito_permissao_perfil" AS ENUM ('CONCEDER', 'NEGAR');

-- CreateEnum
CREATE TYPE "codigo_permissao" AS ENUM (
  'VISUALIZAR_FILA',
  'RESGATAR_ATENDIMENTO',
  'TRANSFERIR_ATENDIMENTO',
  'RECEBER_TRANSFERENCIA',
  'ENCERRAR_ATENDIMENTO',
  'REABRIR_ATENDIMENTO',
  'ASSUMIR_ATENDIMENTO',
  'ADICIONAR_NOTA_INTERNA',
  'VISUALIZAR_NOTA_INTERNA',
  'CONSULTAR_CLIENTE',
  'VINCULAR_CLIENTE',
  'ALTERAR_CONTEXTO_CLIENTE',
  'CONSULTAR_CONTRATO',
  'CONSULTAR_FINANCEIRO',
  'ENVIAR_FATURA',
  'VERIFICAR_DESBLOQUEIO_CONFIANCA',
  'EXECUTAR_DESBLOQUEIO_CONFIANCA',
  'CONSULTAR_SESSAO_ACESSO',
  'DESCONECTAR_SESSAO_ACESSO',
  'CRIAR_ORDEM_SERVICO',
  'SOLICITAR_FORMULARIO_WHATSAPP',
  'VISUALIZAR_FLUXO',
  'EDITAR_FLUXO',
  'TESTAR_FLUXO',
  'PUBLICAR_FLUXO',
  'REVERTER_FLUXO',
  'VISUALIZAR_HISTORICO_TRANSVERSAL',
  'VISUALIZAR_NOTAS_TRANSVERSAIS',
  'VISUALIZAR_DADO_SENSIVEL',
  'EXPORTAR_HISTORICO',
  'ADMINISTRAR_USUARIOS',
  'ADMINISTRAR_FILAS',
  'ADMINISTRAR_INTEGRACOES',
  'ADMINISTRAR_RELEASES'
);

-- CreateEnum
CREATE TYPE "estado_fila" AS ENUM ('ATIVA', 'INATIVA');

-- CreateEnum
CREATE TYPE "estado_acesso_fila" AS ENUM ('ATIVO', 'REVOGADO');

-- CreateTable
CREATE TABLE "perfil_acesso" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "nome_normalizado" VARCHAR(120) NOT NULL,
    "papel_base" "papel_base" NOT NULL,
    "estado" "estado_perfil_acesso" NOT NULL DEFAULT 'ATIVO',
    "inativado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfil_acesso_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "perfil_acesso_nome_check"
      CHECK (char_length(btrim("nome")) BETWEEN 1 AND 120),
    CONSTRAINT "perfil_acesso_nome_normalizado_check"
      CHECK ("nome_normalizado" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CONSTRAINT "perfil_acesso_estado_check"
      CHECK (
        ("estado" = 'ATIVO' AND "inativado_em" IS NULL)
        OR ("estado" = 'INATIVO' AND "inativado_em" IS NOT NULL)
      )
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "nome_exibicao" VARCHAR(160) NOT NULL,
    "estado" "estado_usuario" NOT NULL DEFAULT 'ATIVO',
    "perfil_id" UUID,
    "inativado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usuario_nome_exibicao_check"
      CHECK (char_length(btrim("nome_exibicao")) BETWEEN 1 AND 160),
    CONSTRAINT "usuario_estado_check"
      CHECK (
        ("estado" = 'ATIVO' AND "inativado_em" IS NULL)
        OR ("estado" = 'INATIVO' AND "inativado_em" IS NOT NULL)
      )
);

-- CreateTable
CREATE TABLE "permissao_perfil" (
    "perfil_id" UUID NOT NULL,
    "codigo" "codigo_permissao" NOT NULL,
    "efeito" "efeito_permissao_perfil" NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissao_perfil_pkey" PRIMARY KEY ("perfil_id", "codigo")
);

-- CreateTable
CREATE TABLE "fila" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "nome_normalizado" VARCHAR(120) NOT NULL,
    "estado" "estado_fila" NOT NULL DEFAULT 'ATIVA',
    "inativada_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fila_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fila_nome_check"
      CHECK (char_length(btrim("nome")) BETWEEN 1 AND 120),
    CONSTRAINT "fila_nome_normalizado_check"
      CHECK ("nome_normalizado" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CONSTRAINT "fila_estado_check"
      CHECK (
        ("estado" = 'ATIVA' AND "inativada_em" IS NULL)
        OR ("estado" = 'INATIVA' AND "inativada_em" IS NOT NULL)
      )
);

-- CreateTable
CREATE TABLE "acesso_usuario_fila" (
    "usuario_id" UUID NOT NULL,
    "fila_id" UUID NOT NULL,
    "estado" "estado_acesso_fila" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogado_em" TIMESTAMPTZ(6),

    CONSTRAINT "acesso_usuario_fila_pkey" PRIMARY KEY ("usuario_id", "fila_id"),
    CONSTRAINT "acesso_usuario_fila_estado_check"
      CHECK (
        ("estado" = 'ATIVO' AND "revogado_em" IS NULL)
        OR ("estado" = 'REVOGADO' AND "revogado_em" IS NOT NULL)
      )
);

-- CreateIndex
CREATE UNIQUE INDEX "perfil_acesso_nome_normalizado_key"
ON "perfil_acesso"("nome_normalizado");

-- CreateIndex
CREATE INDEX "perfil_acesso_papel_estado_idx"
ON "perfil_acesso"("papel_base", "estado");

-- CreateIndex
CREATE INDEX "usuario_estado_nome_idx" ON "usuario"("estado", "nome_exibicao");

-- CreateIndex
CREATE INDEX "usuario_perfil_idx" ON "usuario"("perfil_id");

-- CreateIndex
CREATE INDEX "permissao_perfil_codigo_efeito_idx"
ON "permissao_perfil"("codigo", "efeito");

-- CreateIndex
CREATE UNIQUE INDEX "fila_nome_normalizado_key" ON "fila"("nome_normalizado");

-- CreateIndex
CREATE INDEX "fila_estado_nome_idx" ON "fila"("estado", "nome");

-- CreateIndex
CREATE INDEX "acesso_usuario_fila_fila_estado_idx"
ON "acesso_usuario_fila"("fila_id", "estado", "usuario_id");

-- AddForeignKey
ALTER TABLE "usuario"
ADD CONSTRAINT "usuario_perfil_id_fkey"
FOREIGN KEY ("perfil_id") REFERENCES "perfil_acesso"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissao_perfil"
ADD CONSTRAINT "permissao_perfil_perfil_id_fkey"
FOREIGN KEY ("perfil_id") REFERENCES "perfil_acesso"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso_usuario_fila"
ADD CONSTRAINT "acesso_usuario_fila_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso_usuario_fila"
ADD CONSTRAINT "acesso_usuario_fila_fila_id_fkey"
FOREIGN KEY ("fila_id") REFERENCES "fila"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
