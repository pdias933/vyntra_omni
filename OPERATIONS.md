# Operações — Omnichannel V1

## 1. Ambientes

```text
DESENVOLVIMENTO → STAGING → PRODUÇÃO
```

### Desenvolvimento

- máquina local;
- Docker Compose;
- PostgreSQL e Redis locais;
- MinIO como storage S3 compatível;
- fakes/simuladores por padrão;
- credenciais externas somente em arquivo local ignorado ou cofre aprovado;
- nenhum dado real desnecessário.

A implementação local está em `compose.yaml` e sobe `api`, o job único `migrar`, `postgres`, `redis`, `minio` e o inicializador efêmero do volume MinIO. Use os comandos versionados da raiz:

```text
pnpm ambiente:preparar
pnpm ambiente:validar
pnpm ambiente:subir
pnpm ambiente:estado
pnpm ambiente:parar
```

`ambiente:parar` preserva os volumes. A remoção de volumes é intencionalmente manual e destrutiva. Segredos locais ficam em `.segredos/desenvolvimento/`, nunca em `.env.example`, Compose, imagem ou log. O diretório POSIX é `0700`; arquivos lidos por contêiner sem root são `0644` somente dentro dele, devido à semântica de bind do Compose local, e cada um é montado apenas no serviço declarado. O conjunto de segredos é indivisível: perda parcial bloqueia regeneração para não desencontrar credencial e volume persistente. O wrapper fixa arquivo/projeto e recusa daemon Docker remoto. API, S3 e console publicam somente em loopback por uma bridge local própria; PostgreSQL e Redis permanecem sem porta no host e somente na rede Docker interna de dados.

Hosts Linux persistentes que executam Redis devem aplicar `vm.overcommit_memory=1` em arquivo próprio sob `/etc/sysctl.d/`, conforme a orientação oficial, e validar o valor efetivo após boot. O Docker Desktop administra esse ajuste dentro de sua própria VM.

A imagem comunitária do MinIO disponível para múltiplas arquiteturas é legada e possui alertas de segurança posteriores ao último release público. Por isso, seu uso é uma exceção estritamente local: credenciais aleatórias, usuário sem root, nenhuma informação real, nenhuma política pública e nenhuma promoção da imagem para staging ou produção. O PR de staging deve escolher storage mantido/aprovado de forma independente. Detalhes e fontes estão em [docs/operacoes/PR-004.md](docs/operacoes/PR-004.md) e [docs/dependencias/PR-004.md](docs/dependencias/PR-004.md).

### Staging

- VM/ambiente separado;
- PostgreSQL, Redis, storage/prefixo e segredos próprios;
- integrações/número Meta de teste quando possível;
- clientes MK controlados;
- dados sintéticos ou sanitizados;
- recebe build que poderá ir a produção.

Staging nunca lê ou escreve banco de produção e não reutiliza credencial de produção.

A migration `20260831001100_criar_conta_whatsapp` é aditiva e cria somente o cadastro inativo das origens empresariais. Promover essa imagem não configura nem ativa Meta, não cria conta padrão e não introduz credencial no banco. Rollback da aplicação preserva a tabela e sua origem histórica para compatibilidade com versões posteriores.

A implementação mínima usa `compose.staging.yaml`, projeto fixo `vyntra-staging` e comandos `pnpm staging:*`. Seus nomes de banco, usuário Redis, bucket, redes, volumes e diretório de segredos são exclusivos. Somente a API publica porta, em `127.0.0.1:3100`; PostgreSQL, Redis, S3 e administração do storage permanecem nas redes internas.

O storage de staging é Garage S3 mantido e fixado por versão/digest, não o MinIO comunitário legado do desenvolvimento. Ele roda em nó único porque esta PR utiliza uma única VM e somente dados descartáveis de staging. Isso não oferece redundância e é proibido em produção. Metadados, blocos e snapshots usam volumes separados; o bucket é privado, sem website, e a chave da aplicação não recebe permissão de proprietário.

