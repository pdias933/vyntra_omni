ALTER TABLE "nota_interna" ADD COLUMN "fila_id" UUID;

UPDATE "nota_interna" nota
SET "fila_id" = (
  SELECT historico."fila_id"
  FROM "historico_atribuicao" historico
  WHERE historico."atendimento_id" = nota."atendimento_id"
    AND historico."fila_id" IS NOT NULL
    AND historico."iniciado_em" <= nota."criada_em"
    AND (historico."finalizado_em" IS NULL OR historico."finalizado_em" >= nota."criada_em")
  ORDER BY historico."iniciado_em" DESC, historico."id" DESC
  LIMIT 1
)
WHERE nota."fila_id" IS NULL;

ALTER TABLE "nota_interna"
  ADD CONSTRAINT "nota_interna_fila_fkey"
  FOREIGN KEY ("fila_id") REFERENCES "fila"("id") ON DELETE RESTRICT;

CREATE INDEX "nota_interna_fila_criada_idx"
  ON "nota_interna" ("fila_id", "criada_em", "id");
