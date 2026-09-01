CREATE TYPE "estado_snapshot_cliente" AS ENUM ('ATUAL', 'OBSOLETO', 'EXCLUIDO');
CREATE TYPE "motivo_obsolescencia_snapshot_cliente" AS ENUM ('TOMBSTONE_ERP', 'AUSENTE_RECONCILIACAO_COMPLETA');

ALTER TABLE "snapshot_cliente"
  ADD COLUMN "estado" "estado_snapshot_cliente" NOT NULL DEFAULT 'ATUAL',
  ADD COLUMN "motivo_obsolescencia" "motivo_obsolescencia_snapshot_cliente",
  ADD COLUMN "obsoleto_em" TIMESTAMPTZ(6),
  ADD CONSTRAINT "snapshot_cliente_estado_check" CHECK (
    ("estado" = 'ATUAL' AND "motivo_obsolescencia" IS NULL AND "obsoleto_em" IS NULL)
    OR
    ("estado" = 'OBSOLETO' AND "motivo_obsolescencia" = 'AUSENTE_RECONCILIACAO_COMPLETA' AND "obsoleto_em" IS NOT NULL)
    OR
    ("estado" = 'EXCLUIDO' AND "motivo_obsolescencia" = 'TOMBSTONE_ERP' AND "obsoleto_em" IS NOT NULL)
  );

CREATE INDEX "snapshot_cliente_estado_idx"
  ON "snapshot_cliente"("estado", "obsoleto_em", "vinculo_cliente_id");
