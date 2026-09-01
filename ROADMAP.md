# Roadmap de PRs — Omnichannel V1

## 1. Como executar

- A numeração é a ordem preferencial de merge e também expressa dependências.
- Trabalho independente pode ocorrer em paralelo, mas não deve ser integrado antes de sua fundação.
- Cada PR tem um objetivo principal, critério de aceite observável, testes proporcionais ao risco e atualização documental.
- Estado incompleto permanece atrás de controle de recurso desligado.
- Toda migration de produção é aditiva/compatível.
- Integrações usam simuladores até a caracterização real; nenhum DTO externo é inventado.
- Segurança, autorização, auditoria, idempotência e eventos entram junto da funcionalidade, não apenas na revisão final de segurança.
- O PR condicional de sessão de acesso pode ser adiado sem bloquear o piloto.
- Toda PR atualiza sua própria linha no painel abaixo no mesmo conjunto de mudanças.
- `CONCLUÍDA` exige aceite, verificações e entrega publicada/rastreável no repositório; `PRONTA` ainda aguarda publicação ou integração.
- `Effort` indica o nível de raciocínio e revisão recomendado para o Codex, não prazo nem tamanho de equipe. Mudança material de escopo exige recalibrá-lo.

Estados possíveis: `PENDENTE`, `EM FORMALIZAÇÃO`, `EM ANDAMENTO`, `PRONTA`, `CONCLUÍDA`, `BLOQUEADA` e `CONDICIONAL`.

Effort possível: `low`, `medium`, `high` e `xhigh`. Nenhuma PR atual é `low`: mesmo as menores preservam contratos ou decisões arquiteturais.

### Painel de execução

| PR | Estado | Effort |
|---:|---|---|
| 001 | CONCLUÍDA | `xhigh` |
| 002 | CONCLUÍDA | `medium` |
| 003 | CONCLUÍDA | `high` |
| 004 | CONCLUÍDA | `high` |
| 005 | CONCLUÍDA | `xhigh` |
| 006 | CONCLUÍDA | `medium` |
| 007 | CONCLUÍDA | `high` |
| 008 | CONCLUÍDA | `high` |
| 009 | CONCLUÍDA | `xhigh` |
| 010 | CONCLUÍDA | `xhigh` |
| 011 | CONCLUÍDA | `high` |
| 012 | CONCLUÍDA | `xhigh` |
| 013 | CONCLUÍDA | `xhigh` |
| 014 | CONCLUÍDA | `high` |
| 015 | CONCLUÍDA | `xhigh` |
| 016 | CONCLUÍDA | `xhigh` |
| 017 | CONCLUÍDA | `xhigh` |
| 018 | CONCLUÍDA | `high` |
| 019 | CONCLUÍDA | `high` |
| 020 | CONCLUÍDA | `high` |
| 021 | CONCLUÍDA | `medium` |
| 022 | CONCLUÍDA | `medium` |
| 023 | CONCLUÍDA | `high` |
| 024 | CONCLUÍDA | `xhigh` |
| 025 | CONCLUÍDA | `xhigh` |
| 026 | CONCLUÍDA | `xhigh` |
| 027 | CONCLUÍDA | `xhigh` |
| 028 | CONCLUÍDA | `xhigh` |
| 029 | CONCLUÍDA | `high` |
| 030 | CONCLUÍDA | `high` |
| 031 | CONCLUÍDA | `medium` |
| 032 | CONCLUÍDA | `high` |
| 033 | CONCLUÍDA | `xhigh` |
| 034 | CONCLUÍDA | `high` |
| 035 | CONCLUÍDA | `xhigh` |
| 036 | CONCLUÍDA | `xhigh` |
| 037 | CONCLUÍDA | `high` |
| 038 | CONCLUÍDA | `xhigh` |
| 039 | CONCLUÍDA | `xhigh` |
| 040 | CONCLUÍDA | `xhigh` |
| 041 | CONCLUÍDA | `xhigh` |
| 042 | CONCLUÍDA | `xhigh` |
| 043 | CONCLUÍDA | `xhigh` |
| 044 | CONCLUÍDA | `xhigh` |
| 045 | CONCLUÍDA | `xhigh` |
| 046 | CONCLUÍDA | `high` |
| 047 | CONCLUÍDA | `high` |
| 048 | CONCLUÍDA | `high` |
| 049 | CONCLUÍDA | `xhigh` |
| 050 | CONCLUÍDA | `xhigh` |
| 051 | CONCLUÍDA | `xhigh` |
| 052 | CONCLUÍDA | `xhigh` |
| 053 | CONCLUÍDA | `xhigh` |
| 054 | CONCLUÍDA | `xhigh` |
| 055 | CONCLUÍDA | `xhigh` |
| 056 | CONCLUÍDA | `xhigh` |
| 057 | CONCLUÍDA | `high` |
| 058 | CONCLUÍDA | `xhigh` |
| 059 | CONCLUÍDA | `xhigh` |
| 060 | CONCLUÍDA | `high` |
| 061 | CONCLUÍDA | `xhigh` |
| 062 | CONCLUÍDA | `xhigh` |
| 063 | CONCLUÍDA | `xhigh` |
| 064 | CONCLUÍDA | `xhigh` |
| 065 | CONCLUÍDA | `xhigh` |
| 066 | CONCLUÍDA | `xhigh` |
| 067 | CONCLUÍDA | `xhigh` |
| 068 | CONDICIONAL | `xhigh` |
| 069 | CONCLUÍDA | `high` |
| 070 | CONCLUÍDA | `xhigh` |
| 071 | CONCLUÍDA | `xhigh` |
| 072 | CONCLUÍDA | `xhigh` |
| 073 | CONCLUÍDA | `xhigh` |
| 074 | CONCLUÍDA | `high` |
| 075 | PENDENTE | `xhigh` |
| 076 | PENDENTE | `high` |
| 077 | PENDENTE | `xhigh` |
| 078 | PENDENTE | `xhigh` |
| 079 | PENDENTE | `xhigh` |
| 080 | PENDENTE | `xhigh` |
| 081 | PENDENTE | `xhigh` |
| 082 | PENDENTE | `xhigh` |
| 083 | PENDENTE | `xhigh` |
| 084 | PENDENTE | `xhigh` |
| 085 | PENDENTE | `high` |
| 086 | PENDENTE | `high` |
| 087 | PENDENTE | `high` |
| 088 | PENDENTE | `high` |
| 089 | PENDENTE | `high` |
| 090 | PENDENTE | `high` |
| 091 | PENDENTE | `xhigh` |
| 092 | PENDENTE | `xhigh` |
| 093 | PENDENTE | `xhigh` |
| 094 | PENDENTE | `high` |
| 095 | PENDENTE | `xhigh` |
| 096 | PENDENTE | `xhigh` |
| 097 | PENDENTE | `xhigh` |
| 098 | PENDENTE | `high` |
| 099 | PENDENTE | `xhigh` |
| 100 | PENDENTE | `xhigh` |
| 101 | PENDENTE | `high` |
| 102 | PENDENTE | `high` |
| 103 | PENDENTE | `high` |
| 104 | PENDENTE | `xhigh` |
| 105 | PENDENTE | `xhigh` |
| 106 | PENDENTE | `high` |
| 107 | PENDENTE | `xhigh` |
| 108 | PENDENTE | `high` |
| 109 | PENDENTE | `xhigh` |
| 110 | PENDENTE | `high` |
| 111 | PENDENTE | `high` |
| 112 | PENDENTE | `xhigh` |
| 113 | PENDENTE | `xhigh` |
| 114 | PENDENTE | `xhigh` |
| 115 | PENDENTE | `high` |
| 116 | PENDENTE | `xhigh` |

## 2. Portão zero

### PR 001 — ADRs e matriz de decisões

Fechar visibilidade histórica entre filas/notas, matriz de risco por ação ERP, reabertura após encerramento pelo bot, retenção/LGPD e link público, senha/MFA, limites de mídia/QR/rate limit, contrato de disparo ERP e validade máxima da autorização offline.

Aceite concluído em 2026-08-30: oito decisões técnicas aprovadas e rastreáveis em [docs/decisoes](docs/decisoes/README.md); validações externas ainda ausentes permanecem em `default deny` ou com recurso desligado.

## 3. Fundação

| PR | Objetivo | Aceite principal |
|---:|---|---|
| 002 | Monorepo TypeScript | API, web, mobile e pacotes compilam pela raiz; sem regra de negócio fictícia. |
| 003 | CI e guardas | Lint, tipos, testes, build, dependências e varredura de segredos bloqueiam falha real. |
| 004 | Docker Compose de desenvolvimento | API vazia, PostgreSQL, Redis e MinIO sobem com volumes e sem segredo versionado. |
| 005 | Staging isolado mínimo | VM/ambiente, banco, Redis, storage e segredos próprios; nenhum dado bruto de produção. |
| 006 | API base e OpenAPI | /api/v1, erros canônicos em português e cliente TypeScript gerado. |
| 007 | Correlação, logs e saúde | correlacao_id, sanitização central, /saude/vivo e /saude/pronto testados. |
| 008 | Auditoria imutável | Registro somente de acréscimo e serviço central; usuário e administrador não editam/apagam. |
| 009 | Evento e Caixa de Saída Transacional | sequencia_evento, EventoDominio e ItemCaixaSaida no mesmo commit do agregado. |
| 010 | Idempotência e operações recuperáveis | Chaves com escopo, concessão temporária, tentativas e reconciliação persistentes no PostgreSQL. |

### PR 005 — Staging isolado mínimo

Aceite concluído em 30 de agosto de 2026: projeto `vyntra-staging` implantado em diretório próprio na VM de testes, coexistindo com `vyntra-desenvolvimento`; API, PostgreSQL, Redis e Garage S3 saudáveis; somente APIs publicadas em loopback; cinco volumes, três redes e dez arquivos de segredo exclusivos; bucket privado com chave sem permissão de proprietário; protocolo S3 e persistência de PostgreSQL, Redis e objeto comprovados após reinício. Nenhum dado bruto ou credencial de produção foi usado.

### PR 006 — API base e OpenAPI

Aceite concluído em 30 de agosto de 2026: prefixo `/api/v1`, resposta técnica de versão, filtro de erros canônicos em português, validação global estrita, contrato OpenAPI 3.1 e pacote TypeScript gerado entregues; interface HTML do Swagger desativada; divergência entre controllers, JSON e SDK bloqueada pelos testes; lint, tipos, 49 testes, build e auditoria de dependências aprovados. A imagem `vyntra/api-staging:pr-006` foi construída na VM e validada com API, OpenAPI, PostgreSQL, Redis e Garage S3 saudáveis, preservando os volumes e segredos isolados da PR 005.

### PR 007 — Correlação, logs e saúde

Aceite concluído em 31 de agosto de 2026: correlação UUID propagada no header, nos erros canônicos e no contexto assíncrono; entrada inválida substituída; logs Pino em JSON submetidos a allowlist e sanitização central; endpoints separados de vivacidade e prontidão entregues no OpenAPI e no cliente TypeScript. Lint, tipos, 54 testes, build e auditoria de dependências foram aprovados. A imagem `vyntra/api-staging:pr-007` foi implantada na VM; API, PostgreSQL, Redis e Garage S3 permaneceram saudáveis, a prontidão comprovou as três dependências e os logs de homologação preservaram evento/correlação sem expor segredos.

### PR 008 — Auditoria imutável