```text
pnpm staging:preparar
pnpm staging:validar
VYNTRA_CONFIRMAR_STAGING=STAGING_ISOLADO_SEM_DADOS_DE_PRODUCAO pnpm staging:subir
pnpm staging:smoke
pnpm staging:estado
```

O marcador local `DADOS_PERMITIDOS=sinteticos_ou_sanitizados` é obrigatório e indivisível com o conjunto de segredos. A confirmação de subida é uma guarda contra erro operacional; não autoriza importar produção. Não existe comando de importação, restauração ou reset automático no wrapper. Detalhes estão no [runbook da PR 005](docs/operacoes/PR-005.md).

### Produção

- instalação exclusiva da empresa;
- deploy explícito após staging;
- acesso administrativo e SSH restritos;
- backups externos e monitor externo.

## 2. Topologia inicial

```text
Internet
  ↓
Cloudflare / WAF
  ↓ HTTPS
Nginx
  ↓
VM PRODUÇÃO
├── proxy
├── web
├── api-1
├── api-2
├── worker-1
├── worker-2
├── postgres
├── redis
└── agente de backup/monitoramento

Aplicação/VM
├──→ Object Storage S3 externo
├──→ Meta Cloud API
├──→ MK Solutions
└──→ cofre e destino externo de backup
```

Docker Compose é a orquestração da V1. Não usar Kubernetes.

As duas APIs e os dois workers estão na mesma VM. Isso permite deploy/drain e paralelismo, mas a VM e o PostgreSQL continuam pontos únicos de falha aceitos pelo RPO/RTO inicial.

## 3. Dimensionamento inicial

Referência, não compromisso de capacidade:

| Ambiente | CPU | RAM | Disco local |
|---|---:|---:|---:|
| Produção | 8 vCPU | 16 GB | 150–250 GB SSD/NVMe |
| Staging | 4 vCPU | 8 GB | 80–120 GB |
| Desenvolvimento | máquina local | conforme equipe | volumes Docker |

Mídia fica em storage externo; disco local comporta banco, cache, imagens de contêiner e logs recentes. Ajustar por métricas de CPU, memória, conexões, latência, tamanho do banco, backlog e I/O.

## 4. Rede, TLS e firewall

- HTTPS obrigatório usuário↔Cloudflare e Cloudflare↔Nginx;
- não aceitar modo em que a borda fala HTTP com o servidor em produção;
- porta 80 somente redirect/challenge necessário;
- porta 443 para aplicação;
- SSH restrito por IP/VPN e autenticação forte;
- PostgreSQL e Redis somente em rede local/Docker, nunca expostos à internet;
- painel administrativo protegido pelo mesmo backend/RBAC;
- MFA obrigatório para Administrador e usuários que administram usuários/integrações, publicam fluxo ou exportam histórico;
- CORS por origem conhecida;
- webhook Meta em rota dedicada com validação própria;
- comunicação MK restrita por IP/VPN quando suportada;
- egress para integrações por allowlist quando viável.

## 5. Segredos

Produção usa secret manager/cofre. Segredos não entram em código, imagem, Git, log ou parâmetro visível de processo.

Proteger no repositório e CI:

```text
.env
.env.production
*.pem
*.key
tokens
fixtures reais
```

Requisitos:

- segredos diferentes por ambiente;
- menor privilégio;
- rotação documentada;
- acesso auditado;
- secret scan em todo PR;
- resposta a vazamento inclui revogação e nova emissão, não apenas remoção do Git.

## 6. PostgreSQL

Na V1 fica na mesma VM, com:

- volume persistente dedicado;
- sem exposição pública;
- backup frequente e externo;
- criptografia de volume/backup;
- monitor de conexões, locks, lag de jobs, espaço e integridade;
- migrations versionadas e executadas uma vez;
- parâmetros e pool compatíveis com duas APIs/workers;
- análise de queries e índices antes de escalar verticalmente sem diagnóstico.

