DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "controle_recurso"
    WHERE "codigo" IN (
      'MK_CONSULTAS_CADASTRAIS_REAIS',
      'MK_CONSULTAS_FINANCEIRAS_REAIS'
    )
  ) THEN
    RAISE EXCEPTION 'CONTROLE_MK_PREEXISTENTE';
  END IF;
END;
$$;

INSERT INTO "controle_recurso" (
  "id",
  "codigo",
  "estado",
  "desligado_emergencialmente",
  "liberar_administradores",
  "percentual_liberacao",
  "versao"
)
VALUES
  (
    '11111111-1111-4111-8111-111111111122',
    'MK_CONSULTAS_CADASTRAIS_REAIS',
    'DESATIVADO',
    FALSE,
    FALSE,
    0,
    0
  ),
  (
    '11111111-1111-4111-8111-111111111123',
    'MK_CONSULTAS_FINANCEIRAS_REAIS',
    'DESATIVADO',
    FALSE,
    FALSE,
    0,
    0
  );