Aceite concluído em 31 de agosto de 2026: `RegistroAuditoria` canônico, sanitização, serviço e repositório somente de acréscimo entregues com Prisma/PostgreSQL; constraints de origem/ator/contexto e triggers impediram mutação inclusive pelo usuário proprietário do banco. Lint, tipos, 61 testes, build, contratos e auditoria de dependências foram aprovados. O baseline explícito preservou a tabela sintética anterior ao Prisma; o job `migrar` terminou com código zero e a imagem `vyntra/api-staging:pr-008` ficou saudável. Em staging, escrita pelo serviço central, proteção de segredo, rejeição de ator inválido e bloqueio real de `UPDATE`, `DELETE` e `TRUNCATE` foram comprovados; o registro sintético de aceite permaneceu na trilha imutável.

### PR 009 — Evento e Caixa de Saída Transacional

Aceite concluído em 31 de agosto de 2026: `EventoDominio` recebeu `sequencia_evento` global do PostgreSQL e `ItemCaixaSaida` passou a referenciar o fato que originou o efeito; `ServicoTransacaoDominio` confirmou alteração, evento e itens em um único commit e reverteu integralmente a unidade sob falha. Lint, tipos, 68 testes, build, contratos e auditoria de dependências foram aprovados. A migration aditiva terminou com código zero e a imagem `vyntra/api-staging:pr-009` ficou saudável. Em staging, dois commits reais produziram sequências `1` e `3`, enquanto a tentativa intermediária falhou e não deixou auditoria, evento ou item; ambos os commits persistiram dados protegidos e nenhuma caixa de saída ficou órfã.

### PR 010 — Idempotência e operações recuperáveis

Aceite concluído em 31 de agosto de 2026: chaves com escopo e assinatura, operações recuperáveis, concessões temporárias e histórico de tentativas passaram a ser autoridade do PostgreSQL; chave e token persistem somente como hash, e expiração ou resposta perdida exigem reconciliação antes de nova execução. Lint, tipos, 77 testes, build, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831000300_criar_idempotencia_operacoes` terminou com código zero e a imagem `vyntra/api-staging:pr-010` ficou saudável. Em staging, oito criações simultâneas produziram uma operação nova e sete reaproveitamentos; oito aquisições produziram um vencedor; execução incerta, reconciliação com efeito ausente e nova execução concluída preservaram três tentativas; uma concessão vencida foi recuperada como `RESULTADO_INCERTO`; chave, tokens, CPF e senha não ficaram em claro.

## 4. Identidade de funcionários e autorização

| PR | Objetivo | Aceite principal |
|---:|---|---|
| 011 | Usuário, perfil, permissão e fila no schema | Papéis base e permissões granulares sem conceder acesso implícito. |
| 012 | Serviço central de autorização | Sessão + permissão + fila + recurso + estado; IDOR/BOLA retorna negação sem vazamento. |
| 013 | Login e sessão web | Cookie seguro, rotação/expiração e CSRF/origem cobertos. |
| 014 | Limites de sessão web | Duas sessões; terceira exige confirmação; 12 h de inatividade; revogação auditada. |
| 015 | Sessão e dispositivo mobile | Refresh rotativo, Keychain/Keystore e vínculo ao aparelho. |
| 016 | Limites e revogação mobile | Dois aparelhos; terceiro revoga o mais antigo; servidor corta sincronização e WebSocket. |
| 017 | Pareamento por QR | Token efêmero, uso único, validade curta, confirmação web e replay recusado. |
| 018 | Controles de recurso e política de versão | Liberação gradual/desligamento emergencial auditados e versão mínima por plataforma. |

### PR 011 — Usuário, perfil, permissão e fila no schema

Aceite concluído em 31 de agosto de 2026: `Usuario`, `PerfilAcesso`, os três papéis base, 34 códigos granulares, ajustes `CONCEDER`/`NEGAR`, `Fila` e `AcessoUsuarioFila` foram materializados sem antecipar credencial, sessão ou serviço de decisão. Lint, tipos, 82 testes, build, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831000400_criar_usuarios_perfis_permissoes_filas` terminou com código zero e a imagem `vyntra/api-staging:pr-011` ficou saudável. Em staging, usuário sem perfil permaneceu sem fila, perfil Administrador vazio permaneceu sem concessões persistidas, vínculos explícitos de permissão/fila foram preservados e o PostgreSQL recusou nome normalizado duplicado e revogação sem timestamp.

### PR 012 — Serviço central de autorização

Aceite concluído em 31 de agosto de 2026: sessão, usuário/perfil, permissão, fila, recurso e estado passaram por uma decisão central `default deny`; `NEGAR` prevalece, capacidades sensíveis/transversais nunca são herdadas e UUID inexistente, fila alheia, recurso inacessível ou estado inválido retornam a mesma negação. Lint, tipos, 97 testes, build, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; a imagem `vyntra/api-staging:pr-012` ficou saudável e a prontidão permaneceu `PRONTO`. Em staging, dez cenários reais no PostgreSQL comprovaram os portões antes da consulta ao recurso, concessão e negação explícitas, sessão expirada, resposta uniforme contra IDOR/BOLA e autorização/consulta na mesma transação; os dados sintéticos foram revertidos ao fim do aceite.

### PR 013 — Login e sessão web

Aceite concluído em 31 de agosto de 2026: credencial Argon2id, sessão opaca persistida somente por hash, cookies `__Host` seguros, CSRF vinculado, origem/CORS explícitos, expiração absoluta, rotação atômica, logout, limite de força bruta e auditoria transacional foram entregues; usuário inexistente e senha incorreta permanecem indistinguíveis, e conta privilegiada sem MFA não recebe sessão. Lint, tipos, 110 testes, build, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831000500_criar_credencial_sessao_web` terminou com código zero e a imagem `vyntra/api-staging:pr-013` ficou saudável com prontidão `PRONTO`. Em staging, doze cenários HTTP reais comprovaram cookies, CSRF/origem, enumeração uniforme, expiração, rotação, token anterior, logout, MFA e limite; oito falhas concorrentes resultaram em cinco verificações e três bloqueios, enquanto oito rotações produziram um vencedor e sete recusas. Dados mutáveis sintéticos foram removidos e os fatos de auditoria permaneceram imutáveis.

### PR 014 — Limites de sessão web

Aceite concluído em 31 de agosto de 2026: máximo de duas sessões web, confirmação explícita da terceira, substituição atômica da mais antiga, 12 horas de inatividade renovável, listagem própria, revogação remota, logout global e revogação administrativa autorizada/auditada foram entregues. Lint, tipos, 113 testes, build, contratos, Expo e auditoria de dependências foram aprovados. A migration `20260831000600_limitar_sessoes_web` terminou com código zero e a imagem `vyntra/api-staging:pr-014` ficou saudável com prontidão `PRONTO`. Em staging, o primeiro login retornou `200`; duas tentativas concorrentes para a vaga restante produziram um `200` e um `409`; a repetição confirmada retornou `200`, preservou exatamente duas sessões e registrou a revogação por limite; logout global retornou `204` e deixou zero sessão ativa. Dados mutáveis sintéticos foram removidos e os fatos de auditoria permaneceram imutáveis.

### PR 015 — Sessão e dispositivo mobile

Aceite concluído em 31 de agosto de 2026: sessão mobile separada da web, access token de 15 minutos somente em memória, refresh rotativo com limite absoluto de 30 dias no Keychain/Keystore, vínculo por instalação/dispositivo, rate limit persistente, MFA conservador, logout e replay com revogação auditada foram entregues. Lint, tipos, 123 testes, build iOS/Android, contratos, Expo e auditoria de dependências foram aprovados. A migration `20260831000700_criar_sessao_dispositivo_mobile` terminou com código zero e a imagem `vyntra/api-staging:pr-015` ficou saudável com prontidão `PRONTO`. Em staging, login, validação e rotação retornaram `200`; access anterior, refresh repetido e sessão revogada retornaram `401`; novo login retornou `200`, logout `204` e vínculo divergente `403`. PostgreSQL confirmou os hashes, o refresh consumido, duas revogações, duas tentativas bem-sucedidas, uma falha de vínculo e sete fatos de auditoria. Dados mutáveis sintéticos foram removidos; não houve erro de nível 50.

### PR 016 — Limites e revogação mobile

Aceite concluído em 31 de agosto de 2026: o PostgreSQL passou a impor no máximo dois aparelhos por usuário; o terceiro login substitui atomicamente o mais antigo, encerra todas as suas sessões e informa a substituição. Listagem própria, revogação de um aparelho, revogação administrativa autorizada e limpeza segura do app foram entregues sem antecipar o WebSocket da PR 056. Lint, tipos, 129 testes, build iOS/Android, contratos, Expo e auditoria de dependências foram aprovados. Não houve migration; a imagem `vyntra/api-staging:pr-016` ficou saudável com prontidão `PRONTO`. Em staging, a lista inicial apresentou dois aparelhos e um atual; o terceiro login retornou `200` e `dispositivo_substituido=true`; access e refresh antigos retornaram `401`; alvo alheio retornou `403`; revogações própria e administrativa retornaram `204`. O banco confirmou três aparelhos revogados, nenhuma sessão ativa e exatamente um fato para substituição, revogação própria e revogação administrativa. Dados mutáveis sintéticos foram removidos; não houve erro de nível 50.

### PR 017 — Pareamento por QR

Aceite concluído em 31 de agosto de 2026: token QR de 90 segundos e comprovante de resgate separado passaram a ser persistidos somente por hash; novo QR cancela o anterior, confirmação exige a sessão web criadora com autenticação recente e apenas o aparelho vinculado recebe access/refresh. Limites por usuário, IP e instalação, estados finais, cancelamento por revogação web e auditoria foram entregues com autoridade PostgreSQL. Lint, tipos, 138 testes, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831000800_criar_pareamento_qr` terminou com código zero e a imagem `vyntra/api-staging:pr-017` ficou saudável com prontidão `PRONTO`. Em staging, quatro resgates concorrentes produziram um `200` e três `401`; QR substituído, sessão web alheia, autenticação antiga, replay e QR após logout foram recusados; aguardo retornou `409`, confirmação `204`, conclusão e validação mobile `200`. O banco confirmou três pareamentos, um concluído, dois cancelados, zero ativo, hashes de 64 caracteres, seis tentativas e um único sucesso. Dados mutáveis sintéticos foram removidos; a auditoria imutável foi preservada e não houve erro de nível 50.

### PR 018 — Controles de recurso e política de versão

