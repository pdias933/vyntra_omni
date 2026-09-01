ALTER TYPE "codigo_permissao" ADD VALUE IF NOT EXISTS 'ENVIAR_MENSAGEM';

CREATE TYPE "direcao_mensagem" AS ENUM ('ENTRADA', 'SAIDA');
CREATE TYPE "tipo_mensagem" AS ENUM ('TEXTO', 'IMAGEM', 'AUDIO', 'VIDEO', 'PDF', 'INTERATIVA', 'MODELO_APROVADO', 'REACAO');
CREATE TYPE "estado_saida_mensagem" AS ENUM ('NA_FILA', 'ENVIANDO', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU', 'CANCELADA');

CREATE TABLE "mensagem" (
  "id" UUID NOT NULL,
  "conversa_id" UUID NOT NULL,
  "atendimento_id" UUID NOT NULL,
  "conta_whatsapp_id" UUID NOT NULL,
  "direcao" "direcao_mensagem" NOT NULL,
  "tipo" "tipo_mensagem" NOT NULL,
  "estado_saida" "estado_saida_mensagem",
  "conteudo_protegido" JSONB NOT NULL,
  "conteudo_hash" CHAR(64) NOT NULL,
  "identificador_externo_mensagem" VARCHAR(256),
  "mensagem_cliente_id" UUID,
  "responde_a_mensagem_id" UUID,
  "mensagem_alvo_reacao_id" UUID,
  "usuario_remetente_id" UUID,
  "contato_remetente_id" UUID,
  "criada_dispositivo_em" TIMESTAMPTZ(6),
  "recebida_servidor_em" TIMESTAMPTZ(6) NOT NULL,
  "proxima_tentativa_em" TIMESTAMPTZ(6),
  "tentativas_envio" INTEGER NOT NULL DEFAULT 0,
  "enviada_em" TIMESTAMPTZ(6),
  "entregue_em" TIMESTAMPTZ(6),
  "lida_em" TIMESTAMPTZ(6),
  "falhou_em" TIMESTAMPTZ(6),
  "cancelada_em" TIMESTAMPTZ(6),
  "codigo_falha" VARCHAR(100),
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "mensagem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mensagem_direcao_check" CHECK (
    ("direcao" = 'ENTRADA' AND "estado_saida" IS NULL AND "contato_remetente_id" IS NOT NULL AND "usuario_remetente_id" IS NULL AND "identificador_externo_mensagem" IS NOT NULL)
    OR
    ("direcao" = 'SAIDA' AND "estado_saida" IS NOT NULL AND "contato_remetente_id" IS NULL)
  ),
  CONSTRAINT "mensagem_estado_saida_check" CHECK (
    "direcao" = 'ENTRADA'
    OR ("estado_saida" IN ('NA_FILA', 'ENVIANDO') AND "enviada_em" IS NULL AND "entregue_em" IS NULL AND "lida_em" IS NULL AND "falhou_em" IS NULL AND "cancelada_em" IS NULL)
    OR ("estado_saida" = 'ENVIADA' AND "identificador_externo_mensagem" IS NOT NULL AND "enviada_em" IS NOT NULL AND "entregue_em" IS NULL AND "lida_em" IS NULL AND "falhou_em" IS NULL AND "cancelada_em" IS NULL)
    OR ("estado_saida" = 'ENTREGUE' AND "identificador_externo_mensagem" IS NOT NULL AND "enviada_em" IS NOT NULL AND "entregue_em" IS NOT NULL AND "lida_em" IS NULL AND "falhou_em" IS NULL AND "cancelada_em" IS NULL)
    OR ("estado_saida" = 'LIDA' AND "identificador_externo_mensagem" IS NOT NULL AND "enviada_em" IS NOT NULL AND "entregue_em" IS NOT NULL AND "lida_em" IS NOT NULL AND "falhou_em" IS NULL AND "cancelada_em" IS NULL)
    OR ("estado_saida" = 'FALHOU' AND "falhou_em" IS NOT NULL AND "cancelada_em" IS NULL)
    OR ("estado_saida" = 'CANCELADA' AND "cancelada_em" IS NOT NULL AND "enviada_em" IS NULL AND "entregue_em" IS NULL AND "lida_em" IS NULL AND "falhou_em" IS NULL)
  ),
  CONSTRAINT "mensagem_limites_check" CHECK (
    "versao" >= 1 AND "tentativas_envio" >= 0
    AND "conteudo_hash" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("conteudo_protegido") = 'object'
    AND ("criada_dispositivo_em" IS NULL OR "criada_dispositivo_em" <= "recebida_servidor_em")
    AND ("enviada_em" IS NULL OR "enviada_em" >= "recebida_servidor_em")
    AND ("entregue_em" IS NULL OR "entregue_em" >= "enviada_em")
    AND ("lida_em" IS NULL OR "lida_em" >= "entregue_em")
  ),
  CONSTRAINT "mensagem_conversa_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversa"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "mensagem_atendimento_conversa_fkey" FOREIGN KEY ("atendimento_id", "conversa_id") REFERENCES "atendimento"("id", "conversa_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "mensagem_conta_fkey" FOREIGN KEY ("conta_whatsapp_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "mensagem_usuario_remetente_fkey" FOREIGN KEY ("usuario_remetente_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "mensagem_contato_remetente_fkey" FOREIGN KEY ("contato_remetente_id") REFERENCES "contato"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "mensagem_resposta_fkey" FOREIGN KEY ("responde_a_mensagem_id") REFERENCES "mensagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "mensagem_reacao_alvo_fkey" FOREIGN KEY ("mensagem_alvo_reacao_id") REFERENCES "mensagem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "mensagem_conta_identificador_externo_key" ON "mensagem"("conta_whatsapp_id", "identificador_externo_mensagem") WHERE "identificador_externo_mensagem" IS NOT NULL;
CREATE UNIQUE INDEX "mensagem_usuario_cliente_key" ON "mensagem"("usuario_remetente_id", "mensagem_cliente_id") WHERE "usuario_remetente_id" IS NOT NULL AND "mensagem_cliente_id" IS NOT NULL;
CREATE INDEX "mensagem_conversa_recebida_idx" ON "mensagem"("conversa_id", "recebida_servidor_em", "id");
CREATE INDEX "mensagem_atendimento_recebida_idx" ON "mensagem"("atendimento_id", "recebida_servidor_em", "id");
CREATE INDEX "mensagem_saida_pendente_idx" ON "mensagem"("estado_saida", "proxima_tentativa_em", "recebida_servidor_em");

CREATE FUNCTION proteger_identidade_mensagem() RETURNS trigger AS $$
BEGIN
  IF NEW."conversa_id" <> OLD."conversa_id"
    OR NEW."atendimento_id" <> OLD."atendimento_id"
    OR NEW."conta_whatsapp_id" <> OLD."conta_whatsapp_id"
    OR NEW."direcao" <> OLD."direcao"
    OR NEW."tipo" <> OLD."tipo"
    OR NEW."conteudo_protegido" <> OLD."conteudo_protegido"
    OR NEW."conteudo_hash" <> OLD."conteudo_hash"
    OR NEW."mensagem_cliente_id" IS DISTINCT FROM OLD."mensagem_cliente_id"
    OR NEW."responde_a_mensagem_id" IS DISTINCT FROM OLD."responde_a_mensagem_id"
    OR NEW."mensagem_alvo_reacao_id" IS DISTINCT FROM OLD."mensagem_alvo_reacao_id"
    OR NEW."usuario_remetente_id" IS DISTINCT FROM OLD."usuario_remetente_id"
    OR NEW."contato_remetente_id" IS DISTINCT FROM OLD."contato_remetente_id"
    OR NEW."criada_dispositivo_em" IS DISTINCT FROM OLD."criada_dispositivo_em"
    OR NEW."recebida_servidor_em" <> OLD."recebida_servidor_em"
  THEN RAISE EXCEPTION 'IDENTIDADE_MENSAGEM_IMUTAVEL' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "mensagem_proteger_identidade" BEFORE UPDATE ON "mensagem" FOR EACH ROW EXECUTE FUNCTION proteger_identidade_mensagem();

CREATE FUNCTION validar_transicao_estado_mensagem() RETURNS trigger AS $$
BEGIN
  IF OLD."direcao" = 'SAIDA' AND NEW."estado_saida" IS DISTINCT FROM OLD."estado_saida" AND NOT (
    (OLD."estado_saida" = 'NA_FILA' AND NEW."estado_saida" IN ('ENVIANDO', 'CANCELADA'))
    OR (OLD."estado_saida" = 'ENVIANDO' AND NEW."estado_saida" IN ('NA_FILA', 'ENVIADA', 'FALHOU'))
    OR (OLD."estado_saida" = 'ENVIADA' AND NEW."estado_saida" = 'ENTREGUE')
    OR (OLD."estado_saida" = 'ENTREGUE' AND NEW."estado_saida" = 'LIDA')
  ) THEN
    RAISE EXCEPTION 'TRANSICAO_ESTADO_MENSAGEM_INVALIDA: % -> %', OLD."estado_saida", NEW."estado_saida"
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "mensagem_validar_transicao_estado" BEFORE UPDATE ON "mensagem" FOR EACH ROW EXECUTE FUNCTION validar_transicao_estado_mensagem();
