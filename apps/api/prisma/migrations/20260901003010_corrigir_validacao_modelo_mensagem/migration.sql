ALTER TABLE "modelo_mensagem_canal" DROP CONSTRAINT "modelo_mensagem_canal_limites_check";
ALTER TABLE "modelo_mensagem_canal" ADD CONSTRAINT "modelo_mensagem_canal_limites_check" CHECK (
  char_length("nome") BETWEEN 1 AND 512
  AND "nome" ~ '^[a-z0-9_]+$'
  AND "idioma" ~ '^[a-z]{2,3}(_[A-Z]{2})?$'
  AND char_length(btrim("referencia_canal")) BETWEEN 1 AND 256
  AND "quantidade_parametros" BETWEEN 0 AND 100
  AND "componentes_hash" ~ '^[0-9a-f]{64}$'
  AND jsonb_typeof("componentes_protegidos") = 'object'
  AND "versao" >= 1
);