Aceite concluído em 31 de agosto de 2026: controles persistentes passaram a combinar estado, desligamento emergencial, administradores, usuários, filas e percentual determinístico, com autorização `ADMINISTRAR_RELEASES`, versão otimista e auditoria transacional; iOS/Android receberam políticas mínima/recomendada e o backend passou a bloquear login, pareamento, autenticação e refresh abaixo da mínima com `426`. Lint, tipos, 147 testes, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831000900_criar_controles_recurso_versao` terminou com código zero e a imagem `vyntra/api-staging:pr-018` ficou saudável com prontidão `PRONTO`. Em staging, alvos explícitos ativaram o recurso, o desligamento emergencial prevaleceu sobre 100%, duas escritas concorrentes produziram um `200` e um `409`, versão antiga recebeu `426` e a mínima recebeu `200`; constraints recusaram percentual e ordem de versões inválidos. A política foi restaurada, todos os dados mutáveis sintéticos foram removidos e seis fatos imutáveis de release foram preservados, sem erro de nível 50.

## 5. Portas internas

| PR | Objetivo | Aceite principal |
|---:|---|---|
| 019 | Porta de mensageria e simulador Meta | Domínio envia/recebe tipos internos; simulador cobre sucesso, falha e duplicidade. |
| 020 | AdaptadorErp e simulador contratual | Consultas/escritas normalizadas; protocolo pendente e resposta perdida simulados. |
| 021 | AdaptadorSessaoAcesso | Contrato separado, simulador e controle de recurso desligado; nenhuma inferência de sessão ATIVA. |

### PR 019 — Porta de mensageria e simulador Meta

Aceite concluído em 31 de agosto de 2026: `CanalMensageria` e `ConsumidorEventosMensageria` passaram a trocar somente comandos, eventos, identidades, estados e falhas internos normalizados; o simulador Meta determinístico cobre aceite, falha, idempotência, conflito e duplicidade concorrente sem expor DTO ou credencial externa e sem ser registrado na aplicação. Lint, tipos, 158 testes, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; a imagem `vyntra/api-staging:pr-019` ficou saudável com prontidão `PRONTO`. Em staging, repetição de sucesso e falha preservou dois efeitos externos totais, enquanto duas entregas do mesmo evento produziram `APLICADO` e `DUPLICADO` com uma única chamada ao consumidor; não houve erro de nível 50.

### PR 020 — AdaptadorErp e simulador contratual

Aceite concluído em 31 de agosto de 2026: `AdaptadorErp` passou a separar consultas e escritas com clientes, contratos, faturas e resultados internos normalizados; o simulador contratual diferencia indisponibilidade sem efeito de resposta perdida após possível efeito, exige reconciliação e recusa reutilização divergente da chave, sem DTO MK, credencial ou registro na aplicação. Lint, tipos, 169 testes, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; a imagem `vyntra/api-staging:pr-020` ficou saudável com prontidão `PRONTO`. Em staging, três tentativas produziram dois efeitos: confirmação idempotente, indisponibilidade com efeito comprovadamente ausente e resposta perdida que permaneceu incerta até a reconciliação confirmar o protocolo oficial; critérios sintéticos de busca não retornaram na resposta e não houve erro de nível 50.

### PR 021 — AdaptadorSessaoAcesso

Aceite concluído em 31 de agosto de 2026: `AdaptadorSessaoAcesso` foi separado do ERP com consultas, desconexão e reconciliação normalizadas; o simulador nasce desligado, exige estado explícito, recusa desconexão de sessão `DESCONHECIDA` e preserva incerteza até reconciliar, sem provider, endpoint ou fonte PPPoE/AAA fictícia. Lint, tipos, 181 testes, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831001000_criar_controle_sessao_acesso_desativado` terminou com código zero e a imagem `vyntra/api-staging:pr-021` ficou saudável com prontidão `PRONTO`. Em staging, `SESSAO_ACESSO` permaneceu `DESATIVADO`, sem emergência, administradores, percentual, usuários ou filas; resposta perdida produziu um efeito e somente a reconciliação confirmou a desconexão, sem erro de nível 50.

## 6. Domínio principal

| PR | Objetivo | Aceite principal |
|---:|---|---|
| 022 | ContaWhatsApp | Múltiplas contas, origem preservada e credenciais fora do domínio. |
| 023 | Contato e IdentidadeWhatsApp | Identificador estável derivado de BSUID; nome de usuário e telefone opcionais. |
| 024 | Alteração/alias de identidade | Evento anterior→atual preserva contato e timeline; caso incerto cria contato separado. |
| 025 | VinculoCliente e ContextoAtendimento | Múltiplos clientes/contratos; contexto explícito e troca auditada. |
| 026 | SnapshotCliente no PostgreSQL | Documento protegido, origem/idade e Redis descartável. |
| 027 | Conversa única | Uma Conversa por Contato; contas diferentes compartilham timeline lógica e preservam origem. |
| 028 | Atendimento e máquina de estado | Transições válidas, modo/motivo ortogonais e nenhuma conclusão por inatividade. |
| 029 | Protocolo pendente | UUID interno sem número falso; simulador ERP atribui um único protocolo oficial. |
| 030 | Filas e vínculos de usuário | Acesso à fila separado da permissão de ação. |
| 031 | Disponibilidade manual | DISPONIVEL/INDISPONIVEL não deriva de app, heartbeat ou conexão. |
| 032 | HistoricoAtribuicao | Intervalos de fila/responsável aptos a métricas e auditoria. |
| 033 | Resgate atômico | Dois resgates concorrentes deixam um vencedor e incrementam versao_atribuicao. |
| 034 | Transferência para fila | Limpa responsável, mantém protocolo/timeline/contexto e volta a AGUARDANDO. |
| 035 | Transferência direta | Destinatário disponível, fila explícita e sem aceite; uma alteração atômica. |
| 036 | Assunção por supervisor | Escopo por fila; responsável anterior perde autoridade imediatamente. |
| 037 | Calendários | Conta/fila, múltiplos períodos, feriados, exceções, 24x7 e override auditado. |
| 038 | SLA e escalonamento | Relógio começa na obrigação humana; alerta atendente→supervisor→admin sem transferência. |
| 039 | Janela Meta | Estado por Contato + Conta, alertas 1 h/30 min/10 min e texto livre bloqueado. |
| 040 | Timeline composta e NotaInterna | Mensagem, nota, evento, formulário e separador permanecem tipos distintos; nota nunca sai. |

### PR 022 — ContaWhatsApp

Aceite concluído em 31 de agosto de 2026: `ContaWhatsApp` passou a representar múltiplas origens empresariais por UUID interno estável, identidade externa única, telefone de exibição opcional, estado inicial `INATIVA` e histórico sem operação de exclusão. Cadastro exige `ADMINISTRAR_INTEGRACOES`, normaliza os campos textuais e audita na mesma transação sem propagar identificadores externos, telefone ou credencial. Token, segredo e certificado permanecem ausentes do domínio, banco e módulo da aplicação. Lint, tipos, 94 testes da API, 98 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831001100_criar_conta_whatsapp` terminou com código zero e a imagem `vyntra/api-staging:pr-022` ficou saudável com prontidão `PRONTO`. Em staging, duas contas coexistiram com IDs distintos e estado inativo; identidade externa duplicada, telefone inválido e telefone repetido foram recusados; nenhuma coluna de credencial existe, os dados sintéticos foram removidos e não houve erro de nível 50.

### PR 023 — Contato e IdentidadeWhatsApp

Aceite concluído em 31 de agosto de 2026: `Contato` e `IdentidadeWhatsApp` foram materializados com UUID interno, correlação única por portfólio+identificador estável, serialização transacional antes da primeira criação e FKs restritivas. Username, telefone e nome de perfil são opcionais e não participam da chave nem provam identidade ERP; reobservação preserva o contato e a auditoria não recebe seus valores. Lint, tipos, 100 testes da API, 102 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831001200_criar_contato_identidade_whatsapp` terminou com código zero e `vyntra/api-staging:pr-023` ficou saudável com prontidão `PRONTO`. Em staging, identidade sem username/telefone foi aceita, atributos repetidos coexistiram, identificador estável duplicado foi recusado, os dados sintéticos foram revertidos e não houve erro de nível 50.

### PR 024 — alteração e alias de identidade

Aceite concluído em 31 de agosto de 2026: alteração explícita anterior→atual passou a preservar `IdentidadeWhatsApp` e `Contato`, manter o identificador anterior em alias e registrar evento idempotente; as duas chaves são serializadas em ordem determinística. Origem ausente, alias fora de ordem ou destino pertencente a outro contato resulta em `SEPARADA_INCERTA`, sem merge automático. Lint, tipos, 106 testes da API, 106 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831001300_criar_alias_alteracao_identidade` terminou com código zero e `vyntra/api-staging:pr-024` ficou saudável com prontidão `PRONTO`. Em staging, o alias resolveu para o mesmo contato, os resultados `PRESERVADA` e `SEPARADA_INCERTA` coexistiram, o conflito manteve dois contatos, a transação sintética foi revertida e não houve erro de nível 50.

### PR 025 — vínculos de cliente e contexto do atendimento

Aceite concluído em 31 de agosto de 2026: múltiplos `VinculoCliente` e `VinculoContrato` passaram a coexistir por contato, enquanto `ContextoAtendimento` fixa um alvo explícito e versionado. FKs compostas recusam contrato/cliente de outro contato; troca humana exige autorização central, alvo ativo, versão esperada e auditoria transacional sem identificadores externos. Não há rota pública de criação/troca e o UUID do atendimento fica reservado até a FK aditiva da PR 028. Lint, tipos, 111 testes da API, 109 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831001400_criar_vinculo_contexto_atendimento` terminou com código zero e `vyntra/api-staging:pr-025` ficou saudável com prontidão `PRONTO`. Em staging, dois clientes e dois contratos coexistiram, a troca chegou à versão 2, combinação cruzada e segundo preferencial foram recusados, a transação sintética foi revertida e não houve erro de nível 50.

### PR 026 — SnapshotCliente no PostgreSQL

Aceite concluído em 31 de agosto de 2026: `SnapshotCliente` passou a persistir uma leitura protegida por vínculo ativo, com origem, captura, hash, versão e idade explícitos. Atualização serializa por vínculo, ignora captura antiga, trata replay idêntico e recusa divergência no mesmo instante; documento/telefone bruto ou campo desconhecido falha antes de persistir. A leitura declara `SNAPSHOT`; não há controller, escrita ERP, limiar fictício de obsolescência ou autoridade em Redis. Lint, tipos, 117 testes da API, 112 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831001500_criar_snapshot_cliente` terminou com código zero e `vyntra/api-staging:pr-026` ficou saudável com prontidão `PRONTO`. Em staging, atualização avançou à versão 2, unicidade por vínculo, JSON objeto e hash foram protegidos, a transação sintética foi revertida e não houve erro de nível 50.

### PR 027 — conversa única por contato

Aceite concluído em 31 de agosto de 2026: `Conversa` passou a ser única por `Contato`, sem estado/data de fechamento, e `ParticipacaoContaConversa` preserva cada conta WhatsApp e seu intervalo na mesma timeline. Resolução serializa por contato, exige conta ativa, reutiliza o UUID entre origens, não regride atividade sob evento atrasado e usa versão condicional. A participação não concede acesso nem substitui a origem futura de mensagem/atendimento. Lint, tipos, 123 testes da API, 115 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831001600_criar_conversa_unica` terminou com código zero e `vyntra/api-staging:pr-027` ficou saudável com prontidão `PRONTO`. Em staging, um contato preservou uma conversa e duas origens, atraso ampliou somente o início, segunda conversa e intervalo inválido foram recusados, a transação sintética foi revertida e não houve erro de nível 50.

### PR 028 — atendimento e máquina de estado

Aceite concluído em 31 de agosto de 2026: `Atendimento` passou a materializar estado, modo e motivo de espera ortogonais, com combinações protegidas tanto na máquina quanto no PostgreSQL. A origem empresarial deve participar da mesma `Conversa`; o contexto agora referencia um atendimento real. Resgate, retorno à fila, encerramento explícito, reaberturas humana/por entrada e finalização da tolerância têm transições determinísticas e versões separadas para estado e atribuição. Não existe transição de encerramento por inatividade: os 30 minutos apenas finalizam um fechamento já explícito. Lint, tipos, 130 testes da API, 117 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831001700_criar_atendimento_maquina_estado` terminou com código zero e `vyntra/api-staging:pr-028` ficou saudável com prontidão `PRONTO`. Em staging, origem alheia e atendimento humano sem atribuição foram recusados, a tolerância permaneceu exatamente em 30 minutos, o contexto apontou para o atendimento real, a transação sintética foi revertida e não houve erro de nível 50.

### PR 029 — protocolo ERP pendente

Aceite concluído em 31 de agosto de 2026: cada `Atendimento` pode ter exatamente um `ProtocoloErp`, que nasce `PENDENTE` sem número e só muda para `OFICIAL` diante de confirmação explícita da criação ou reconciliação do ERP. Resultado indisponível, ausente ou incerto não altera a pendência. O UUID interno e o marcador `PENDENTE` são recusados como número externo; protocolo oficial é globalmente único e imutável no serviço e no PostgreSQL. O simulador da porta ERP atribuiu um único protocolo oficial, sem ser registrado como integração real ou expor uma rota pública. Lint, tipos, 136 testes da API, 119 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831001800_criar_protocolo_erp_pendente` terminou com código zero e `vyntra/api-staging:pr-029` ficou saudável com prontidão `PRONTO`. Em staging, dois protocolos nasceram sem número; somente um foi confirmado, alteração, duplicidade e uso do UUID interno foram recusados, a transação sintética foi revertida e não houve erro de nível 50.

