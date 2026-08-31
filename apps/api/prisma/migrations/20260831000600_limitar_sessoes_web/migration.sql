ALTER TABLE "sessao_web"
  ADD COLUMN "ultima_atividade_em" TIMESTAMPTZ(6),
  ADD COLUMN "motivo_revogacao" VARCHAR(80);

UPDATE "sessao_web"
SET "ultima_atividade_em" = GREATEST(
  "autenticada_em",
  COALESCE("rotacionada_em", "autenticada_em")
);

UPDATE "sessao_web"
SET "motivo_revogacao" = 'LEGADO'
WHERE "estado" = 'REVOGADA';

ALTER TABLE "sessao_web"
  ALTER COLUMN "ultima_atividade_em" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "ultima_atividade_em" SET NOT NULL;

ALTER TABLE "sessao_web"
  ADD CONSTRAINT "sessao_web_atividade_expiracao_check"
  CHECK ("expira_em" > "ultima_atividade_em"),
  ADD CONSTRAINT "sessao_web_motivo_revogacao_check"
  CHECK (
    ("estado" = 'ATIVA' AND "motivo_revogacao" IS NULL)
    OR ("estado" = 'REVOGADA' AND "motivo_revogacao" IS NOT NULL)
  );

CREATE INDEX "sessao_web_usuario_atividade_idx"
  ON "sessao_web"("usuario_id", "estado", "ultima_atividade_em", "criado_em");
