CREATE TABLE "conversa" (
  "id" UUID NOT NULL,
  "contato_id" UUID NOT NULL,
  "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultima_atividade_em" TIMESTAMPTZ(6) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "conversa_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversa_contato_key" UNIQUE ("contato_id"),
  CONSTRAINT "conversa_contato_fkey" FOREIGN KEY ("contato_id") REFERENCES "contato"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "conversa_versao_check" CHECK ("versao" >= 1),
  CONSTRAINT "conversa_datas_check" CHECK ("atualizada_em" >= "criada_em" AND "ultima_atividade_em" <= "atualizada_em")
);

CREATE TABLE "participacao_conta_conversa" (
  "conversa_id" UUID NOT NULL,
  "conta_whatsapp_id" UUID NOT NULL,
  "primeira_interacao_em" TIMESTAMPTZ(6) NOT NULL,
  "ultima_interacao_em" TIMESTAMPTZ(6) NOT NULL,
  "versao" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "participacao_conta_conversa_pkey" PRIMARY KEY ("conversa_id", "conta_whatsapp_id"),
  CONSTRAINT "participacao_conta_conversa_conversa_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversa"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "participacao_conta_conversa_conta_fkey" FOREIGN KEY ("conta_whatsapp_id") REFERENCES "conta_whatsapp"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "participacao_conta_conversa_datas_check" CHECK ("primeira_interacao_em" <= "ultima_interacao_em"),
  CONSTRAINT "participacao_conta_conversa_versao_check" CHECK ("versao" >= 1)
);

CREATE INDEX "conversa_ultima_atividade_idx"
  ON "conversa"("ultima_atividade_em", "id");
CREATE INDEX "participacao_conta_conversa_conta_atividade_idx"
  ON "participacao_conta_conversa"("conta_whatsapp_id", "ultima_interacao_em", "conversa_id");
