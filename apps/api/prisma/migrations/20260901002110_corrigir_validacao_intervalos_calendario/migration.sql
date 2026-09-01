CREATE OR REPLACE FUNCTION validar_intervalo_calendario() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'periodo_semanal_calendario' THEN
    IF EXISTS (
      SELECT 1 FROM "periodo_semanal_calendario" p
      WHERE p."calendario_id" = NEW."calendario_id" AND p."dia_semana" = NEW."dia_semana"
        AND p."id" <> NEW."id" AND p."minuto_inicio" < NEW."minuto_fim" AND NEW."minuto_inicio" < p."minuto_fim"
    ) THEN RAISE EXCEPTION 'PERIODO_CALENDARIO_SOBREPOSTO' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'periodo_excecao_calendario' THEN
    IF EXISTS (
      SELECT 1 FROM "periodo_excecao_calendario" p
      WHERE p."excecao_id" = NEW."excecao_id" AND p."id" <> NEW."id"
        AND p."minuto_inicio" < NEW."minuto_fim" AND NEW."minuto_inicio" < p."minuto_fim"
    ) THEN RAISE EXCEPTION 'PERIODO_EXCECAO_SOBREPOSTO' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
