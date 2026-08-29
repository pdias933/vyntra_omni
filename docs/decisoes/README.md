# Portão Zero — índice de decisões

Status do portão: **ABERTO**.

Os documentos abaixo são propostas conservadoras preparadas para aprovação do responsável do produto. Enquanto uma proposta não estiver `APROVADA`, vale o comportamento seguro descrito nela: negar, limitar ou manter o recurso desligado.

| ID | Decisão | Status | Aprovação necessária |
|---|---|---|---|
| 0001 | [Visibilidade de histórico e notas](0001-visibilidade-historico-e-notas.md) | PROPOSTA | Produto + compliance interno |
| 0002 | [Matriz de risco das ações ERP](0002-matriz-risco-acoes-erp.md) | PROPOSTA | Produto + segurança |
| 0003 | [Reabertura após encerramento pelo fluxo](0003-reabertura-apos-encerramento-fluxo.md) | PROPOSTA | Produto + operação |
| 0004 | [Retenção, LGPD e link de transcrição](0004-retencao-lgpd-e-link-transcricao.md) | PROPOSTA | Jurídico/DPO + produto |
| 0005 | [Senha e MFA](0005-politica-senha-e-mfa.md) | PROPOSTA | Segurança + produto |
| 0006 | [Limites de mídia, QR e rate limit](0006-limites-midia-qr-e-rate-limit.md) | PROPOSTA | Segurança + operação |
| 0007 | [Disparos transacionais pelo ERP](0007-disparos-transacionais-erp.md) | PROPOSTA | Produto + ERP + jurídico/DPO |
| 0008 | [Validade da autorização offline](0008-validade-autorizacao-offline.md) | PROPOSTA | Segurança + dono dos dados |

## Regra de aprovação

Ao aprovar ou rejeitar uma decisão:

1. alterar o status no arquivo e nesta tabela;
2. registrar responsável e data;
3. atualizar os documentos normativos afetados no mesmo PR;
4. adicionar testes/flags exigidos pela decisão ao PR correspondente do `ROADMAP.md`.

O Portão Zero fecha somente quando os oito itens estiverem `APROVADA` ou `NEGADA/DESATIVADA`, sem lacuna implícita.
