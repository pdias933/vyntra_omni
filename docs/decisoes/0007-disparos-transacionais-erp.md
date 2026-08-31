# 0007 — Disparos transacionais pelo ERP

- Status: **APROVADA**
- Data da proposta: 2026-08-29
- Data da aprovação técnica: 2026-08-30
- Responsável pela aprovação técnica: Patrick Dias — responsável do projeto
- Afeta: `INTEGRATIONS.md`, consentimento, Meta e callbacks

## Decisão técnica aprovada

- Cada requisição cria no máximo uma mensagem. Lote/campanha continua fora da V1.
- Autenticação máquina-a-máquina usa credencial própria por ambiente, escopo mínimo, TLS, rotação e allowlist de rede opcional.
- `chave_idempotencia` é obrigatória. Mesma chave e mesmo corpo retornam o mesmo `disparo_id`; corpo diferente retorna conflito `409`.
- Resposta inicial é `202`, com `disparo_id` e estado `NA_FILA`; envio nunca é tratado como síncrono.
- Callback não aceita URL arbitrária na requisição. Usa `callback_id` previamente cadastrado/permitido, assinatura e eventos idempotentes. Consulta autenticada por `GET` é fallback obrigatório.
- Estados normalizados: `NA_FILA`, `ENVIADA`, `ENTREGUE`, `LIDA` e `FALHOU`.
- Finalidade pertence a allowlist transacional; política de consentimento/opt-out é verificada antes de entrar na fila.
- Registro de idempotência dura pelo menos tanto quanto a mensagem resultante.

## Validações externas obrigatórias

Capacidade real do ERP para autenticação/callback e a política de consentimento/base legal precisam ser confirmadas. Nenhum DTO ou endpoint do MK é presumido por esta decisão.

## Condição externa de liberação

A aprovação técnica não presume capacidade do ERP nem base legal. Endpoint e callback permanecem desligados até validar autenticação/callback reais, finalidade, consentimento e opt-out com ERP e jurídico/DPO. Simuladores podem cobrir o contrato interno sem disparo real.
