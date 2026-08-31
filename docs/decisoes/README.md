# Portão Zero — índice de decisões

Status do portão: **FECHADO EM 2026-08-30**.

Patrick Dias, responsável do projeto, aprovou as oito decisões técnicas. Essa aprovação não substitui validação jurídica/DPO ou caracterização de ERP declarada como condição externa: nesses casos, o recurso continua desligado até a evidência exigida.

| ID | Decisão | Status | Escopo ou condição preservada |
|---|---|---|---|
| 0001 | [Visibilidade de histórico e notas](0001-visibilidade-historico-e-notas.md) | APROVADA | Produto + compliance interno |
| 0002 | [Matriz de risco das ações ERP](0002-matriz-risco-acoes-erp.md) | APROVADA | Produto + segurança |
| 0003 | [Reabertura após encerramento pelo fluxo](0003-reabertura-apos-encerramento-fluxo.md) | APROVADA | Produto + operação |
| 0004 | [Retenção, LGPD e link de transcrição](0004-retencao-lgpd-e-link-transcricao.md) | APROVADA | Liberação continua condicionada a jurídico/DPO |
| 0005 | [Senha e MFA](0005-politica-senha-e-mfa.md) | APROVADA | Segurança + produto |
| 0006 | [Limites de mídia, QR e rate limit](0006-limites-midia-qr-e-rate-limit.md) | APROVADA | Segurança + operação |
| 0007 | [Disparos transacionais pelo ERP](0007-disparos-transacionais-erp.md) | APROVADA | Liberação continua condicionada a ERP + jurídico/DPO |
| 0008 | [Validade da autorização offline](0008-validade-autorizacao-offline.md) | APROVADA | Segurança + dono dos dados |

## Regra de aprovação

Ao aprovar ou rejeitar uma decisão:

1. alterar o status no arquivo e nesta tabela;
2. registrar responsável e data;
3. atualizar os documentos normativos afetados no mesmo PR;
4. adicionar testes/flags exigidos pela decisão ao PR correspondente do `ROADMAP.md`.

O Portão Zero está fechado porque os oito itens estão `APROVADA` e as condições externas possuem comportamento `default deny` explícito, sem lacuna implícita.