Mover para VM/serviço dedicado é evolução operacional, não reescrita do software.

Migrations são executadas por um job único antes da liberação da nova API, protegido por lock consultivo/transacional no PostgreSQL. Containers de API e worker não disputam migration no startup e nunca executam alteração destrutiva automaticamente.

Desde a PR 008, Compose materializa esse job como `migrar`: Prisma Migrate mantém seu lock consultivo e metadados, aplica somente migrations versionadas e termina. A API depende de `service_completed_successfully`; falha de migration impede prontidão e tráfego. O mesmo artefato pode ser executado novamente com segurança, pois migrations concluídas não são reaplicadas.

O primeiro ambiente preexistente deve ter o schema conferido e o marco `20260830000000_baseline_pre_prisma` resolvido explicitamente uma única vez antes do deploy. O marco não altera nem reivindica tabelas anteriores ao Prisma; em banco vazio, ele é aplicado automaticamente.

## 7. Redis e workers

Redis pode ser reiniciado/perdido sem apagar negócio. Depois da recuperação:

- workers reconstroem jobs a partir da caixa de saída/estado PostgreSQL;
- locks expirados não autorizam efeito duplicado;
- rate limits/cache voltam gradualmente;
- health indica degradação;
- nenhum atendimento ou execução de fluxo retorna ao início.

Workers usam:

- shutdown gracioso;
- lease/heartbeat de job;
- número máximo de tentativas por tipo;
- backoff com jitter para falha temporária;
- dead-letter/estado de intervenção para falha definitiva;
- idempotência no consumidor;
- limite de concorrência por integração.

Valores concretos de timeout, tentativas e concorrência devem ser calibrados com APIs reais e configuração por ambiente, não espalhados em código.

## 8. Object storage

- bucket privado;
- acesso somente por backend/identidade de serviço;
- URL assinada de curta duração;
- versionamento/redundância quando disponível;
- criptografia;
- ciclo de vida sem auto-limpeza na V1, salvo política legal explícita;
- backup/replicação conforme capacidade do provedor;
- monitor de erro, latência e capacidade;
- MinIO comunitário legado apenas em desenvolvimento; staging exige storage mantido e aprovado.

PostgreSQL guarda `storage_key`, MIME, tamanho, hash e vínculos; não guarda o binário.

## 9. Backups e recuperação

Metas aprovadas:

- **RPO:** até 4 horas em desastre extremo;
- **RTO:** algumas horas.

Estratégia inicial:

```text
PostgreSQL
├── backup incremental/frequente compatível com RPO
└── backup completo diário

Configurações críticas
└── backup versionado

Object storage
└── redundância/versionamento quando disponível
```

Ao menos uma cópia fica fora da VM e do domínio de falha principal. Backups são criptografados e o acesso é mínimo. O plano deve declarar como o RPO cobre PostgreSQL, configurações, chaves recuperáveis e conteúdo do object storage — por backup, versionamento ou garantia equivalente do provedor.

### 9.1 Teste de restauração

Mensalmente ou em intervalo formal equivalente:

1. provisionar ambiente limpo;
2. restaurar banco/configurações e obter do cofre as chaves de criptografia/HMAC necessárias;
3. validar integridade e migrations;
4. baixar amostras de mídia, conferir hashes e comprovar descriptografia de dados/formulários protegidos;
5. iniciar API/workers sem chamar produção externa;
6. executar smoke tests;
7. medir RPO/RTO obtidos;
8. registrar evidência e correções.

Backup sem restauração comprovada não satisfaz a V1.

### 9.2 Runbook de desastre

O runbook deve cobrir:

- perda da VM;
- corrupção/indisponibilidade do PostgreSQL;
- perda do Redis;
- indisponibilidade do storage;
- credencial externa comprometida;
- restauração em nova VM;
- atualização de DNS/Cloudflare;
- validação de integridade antes de liberar tráfego.

