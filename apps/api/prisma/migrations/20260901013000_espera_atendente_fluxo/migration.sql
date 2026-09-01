ALTER TABLE "execucao_fluxo"
  DROP CONSTRAINT "execucao_fluxo_agendamento_check";

ALTER TABLE "execucao_fluxo"
  ADD CONSTRAINT "execucao_fluxo_agendamento_check" CHECK (
    "retomar_em" IS NULL
    OR (
      "estado" IN (
        'AGUARDANDO_SISTEMA'::"estado_execucao_fluxo",
        'AGUARDANDO_RESPOSTA'::"estado_execucao_fluxo",
        'AGUARDANDO_ATENDENTE'::"estado_execucao_fluxo"
      )
      AND "retomar_em" > "atualizada_em"
      AND (
        "estado" = 'AGUARDANDO_SISTEMA'::"estado_execucao_fluxo"
        OR (
          "estado" = 'AGUARDANDO_RESPOSTA'::"estado_execucao_fluxo"
          AND "contexto_protegido" #>> ARRAY[
            'esperasFluxo',
            "no_atual_id",
            'tipo'
          ] = 'RESPOSTA'
          AND "contexto_protegido" #>> ARRAY[
            'esperasFluxo',
            "no_atual_id",
            'respostaRecebida'
          ] = 'false'
          AND (
            "contexto_protegido" #>> ARRAY[
              'esperasFluxo',
              "no_atual_id",
              'retomarEm'
            ]
          )::timestamptz = "retomar_em"
        )
        OR (
          "estado" = 'AGUARDANDO_ATENDENTE'::"estado_execucao_fluxo"
          AND "contexto_protegido" #>> ARRAY[
            'esperasFluxo',
            "no_atual_id",
            'tipo'
          ] = 'ATENDENTE'
          AND "contexto_protegido" #>> ARRAY[
            'esperasFluxo',
            "no_atual_id",
            'respostaRecebida'
          ] = 'false'
          AND (
            "contexto_protegido" #>> ARRAY[
              'esperasFluxo',
              "no_atual_id",
              'retomarEm'
            ]
          )::timestamptz = "retomar_em"
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION proteger_maquina_execucao_fluxo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EXECUCAO_FLUXO_NAO_PODE_SER_EXCLUIDA';
  END IF;

  IF OLD."estado" IN (
    'SUSPENSA_POR_ATENDIMENTO_HUMANO',
    'CONCLUIDA',
    'FALHOU',
    'CANCELADA'
  ) THEN
    RAISE EXCEPTION 'EXECUCAO_FLUXO_TERMINAL_IMUTAVEL';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."atendimento_id" IS DISTINCT FROM OLD."atendimento_id"
    OR NEW."fluxo_id" IS DISTINCT FROM OLD."fluxo_id"
    OR NEW."versao_fluxo_id" IS DISTINCT FROM OLD."versao_fluxo_id"
    OR NEW."iniciada_em" IS DISTINCT FROM OLD."iniciada_em"
  THEN
    RAISE EXCEPTION 'IDENTIDADE_EXECUCAO_FLUXO_IMUTAVEL';
  END IF;

  IF NEW."revisao" <> OLD."revisao" + 1
    OR NEW."atualizada_em" < OLD."atualizada_em"
  THEN
    RAISE EXCEPTION 'REVISAO_EXECUCAO_FLUXO_INVALIDA';
  END IF;

  IF OLD."estado" IN (
      'AGUARDANDO_SISTEMA',
      'AGUARDANDO_RESPOSTA',
      'AGUARDANDO_ATENDENTE'
    )
    AND OLD."retomar_em" IS NOT NULL
    AND NEW."estado" = 'EXECUTANDO'
    AND NEW."atualizada_em" < OLD."retomar_em"
    AND NOT (
      OLD."estado" = 'AGUARDANDO_RESPOSTA'
      AND NEW."contexto_protegido" #>> ARRAY[
        'esperasFluxo',
        OLD."no_atual_id",
        'respostaRecebida'
      ] = 'true'
    )
  THEN
    RAISE EXCEPTION 'RETOMADA_EXECUCAO_FLUXO_PREMATURA';
  END IF;

  IF (OLD."estado" = 'EXECUTANDO' AND NEW."estado" NOT IN (
      'EXECUTANDO',
      'AGUARDANDO_RESPOSTA',
      'AGUARDANDO_SISTEMA',
      'AGUARDANDO_ATENDENTE',
      'SUSPENSA_POR_ATENDIMENTO_HUMANO',
      'CONCLUIDA',
      'FALHOU',
      'CANCELADA'
    )) OR (OLD."estado" = 'AGUARDANDO_RESPOSTA' AND NEW."estado" NOT IN (
      'EXECUTANDO',
      'SUSPENSA_POR_ATENDIMENTO_HUMANO',
      'CANCELADA'
    )) OR (OLD."estado" = 'AGUARDANDO_SISTEMA' AND NEW."estado" NOT IN (
      'EXECUTANDO',
      'SUSPENSA_POR_ATENDIMENTO_HUMANO',
      'FALHOU',
      'CANCELADA'
    )) OR (OLD."estado" = 'AGUARDANDO_ATENDENTE' AND NEW."estado" NOT IN (
      'EXECUTANDO',
      'SUSPENSA_POR_ATENDIMENTO_HUMANO',
      'CANCELADA'
    ))
  THEN
    RAISE EXCEPTION 'TRANSICAO_EXECUCAO_FLUXO_INVALIDA';
  END IF;

  RETURN NEW;
END;
$$;
