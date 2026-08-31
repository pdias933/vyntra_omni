# 0002 — Matriz de risco das ações ERP

- Status: **APROVADA**
- Data da proposta: 2026-08-29
- Data da aprovação: 2026-08-30
- Responsável pela aprovação: Patrick Dias — responsável do projeto
- Afeta: `SECURITY.md`, `PRODUCT.md`, `INTEGRATIONS.md` e Motor de Fluxos

## Decisão aprovada

| Risco | Ações iniciais | Controles mínimos |
|---|---|---|
| Baixo | Criar protocolo; consultar cliente/contrato com dados mascarados | contexto explícito, RBAC, anti-enumeração e auditoria quando aplicável |
| Médio | Situação financeira resumida; listar faturas; consultar sessão; trocar contexto temporário | vínculo verificado sem sinal de risco ou revalidação no atendimento; origem em tempo real quando necessária; prévia |
| Alto | Enviar PDF/Pix/linha digitável; criar vínculo persistente; desbloquear; desconectar sessão; criar/alterar OS | ERP em tempo real, cliente e contrato explícitos, revalidação, prévia, confirmação, idempotência e auditoria |

Regras complementares:

- CPF/CNPJ sozinho nunca autoriza ação de risco alto.
- `REVALIDADO_NO_ATENDIMENTO` exige fator estruturado aprovado e conferido no ERP. Ação alta exige segundo fator independente aprovado ou encaminhamento humano.
- Capacidade ou método de prova não aprovado resulta em `default deny`.
- Desconexão de sessão é somente humana na V1; nenhum nó do Motor de Fluxos a executa.
- Cada ação deve congelar vínculo aceito, dados exibíveis, confirmação, permissão humana/fluxo e caminho de falha antes de ser habilitada.

## Consequências

A consulta de elegibilidade e a execução são casos de uso separados. Snapshot nunca autoriza mutação, decisão financeira atual ou escrita externa.

## Regra de implementação

A matriz é o piso obrigatório. Toda ação concreta ainda precisa declarar os controles da própria linha antes de ser habilitada; capacidade, método de prova ou dado em tempo real não caracterizado mantém a ação em `default deny`.