### 9.3 Retenção e eliminação controlada

Antes do piloto, jurídico/DPO e produto devem aprovar prazos, bases legais, categorias de histórico/mídia/auditoria/backups, bloqueio legal e conteúdo exportável. Até essa aprovação:

- não existe autoeliminação de histórico/mídia nem exclusão individual por usuário;
- link público de transcrição permanece desligado;
- a implementação prepara anonimização/eliminação controlada e auditoria `RETENCAO_APLICADA`;
- eventos incrementais conservam 30 dias para sincronização, sem definir a retenção do histórico de negócio;
- restauração e eliminação devem ser ensaiadas em conjunto para evitar ressuscitar dado já eliminado.

Se o link público for liberado, sua validade padrão será 72 horas, máxima de 7 dias, com revogação imediata, conteúdo sanitizado e mídia excluída por padrão.

## 10. Pipeline de entrega

```text
PR
  ↓ lint
  ↓ typecheck
  ↓ testes
  ↓ scanner de dependências
  ↓ secret scan
  ↓ build
  ↓ deploy STAGING
  ↓ smoke/integracao/migration
  ↓ aprovação explícita
DEPLOY PRODUÇÃO
```

Produção nunca recebe auto-deploy apenas por push/merge. O botão/ação de deploy é explícito e auditável.

A integração contínua inicial implementa somente os portões anteriores a staging: qualidade, tipos, testes, dependências, segredos, build e smoke efêmero do Docker Compose com reinício/persistência. Ela roda em pull requests, em alterações da `main` e semanalmente para detectar nova vulnerabilidade sem depender de outro commit. O workflow não recebe permissão de escrita, não persiste credencial do checkout, não publica artefato e não executa deploy.

## 11. Deploy sem interromper atendimento

Sequência:

1. construir imagem imutável;
2. executar o job único de migration compatível sob lock no banco;
3. subir nova instância da API;
4. esperar `/saude/pronto`;
5. adicionar ao tráfego;
6. drenar API antiga;
7. impedir novos jobs no worker antigo;
8. concluir/devolver jobs recuperáveis;
9. encerrar instâncias antigas;
10. observar erros, backlog e latência;
11. reverter tráfego se health/regressão falhar.

Durante o drain, a instância deixa de aceitar novos SSE/WebSocket e fecha streams antigos de forma controlada após limite curto; os clientes reconectam usando o último cursor aplicado. Deploy nunca altera estado do atendimento nem mantém a versão antiga viva indefinidamente.

## 12. Migrations compatíveis

Usar padrão expandir→migrar→contrair:

```text
PR A: adicionar nova coluna/tabela, nullable/compatível
PR B: escrever nos formatos antigo e novo quando necessário
PR C: migrar/backfill em lotes observáveis
PR D: ler somente formato novo
PR futuro: remover formato antigo
```

Proibido em deploy comum:

- renomear/drop de coluna ainda usada pela versão antiga;
- editar migration já aplicada;
- backfill gigante dentro da migration de startup;
- prender tabela crítica por tempo imprevisível;
- exigir desligamento total sem plano aprovado.

Reversão de aplicação não presume reversão destrutiva de banco.

## 13. Feature flags e releases

Painel web permite:

- ativar/desativar recurso já implementado;
- liberar para admin, usuários, fila, percentual ou todos;
- kill switch;
- versão mínima/recomendada por iOS/Android;
- mensagem e links de atualização;
- auditoria de cada alteração.

Fluxo preferido:

```text
código em produção com recurso DESATIVADO
  ↓
piloto restrito
  ↓ métricas/erros
ampliar ou desativar
```

Flag não mascara migration incompleta, falha de segurança ou estado inconsistente. Remover flags antigas em PR próprio após rollout estável.

