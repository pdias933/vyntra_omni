# Omnichannel V1 — documentação-base

Status: **base consolidada para revisão e implementação**.

Origem: decisões consolidadas da conversa **NEXUS CHAT** até 29 de agosto de 2026. Quando propostas intermediárias divergiam, prevaleceu a decisão aceita mais recente.

Este pacote consolida as decisões de produto, domínio, arquitetura, segurança, integrações, operação e desenvolvimento da V1. Ele é a fonte inicial para decompor o projeto em PRs pequenos; não substitui contratos reais da Meta ou do MK Solutions, nem dispensa validar essas APIs no ambiente contratado antes de congelar DTOs.

## Princípios congelados

1. Uma instalação atende **uma única empresa**. Se o produto for comercializado, cada cliente recebe ambiente, banco, storage e credenciais isolados.
2. Existe **uma timeline contínua por contato dentro da empresa**, mesmo quando o contato usa números de WhatsApp empresariais diferentes. Mensagens e atendimentos preservam a conta de origem.
3. `Conversa` é a timeline; `Atendimento` é a unidade operacional com protocolo, fila, responsável, início e encerramento.
4. O protocolo oficial pertence ao ERP. Na indisponibilidade do ERP, o atendimento continua com protocolo pendente e é reconciliado depois; não existe protocolo paralelo inventado.
5. O backend é a autoridade para identidade, autorização, estado, regras de negócio, idempotência e integração.
6. PostgreSQL é a fonte da verdade. Redis, SSE, WebSocket e push são mecanismos recuperáveis e nunca a única cópia de estado de negócio.
7. Tempo real entrega rapidez; sincronização por `sequencia_evento` entrega convergência; PostgreSQL entrega verdade.
8. O código define capacidades; a configuração define comportamento. O Motor de Fluxos não executa código arbitrário.
9. Todo termo de domínio é escrito em português. Termos e payloads externos permanecem no idioma original apenas dentro de adaptadores.
10. IA, ACS e massivas estão fora da V1.

## Documentos

- [PRODUCT.md](PRODUCT.md): visão, escopo aprovado, critérios de sucesso e itens fora da V1.
- [DOMAIN.md](DOMAIN.md): glossário, entidades, relações, invariantes e máquinas de estado.
- [ARCHITECTURE.md](ARCHITECTURE.md): módulos, componentes, persistência, eventos, tempo real e sincronização.
- [SECURITY.md](SECURITY.md): modelo de confiança, RBAC, auditoria, proteção de dados e threat model.
- [FLOWS.md](FLOWS.md): Motor de Fluxos configurável, versões, execução e WhatsApp Flows.
- [MOBILE.md](MOBILE.md): aplicativo iOS/Android, sessões, UX, offline e reconciliação.
- [INTEGRATIONS.md](INTEGRATIONS.md): Meta Cloud API, MK Solutions, snapshot e `AccessSessionAdapter`.
- [OPERATIONS.md](OPERATIONS.md): ambientes, Docker Compose, deploy, backups e observabilidade.
- [AGENTS.md](AGENTS.md): regras operacionais para agentes de código e revisão.
- [ROADMAP.md](ROADMAP.md): sequência proposta de PRs pequenos e seus critérios de aceite.
- [design/README.md](design/README.md): referências conceituais aprovadas, direção visual e comportamento esperado das animações.

## Precedência em caso de dúvida

1. Segurança e privacidade em [SECURITY.md](SECURITY.md).
2. Invariantes e estados em [DOMAIN.md](DOMAIN.md).
3. Escopo em [PRODUCT.md](PRODUCT.md).
4. Fronteiras técnicas em [ARCHITECTURE.md](ARCHITECTURE.md) e [INTEGRATIONS.md](INTEGRATIONS.md).
5. Detalhes específicos de fluxo, mobile e operação nos respectivos documentos.

Conflitos reais entre documentos não devem ser resolvidos silenciosamente em código. Devem gerar uma decisão registrada e uma atualização coordenada da documentação.

## Decisões que exigem validação antes do adaptador final

- Versão e payloads contratados da Meta, inclusive BSUID, username, eventos de alteração de identidade, mensagens interativas, representações de segunda via/Pix/linha/link e WhatsApp Flows.
- Liberação das APIs especiais do MK Solutions.
- Campos reais de contratos, planos, velocidades, protocolos e ordens de serviço.
- Formato real da segunda via, Pix, linha digitável e códigos de erro.
- Semântica real do desbloqueio de confiança e sua elegibilidade.
- Fonte confiável para estado e desconexão de sessão PPPoE.
- Limites de arquivo, templates, rate limits e políticas dos provedores vigentes no momento da implementação.

Essas validações refinam adaptadores. Elas não autorizam transportar nomes, DTOs ou regras externas para o domínio.
