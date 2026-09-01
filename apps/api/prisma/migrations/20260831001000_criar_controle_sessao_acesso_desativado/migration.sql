INSERT INTO "controle_recurso" (
  "id",
  "codigo",
  "estado",
  "desligado_emergencialmente",
  "liberar_administradores",
  "percentual_liberacao",
  "versao"
)
VALUES (
  '11111111-1111-4111-8111-111111111121',
  'SESSAO_ACESSO',
  'DESATIVADO',
  FALSE,
  FALSE,
  0,
  0
)
ON CONFLICT ("codigo") DO NOTHING;