Na PR 018, controles e políticas são autoridade do PostgreSQL. O backend calcula rollout estável por código+usuário e aplica primeiro estado, atividade de usuário/perfil e desligamento emergencial. Escritas administrativas exigem `ADMINISTRAR_RELEASES`, CSRF/origem, versão esperada e auditoria transacional. Apps abaixo da mínima recebem `426 ATUALIZACAO_OBRIGATORIA` em login, pareamento, autenticação e refresh; a avaliação pública serve apenas para antecipar a tela obrigatória. A marca de prontidão passa a ser `20260831000900_criar_controles_recurso_versao`.

## 14. Health checks

### `/saude/vivo`

Responde se o processo está vivo. Não faz consulta pesada a todas as dependências.

### `/saude/pronto`

Responde se a instância pode receber tráfego, verificando dependências mínimas e estado de inicialização/migration.

Além da conexão com PostgreSQL, a implementação confirma em `_prisma_migrations` que a migration obrigatória mais recente terminou e não foi revertida. Na PR 015, a marca é `20260831000700_criar_sessao_dispositivo_mobile`. A resposta externa continua genérica e não revela schema, tabela ou dependência defeituosa.

A PR 012 não altera schema; por isso a marca de prontidão continua sendo a migration da PR 011. A imagem da API passa a incluir o serviço central de autorização e só deve ser promovida após os testes de outra fila, UUID conhecido sem acesso, recurso inexistente, estado inválido e permissões sempre explícitas produzirem a mesma negação canônica.

A PR 013 exige `ORIGENS_WEB_PERMITIDAS` como lista exata de origens HTTPS separadas por vírgula. Staging usa somente `https://staging.vyntra.local`; produção deve declarar o domínio real antes da promoção. Cookie seguro não possui exceção HTTP. Parâmetros Argon2id iniciais são 64 MiB, três iterações e paralelismo um; a calibração de 100–250 ms no hardware final continua obrigatória antes do piloto.

A PR 014 não acrescenta configuração nem segredo. Alertar para crescimento anormal de `CONFIRMACAO_REVOGACAO_SESSAO_WEB_SOLICITADA`, revogações administrativas e sessões ativas com `expira_em` vencido; estas últimas já não autenticam e podem ser saneadas por manutenção posterior. Nunca reativar sessão por SQL: o usuário deve autenticar novamente.

A PR 015 também não acrescenta segredo de infraestrutura. Monitorar `LOGIN_MOBILE_BLOQUEADO`, `DISPOSITIVO_MOBILE_RECUSADO`, `REPLAY_TOKEN_REFRESH_MOBILE`, taxa de renovação negada e sessões/dispositivos ativos com expiração vencida. Replay deve revogar a sessão; nunca apagar `TokenRefreshMobileUsado`, reativar sessão/dispositivo por SQL nem registrar token, segredo de vínculo ou identificador bruto da instalação. Rollback de imagem preserva as tabelas aditivas e não exige removê-las.

A PR 016 não possui migration e mantém como marca obrigatória `20260831000700_criar_sessao_dispositivo_mobile`. Monitorar `DISPOSITIVO_MOBILE_ANTIGO_REVOGADO`, revogações próprias/administrativas, usuários com mais de dois dispositivos ativos e sessões ativas ligadas a aparelho revogado; os dois últimos sinais indicam quebra de invariantes. Nunca corrigir reativando/alterando linhas manualmente. O rollback de imagem preserva os estados já revogados; novo login legítimo cria o vínculo permitido pela versão em execução.

A PR 019 não possui migration e mantém como marca obrigatória `20260831000900_criar_controles_recurso_versao`. O simulador de mensageria pode ser exercitado no build/staging, mas não é selecionado por configuração, não abre webhook e não possui credencial. Promover a imagem não habilita envio Meta. Se o simulador aparecer no grafo de dependências da aplicação, a promoção deve ser bloqueada.

