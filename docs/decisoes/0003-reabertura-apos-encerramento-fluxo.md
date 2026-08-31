# 0003 — Reabertura após encerramento pelo fluxo

- Status: **APROVADA**
- Data da proposta: 2026-08-29
- Data da aprovação: 2026-08-30
- Responsável pela aprovação: Patrick Dias — responsável do projeto
- Afeta: `DOMAIN.md`, `FLOWS.md` e filas

## Decisão aprovada

- Nova mensagem do contato em até 30 minutos reabre atomicamente o mesmo atendimento e protocolo.
- Quando o encerramento foi pelo Motor de Fluxos, o atendimento volta como `AGUARDANDO`, em fila humana de fallback configurada e sem responsável.
- A `ExecucaoFluxo` anterior permanece terminal. Ela nunca retoma nó antigo nem repete escrita ERP.
- Publicar fluxo capaz de encerrar exige configurar a fila humana de fallback.
- Reabertura manual por operador autorizado resulta em `EM_ATENDIMENTO`, modo `HUMANO`, com esse operador como responsável.
- Após 30 minutos, uma nova interação cria outro atendimento/protocolo e inicia o fluxo atualmente publicado.

## Consequências

O protocolo permanece contínuo dentro da tolerância, mas automação concluída não reaparece silenciosamente. A transição incrementa a versão de atribuição e gera auditoria/evento.

## Regra de implementação

Encerramento por fluxo só pode ser publicado com fila humana de fallback ativa. A reabertura cria nova autoridade operacional sem retomar a execução terminal anterior.
