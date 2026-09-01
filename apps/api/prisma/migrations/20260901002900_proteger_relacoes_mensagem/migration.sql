CREATE FUNCTION validar_relacoes_mensagem() RETURNS trigger AS $$
DECLARE
  alvo RECORD;
BEGIN
  IF NEW."responde_a_mensagem_id" IS NOT NULL AND NEW."mensagem_alvo_reacao_id" IS NOT NULL THEN
    RAISE EXCEPTION 'RELACAO_MENSAGEM_AMBIGUA' USING ERRCODE = '23514';
  END IF;
  IF NEW."tipo" = 'REACAO' AND NEW."mensagem_alvo_reacao_id" IS NULL THEN
    RAISE EXCEPTION 'REACAO_SEM_ALVO' USING ERRCODE = '23514';
  END IF;
  IF NEW."tipo" <> 'REACAO' AND NEW."mensagem_alvo_reacao_id" IS NOT NULL THEN
    RAISE EXCEPTION 'ALVO_REACAO_EM_TIPO_INVALIDO' USING ERRCODE = '23514';
  END IF;

  IF NEW."responde_a_mensagem_id" IS NOT NULL THEN
    SELECT "conversa_id", "conta_whatsapp_id" INTO alvo FROM "mensagem" WHERE "id" = NEW."responde_a_mensagem_id";
    IF NOT FOUND OR NEW."id" = NEW."responde_a_mensagem_id"
      OR alvo."conversa_id" <> NEW."conversa_id"
      OR alvo."conta_whatsapp_id" <> NEW."conta_whatsapp_id"
    THEN RAISE EXCEPTION 'ALVO_RESPOSTA_FORA_DO_CONTEXTO' USING ERRCODE = '23514'; END IF;
  END IF;

  IF NEW."mensagem_alvo_reacao_id" IS NOT NULL THEN
    SELECT "conversa_id", "conta_whatsapp_id" INTO alvo FROM "mensagem" WHERE "id" = NEW."mensagem_alvo_reacao_id";
    IF NOT FOUND OR NEW."id" = NEW."mensagem_alvo_reacao_id"
      OR alvo."conversa_id" <> NEW."conversa_id"
      OR alvo."conta_whatsapp_id" <> NEW."conta_whatsapp_id"
    THEN RAISE EXCEPTION 'ALVO_REACAO_FORA_DO_CONTEXTO' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "mensagem_validar_relacoes" BEFORE INSERT OR UPDATE ON "mensagem" FOR EACH ROW EXECUTE FUNCTION validar_relacoes_mensagem();