A PR 020 também não possui migration e mantém a mesma marca obrigatória. O simulador ERP pode ser exercitado dentro da imagem, mas não possui endpoint, credencial ou registro no módulo da aplicação; promover a imagem não habilita MK. `RESULTADO_INCERTO` em produção exige operação persistente e reconciliação — reiniciar, reprogramar cenário ou repetir manualmente não é procedimento válido.

A PR 021 aplica `20260831001000_criar_controle_sessao_acesso_desativado`, que semeia `SESSAO_ACESSO` em `DESATIVADO`, sem alvo ou percentual. O simulador não possui endpoint, credencial nem registro na aplicação. `NAO_CONFIGURADO` ou `DESATIVADO` não degrada a saúde geral; `INDISPONIVEL` só deve alertar quando uma fonte real previamente habilitada existir. Promover a imagem não habilita consulta nem desconexão.

A PR 062 eleva a marca de prontidão para `20260901003500_estado_snapshot_cliente`. A migration acrescenta estado, motivo e instante de obsolescência com padrão compatível `ATUAL`; não apaga nem reescreve documentos existentes. Rollback da aplicação preserva as colunas. Antes de habilitar um sincronizador real, validar paginação, cursor e exclusões do MK; ausência em página parcial nunca é procedimento válido para marcar obsolescência.

A PR 063 não acrescenta migration e mantém a marca da PR 062. O deploy também não registra adaptador MK, credencial, endpoint ou worker real. Em staging, validar o ciclo persistente `PENDENTE → RESULTADO_INCERTO → EM_RECONCILIACAO → CONCLUIDA` e confirmar que há um único `ProtocoloErp(OFICIAL)`. A conclusão do protocolo e da operação deve compartilhar a transação; se uma delas falhar, nenhuma pode ficar confirmada isoladamente.

A PR 064 aplica `20260901004000_historico_desbloqueio_confianca` e eleva essa migration à marca de prontidão. A tabela é aditiva, começa vazia, relaciona cada confirmação futura a atendimento e operação e bloqueia atualização ou exclusão. O módulo implantado apenas verifica elegibilidade; não registra adapter MK, rota ou capacidade de execução. Rollback da imagem preserva o histórico. Monitorar consultas indisponíveis separadamente de negações ERP e da janela local de 30 dias.

A PR 065 aplica `20260901004500_reserva_desbloqueio_confianca` e eleva essa migration à marca de prontidão. A tabela aditiva possui uma reserva por contrato e uma por operação; atualização é proibida, enquanto exclusão é a liberação controlada pelo caso de uso. O deploy não registra adapter MK, credencial, rota ou worker externo. Monitorar reservas antigas, operações em `RESULTADO_INCERTO`, tentativas repetidas e divergência entre reserva e operação. Nunca apagar a reserva nem criar histórico manualmente: a recuperação válida usa reconciliação e a mesma chave. Rollback da imagem preserva reservas; voltar de versão exige antes comprovar que nenhuma reserva da PR 065 permanece ativa.

A PR 066 aplica `20260901005000_ordens_servico_erp` e eleva essa migration à marca de prontidão. As três tabelas aditivas preservam a ordem corrente, o histórico imutável de alterações e uma reserva exclusiva por ordem. O deploy não registra rota, credencial, worker ou provider MK. Monitorar operações de OS em `RESULTADO_INCERTO`, reservas antigas, conflitos de versão e divergência entre versão corrente e último histórico. A recuperação válida usa o caso de reconciliação e a mesma chave; não editar ordem, histórico, reserva ou operação por SQL. Rollback da imagem preserva dados e reservas, mas voltar de versão só é seguro depois de comprovar que não há reserva da PR 066 ativa nem operação de OS aguardando reconciliação.