### PR 030 — filas e vínculos de usuário

Aceite concluído em 31 de agosto de 2026: `ServicoFilas` passou a cadastrar/inativar filas e conceder/revogar `AcessoUsuarioFila` com `ADMINISTRAR_FILAS`, locks transacionais, alvos ativos, idempotência e auditoria na mesma transação. O vínculo representa somente escopo: ele não cria nem altera permissões, e uma ação ausente ou negada no RBAC continua recusada. Inativar a fila torna o escopo ineficaz sem apagar o vínculo histórico; revogação é explícita. O módulo não publica controller administrativo prematuro. Lint, tipos, 142 testes da API, 122 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-030` ficou saudável com prontidão `PRONTO`. Em staging, fila e vínculo ativos coexistiram com negação explícita de resgate, nome duplicado foi recusado, inativação preservou o vínculo e revogação registrou instante próprio; a transação sintética foi revertida e não houve erro de nível 50.

### PR 031 — disponibilidade manual

Aceite concluído em 1º de setembro de 2026: `DisponibilidadeUsuario` passou a guardar `DISPONIVEL`/`INDISPONIVEL`, autor da alteração, instante e versão otimista. A própria pessoa pode alterar seu estado com permissão específica; supervisão/administração exige capacidade separada. Sessão, conexão, aplicativo aberto, dispositivo, push e heartbeat não inferem nem modificam disponibilidade. O módulo é interno, autoriza e audita na mesma transação e não publica controller prematuro. Lint, tipos, 146 testes da API, 124 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260831001900_criar_disponibilidade_manual` terminou com código zero e `vyntra/api-staging:pr-031` ficou saudável com prontidão `PRONTO`. Em staging, a mudança explícita incrementou a versão, o banco recusou versão inválida, não havia gatilho técnico de inferência, a transação sintética foi revertida e não houve erro de nível 50.

### PR 032 — histórico de atribuição

Aceite concluído em 1º de setembro de 2026: `HistoricoAtribuicao` passou a materializar intervalos de fila e responsabilidade por atendimento, com os seis motivos aprovados e executor humano opcional. O serviço serializa por atendimento, exige que o novo intervalo corresponda à atribuição atual, fecha o anterior e abre o seguinte no mesmo instante. O PostgreSQL garante um único intervalo aberto, combinações coerentes de fila/responsável e imutabilidade, permitindo somente fechar um intervalo ainda aberto. Índices temporais suportam métricas sem reconstrução de logs. Lint, tipos, 150 testes da API, 126 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901002000_criar_historico_atribuicao` terminou com código zero e `vyntra/api-staging:pr-032` ficou saudável com prontidão `PRONTO`. Em staging, a espera em fila foi calculada em 300 segundos, houve exatamente um intervalo atual `RESGATE`, segundo intervalo aberto e reescrita histórica foram recusados, a transação sintética foi revertida e não houve erro de nível 50.

### PR 033 — resgate atômico

Aceite concluído em 1º de setembro de 2026: o resgate passou a exigir cumulativamente `VISUALIZAR_FILA` e `RESGATAR_ATENDIMENTO` no escopo da fila. A escrita condicional compara estado `AGUARDANDO`, modo `FILA_HUMANA`, fila esperada, responsável nulo e `versao_atribuicao`; somente o vencedor muda para `EM_ATENDIMENTO/HUMANO`, incrementa as versões e registra histórico, evento e auditoria na mesma transação. O perdedor recebe conflito com o responsável vencedor e não produz efeitos derivados. Lint, tipos, 154 testes da API, 128 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve nova migration; `vyntra/api-staging:pr-033` ficou saudável com prontidão `PRONTO`. Em staging, dois candidatos produziram uma única alteração, a segunda comparação afetou zero registros, a versão avançou de 7 para 8, restou um único histórico aberto, a transação sintética foi revertida e não houve erro de nível 50.

### PR 034 — transferência para fila

Aceite concluído em 1º de setembro de 2026: `TRANSFERIR_FILA` passou a ser comando explícito da máquina de atendimento. A operação exige `TRANSFERIR_ATENDIMENTO` tanto na fila de origem quanto na de destino, compara origem e versão atomicamente e resulta em `AGUARDANDO/FILA_HUMANA`, motivo `AGUARDANDO_HUMANO`, fila destino e responsável nulo, incrementando as duas versões. Somente campos de estado/atribuição são escritos; conversa/timeline, conta de origem, protocolo, contexto e demais relações permanecem. Histórico `TRANSFERENCIA_FILA`, evento e auditoria compartilham a transação. Lint, tipos, 158 testes da API, 130 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve nova migration; `vyntra/api-staging:pr-034` ficou saudável com prontidão `PRONTO`. Em staging, a versão avançou de 5 para 6, responsável foi limpo, destino/histórico foram trocados e timeline, origem e protocolo permaneceram, com rollback sintético e nenhum erro de nível 50.

### PR 035 — transferência direta

Aceite concluído em 1º de setembro de 2026: a transferência direta passou a exigir fila destino explícita, `TRANSFERIR_ATENDIMENTO` nas filas de origem/destino e validação RBAC central de `RECEBER_TRANSFERENCIA` para o destinatário. O alvo deve estar `DISPONIVEL`; essa condição é lida antes do comando e repetida dentro do `UPDATE` atômico para cobrir mudança concorrente. O resultado é atribuição imediata `EM_ATENDIMENTO/HUMANO`, sem aceite intermediário, com versão incrementada, histórico `TRANSFERENCIA_USUARIO`, evento apto à notificação e auditoria na mesma transação. Lint, tipos, 162 testes da API, 132 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-035` ficou saudável com prontidão `PRONTO`. Em staging, a atribuição foi imediata com versão 9, mudança do alvo para indisponível fez a segunda escrita afetar zero registros, não existe coluna de aceite, o histórico ficou único, houve rollback sintético e nenhum erro de nível 50.

### PR 036 — assunção de supervisor

Aceite concluído em 1º de setembro de 2026: `ASSUMIR_SUPERVISOR` passou a trocar atomicamente o responsável de um atendimento aberto, comparando fila, responsável anterior e versão. Somente `SUPERVISOR` ou `ADMINISTRADOR` com `ASSUMIR_ATENDIMENTO` pode executar; supervisão exige vínculo ativo à fila e administração mantém o bypass de escopo aprovado. O novo responsável fica em `EM_ATENDIMENTO/HUMANO` e a versão aumenta. A verificação de autoridade exige atendimento, responsável e versão correntes, portanto o operador anterior perde poder de envio imediatamente. Histórico `ASSUNCAO_SUPERVISOR`, evento canônico e auditoria compartilham a transação. Lint, tipos, 166 testes da API, 134 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-036` ficou saudável com prontidão `PRONTO`. Em staging, a autoridade anterior caiu de um registro para zero, o supervisor ganhou exatamente uma autoridade na versão 15 e restou um histórico aberto, com rollback sintético e nenhum erro de nível 50.

### PR 037 — calendários operacionais

Aceite concluído em 1º de setembro de 2026: calendários de conta ou fila passaram a suportar fuso IANA, múltiplos períodos semanais, feriados, exceções, modo 24x7 e overrides administrativos temporários. A avaliação determinística prioriza override vigente, exceção da data, feriado, 24x7 e grade semanal. Períodos usam intervalos semiabertos e sobreposição é recusada no domínio e no PostgreSQL. Overrides exigem `ADMINISTRAR_CALENDARIOS`, motivo e vigência, são auditados na mesma transação e imutáveis depois de criados. Lint, tipos, 171 testes da API, 136 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. As migrations `20260901002100_criar_calendarios` e `20260901002110_corrigir_validacao_intervalos_calendario` terminaram com código zero e `vyntra/api-staging:pr-037` ficou saudável com prontidão `PRONTO`. O primeiro ensaio revelou e corrigiu a avaliação cruzada do gatilho; na repetição, dois períodos não sobrepostos, feriado, exceção e override coexistiram, sobreposição e mutação do override foram recusadas, a transação foi revertida e não houve erro de nível 50.

### PR 038 — SLA e escalonamento

Aceite concluído em 1º de setembro de 2026: `PoliticaSla` passou a definir os marcos crescentes por fila e cada obrigação humana cria um ciclo de `RelogioSlaAtendimento` com política/versão e vencimentos congelados. Automação e fila sem política não inventam relógio. A avaliação atrasada emite, em ordem, alertas idempotentes para atendente, supervisor e administrador; concluir a obrigação fecha o ciclo e permite o seguinte. Eventos operacionais são produzidos na mesma transação, sem alterar fila, responsável ou versão de atribuição e sem transferência automática. Lint, tipos, 175 testes da API, 138 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901002200_criar_sla_escalonamento` terminou com código zero e `vyntra/api-staging:pr-038` ficou saudável com prontidão `PRONTO`. Em staging, política inválida e segundo relógio ativo foram recusados; dois ciclos sequenciais e os três alertas coexistiram, enquanto responsável permaneceu nulo e `versao_atribuicao` permaneceu 7; houve rollback e nenhum erro de nível 50.

### PR 039 — janela de atendimento do canal

Aceite concluído em 1º de setembro de 2026: `JanelaAtendimentoCanal` passou a manter estado independente para cada par contato + conta WhatsApp, abrindo ou ampliando exatamente 24 horas a partir da entrada mais nova do contato. Replay, duplicidade ou evento atrasado não fazem o prazo regredir. O limite é semiaberto: no instante exato de expiração, texto livre já é recusado. Saída por modelo aprovado permanece permitida sem criar, reabrir ou ampliar janela. Alertas de uma hora, 30 minutos e 10 minutos são idempotentes por versão, preservando o histórico quando uma nova entrada amplia a vigência. O domínio usa termos internos; detalhes de Meta/template ficam para o adapter futuro. Lint, tipos, 179 testes da API, 140 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901002300_criar_janela_atendimento_canal` terminou com código zero e `vyntra/api-staging:pr-039` ficou saudável com prontidão `PRONTO`. Em staging, duas contas mantiveram janelas distintas para o mesmo contato, todas as vigências tiveram 86.400 segundos, a conta A avançou para a versão 2, o limite exato ficou fechado e quatro alertas históricos foram preservados; duração inválida e alerta repetido foram recusados, houve rollback e nenhum erro de nível 50.

### PR 040 — timeline composta e nota interna

Aceite concluído em 1º de setembro de 2026: a timeline passou a ter união discriminada para `MENSAGEM`, `NOTA_INTERNA`, `EVENTO_OPERACIONAL`, `FORMULARIO` e `SEPARADOR_ATENDIMENTO`, ordenada por ocorrência e `sequencia_evento` sem converter um tipo em outro. `NotaInterna` exige `ADICIONAR_NOTA_INTERNA` na fila e vínculo exato entre conversa e atendimento aberto. Ela persiste conteúdo protegido, autor, instante e visibilidade única `SOMENTE_EQUIPE`; evento e auditoria não recebem o texto. O PostgreSQL torna a nota imutável. O módulo não importa mensageria, adapter nem caixa de saída e a tabela não possui coluna de destino/estado de envio, impedindo que a nota saia para o cliente por esse caminho. Lint, tipos, 182 testes da API, 142 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901002400_criar_timeline_nota_interna` terminou com código zero e `vyntra/api-staging:pr-040` ficou saudável com prontidão `PRONTO`. Em staging, uma nota permaneceu `SOMENTE_EQUIPE` e inalterada; conteúdo vazio, contexto conversa–atendimento cruzado e alteração posterior foram recusados, não havia coluna de saída, houve rollback e nenhum erro de nível 50.

