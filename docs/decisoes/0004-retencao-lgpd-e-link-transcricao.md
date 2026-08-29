# 0004 — Retenção, LGPD e link de transcrição

- Status: **PROPOSTA PARCIAL — EXIGE JURÍDICO/DPO**
- Data da proposta: 2026-08-29
- Responsável pela aprovação: pendente
- Afeta: `SECURITY.md`, `OPERATIONS.md`, exportação e backups

## Limite desta decisão técnica

Prazos de histórico, mídia, auditoria e backups; bases legais; obrigações de eliminação; e conteúdo exportável precisam ser definidos pelo jurídico/DPO e pelo negócio. Engenharia não fecha esses pontos sozinha.

## Decisão técnica proposta

- Link público permanece desligado até aprovação jurídica.
- Ausência temporária de política não autoriza exclusão ad hoc nem torna retenção indefinida aceitável para o piloto.
- O sistema deve suportar categorias de retenção, bloqueio legal, anonimização/eliminação controlada e auditoria `RETENCAO_APLICADA`.
- Eventos disponíveis para sincronização incremental permanecem por 30 dias, conforme arquitetura; isso não define a retenção do histórico de negócio.
- Se o link for liberado: validade padrão de 72 horas e máxima de 7 dias; revogação imediata; token aleatório armazenado por HMAC; sem indexação; notas, formulários sensíveis e eventos internos sempre excluídos; mídia excluída por padrão; acessos auditados quando identificáveis.

## Comportamento até aprovação

Não criar link público. Não executar eliminação automática nem permitir exclusão individual por usuário. O piloto fica bloqueado até existir política jurídica aprovada e ensaio de restauração/eliminação compatível.
