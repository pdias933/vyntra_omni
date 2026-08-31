# Omnichannel V1 — documentação-base

Status: **base consolidada para implementação; Portão Zero fechado em 30 de agosto de 2026**.

Origem: decisões consolidadas da conversa **NEXUS CHAT** até 29 de agosto de 2026, com aprovação do Portão Zero registrada em 30 de agosto de 2026. Quando propostas intermediárias divergiam, prevaleceu a decisão aceita mais recente.

Este pacote consolida as decisões de produto, domínio, arquitetura, segurança, integrações, operação e desenvolvimento da V1. Ele é a fonte inicial para decompor o projeto em PRs pequenos; não substitui contratos reais da Meta ou do MK Solutions, nem dispensa validar essas APIs no ambiente contratado antes de congelar DTOs.

## Fundação técnica

O monorepo contém aplicações mínimas e compiláveis em `apps/api`, `apps/web` e `apps/mobile`. Elas ainda não representam uma funcionalidade da V1 e não possuem endpoint de negócio, integração externa ou layout final. A API já publica sua identidade técnica e o contrato OpenAPI em `/api/v1`.

Baseline local:

- Node.js 24 LTS, a partir de 24.15 e antes da 25; `.node-version` fixa 24.20.0 como referência reproduzível;
- pnpm 11.24.0, versão que gerou o lockfile e está registrada em `packageManager`.

Verificação completa:

```text
pnpm install --frozen-lockfile
pnpm verificar:expo
pnpm lint
pnpm typecheck
pnpm test
pnpm verificar:contratos
pnpm verificar:dependencias
pnpm build
```

Desenvolvedores com Gitleaks 8.30.0 instalado também podem examinar histórico, arquivos preparados e alterações rastreadas com `pnpm verificar:segredos`; arquivos novos devem ser preparados no Git para entrar nessa verificação local. Tanto o comando local quanto a CI fixam configuração e arquivo de exceções, ignoram comentários de liberação e exigem que um canário sintético seja detectado antes da varredura real.

As versões e a justificativa da superfície inicial estão em [docs/dependencias/PR-002.md](docs/dependencias/PR-002.md).

### API base e cliente gerado

`GET /api/v1` identifica a versão pública. O contrato fica em `GET /api/v1/openapi.json`, sem interface Swagger HTML exposta. `pnpm gerar:contratos` atualiza o JSON e o pacote `@vyntra/api-client`; `pnpm verificar:contratos` bloqueia divergência entre controllers, contrato e SDK. Uso, formato de erro e limites desta fundação estão em [docs/api/PR-006.md](docs/api/PR-006.md); dependências e superfície estão em [docs/dependencias/PR-006.md](docs/dependencias/PR-006.md).

### Correlação, logs e saúde

Toda requisição recebe correlação validada; erros devolvem o mesmo identificador e logs técnicos são JSON sanitizado via Pino. Liveness e readiness ficam em `/api/v1/saude/vivo` e `/api/v1/saude/pronto`. Contrato operacional e limites estão em [docs/operacoes/PR-007.md](docs/operacoes/PR-007.md); a análise da dependência está em [docs/dependencias/PR-007.md](docs/dependencias/PR-007.md).

### Auditoria imutável

`ServicoAuditoria` acrescenta registros sanitizados no PostgreSQL por um repositório sem operações de edição/remoção. A migration aditiva bloqueia `UPDATE`, `DELETE` e `TRUNCATE` na própria tabela; usuários e administradores da plataforma não recebem endpoint de mutação. O job de migration termina antes da API e a prontidão confirma a migration obrigatória. Modelo, operação e rollback estão em [docs/operacoes/PR-008.md](docs/operacoes/PR-008.md); versões e superfície das dependências estão em [docs/dependencias/PR-008.md](docs/dependencias/PR-008.md).

### Eventos e caixa de saída

Efeitos assíncronos usam `EventoDominio` sequenciado e `ItemCaixaSaida` no mesmo commit PostgreSQL da alteração principal. A entrega é posterior e nunca antecipa o estado confirmado. Contratos, rollback e limites estão em [docs/operacoes/PR-009.md](docs/operacoes/PR-009.md).

### Idempotência e recuperação

Comandos sensíveis usam chave com escopo, concessão temporária e tentativas persistentes. Timeout ou execução interrompida produz resultado incerto e exige reconciliação antes de uma nova tentativa. O contrato operacional está em [docs/operacoes/PR-010.md](docs/operacoes/PR-010.md); a análise de dependências está em [docs/dependencias/PR-010.md](docs/dependencias/PR-010.md).

### Identidade e escopo de funcionários

O PostgreSQL materializa usuários, perfis, ajustes granulares de permissão, filas e vínculos explícitos de escopo. Usuário nasce sem perfil e sem fila; autenticação e sessões permanecem nos PRs seguintes. O modelo e o aceite estão em [docs/operacoes/PR-011.md](docs/operacoes/PR-011.md).

