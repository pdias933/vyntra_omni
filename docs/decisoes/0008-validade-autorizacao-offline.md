# 0008 — Validade da autorização offline

- Status: **PROPOSTA**
- Data da proposta: 2026-08-29
- Responsável pela aprovação: pendente
- Afeta: `MOBILE.md`, `SECURITY.md`, revogação e SQLite

## Decisão proposta

- Autorização offline vale no máximo 4 horas e só é renovada pelo servidor enquanto online.
- O artefato é vinculado à instalação, usuário, dispositivo, sessão, versão de permissões e escopos autorizados.
- Offline permite apenas ler cache já autorizado, manter rascunhos e criar pendência de texto.
- Offline proíbe ação ERP, exportação, criação de vínculo, visualização integral de dado sensível, obtenção de nova URL de mídia e envio efetivo.
- Ao retornar, o app sincroniza e reautoriza antes de enviar qualquer pendência.
- Token expirado, falha de integridade local ou relógio recuado além da tolerância bloqueiam a área autenticada.
- Revogação conhecida invalida imediatamente cache e pendências; totalmente offline, a exposição residual termina no máximo na validade acima.

## Risco residual

Aceitar até quatro horas de acesso a cache previamente autorizado em aparelho revogado é decisão do responsável de segurança e do dono dos dados.

## Comportamento até aprovação

Autorização offline autenticada permanece desligada. O app pode ser estruturado para cache, mas bloqueia a área protegida ao perder a autorização online normal.