A PR 067 aplica `20260901005500_acoes_atendimento_erp` e eleva essa migration à marca de prontidão. O registro de comentário/encerramento é imutável e a reserva de encerramento só pode ser removida pelo caso de uso. O deploy não cria link público, rota, token, credencial, worker ou provider MK. Monitorar operações em `RESULTADO_INCERTO`, reservas antigas, atendimentos abertos com encerramento externo confirmado e divergência entre registro, evento e estado. Recuperar pela reconciliação com a mesma chave; nunca fechar atendimento, preencher registro ou apagar reserva por SQL. Rollback preserva registros e reservas, mas exige comprovar ausência de reconciliação pendente antes de voltar a uma imagem sem o módulo.

### Recuperação de operações

Um processo periódico recupera concessões vencidas em lotes pequenos. Ele encerra a tentativa como `RESULTADO_INCERTO`, limpa a concessão e agenda reconciliação imediata. O operador pode observar tipo, estado, idade, quantidade de tentativas e código normalizado; token, payload bruto e dado sensível não aparecem em log ou painel.

Alertar para concessões expiradas, crescimento contínuo de `RESULTADO_INCERTO`, reconciliação repetida e idade da operação mais antiga. Reprocessamento manual nunca muda o estado diretamente no banco: usa o caso de uso, adquire nova concessão e preserva o histórico. Deploy/reinício não exige drenar operações, pois a retomada vem do PostgreSQL.

Para protocolo incerto, a ação operacional válida é solicitar reconciliação pelo caso de uso. Não chamar criação diretamente, não trocar estado por SQL e não preencher `protocolo_oficial` manualmente. Nova criação só fica elegível depois de o adaptador comprovar ausência do efeito anterior; indisponibilidade da consulta mantém a operação incerta.

### Painel por componente

```text
Meta Cloud API
Webhook Meta
MK Solutions
Provedor de sessão de acesso
PostgreSQL
Redis
Workers
Object Storage
Push iOS
Push Android
SSE/WebSocket
```

Cada componente informa estado normalizado, última verificação, latência e erro sanitizado.

O provedor de sessão de acesso pode informar `NAO_CONFIGURADO` ou `DESATIVADO` sem degradar a saúde geral do piloto.

Um monitor externo consulta a saúde pública mínima. Se a VM morrer, o alerta não depende do próprio sistema.

## 15. Logs, métricas e tracing

### Logs técnicos

- JSON estruturado via Pino;
- rotação para não preencher disco;
- retenção inicial operacional de 30 dias para logs locais recentes; agregação externa conforme necessidade;
- `correlacao_id`, módulo, operação, duração e código de erro;
- sanitização central conforme [SECURITY.md](SECURITY.md).

### Auditoria

Fica no PostgreSQL/armazenamento próprio, com retenção longa e imutabilidade lógica. Não desaparece com rotação de Docker. A tabela é somente de acréscimo; triggers bloqueiam alteração, exclusão e truncamento até mesmo pelo papel atual da aplicação. Usuários da plataforma não recebem acesso SQL nem endpoint de mutação.

### Métricas iniciais

```text
mensagens_recebidas_total
mensagens_enviadas_total
mensagens_falharam_total
tempo_resposta_meta_ms
tempo_resposta_mk_ms
itens_caixa_saida_pendentes
jobs_pendentes/falhos
atendimentos_aguardando/em_atendimento
conexoes_sse/websocket
uso_cpu/memoria/disco
backup_ultimo_sucesso
```

### Tracing

OpenTelemetry básico em HTTP, webhook, worker, Motor de Fluxos, banco, Redis, storage, Meta e MK. Amostragem/retenção são menores que auditoria e nunca carregam payload sensível.

## 16. Alertas

Alertar sem exigir dashboard aberto:

- API/VM indisponível;
- PostgreSQL sem responder ou disco crítico;
- Redis/worker indisponível;
- caixa de saída/fila crescendo continuamente;
- Meta ou MK indisponível/degradado;
- webhook sem chegar por período anormal;
- taxa de falha de mensagens acima do limite;
- storage quase cheio/indisponível;
- backup falhou ou restauração está vencida;
- certificado próximo de vencer;
- template/capacidade externa rejeitada;
- reconciliação de protocolo presa.
- aumento anormal de geração, resgate recusado ou bloqueio de pareamento QR por usuário, IP ou instalação.

