CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "mensagem_busca_texto_pt_idx"
  ON "mensagem" USING GIN (to_tsvector('portuguese', coalesce("conteudo_protegido" ->> 'texto', '')))
  WHERE "tipo" <> 'REACAO';

CREATE INDEX "mensagem_galeria_conversa_tipo_recebida_idx"
  ON "mensagem" ("conversa_id", "tipo", "recebida_servidor_em" DESC, "id" DESC)
  WHERE "tipo" IN ('IMAGEM', 'AUDIO', 'VIDEO', 'PDF');

CREATE INDEX "mensagem_link_texto_trgm_idx"
  ON "mensagem" USING GIN (("conteudo_protegido" ->> 'texto') gin_trgm_ops)
  WHERE "tipo" = 'TEXTO' AND ("conteudo_protegido" ->> 'texto') IS NOT NULL;