### PR 041 — mensagem e máquina de saída

Aceite concluído em 1º de setembro de 2026: `Mensagem` passou a pertencer simultaneamente à conversa contínua, ao atendimento e à conta WhatsApp de origem, preservando conteúdo protegido, hash, remetente e chave idempotente do cliente. A criação de texto exige `ENVIAR_MENSAGEM`, responsabilidade humana atual e janela do canal aberta; grava `NA_FILA`, evento e item da caixa de saída na mesma transação sem expor texto nos eventos. A máquina permite somente `NA_FILA→ENVIANDO→ENVIADA→ENTREGUE→LIDA`, retorno temporário `ENVIANDO→NA_FILA`, falha definitiva e cancelamento antes do envio. O PostgreSQL replica as transições e torna a identidade/conteúdo imutáveis. Lint, tipos, 186 testes da API, 144 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901002500_criar_mensagem_maquina_saida` terminou com código zero e `vyntra/api-staging:pr-041` ficou saudável com prontidão `PRONTO`. Em staging, a cadeia chegou a `LIDA` na versão 5, o cancelamento chegou a `CANCELADA`, regressão e alteração de conteúdo foram recusadas, houve rollback e nenhum erro de nível 50.

### PR 042 — mídia e storage

Aceite concluído em 1º de setembro de 2026: imagem JPEG/PNG/WebP, áudio MPEG/Ogg, vídeo MP4 e PDF passaram a ser reconhecidos por assinatura binária, com MIME declarado obrigatoriamente igual ao detectado e limites por categoria. A mídia pertence a uma `Mensagem` de tipo compatível e persiste somente bucket privado, chave opaca, MIME, tamanho e hash; URL pública ou assinada não integra o domínio. O PostgreSQL replica os limites estruturais, valida a correspondência categoria–mensagem e torna a referência imutável. Lint, tipos, 190 testes da API, 146 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901002600_criar_midia_mensagem` terminou com código zero e `vyntra/api-staging:pr-042` ficou saudável com prontidão `PRONTO`. Em staging, uma imagem PNG válida foi vinculada ao bucket `vyntra-staging-midias`; MIME/tipo divergentes e mutação foram recusados, não houve URL pública, a transação foi revertida e nenhum erro de nível 50 foi emitido.

### PR 043 — caracterização real da Meta

Aceite concluído em 1º de setembro de 2026: a coleção oficial da Meta e o material oficial de usernames/BSUID foram registrados como evidência revisada. O adapter exige versão explícita `vN.0`, considera BSUID identificador estável, mantém username e telefone opcionais e trata capacidades/throughput por conta como observações, nunca constantes globais. Fixtures sanitizadas cobrem webhook com BSUID sem telefone. Como não foi fornecida conta Meta real nem token, a própria caracterização impede ativação com evidência sintética ou capacidade `NAO_OBSERVADA`; a versão `v25.0` da fixture não é promovida a recomendação de produção. Lint, tipos, 193 testes da API, 148 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-043` ficou saudável com prontidão `PRONTO`. Em staging, fixture/versão e identidade BSUID sem telefone foram aceitas, ativação real permaneceu `false`, migration encerrou com código zero e nenhum erro de nível 50 foi emitido.

### PR 044 — entrada do AdaptadorMetaCloud

Aceite concluído em 1º de setembro de 2026: o adapter passou a verificar `X-Hub-Signature-256` por HMAC SHA-256 sobre o corpo bruto com comparação constante, limite de corpo e parsing estrito. A conta externa é resolvida para `ContaWhatsApp` ativa; BSUID resolve o contato, a conversa única registra a conta participante e um atendimento BOT/protocolo pendente nasce quando necessário. `EventoEntradaCanal` deduplica por conta + identificador externo. Mensagem `ENTRADA` e a recepção `PERSISTIDO` são gravadas antes do evento que libera automação/retorno. Lint, tipos, 197 testes da API, 150 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901002700_criar_entrada_canal` terminou com código zero e `vyntra/api-staging:pr-044` ficou saudável com prontidão `PRONTO`. Em staging, duplicidade foi recusada, recepção chegou a `PERSISTIDO` somente vinculada à mensagem `ENTRADA`, mutação posterior foi bloqueada, houve rollback e nenhum erro de nível 50 foi emitido.

### PR 045 — saída do AdaptadorMetaCloud

Aceite concluído em 1º de setembro de 2026: o adapter de saída passou a exigir versão e credencial externas explícitas, converter somente o comando interno de texto e considerar a mensagem `ACEITA` apenas quando a Meta responde em HTTP 2xx com identificador externo válido. Timeout, indisponibilidade, limitação e códigos transitórios produzem falha temporária com repetição controlada; autenticação, configuração, destinatário e payload inválidos produzem falha definitiva. Resposta 2xx sem identificador não confirma envio nem autoriza repetição cega. O despachante grava `ENVIADA` somente após aceite, devolve falha temporária a `NA_FILA` e termina falha definitiva em `FALHOU`. Lint, tipos, 201 testes da API, 152 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-045` ficou saudável com prontidão `PRONTO`. Em staging, aceite, 2xx sem ID, indisponibilidade e destinatário inválido foram classificados corretamente, migration encerrou com código zero e nenhum erro de nível 50 foi emitido.

### PR 046 — estados de entrega e leitura

Aceite concluído em 1º de setembro de 2026: recibos externos de envio, entrega, leitura e falha passaram a ser normalizados no adapter e deduplicados por conta + identificador determinístico. A aplicação é monotônica: leitura pode avançar diretamente de `ENVIADA` para `LIDA`, materializando a entrega ausente; entrega, envio ou falha atrasados não vencem `ENTREGUE/LIDA`. Todo recibo único é preservado, mas somente avanço real marca a recepção como aplicada e emite `ESTADO_MENSAGEM_ATUALIZADO`. Lint, tipos, 203 testes da API, 152 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901002800_criar_estados_mensagem` terminou com código zero e `vyntra/api-staging:pr-046` ficou saudável com prontidão `PRONTO`. Em staging, leitura fora de ordem chegou a `LIDA` na versão 4, entrega atrasada permaneceu não aplicada, replay inseriu zero linhas, dois recibos foram preservados com somente um aplicado, houve rollback e nenhum erro de nível 50 foi emitido.

### PR 047 — resposta citada, reação e prévia

Aceite concluído em 1º de setembro de 2026: resposta citada e reação passaram a manter o identificador interno real da mensagem-alvo e a exigir mesma conversa e conta WhatsApp no domínio e no PostgreSQL. Capacidades observadas no adapter são projetadas como booleanos internos. Resposta usa contexto externo somente quando a capacidade está habilitada e o alvo possui ID externo; caso contrário, mantém a relação interna com fallback textual protegido. Reação sem capacidade fica somente interna e não produz efeito surpresa no cliente. Prévia de URL permanece desligada até observação positiva. Lint, tipos, 206 testes da API, 152 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901002900_proteger_relacoes_mensagem` terminou com código zero e `vyntra/api-staging:pr-047` ficou saudável com prontidão `PRONTO`. Em staging, resposta e reação válidas foram persistidas, vínculo com outra conta e reação sem alvo foram recusados, houve rollback e nenhum erro de nível 50 foi emitido.

### PR 048 — catálogo de modelos de mensagem

Aceite concluído em 1º de setembro de 2026: modelos passaram a ser normalizados no adapter e catalogados por conta, referência do canal, nome e idioma, com estado, quantidade de parâmetros, componentes protegidos, hash, instante de sincronização e versão. Composição exige correspondência exata, estado `APROVADO` e parâmetros completos; estado externo desconhecido falha fechado. Repetição idêntica preserva ID/versão. O primeiro ensaio revelou o limite de repetição da regex do PostgreSQL e a migration complementar corrigiu a validação antes do aceite. Lint, tipos, 209 testes da API, 152 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. As migrations `20260901003000_criar_catalogo_modelos_mensagem` e `20260901003010_corrigir_validacao_modelo_mensagem` terminaram com código zero e `vyntra/api-staging:pr-048` ficou saudável com prontidão `PRONTO`. Em staging, dois idiomas e um único aprovado coexistiram, duplicidade nome + idioma foi recusada, nenhuma janela foi criada, houve rollback e nenhum erro de nível 50 foi emitido.

### PR 049 — composição de segunda via

Aceite concluído em 1º de setembro de 2026: a composição de segunda via passou a sempre apresentar valor e vencimento e selecionar PDF, Pix copia e cola, linha digitável e link HTTPS conforme disponibilidade. Ausência de todos os meios produz fallback explícito para a equipe, sem inventar conteúdo. Opções permanecem em objeto protegido com hash e indicadores coerentes; PDF referencia mídia privada existente. O componente somente compõe a comunicação: não possui comando, estado ou coluna para pagar, cobrar ou liquidar. Lint, tipos, 212 testes da API, 152 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901003100_criar_composicao_segunda_via` terminou com código zero e `vyntra/api-staging:pr-049` ficou saudável com prontidão `PRONTO`. Em staging, composição completa e fallback coexistiram, indicador incoerente foi recusado, zero coluna de pagamento foi encontrada, houve rollback e nenhum erro de nível 50 foi emitido.

### PR 050 — WhatsApp Flows e submissões

Aceite concluído em 1º de setembro de 2026: formulários de identificação e cadastro comercial passaram a ser catalogados por conta, com definição protegida, hash, estado e versão. O adapter transforma a resposta externa em submissão idempotente sem conservar o token do Flow. O projetor da timeline aceita apenas campos declarados, mascara os sensíveis sem permissão e entrega um card estruturado `FORMULARIO`, `SOMENTE_EQUIPE`, com a ação `VER_FORMULARIO`; o JSON protegido não integra a projeção. Submissões são imutáveis no PostgreSQL e únicas por mensagem e referência do canal. Lint, tipos, 215 testes da API, 152 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901003200_criar_formularios_canal` terminou com código zero e `vyntra/api-staging:pr-050` ficou saudável com prontidão `PRONTO`. Em staging, uma submissão `INTERATIVA` de formulário ativo foi persistida, o replay inseriu zero linhas, a mutação foi recusada, nenhuma coluna bruta foi encontrada, houve rollback e nenhum erro de nível 50 foi emitido.

### PR 051 — disparo transacional pelo ERP

Aceite concluído em 1º de setembro de 2026: aplicações de integração passaram a autenticar com segredo de alta entropia persistido somente por SHA-256 e comparado em tempo constante. Cada disparo exige aplicação ativa, consentimento `MENSAGEM_TRANSACIONAL` concedido para o contato e conta exatos, modelo aprovado, mensagem de máquina sem usuário remetente e chave idempotente armazenada somente por hash. Repetição compatível devolve o mesmo disparo e comando divergente é recusado. A mensagem nasce `NA_FILA`, entra na timeline e segue a máquina já aprovada; o retorno lê `NA_FILA`, `ENVIADA`, `ENTREGUE`, `LIDA` ou `FALHOU` da própria mensagem. O PostgreSQL repete as validações no instante da inserção e torna o disparo imutável. Lint, tipos, 218 testes da API, 152 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901003300_criar_disparo_transacional` terminou com código zero e `vyntra/api-staging:pr-051` ficou saudável com prontidão `PRONTO`. Em staging, replay inseriu zero linhas, consentimento revogado e mutação foram recusados, o retorno chegou a `ENTREGUE`, não havia credencial bruta, houve rollback e nenhum erro de nível 50 foi emitido. Endpoint e callback reais permanecem desligados até cumprir os portões externos já documentados.

