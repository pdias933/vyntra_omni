ALTER TYPE "codigo_permissao" ADD VALUE IF NOT EXISTS 'ALTERAR_DISPONIBILIDADE_PROPRIA';
ALTER TYPE "codigo_permissao" ADD VALUE IF NOT EXISTS 'ALTERAR_DISPONIBILIDADE_USUARIO';

CREATE TYPE "estado_disponibilidade_usuario" AS ENUM ('DISPONIVEL', 'INDISPONIVEL');

CREATE TABLE "disponibilidade_usuario" (
  "usuario_id" UUID NOT NULL,
  "estado" "estado_disponibilidade_usuario" NOT NULL DEFAULT 'INDISPONIVEL',
  "alterado_em" TIMESTAMPTZ(6) NOT NULL,
  "alterado_por_usuario_id" UUID NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "disponibilidade_usuario_pkey" PRIMARY KEY ("usuario_id"),
  CONSTRAINT "disponibilidade_usuario_usuario_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "disponibilidade_usuario_alterador_fkey" FOREIGN KEY ("alterado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "disponibilidade_usuario_versao_check" CHECK ("versao" >= 1)
);

CREATE INDEX "disponibilidade_usuario_estado_idx" ON "disponibilidade_usuario"("estado", "alterado_em", "usuario_id");
CREATE INDEX "disponibilidade_usuario_alterador_idx" ON "disponibilidade_usuario"("alterado_por_usuario_id", "alterado_em");

