# 0006 — Limites de mídia, QR e rate limit

- Status: **APROVADA**
- Data da proposta: 2026-08-29
- Data da aprovação: 2026-08-30
- Responsável pela aprovação: Patrick Dias — responsável do projeto
- Afeta: `SECURITY.md`, `MOBILE.md`, adapters e operação

## Decisão aprovada

### Mídia

| Tipo | Limite interno inicial |
|---|---:|
| Imagem | 8 MB |
| Áudio | 16 MB |
| Vídeo | 32 MB |
| PDF | 20 MB |

O limite efetivo é sempre o menor entre o limite interno e a capacidade real validada do provedor. Entrada acima do teto vira placeholder seguro; não dispara download irrestrito.

### QR

- validade de 90 segundos;
- uso único e um QR ativo por sessão web;
- gerar outro invalida imediatamente o anterior;
- confirmação explícita na web antes de criar a sessão mobile.

### Limites iniciais

- Login: 5 falhas em 15 minutos por conta+IP bloqueiam por 15 minutos; teto adicional de 50 tentativas em 15 minutos por IP; atraso progressivo.
- QR: 5 gerações em 10 minutos por usuário; 10 tentativas de resgate em 10 minutos por IP/dispositivo.
- Busca de identidade: 30 por minuto por usuário.
- Escrita ERP sensível: 10 por minuto por usuário e 30 por hora por instalação/ação, além de idempotência.
- API transacional ERP: 60 por minuto por credencial, com burst de 20.
- Webhook Meta não recebe teto baixo genérico: usa limite de tamanho, assinatura, concorrência e backpressure medidos.

Todos os valores são configuráveis por ambiente e observados antes de ajuste. Caracterização real Meta/MK pode apenas reduzir o teto efetivo sem contaminar o domínio.

## Regra de implementação

Os valores são tetos internos iniciais e configuráveis. Caracterização real de Meta/MK pode apenas reduzir o limite efetivo; aumento exige nova revisão de risco e evidência operacional.
