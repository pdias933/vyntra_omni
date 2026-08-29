# 0005 — Política de senha e MFA

- Status: **PROPOSTA**
- Data da proposta: 2026-08-29
- Responsável pela aprovação: pendente
- Afeta: `SECURITY.md`, autenticação, recuperação e operação

## Decisão proposta

- Senha entre 12 e 128 caracteres, aceitando espaços e sem composição artificial obrigatória.
- Bloquear senhas comuns ou conhecidamente comprometidas; não exigir troca periódica sem indício de risco.
- Armazenar com Argon2id calibrado entre 100 e 250 ms no servidor. Ponto inicial de teste: 64 MiB, 3 iterações e paralelismo 1.
- MFA obrigatório para Administrador e qualquer usuário que administre usuários/integrações, publique fluxo ou exporte histórico.
- TOTP e códigos de recuperação de uso único na V1. SMS ou WhatsApp não são fator único.
- WebAuthn pode ser acrescentado depois por decisão própria, sem enfraquecer TOTP existente.
- Exigir reautenticação realizada há no máximo 10 minutos para ação administrativa crítica e confirmação de novo aparelho.
- Recuperação invalida sessões/refresh tokens e gera auditoria/alerta ao usuário.

## Ponto operacional pendente

MFA obrigatório para todos os atendentes depende de decisão operacional. A proposta do piloto obriga inicialmente apenas usuários privilegiados.

## Comportamento até aprovação

Autenticação real e piloto permanecem bloqueados; nenhum requisito de senha/MFA diferente deve ser codificado como definitivo.