### PR 052 — projeções autorizadas de evento

Aceite concluído em 1º de setembro de 2026: `EventoDominio` passou a ser convertido por negação padrão em contratos discriminados para `WEB`, `MOBILE` e `PUSH`. Sessão e acesso ao recurso são avaliados no contexto atual; `PERMISSOES_ALTERADAS` alcança somente o próprio usuário. Tipos não publicados viram atualização genérica e dados seguem allowlist de primitivas compatível com sua classificação. Web não recebe política local; mobile recebe somente a política de cache; push admite apenas os cinco avisos aprovados, com sequência e IDs mínimos, sem dados ou conteúdo. Lint, tipos, 222 testes da API, 152 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-052` ficou saudável com prontidão `PRONTO`. Em staging, web, mobile e push receberam suas projeções, recurso negado não recebeu evento, conteúdo protegido não vazou, migration encerrou com código zero e nenhum erro de nível 50 foi emitido.

### PR 053 — sincronização incremental

Aceite concluído em 1º de setembro de 2026: web e mobile passaram a recuperar fatos confirmados por `sequencia_evento`, com cursor decimal validado, limite máximo de 100, ordem estrita e indicação de continuação. A identidade vem exclusivamente da sessão web ou mobile autenticada. A autorização atual é calculada no PostgreSQL antes da projeção; linha fora do escopo chega ao serviço somente com objeto vazio, mas sua sequência ainda faz o cursor avançar, impedindo tanto vazamento quanto travamento em lacunas de permissão. Cursor anterior à retenção de 30 dias exige ressincronização completa e cursor futuro é recusado. O planejador local aplica lotes de modo idempotente e só confirma o cursor depois do lote válido. Lint, tipos, 225 testes da API, 152 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-053` ficou saudável com prontidão `PRONTO`. Em staging, uma primeira página não autorizada retornou zero eventos e avançou o cursor; a página seguinte entregou somente a conversa permitida, nenhum campo protegido vazou, migration encerrou com código zero e nenhum erro de nível 50 foi emitido.

### PR 054 — ressincronização completa consistente

Aceite concluído em 1º de setembro de 2026: `GET /api/v1/sincronizacao/completa` passou a reconstruir a réplica autorizada em transação PostgreSQL `REPEATABLE READ` e somente-leitura. A primeira leitura captura `sequencia_base`; filas, permissões efetivas, atendimentos abertos/reabríveis, até 200 conversas recentes e 200 mensagens/notas por conversa, controles de recurso e políticas de versão observam exatamente o mesmo snapshot lógico. Fila, conversa, mensagem e nota são filtradas no banco pela autorização vigente antes da projeção. O planejador mobile substitui réplica e cursor na mesma transação SQLite e preserva rascunhos e comandos pendentes. Lint, tipos, 228 testes da API, 155 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-054` ficou saudável com prontidão `PRONTO`. Em staging, somente uma das duas filas sintéticas apareceu, a conversa negada não vazou, uma alteração concorrente permaneceu invisível na leitura antiga e seu evento posterior foi recuperado pelo incremental; migration encerrou com código zero, os dados de aceite foram removidos e nenhum erro de nível 50 foi emitido.

### PR 055 — SSE web sem lacuna

Aceite concluído em 1º de setembro de 2026: a web passou a acompanhar `GET /api/v1/sincronizacao/eventos` por SSE autenticado exclusivamente pelo cookie de sessão. O coordenador inicia a consulta ao PostgreSQL em modo buffer antes de capturar a marca d’água, envia o backlog autorizado até o limite, drena eventos posteriores ordenados e sem duplicidade e então entra ao vivo. `Last-Event-ID` é a `sequencia_evento` realmente aplicada; heartbeat não altera disponibilidade. `Cache-Control: no-cache, no-transform` e `X-Accel-Buffering: no` impedem buffering indevido. Buffer excessivo ou falha fecha o stream para reconexão recuperável. Lint, tipos, 231 testes da API, 158 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-055` ficou saudável com prontidão `PRONTO`. Em staging, o endpoint retornou `text/event-stream`, entregou backlog e evento ao vivo uma única vez, retomou somente o segundo pelo primeiro ID, migration encerrou com código zero, os dados sintéticos foram removidos e nenhum erro de nível 50 foi emitido.

### PR 056 — WebSocket mobile sem lacuna

Aceite concluído em 1º de setembro de 2026: o mobile passou a acompanhar `/api/v1/sincronizacao/eventos-mobile?apos=<sequencia>` por WebSocket autenticado com access token, UUID do dispositivo e segredo de vínculo. O gateway autentica antes do upgrade, inicia a consulta PostgreSQL em modo buffer, captura a marca d’água, entrega backlog e eventos concorrentes em ordem e só então declara `PRONTO`. Cada `EVENTO` exige `CONFIRMAR`; a confirmação é cumulativa, monotônica e nunca pode superar a maior sequência enviada. Heartbeat usa ping/pong técnico. Cursor inválido, mensagem binária, ordem impossível, pressão de saída, excesso de confirmações pendentes ou falha de sincronização fecham a conexão para retomada pelo último evento aplicado. Lint, tipos, 235 testes da API, 161 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-056` ficou saudável com prontidão `PRONTO`. Em staging, as sequências `12` e `13` chegaram uma única vez como backlog e vivo, três confirmações foram aceitas, a retomada pelo cursor `12` entregou somente `13`, segredo incorreto recebeu `401`, migration encerrou com código zero, os dados sintéticos foram removidos e nenhum erro de nível 50 foi emitido.

### PR 057 — avisos mobile por push

Aceite concluído em 1º de setembro de 2026: a projeção `PUSH` passou por um compositor de domínio que aceita somente os cinco avisos aprovados, sequência observada e UUIDs mínimos de navegação. Título e corpo pertencem a um catálogo genérico sem nome, conteúdo, CPF, fatura ou dado financeiro. A chave de agrupamento é derivada da conversa e, quando ela não existe, do atendimento; uma rajada substitui o aviso agrupado anterior. A porta de entrega usa resultados internos `ACEITO`, `DESTINO_INVALIDO` e `INDISPONIVEL`; termos do provedor e o simulador ficam nos adapters, e o simulador não é registrado na aplicação. No app, `expo-notifications` recebe somente uma allowlist estrita; aviso em primeiro plano solicita sincronização, enquanto toque ou abertura a frio sincroniza antes de navegar. Falha de sincronização impede a navegação, e push nunca grava SQLite, avança cursor, marca leitura ou habilita ação. Lint, tipos, 239 testes da API, 165 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-057` ficou saudável com prontidão `PRONTO`. Em staging, as sequências `57` e `58` da mesma conversa produziram um único aviso na sequência mais recente, campo adicional foi recusado, indisponibilidade permaneceu explícita, migration encerrou com código zero e nenhum erro de nível 50 foi emitido. Envio externo real permanece sem adapter registrado até existirem credenciais, destinos e configuração operacional aprovados; isso não é substituído pelo simulador.

### PR 058 — invalidação por permissão

Aceite concluído em 1º de setembro de 2026: cada usuário ativo passou a possuir `versao_permissoes`. Concessão, revogação ou inativação de fila incrementa a versão e confirma `PERMISSOES_ALTERADAS` na mesma transação da mudança de escopo; repetição idempotente não cria nova invalidação. A projeção alcança somente o usuário afetado. SSE revalida a sessão durante o stream e, após entregar o evento, encerra a resposta. WebSocket autentica no upgrade, heartbeat e confirmação e fecha com código privado `4003` depois de entregar a invalidação. O snapshot completo publica `versao_permissoes`; o coordenador mobile pausa comandos, fecha o tempo real, exige snapshot ao menos tão novo quanto evento e versão, substitui a réplica removendo ausentes, reconcilia pendências e só então reconecta. Falha bloqueia a área autenticada. Lint, tipos, 244 testes da API, 168 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901003400_versionar_permissoes_usuario` terminou com código zero e `vyntra/api-staging:pr-058` ficou saudável com prontidão `PRONTO`. Em staging, uma fila autorizada apareceu no snapshot de versão 1; a revogação transacional gerou o evento `14`, encerrou o WebSocket com `4003`, elevou a versão para 2, removeu a fila do novo snapshot e permitiu reconexão em `PRONTO`. Dados sintéticos foram removidos e nenhum erro de nível 50 foi emitido.

### PR 059 — caracterização real do MK Solutions

Aceite concluído em 1º de setembro de 2026: a integração MK Solutions recebeu um inventário versionado de onze capacidades internas, famílias externas, licenciamento, transporte e estado da evidência. O validador usa allowlist estrita, exige fontes oficiais e rejeita campos, capacidades ausentes ou duplicadas. A fixture pública sanitizada registra honestamente que respostas reais, DTOs, paginação e erros ainda não foram observados; por isso o portão de ativação permanece fechado e nenhum contrato externo foi inventado. Lint, tipos, 246 testes da API, 170 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-059` ficou saudável com prontidão `PRONTO`. Em staging, as onze operações foram lidas, o portão permaneceu fechado, campo inesperado foi recusado e nenhum erro de nível 50 foi emitido.

### PR 060 — consultas de cliente e contrato

Aceite concluído em 1º de setembro de 2026: a porta ERP passou a oferecer busca e detalhes exatos de cliente e contrato em modelos internos normalizados. `ServicoConsultasClienteContratoErp` valida entrada e resposta, limita resultados, exige coerência cliente↔contrato e recusa qualquer campo desconhecido. Ausência, indisponibilidade e resposta inválida são distintas; sucesso sempre declara origem `TEMPO_REAL`. Nenhum nome, DTO, endpoint ou provider MK atravessa a fronteira, e o adapter real permanece desligado até a observação aprovada. Lint, tipos, 250 testes da API, 172 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-060` ficou saudável com prontidão `PRONTO`. Em staging, busca, cliente e contrato normalizados tiveram sucesso, ausência foi preservada, documento de busca não vazou e nenhum erro de nível 50 foi emitido.

### PR 061 — financeiro e faturas em tempo real

Aceite concluído em 1º de setembro de 2026: a porta ERP passou a consultar fatura, documento e dados de pagamento separadamente. `ServicoFinanceiroErp` valida vínculo ao contrato, situação, valor, vencimento, assinatura/tamanho do PDF, Pix e linha digitável. Documento e pagamento declaram disponibilidade independente; ausência ou capacidade indisponível produz `PARCIAL` com motivo, sem inventar valor. Fatura e complementos bem-sucedidos são sempre `TEMPO_REAL`; snapshot financeiro não é fallback. O modelo interno usa bytes de PDF e não deixa URL, Base64 ou DTO externo atravessar a fronteira. Lint, tipos, 255 testes da API, 174 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-061` ficou saudável com prontidão `PRONTO`. Em staging, o caso completo confirmou situação, PDF e pagamento; o caso parcial identificou os dois complementos como `NAO_FORNECIDO`, e nenhum erro de nível 50 foi emitido.

### PR 062 — sincronização do SnapshotCliente

