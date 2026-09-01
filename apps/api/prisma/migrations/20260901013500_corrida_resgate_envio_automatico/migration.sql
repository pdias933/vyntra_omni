DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "mensagem" m
    JOIN "evento_dominio" e
      ON e."entidade_tipo" = 'MENSAGEM'
     AND e."entidade_id" = m."id"
     AND e."tipo" = 'MENSAGEM_AUTOMATICA_CRIADA'
    WHERE m."estado_saida" = 'ENVIANDO'
  ) THEN
    RAISE EXCEPTION 'MENSAGEM_AUTOMATICA_LEGADA_EM_ENVIO_REQUER_RECONCILIACAO';
  END IF;
END;
$$;

UPDATE "mensagem" m
SET
  "estado_saida" = 'CANCELADA',
  "cancelada_em" = GREATEST(CURRENT_TIMESTAMP, m."recebida_servidor_em"),
  "proxima_tentativa_em" = NULL,
  "versao" = m."versao" + 1
WHERE m."estado_saida" = 'NA_FILA'
  AND EXISTS (
    SELECT 1
    FROM "evento_dominio" e
    WHERE e."entidade_tipo" = 'MENSAGEM'
      AND e."entidade_id" = m."id"
      AND e."tipo" = 'MENSAGEM_AUTOMATICA_CRIADA'
  );

ALTER TABLE "mensagem"
  ADD COLUMN "execucao_fluxo_origem_id" UUID,
  ADD COLUMN "versao_atribuicao_origem" INTEGER;

ALTER TABLE "mensagem"
  ADD CONSTRAINT "mensagem_automacao_origem_check"
  CHECK (
    ("execucao_fluxo_origem_id" IS NULL AND "versao_atribuicao_origem" IS NULL)
    OR
    (
      "execucao_fluxo_origem_id" IS NOT NULL
      AND "versao_atribuicao_origem" >= 1
      AND "direcao" = 'SAIDA'
      AND "usuario_remetente_id" IS NULL
      AND "contato_remetente_id" IS NULL
      AND "mensagem_cliente_id" IS NULL
    )
  );

ALTER TABLE "mensagem"
  ADD CONSTRAINT "mensagem_execucao_fluxo_origem_fkey"
  FOREIGN KEY ("execucao_fluxo_origem_id")
  REFERENCES "execucao_fluxo"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX "mensagem_execucao_fluxo_estado_idx"
  ON "mensagem"("execucao_fluxo_origem_id", "estado_saida", "recebida_servidor_em");