### Autorização central

`ServicoAutorizacao` valida sessão autenticada, usuário/perfil, permissão efetiva, fila, recurso e estado em ordem e com negação padrão. Recurso inexistente ou fora do escopo devolve a mesma resposta segura. Matriz, uso transacional e aceite estão em [docs/operacoes/PR-012.md](docs/operacoes/PR-012.md).

### Login e sessão web

Senha usa Argon2id; identificador desconhecido não altera a resposta nem elimina o custo criptográfico. Sessões usam cookie `__Host` seguro, token opaco persistido apenas por hash, CSRF vinculado, origem HTTPS explícita, rotação atômica e auditoria. Há no máximo duas sessões web, a terceira exige confirmação antes de substituir a mais antiga e 12 horas sem atividade encerram a autoridade. Contas privilegiadas continuam bloqueadas sem MFA. Contratos e operação estão em [docs/operacoes/PR-013.md](docs/operacoes/PR-013.md) e [docs/operacoes/PR-014.md](docs/operacoes/PR-014.md); as análises de dependências estão em [docs/dependencias/PR-013.md](docs/dependencias/PR-013.md) e [docs/dependencias/PR-014.md](docs/dependencias/PR-014.md).

### Sessão e dispositivo mobile

O mobile usa sessão própria vinculada à instalação e ao dispositivo. Access token de 15 minutos fica somente em memória; refresh rotativo com limite absoluto de 30 dias e segredo de vínculo ficam no cofre nativo. PostgreSQL conserva apenas hashes e detecta replay de refresh para revogar a sessão. Contrato, custódia local e operação estão em [docs/operacoes/PR-015.md](docs/operacoes/PR-015.md); dependências em [docs/dependencias/PR-015.md](docs/dependencias/PR-015.md).

Cada usuário possui no máximo dois aparelhos ativos. Uma terceira instalação substitui atomicamente a mais antiga; o próprio usuário pode listar/revogar aparelhos e a administração pode revogar todos mediante autorização central. Detalhes e aceite estão em [docs/operacoes/PR-016.md](docs/operacoes/PR-016.md); a PR não adiciona dependências, conforme [docs/dependencias/PR-016.md](docs/dependencias/PR-016.md).

O workflow de integração contínua repete essas verificações, examina segredos em todo o histórico e não executa deploy. Política, exceções e configurações remotas necessárias estão em [docs/ci/PR-003.md](docs/ci/PR-003.md).

### Ambiente local

O ambiente de desenvolvimento sobe a API mínima, um job único de migration, PostgreSQL, Redis e MinIO por Docker Compose. As credenciais são geradas em arquivos locais ignorados pelo Git; nenhum valor é exibido pelo comando de preparação.

```text
pnpm ambiente:preparar
pnpm ambiente:validar
pnpm ambiente:subir
pnpm ambiente:estado
pnpm ambiente:parar
```

API, endpoint S3 e console MinIO ficam disponíveis somente em `127.0.0.1`. PostgreSQL e Redis não publicam portas no host. Requisitos, persistência, limpeza segura e a restrição do MinIO a desenvolvimento estão em [docs/operacoes/PR-004.md](docs/operacoes/PR-004.md); imagens e riscos de licença/manutenção estão em [docs/dependencias/PR-004.md](docs/dependencias/PR-004.md).

### Staging isolado

O staging possui composição, projeto Docker, redes, volumes e segredos próprios. PostgreSQL, Redis e Garage S3 não publicam portas no host; a API mínima fica somente em `127.0.0.1:3100`. O comando de subida exige confirmação explícita de que o ambiente contém apenas dados sintéticos ou sanitizados.

```text
pnpm staging:preparar
pnpm staging:validar
VYNTRA_CONFIRMAR_STAGING=STAGING_ISOLADO_SEM_DADOS_DE_PRODUCAO pnpm staging:subir
pnpm staging:smoke
pnpm staging:estado
```

Segredos são arquivos ignorados em `.segredos/staging/`; valores nunca entram em Compose, Git, imagem, log ou parâmetro de processo. O storage cria uma chave exclusiva com leitura/escrita somente no bucket privado `vyntra-staging-midias`, sem permissão de proprietário. Topologia, implantação, recuperação e limites estão em [docs/operacoes/PR-005.md](docs/operacoes/PR-005.md); seleção e risco do storage estão em [docs/dependencias/PR-005.md](docs/dependencias/PR-005.md).

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
- [ROADMAP.md](ROADMAP.md): sequência de PRs pequenos, estado atual, `Effort` recomendado e critérios de aceite.
- [docs/decisoes/README.md](docs/decisoes/README.md): Portão Zero fechado, decisões aprovadas e condições externas que permanecem bloqueadas.
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
