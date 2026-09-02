# 0005 — Política de senha e MFA

- Status: **APROVADA**
- Data da proposta: 2026-08-29
- Data da aprovação: 2026-08-30
- Responsável pela aprovação: Patrick Dias — responsável do projeto
- Afeta: `SECURITY.md`, autenticação, recuperação e operação

## Decisão aprovada

- Senha entre 12 e 128 caracteres, aceitando espaços e sem composição artificial obrigatória.
- Bloquear senhas comuns ou conhecidamente comprometidas; não exigir troca periódica sem indício de risco.
- Armazenar com Argon2id calibrado entre 100 e 250 ms no servidor. Ponto inicial de teste: 64 MiB, 3 iterações e paralelismo 1.
- MFA obrigatório para Administrador e qualquer usuário que administre usuários/integrações, publique fluxo ou exporte histórico.
- TOTP e códigos de recuperação de uso único na V1. SMS ou WhatsApp não são fator único.
- WebAuthn pode ser acrescentado depois por decisão própria, sem enfraquecer TOTP existente.
- Exigir reautenticação realizada há no máximo 10 minutos para ação administrativa crítica e confirmação de novo aparelho.
- Recuperação invalida sessões/refresh tokens e gera auditoria/alerta ao usuário.

## Decisão operacional da V1

MFA é obrigatório inicialmente para usuários privilegiados. Obrigá-lo para todos os atendentes poderá ser configurado depois sem reduzir esse piso.

## Regra de implementação

Autenticação real segue esta política. Parâmetros Argon2id são calibrados no hardware de produção dentro da faixa aprovada e registrados antes do piloto.

## Implementação da PR 096B

TOTP usa passo de 30 segundos, seis dígitos, tolerância de um passo e contador persistido para bloquear replay. O segredo é protegido por AES-256-GCM com chave fora do banco; códigos de recuperação são normalizados, armazenados somente por HMAC-SHA-256 e consumidos atomicamente. O primeiro Administrador de staging é criado por serviço one-shot, bloqueado fora de staging e sem exibir segredos. Não existe bypass temporário de MFA.
