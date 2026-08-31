# 0008 — Validade da autorização offline

- Status: **APROVADA**
- Data da proposta: 2026-08-29
- Data da aprovação: 2026-08-30
- Responsável pela aprovação: Patrick Dias — responsável do projeto
- Afeta: `MOBILE.md`, `SECURITY.md`, revogação e SQLite

## Decisão aprovada

- Autorização offline vale no máximo 4 horas e só é renovada pelo servidor enquanto online.
- O artefato é vinculado à instalação, usuário, dispositivo, sessão, versão de permissões e escopos autorizados.
- Offline permite apenas ler cache já autorizado, manter rascunhos e criar pendência de texto.
- Offline proíbe ação ERP, exportação, criação de vínculo, visualização integral de dado sensível, obtenção de nova URL de mídia e envio efetivo.
- Ao retornar, o app sincroniza e reautoriza antes de enviar qualquer pendência.
- Token expirado, falha de integridade local ou relógio recuado além da tolerância bloqueiam a área autenticada.
- Revogação conhecida invalida imediatamente cache e pendências; totalmente offline, a exposição residual termina no máximo na validade acima.

## Risco residual

Fica aceito para a V1 o risco residual de até quatro horas de acesso ao cache previamente autorizado em aparelho totalmente offline. Escopo e dado exibível permanecem minimizados.

## Regra de implementação

Autorização offline pode ser implementada com validade máxima de quatro horas, vínculo integral ao dispositivo/sessão/escopo e bloqueio imediato ao expirar. Ação externa continua proibida offline.
