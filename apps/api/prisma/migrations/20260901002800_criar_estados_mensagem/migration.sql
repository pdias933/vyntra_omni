CREATE TYPE "estado_evento_mensagem_canal" AS ENUM ('ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU');

CREATE TABLE "evento_estado_mensagem" (
  "id" UUID NOT NULL,
  "conta_whatsapp_id" UUID NOT NULL,
  "mensagem_id" UUID NOT NULL,
  "identificador_evento_externo" VARCHAR(256) NOT NULL,
  "estado" "estado_evento_mensagem_canal" NOT NULL,
  "codigo_falha" VARCHAR(100),
  "ocorrido_em" TIMESTAMPTZ(6) NOT NULL,
  "recebido_em" TIMESTAMPTZ(6) NOT NULL,
  "aplicado" BOOLEAN NOT NULL DEFAULT false,
  "aplicado_em" TIMESTAMPTZ(6),
  CONSTRAINT "evento_estado_mensagem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evento_estado_mensagem_aplicacao_check" CHECK (("aplicado" AND "aplicado_em" IS NOT NULL) OR (NOT "aplicado" AND "aplicado_em" IS NULL)),
  CONSTRAINT "evento_estado_mensagem_falha_check" CHECK (("estado" = 'FALHOU' AND "codigo_falha" IS NOT NULL) OR ("estado" <> 'FALHOU' AND "codigo_falha" IS NULL)),
  CONSTRAINT "evento_estado_mensagem_conta_fkey" FOREIGN KEY ("conta_whatsapp_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "evento_estado_mensagem_mensagem_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "mensagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "evento_estado_mensagem_conta_evento_key" ON "evento_estado_mensagem"("conta_whatsapp_id", "identificador_evento_externo");
CREATE INDEX "evento_estado_mensagem_mensagem_ocorrido_idx" ON "evento_estado_mensagem"("mensagem_id", "ocorrido_em", "id");

CREATE FUNCTION proteger_evento_estado_mensagem() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EVENTO_ESTADO_MENSAGEM_IMUTAVEL' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "evento_estado_mensagem_proteger_exclusao" BEFORE DELETE ON "evento_estado_mensagem" FOR EACH ROW EXECUTE FUNCTION proteger_evento_estado_mensagem();

CREATE FUNCTION proteger_evento_estado_mensagem_update() RETURNS trigger AS $$
BEGIN
  IF OLD."aplicado" OR NOT NEW."aplicado" OR NEW."aplicado_em" IS NULL
    OR NEW."id" <> OLD."id"
    OR NEW."conta_whatsapp_id" <> OLD."conta_whatsapp_id"
    OR NEW."mensagem_id" <> OLD."mensagem_id"
    OR NEW."identificador_evento_externo" <> OLD."identificador_evento_externo"
    OR NEW."estado" <> OLD."estado"
    OR NEW."codigo_falha" IS DISTINCT FROM OLD."codigo_falha"
    OR NEW."ocorrido_em" <> OLD."ocorrido_em"
    OR NEW."recebido_em" <> OLD."recebido_em"
  THEN RAISE EXCEPTION 'EVENTO_ESTADO_MENSAGEM_IMUTAVEL' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "evento_estado_mensagem_proteger_update" BEFORE UPDATE ON "evento_estado_mensagem" FOR EACH ROW EXECUTE FUNCTION proteger_evento_estado_mensagem_update();

CREATE OR REPLACE FUNCTION validar_transicao_estado_mensagem() RETURNS trigger AS $$
BEGIN
  IF OLD."direcao" = 'SAIDA' AND NEW."estado_saida" IS DISTINCT FROM OLD."estado_saida" AND NOT (
    (OLD."estado_saida" = 'NA_FILA' AND NEW."estado_saida" IN ('ENVIANDO', 'CANCELADA'))
    OR (OLD."estado_saida" = 'ENVIANDO' AND NEW."estado_saida" IN ('NA_FILA', 'ENVIADA', 'FALHOU'))
    OR (OLD."estado_saida" = 'ENVIADA' AND NEW."estado_saida" IN ('ENTREGUE', 'LIDA', 'FALHOU'))
    OR (OLD."estado_saida" = 'ENTREGUE' AND NEW."estado_saida" = 'LIDA')
  ) THEN
    RAISE EXCEPTION 'TRANSICAO_ESTADO_MENSAGEM_INVALIDA: % -> %', OLD."estado_saida", NEW."estado_saida"
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