Aceite concluído em 1º de setembro de 2026: `SnapshotCliente` passou a persistir `ATUAL`, `OBSOLETO` ou `EXCLUIDO`, com motivo, instante e versão. Incremental aceita atualização e tombstone explícito; reconciliação só aceita ausências quando a enumeração é declarada completa. Lotes são limitados a 100 e não admitem o mesmo vínculo duas vezes. Obsolescência preserva o documento protegido, evidência antiga não regride estado e observação posterior reativa. O aceite PostgreSQL revelou e corrigiu um byte nulo indevido na chave do advisory lock. Lint, tipos, 260 testes da API, 175 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901003500_estado_snapshot_cliente` terminou com código zero e `vyntra/api-staging:pr-062` ficou saudável com prontidão `PRONTO`. Em staging, o serviço e repositório reais percorreram `ATUAL→OBSOLETO→ATUAL→EXCLUIDO`, a leitura expôs motivo/versão, dados sintéticos foram removidos e nenhum erro de nível 50 foi emitido.

### PR 065 — execução de desbloqueio

Aceite concluído em 1º de setembro de 2026: a execução de desbloqueio passou a exigir confirmação explícita, permissão própria, contexto exato e nova elegibilidade ERP em tempo real. Um advisory lock e uma reserva única por contrato fecham a corrida entre chaves distintas. Confirmação grava histórico imutável, conclui idempotência, audita e libera a reserva atomicamente; resposta perdida conserva operação e reserva até reconciliação, sem repetição cega. Campo externo inválido falha conservadoramente, snapshot é recusado e o adapter MK real permanece desligado. Lint, tipos, 276 testes da API, 178 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. O primeiro exercício PostgreSQL revelou e corrigiu o retorno `void` do advisory lock antes da aceitação. A migration `20260901004500_reserva_desbloqueio_confianca` terminou com código zero e `vyntra/api-staging:pr-065` ficou saudável com prontidão `PRONTO`. Em staging, execução e replay produziram um único efeito, histórico e auditoria; a reserva terminou vazia, outra chave foi bloqueada por `INTERVALO_30_DIAS`, dados sintéticos foram removidos e nenhum erro de nível 50 foi emitido.

### PR 066 — ordem de serviço

Aceite concluído em 1º de setembro de 2026: criação e atualização de ordem de serviço passaram a exigir confirmação explícita, `CRIAR_ORDEM_SERVICO`, atendimento/fila autorizados e correspondência exata de cliente, contrato e protocolo oficial. A criação é única pela operação e pelo identificador externo. Atualizações usam versão otimista, advisory lock, reserva exclusiva por ordem e histórico imutável; confirmação atualiza domínio, conclui idempotência, audita e libera a reserva atomicamente. Resultado ambíguo exige reconciliação e não permite repetição cega; snapshot, controller e provider MK real permanecem fora do módulo. Lint, tipos, 287 testes da API, 181 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901005000_ordens_servico_erp` terminou com código zero e `vyntra/api-staging:pr-066` ficou saudável com prontidão `PRONTO`. Em staging, criação e atualização produziram um efeito externo cada, ambos os replays foram estáveis, a ordem terminou na versão 2 com um histórico, a reserva terminou vazia, versão obsoleta foi recusada antes do adapter, a auditoria permaneceu sanitizada, dados sintéticos foram removidos e nenhum erro de nível 50 foi emitido.

### PR 067 — comentário, encerramento e link

Aceite concluído em 1º de setembro de 2026: comentário de finalização e encerramento por protocolo oficial passaram a exigir confirmação explícita, `ENCERRAR_ATENDIMENTO`, fila autorizada e contexto exato. Comentário confirmado persiste apenas hash e não altera o atendimento. Encerramento usa advisory lock, versão otimista, reserva exclusiva e a máquina de estado; somente a confirmação externa fecha a atribuição, grava evento e deixa o atendimento `ENCERRADO_REABRIVEL`. Resultado ambíguo preserva o atendimento aberto e a reserva até reconciliação, sem repetição cega. Auditoria não recebe comentário, motivo ou protocolo em claro. O link público permanece `DESATIVADO` por aprovação jurídica pendente, sem token, URL ou rota; controller e provider MK real continuam ausentes. Lint, tipos, 300 testes da API, 184 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901005500_acoes_atendimento_erp` terminou com código zero e `vyntra/api-staging:pr-067` ficou saudável com prontidão `PRONTO`. Em staging, comentário e encerramento produziram um efeito externo cada, os replays foram estáveis, a resposta perdida manteve o atendimento aberto até a reconciliação, a transição final gerou um evento, encerrou o histórico, removeu a reserva e preservou auditoria sanitizada. Dados sintéticos foram removidos e nenhum erro de nível 50 foi emitido.

### PR 069 — fluxo, versão e ponteiro publicado

Aceite concluído em 1º de setembro de 2026: `Fluxo` passou a ser a identidade estável e `VersaoFluxo` a definição numerada. Criação de fluxo e versão 1 em `RASCUNHO` compartilha transação; novas versões recebem número sob lock; alteração de rascunho exige revisão esperada. PostgreSQL limita a definição a objeto JSON de 256 KiB, impõe uma única versão `PUBLICADA`, valida por referência composta e constraint diferida que o ponteiro pertença ao mesmo fluxo e protege definição, autoria e datas publicadas contra reescrita ou exclusão. O seletor para futura execução devolve exatamente a versão apontada, não a versão mais recente. Não há controller, editor, executor, worker ou adapter antecipado. Lint, tipos, 307 testes da API, 187 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901010000_fluxos_versionados` terminou com código zero e `vyntra/api-staging:pr-069` ficou saudável com prontidão `PRONTO`. Em staging, o serviço e repositório reais criaram as versões 1 e 2, fixaram o ponteiro na versão 1, editaram somente o rascunho e o trigger recusou alterar a definição publicada; a transação de aceite foi revertida integralmente, os dados sintéticos foram removidos e nenhum erro de nível 50 foi emitido.

### PR 070 — publicação, arquivamento e reversão

Aceite concluído em 1º de setembro de 2026: publicação, arquivamento e reversão passaram a ser serializados por fluxo, comparar `revisao` e exigir `PUBLICAR_FLUXO` ou `REVERTER_FLUXO`. Publicação aceita somente `EM_TESTE`; reversão aceita somente `ARQUIVADA` e conserva definição, autoria e data originais. Versão atual, alvo, ponteiro e revisão mudam na mesma transação, que também acrescenta `HistoricoPublicacaoFluxo` e auditoria sanitizada. O histórico vincula versões do mesmo fluxo, tem revisão resultante única e é imutável contra update, delete e truncate. Nenhuma rota foi exposta antes do validador integral. Lint, tipos, 313 testes da API, 190 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901010500_historico_publicacao_fluxo` terminou com código zero e `vyntra/api-staging:pr-070` ficou saudável com prontidão `PRONTO`. Em staging, serviços, repositórios, auditoria e PostgreSQL reais percorreram publicação v1, publicação v2, reversão para v1 e arquivamento nas revisões 2–5; estados, ponteiro e quatro históricos permaneceram coerentes, e o trigger recusou reescrita. A transação de aceite foi revertida, os dados sintéticos foram removidos e nenhum erro de nível 50 foi emitido.

### PR 071 — validador de publicação

Aceite concluído em 1º de setembro de 2026: a promoção de `RASCUNHO` para `EM_TESTE` passou a exigir `PUBLICAR_FLUXO`, revisão esperada e validação semântica integral. O schema fechado verifica início/fim, alcance, conexões e saídas, variáveis disponíveis em todos os caminhos, sensibilidade, ciclos limitados com saída, capacidades habilitadas, referências ativas e parâmetros proibidos. O contexto é obtido no backend; a implementação conservadora nega capacidades externas não registradas. Falha conserva o rascunho e não audita sucesso, enquanto a promoção válida e a auditoria compartilham a transação. Lint, tipos, 321 testes da API, 192 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. Não houve migration; `vyntra/api-staging:pr-071` ficou saudável com prontidão `PRONTO` e sem migrations pendentes. Em staging, os serviços e repositórios reais validaram e publicaram o grafo nativo válido, mantiveram a segunda versão inválida em `RASCUNHO`, produziram uma auditoria de validação e um histórico de publicação, confirmaram ponteiro coerente e fizeram rollback integral dos dados sintéticos; nenhum erro de nível 50 foi emitido.

### PR 072 — máquina persistente de execução

Aceite concluído em 1º de setembro de 2026: `ExecucaoFluxo` passou a fixar atendimento, fluxo, versão publicada inicial, nó atual, contexto protegido, estado, revisão e datas no PostgreSQL. A máquina admite somente transições explícitas; estados terminais são imutáveis e não retomam após reinício. O início exige atendimento `AGUARDANDO/BOT/PROCESSANDO_BOT`, sem responsável, e usa criação condicional com uma única execução ativa por atendimento. Repetição do mesmo fluxo devolve a execução ativa e uma troca posterior do ponteiro publicado não migra a execução em curso. Transição condicional e auditoria sanitizada compartilham a transação; contexto não entra na auditoria. Lint, tipos, 328 testes da API, 195 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901011000_execucoes_fluxo` terminou com código zero e `vyntra/api-staging:pr-072` ficou saudável com prontidão `PRONTO`. Em staging, o ciclo `EXECUTANDO→AGUARDANDO_RESPOSTA→EXECUTANDO→CONCLUIDA` gerou quatro auditorias, preservou a versão 1 após publicação da versão 2, recusou retomada com uma nova instância do serviço e teve a reabertura terminal bloqueada pelo trigger; a transação sintética foi revertida integralmente e nenhum erro de nível 50 foi emitido.

### PR 073 — agendamento e recuperação

