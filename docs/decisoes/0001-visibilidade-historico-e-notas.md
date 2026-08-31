# 0001 — Visibilidade de histórico e notas

- Status: **APROVADA**
- Data da proposta: 2026-08-29
- Data da aprovação: 2026-08-30
- Responsável pela aprovação: Patrick Dias — responsável do projeto
- Afeta: `SECURITY.md`, `DOMAIN.md`, RBAC e timeline

## Contexto

A timeline é única por contato, mas menor privilégio continua obrigatório. Transferência precisa levar contexto suficiente sem expor notas privadas de filas sem relação com o usuário.

## Decisão aprovada

- Quem está autorizado no atendimento atual vê todas as mensagens cliente↔empresa do mesmo protocolo, inclusive as anteriores à transferência.
- Atendimento histórico só aparece quando o usuário acessa ao menos uma fila participante ou possui `VISUALIZAR_HISTORICO_TRANSVERSAL`.
- Nota exige `VISUALIZAR_NOTA_INTERNA` e permanece vinculada à fila em que foi criada.
- Nota de fila sem interseção exige `VISUALIZAR_NOTAS_TRANSVERSAIS`; nem o papel Administrador recebe essa permissão implicitamente.
- Permissão transversal de mensagens não concede permissão transversal de notas.
- Conteúdo negado não sai da API. Quando a continuidade exigir indicação, a API pode retornar apenas um separador neutro, sem data, fila, autor ou assunto.
- Informação essencial para a próxima fila deve virar `EventoConversa` sanitizado, nunca nota privada usada como atalho.

## Consequências

O serviço de autorização e as consultas filtram no PostgreSQL antes de retornar conteúdo. A UI não recebe metadados de itens negados.

## Regra de implementação

Histórico e notas sem interseção de fila permanecem negados sem a permissão transversal específica. Nenhum papel base, inclusive Administrador, recebe permissão transversal de notas implicitamente.
