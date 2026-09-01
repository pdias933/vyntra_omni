CREATE TYPE "visibilidade_nota_interna" AS ENUM ('SOMENTE_EQUIPE');

CREATE UNIQUE INDEX "atendimento_id_conversa_key" ON "atendimento"("id", "conversa_id");

CREATE TABLE "nota_interna" (
  "id" UUID NOT NULL,
  "conversa_id" UUID NOT NULL,
  "atendimento_id" UUID NOT NULL,
  "autor_usuario_id" UUID NOT NULL,
  "visibilidade" "visibilidade_nota_interna" NOT NULL DEFAULT 'SOMENTE_EQUIPE',
  "conteudo_protegido" JSONB NOT NULL,
  "criada_em" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "nota_interna_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nota_interna_conteudo_check" CHECK (
    jsonb_typeof("conteudo_protegido") = 'object'
    AND "conteudo_protegido" ? 'texto'
    AND jsonb_typeof("conteudo_protegido"->'texto') = 'string'
    AND char_length(btrim("conteudo_protegido"->>'texto')) BETWEEN 1 AND 4000
  ),
  CONSTRAINT "nota_interna_conversa_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversa"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "nota_interna_atendimento_conversa_fkey" FOREIGN KEY ("atendimento_id", "conversa_id") REFERENCES "atendimento"("id", "conversa_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "nota_interna_autor_fkey" FOREIGN KEY ("autor_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "nota_interna_conversa_criada_idx" ON "nota_interna"("conversa_id", "criada_em", "id");
CREATE INDEX "nota_interna_atendimento_criada_idx" ON "nota_interna"("atendimento_id", "criada_em", "id");
CREATE INDEX "nota_interna_autor_criada_idx" ON "nota_interna"("autor_usuario_id", "criada_em", "id");

CREATE FUNCTION proteger_nota_interna() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'NOTA_INTERNA_IMUTAVEL' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "nota_interna_proteger_alteracao" BEFORE UPDATE OR DELETE ON "nota_interna" FOR EACH ROW EXECUTE FUNCTION proteger_nota_interna();
CREATE TRIGGER "nota_interna_proteger_truncate" BEFORE TRUNCATE ON "nota_interna" FOR EACH STATEMENT EXECUTE FUNCTION proteger_nota_interna();