Aceite concluído em 1º de setembro de 2026: esperas por instante passaram a persistir `retomar_em` somente em `AGUARDANDO_SISTEMA`, com instante futuro, revisão esperada e auditoria transacional. A migration reforça a constraint e o trigger contra retomada prematura. O worker sem HTTP, Redis ou storage consulta lotes vencidos no PostgreSQL com `FOR UPDATE SKIP LOCKED`; ele nunca mantém temporizador longo por atendimento nem outra autoridade de job. Lint, tipos, 331 testes da API, 196 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901011500_agendamento_execucoes_fluxo` terminou com código zero; `vyntra/api-staging:pr-073` e duas instâncias de `vyntra/worker-fluxos-staging:pr-073` ficaram saudáveis. Em staging, uma retomada prematura foi recusada pelo banco, o worker foi reiniciado antes do vencimento e duas instâncias concorreram durante a perda total do Redis: houve exatamente uma transição auditada para `EXECUTANDO`, revisão 3 e limpeza de `retomar_em`. A prontidão degradou enquanto a dependência geral estava parada e voltou a `PRONTO` após a recuperação; não houve erro de ciclo nos workers nem erro de nível 50 depois da normalização. O registro sintético identificado de aceite foi preservado por ser histórico imutável.

### PR 074 — nós de mensagem e lista

Aceite concluído em 1º de setembro de 2026: o executor passou a interpretar `INICIO`, `FIM`, `ENVIAR_MENSAGEM` e `ENVIAR_BOTOES_OU_LISTA` sempre pela versão fixada na execução. Mensagens automáticas nascem sem usuário remetente por `ServicoMensagensSaida`, com autoridade BOT e janela do canal revalidadas; texto cria `SUCESSO` e lista usa fallback textual enumerado explícito enquanto a capacidade estruturada não está comprovada. Mensagem `NA_FILA`, evento, caixa de saída, passo sanitizado e avanço de revisão compartilham a transação. Duas instâncias selecionam uma execução por transação com `FOR UPDATE SKIP LOCKED`; definição fixa inconsistente termina somente a execução afetada como `FALHOU/DEFINICAO_FLUXO_INVALIDA`, sem envenenar a fila. Lint, tipos, 339 testes da API, 197 testes de arquitetura, build web/API/iOS/Android, contratos, Expo, auditoria de dependências e varredura de segredos foram aprovados. A migration `20260901012000_nos_mensagem_lista` terminou com código zero; `vyntra/api-staging:pr-074` e duas instâncias de `vyntra/worker-fluxos-staging:pr-074` ficaram saudáveis. Em staging, a execução conservou a V1 arquivada mesmo com o ponteiro na V2, concluiu quatro passos e criou exatamente duas mensagens sem usuário, dois eventos e dois itens de saída; a lista percorreu `FALLBACK`, e passos/eventos/auditoria não continham texto nem opções. O cenário sem autoridade terminou por `FALHA_DEFINITIVA/AUTORIDADE_AUTOMACAO_PERDIDA` com zero mensagem; o trigger recusou reescrita de passo terminal. Uma execução inconsistente anterior foi isolada e finalizada com código controlado. Com o Redis totalmente parado, duas instâncias concluíram outra execução uma única vez, a prontidão degradou para `503` e voltou a `PRONTO` após a recuperação; não houve erro de ciclo depois da correção. Os registros sintéticos identificados foram preservados por formarem histórico imutável.

## 7. Mensageria Meta

| PR | Objetivo | Aceite principal |
|---:|---|---|
| 041 | Mensagem e máquina de saída | NA_FILA→ENVIANDO→ENVIADA→ENTREGUE→LIDA; falha/cancelamento coerentes. |
| 042 | Mídia e storage | Imagem, áudio, vídeo e PDF validados por MIME/assinatura e bucket privado. |
| 043 | Caracterização real da Meta | Versão, BSUID, identidade, limites e capacidades da conta documentados com fixtures sanitizadas. |
| 044 | Entrada do AdaptadorMetaCloud | Assinatura válida, deduplicação e persistência antes de automação/retorno. |
| 045 | Saída do AdaptadorMetaCloud | ENVIADA somente após aceitação; falha temporária e definitiva separadas. |
| 046 | Estados de entrega/leitura | Webhooks fora de ordem não retrocedem estado e duplicidade não cria evento novo indevido. |
| 047 | Resposta citada, reação e prévia | Relações reais e fallback quando a capacidade não está habilitada. |
| 048 | Templates | Catálogo sincronizado; idioma/aprovação válidos; template não reabre janela sozinho. |
| 049 | Composição de segunda via | PDF, valor, vencimento, Pix, linha/código e link com fallback; sem processar pagamento. |
| 050 | WhatsApp Flows e submissões | Identificação/cadastro comercial, dados protegidos e timeline estruturada sem JSON bruto. |
| 051 | Disparo transacional pelo ERP | Autenticação máquina-a-máquina, consentimento, idempotência, NA_FILA na timeline e estados de retorno. |

## 8. Sincronização e tempo real

| PR | Objetivo | Aceite principal |
|---:|---|---|
| 052 | Projeções autorizadas de evento | Evento interno protegido vira payload mínimo distinto por audiência. |
| 053 | Sincronização incremental | Cursor, paginação, ordem por sequencia_evento e aplicação idempotente. |
| 054 | Ressincronização completa consistente | Snapshot e sequencia_base no mesmo ponto lógico; alteração concorrente entra inteira na recuperação posterior. |
| 055 | SSE web sem lacuna | Last-Event-ID, assinatura bufferizada, marca d’água, backlog e modo ao vivo sem corrida. |
| 056 | WebSocket mobile sem lacuna | Conecta com cursor, recupera eventos anteriores antes do vivo e retoma do último aplicado. |
| 057 | Push | Payload mínimo, agrupamento e abertura seguida de sincronização; push não é fonte da verdade. |
| 058 | Invalidação por permissão | Evento de escopo, fechamento da conexão e remoção do cache local não autorizado. |

## 9. MK Solutions e sessão de acesso

| PR | Objetivo | Aceite principal |
|---:|---|---|
| 059 | Caracterização real do MK | APIs/licenças, paginação, erros, DTOs e fixtures sanitizadas aprovados. |
| 060 | Consultas de cliente/contrato | Busca e detalhes normalizados; módulos externos ao adaptador não conhecem MK. |
| 061 | Financeiro e faturas em tempo real | Situação, documento, Pix/linha e origem explícita; resposta parcial validada. |
| 062 | Sincronização do SnapshotCliente | Incremental, exclusão/tombstone ou reconciliação completa e obsolescência visível. |
| 063 | Criação/reconciliação de protocolo | Timeout incerto consulta antes de repetir; protocolo oficial liga histórico uma vez. |
| 064 | Elegibilidade de desbloqueio | Consulta em tempo real e política de 30 dias sem executar ação. |
| 065 | Execução de desbloqueio | Confirmação, permissão, idempotência e auditoria; snapshot recusado. |
| 066 | Ordem de serviço | Criar/atualizar com protocolo e contexto explícitos, uma operação por chave. |
| 067 | Comentário, encerramento e link | Somente capacidades reais do MK; falha preserva atendimento e permite reconciliação. |
| 068 | Provedor real de sessão de acesso — condicional | Fonte comprovada, consulta/desconexão autorizada e idempotente; se ausente, recurso continua desligado. |

## 10. Motor de Fluxos

| PR | Objetivo | Aceite principal |
|---:|---|---|
| 069 | Fluxo, VersaoFluxo e ponteiro publicado | Definição imutável após publicar e execuções fixadas à versão inicial. |
| 070 | Publicação, arquivo e reversão | Troca atômica do ponteiro, auditoria e nenhum histórico reescrito. |
| 071 | Validador de publicação | Início, referências, variáveis, ciclos, capacidades e saídas de falha validados. |
| 072 | Máquina de ExecucaoFluxo | Estados/transições persistidos; terminais não retomam após reinício. |
| 073 | Agendamento e recuperação | retomar_em e jobs reconstruíveis; worker nunca dorme aguardando. |
| 074 | Nós de mensagem/lista | Envio por serviço de domínio e saídas de erro explícitas. |
| 075 | Nós de condição/variável | Tipos controlados; sem expressão, segredo ou código arbitrário. |
| 076 | Nós de espera/calendário | Timeout, tentativas e caminho fora do horário determinísticos. |
| 077 | Nós de identidade/cliente/contrato | Matriz de risco e contexto explícito; nenhum vínculo inseguro automático. |
| 078 | Nó de fatura | Consulta em tempo real, composição segura e saída ERP indisponível. |
| 079 | Nó de WhatsApp Flow | Formulário pré-cadastrado, fallback e submissão idempotente. |
| 080 | Nós de protocolo e OS | Operações idempotentes pelos serviços de domínio. |
| 081 | Nó de desbloqueio | Verificação e execução separadas, com confirmação/política. |
| 082 | Nós de fila e encerramento | Roteamento humano e encerramento explícito sem estado inválido. |
| 083 | Corrida resgate×envio automático | NA_FILA automática é cancelada; só aceitação Meta anterior ao resgate permanece. |
| 084 | Editor visual | Edição tipada, validação e publicação sem alterar produção ao salvar. |
| 085 | Simulador | Dados fictícios, passos visíveis e nenhuma chamada Meta/MK real. |

## 11. Web

| PR | Objetivo | Aceite principal |
|---:|---|---|
| 086 | Shell e autenticação | Rotas, sessão, expiração e tratamento de atualização de escopo. |
| 087 | Lista de atendimentos | Meus/Pendentes/Não lidos/SLA/Expirando; evento reordena sem atualização manual. |
| 088 | Timeline e leitura | Paginação autorizada, separadores, notas e marcador pessoal não lido. |
| 089 | Área de composição e respostas rápidas | Texto, templates e comando / pesquisável; janela expirada bloqueia antes do envio. |
| 090 | Mídia, resposta citada e reação | Upload/download autorizados e fallbacks de capacidade. |
| 091 | Busca e galeria | PostgreSQL, paginação e filtros aplicados no banco com autorização. |
| 092 | Contato, contexto e ações ERP | Cliente/contrato explícitos, origem SNAPSHOT/TEMPO_REAL e confirmação por risco. |
| 093 | Administração de usuários/RBAC | Perfis, permissões, filas, sessões e auditoria. |
| 094 | Administração operacional | Contas WhatsApp, filas, calendários, SLA e integrações. |
| 095 | Administração do Motor de Fluxos | Editor, versões, simulador e publicação/reversão autorizadas. |
| 096 | Saúde, reprocessamento e releases | Componentes, falhas, Reprocessar agora, controles de recurso e política mobile. |

## 12. Mobile

| PR | Objetivo | Aceite principal |
|---:|---|---|
| 097 | Shell, login e biometria | iOS/Android reais, um código-base, tokens seguros e navegação principal. |
| 098 | Política de versão | Bloqueio ATUALIZACAO_OBRIGATORIA e abertura da loja sem prometer publicar binário. |
| 099 | SQLite e autorização offline | Réplica criptografada, autorização limitada e bloqueio ao expirar. |
| 100 | Motor de sincronização | Lotes/cursor atômicos, ressincronização consistente e WebSocket sem lacuna. |
| 101 | Lista de atendimentos | Filtros, reordenação, badges e estado de conexão. |
| 102 | Timeline e detalhes | Paginação, posição, leitura, contato, cliente e contrato. |
| 103 | Área de composição e respostas rápidas | Texto, /, rascunho e botão de ações quando vazio. |
| 104 | Offline e reconciliação | AGUARDANDO_CONEXAO/REVISAO_NECESSARIA; enviar mesmo assim continua autorizado no backend. |
| 105 | Mídia e ações ERP | Envio online, prévia/confirmação e origem dos dados; mídia offline avançada fica fora. |
| 106 | Notificações | Cinco eventos aprovados, agrupamento por contato e navegação direta após sincronização. |
| 107 | Revogação e perda de permissão | Limpeza ao conectar e exposição offline limitada pela autorização. |
| 108 | Diagnóstico, acessibilidade e desempenho | Pacote sanitizado, Reduzir Movimento, listas virtualizadas e limites de cache. |

## 13. Fechamento operacional

| PR | Objetivo | Aceite principal |
|---:|---|---|
| 109 | Cópia segura do atendimento | Token imprevisível, só cliente↔empresa, política aprovada e nenhuma nota interna. |
| 110 | Relatórios operacionais mínimos | Filas, SLA, mensagens, Motor de Fluxos e ERP com fórmulas documentadas. |
| 111 | Observabilidade e alertas | Métricas/traces sanitizados e alertas acionáveis para dependências/backlogs. |
| 112 | Produção e deploy compatível | Job único de migration, API pronta, drain de streams/workers e reversão de tráfego. |
| 113 | Backups e restauração | Banco, chaves e mídia recuperáveis; RPO até 4 h e RTO medido em ambiente limpo. |
| 114 | Testes integrados adversariais e de falha | IDOR, webhook falso, XSS, upload, Redis/worker/VM e corrida offline cobertos; complementa testes de cada PR. |
| 115 | Checklist de produção | Segredos, WAF, monitor externo, lojas, runbooks, capacidade e decisões do PR 001 conferidos. |
| 116 | Piloto controlado | Flags desligadas por padrão, usuários/números controlados, métricas, reversão e responsável de plantão. |

## 14. Marcos

| Marco | PRs | Resultado |
|---|---:|---|
| Fundação segura | 001–021 | Ambientes, contratos, acesso, auditoria, eventos e simuladores. |
| Domínio confiável | 022–040 | Contato, timeline, atendimento, filas, protocolo, calendário e janela. |
| Mensageria convergente | 041–058 | Meta, mídia, formulários, sincronização, SSE, WebSocket e push. |
| ERP caracterizado | 059–068 | MK real, snapshot, protocolo, operações e sessão condicional. |
| Automação configurável | 069–085 | Versões, executor, nós, resgate, editor e simulador. |
| Interfaces operacionais | 086–108 | Web e mobile utilizáveis, inclusive offline/reconciliação. |
| Piloto recuperável | 109–116 | Cópia segura, operação, deploy, backup, robustez e liberação gradual. |

O roadmap é uma proposta de execução, não autorização para preencher lacunas externas. Se Meta, MK ou o provedor de sessão divergirem, atualize o adaptador, as fixtures e a documentação; não contamine o domínio com o contrato do fornecedor.
