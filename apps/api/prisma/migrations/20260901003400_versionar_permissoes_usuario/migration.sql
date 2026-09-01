ALTER TABLE "usuario"
  ADD COLUMN "versao_permissoes" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "usuario"
  ADD CONSTRAINT "usuario_versao_permissoes_check"
  CHECK ("versao_permissoes" >= 1);