Limites concretos devem ser definidos a partir de baseline e revisados após piloto.

## 17. Runbooks mínimos

- Meta indisponível e reprocessamento seguro;
- número inválido/template rejeitado;
- MK degradado/indisponível e uso de snapshot;
- protocolo pendente sem reconciliação;
- worker parado/backlog crescente;
- Redis reiniciado;
- storage indisponível;
- sessão/segredo comprometido;
- deploy com health falhando;
- reversão de versão de fluxo;
- app abaixo da versão mínima;
- pareamento QR bloqueado, expirando em massa ou sem confirmação;
- restauração de backup.

Cada runbook contém sinais, impacto, ações seguras, verificação, comunicação e critério de encerramento.

## 18. Capacidade e evolução

Revisar dimensionamento usando:

- mensagens/minuto e tamanho médio;
- contatos/atendimentos ativos;
- conexões SSE/WebSocket;
- jobs e idade do item mais antigo;
- tempo e erro Meta/MK;
- crescimento do PostgreSQL e storage;
- CPU, memória, I/O e conexões.

Evolução natural:

```text
V1: app + dados na mesma VM, storage externo
  ↓
separar PostgreSQL/Redis em camada de dados
  ↓
escalar APIs/workers em múltiplas VMs
  ↓
load balancer/serviços gerenciados quando justificados
```

Não antecipar Kubernetes ou microserviços sem evidência.

## 19. Checklist de produção

- staging isolado e aprovado;
- segredos fora do Git/imagem;
- TLS ponta a ponta e firewall;
- PostgreSQL/Redis sem exposição;
- backup externo e restauração comprovada;
- health + monitor externo + alertas;
- migrations expand/contract;
- testes de idempotência, concorrência e reinício;
- testes de segurança do [SECURITY.md](SECURITY.md);
- flags iniciais e reversão definidas;
- política de versão mobile configurada;
- parâmetros Argon2id calibrados no hardware de produção e limites de login/QR/identidade/ERP carregados por ambiente;
- runbooks acessíveis;
- capacidades Meta/MK confirmadas;
- política jurídica/LGPD de retenção e conteúdo exportável aprovada e ensaiada;
- contrato real de disparo ERP, consentimento/opt-out e callbacks aprovados antes de habilitar o endpoint;
- RPO/RTO medidos e aceitos;
- deploy de produção manual.

## 20. Operação do catálogo de fluxos da PR 069

A migration obrigatória passa a ser `20260901010000_fluxos_versionados`. Ela cria tabelas, enums, índices, FKs compostas e triggers; é aditiva e não ativa automação. Depois do deploy, prontidão deve permanecer `PRONTO`, e não deve existir controller, worker ou adapter de fluxo registrado.

Monitorar conflito repetido de revisão, falha de constraint do ponteiro, definição acima do limite e tentativa de mutação/exclusão histórica. Não corrigir uma versão publicada por SQL: criar nova versão e usar o processo autorizado de publicação/reversão quando a PR 070 estiver disponível. Rollback de imagem preserva as tabelas e não remove a migration; antes de voltar para uma imagem sem o catálogo, comprovar que nenhum componente posterior depende dele.

Na PR 070, a migration obrigatória passa a `20260901010500_historico_publicacao_fluxo`. Monitorar divergência entre revisão do fluxo, ponteiro, estados e último histórico; conflito de revisão frequente; tentativa de alterar/apagar/truncar histórico; e fluxo arquivado sem versão publicada quando isso não foi uma ação esperada. Recuperação nunca usa `UPDATE` manual: recarregar a revisão e executar publicação, arquivamento ou reversão autorizada. Rollback preserva o histórico e exige confirmar que nenhuma transição ficou aberta — como todas são transacionais, não deve existir estado intermediário após commit.
