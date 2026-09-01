CREATE TABLE "composicao_segunda_via" (
  "id" UUID NOT NULL,
  "conta_whatsapp_id" UUID NOT NULL,
  "contato_id" UUID NOT NULL,
  "referencia_fatura" VARCHAR(256) NOT NULL,
  "valor_centavos" BIGINT NOT NULL,
  "vencimento" DATE NOT NULL,
  "documento_midia_mensagem_id" UUID,
  "inclui_pdf" BOOLEAN NOT NULL DEFAULT false,
  "inclui_pix" BOOLEAN NOT NULL DEFAULT false,
  "inclui_linha_digitavel" BOOLEAN NOT NULL DEFAULT false,
  "inclui_link_seguro" BOOLEAN NOT NULL DEFAULT false,
  "opcoes_protegidas" JSONB NOT NULL,
  "opcoes_hash" CHAR(64) NOT NULL,
  "criada_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "composicao_segunda_via_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "composicao_segunda_via_conta_fkey" FOREIGN KEY ("conta_whatsapp_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "composicao_segunda_via_contato_fkey" FOREIGN KEY ("contato_id") REFERENCES "contato"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "composicao_segunda_via_documento_fkey" FOREIGN KEY ("documento_midia_mensagem_id") REFERENCES "midia_mensagem"("mensagem_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "composicao_segunda_via_limites_check" CHECK (
    char_length(btrim("referencia_fatura")) BETWEEN 1 AND 256
    AND "valor_centavos" > 0
    AND jsonb_typeof("opcoes_protegidas") = 'object'
    AND "opcoes_hash" ~ '^[0-9a-f]{64}$'
    AND "inclui_pdf" = ("documento_midia_mensagem_id" IS NOT NULL)
    AND "inclui_pix" = ("opcoes_protegidas" ? 'pixCopiaCola')
    AND "inclui_linha_digitavel" = ("opcoes_protegidas" ? 'linhaDigitavel')
    AND "inclui_link_seguro" = ("opcoes_protegidas" ? 'linkSeguro')
  )
);
CREATE INDEX "composicao_segunda_via_contato_criada_idx" ON "composicao_segunda_via"("contato_id", "criada_em", "id");
