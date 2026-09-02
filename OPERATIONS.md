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

A implementação usa `compose.staging.yaml`, projeto fixo `vyntra-staging` e comandos `pnpm staging:*`. Seus nomes de banco, usuário Redis, bucket, redes, volumes e diretório de segredos são exclusivos. O proxy publica somente HTTP/HTTPS em `80/443`, o console e a API compartilham `https://omni.up100.com.br`, e a API preserva o acesso operacional em `127.0.0.1:3100`. PostgreSQL, Redis, S3, administração do storage, web estático e workers não publicam portas próprias.

O storage de staging é Garage S3 mantido e fixado por versão/digest, não o MinIO comunitário legado do desenvolvimento. Ele roda em nó único porque esta PR utiliza uma única VM e somente dados descartáveis de staging. Isso não oferece redundância e é proibido em produção. Metadados, blocos e snapshots usam volumes separados; o bucket é privado, sem website, e a chave da aplicação não recebe permissão de proprietário.

```text
pnpm staging:preparar
pnpm staging:validar
VYNTRA_CONFIRMAR_STAGING=STAGING_ISOLADO_SEM_DADOS_DE_PRODUCAO pnpm staging:subir
pnpm staging:smoke
pnpm staging:estado
```

O marcador local `DADOS_PERMITIDOS=sinteticos_ou_sanitizados` é obrigatório e indivisível com o conjunto de segredos. A confirmação de subida é uma guarda contra erro operacional; não autoriza importar produção. Não existe comando de importação, restauração ou reset automático no wrapper. Detalhes estão no [runbook da PR 005](docs/operacoes/PR-005.md).

A entrega intermediária PR 096A adiciona a imagem imutável do console, a borda Caddy não privilegiada e o TLS público automático. O volume de certificados não é cache e deve ser preservado entre recriações. A origem permitida da sessão web é exatamente `https://omni.up100.com.br`; aliases e acesso direto por IP não são origens de autenticação válidas. O smoke confere HTML, API pela mesma origem, certificado confiável, redirecionamento e cabeçalhos defensivos. Detalhes e reversão estão no [runbook da PR 096A](docs/operacoes/PR-096A.md).

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

Em staging, `pnpm staging:preparar-administrador` cria sem exibir a chave de proteção, senha, segredo TOTP e dez códigos de recuperação. O serviço `provisionar_administrador` roda somente sob o perfil Compose `provisionamento`, falha fora do ambiente sintético/sanitizado e não permanece ativo. O procedimento e o aceite estão em [docs/operacoes/PR-096B.md](docs/operacoes/PR-096B.md).

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

Na PR 096, o painel autenticado observa API, PostgreSQL, Redis e Object Storage sem expor endereço, credencial ou detalhe de conexão. A ausência de configuração é distinta de indisponibilidade. Contagens de caixa de saída e operações recuperáveis vêm do PostgreSQL; payload e identificadores de negócio não entram na projeção.

`Reprocessar agora` somente antecipa a agenda persistida. Para `AGUARDANDO_NOVA_TENTATIVA`, o worker pode adquirir nova execução; para `RESULTADO_INCERTO`, ele deve adquirir reconciliação. A rota HTTP não chama Meta, MK ou outro destino, não muda operação incerta para pendente e não reabre falha definitiva. Revisão concorrente retorna conflito e toda antecipação é auditada. Se o worker estiver parado, o botão não mascara a falha: a operação continuará visível e o runbook do worker deve ser seguido.

Controles de recurso e política mobile permanecem sob `ADMINISTRAR_RELEASES`. Todo aumento de rollout, desligamento emergencial ou mudança de versão mínima exige revisão visual, confirmação, versão esperada e auditoria. A criação de controle nasce desativada, com zero por cento e sem alvo.

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

Na PR 071 não há migration e a marca obrigatória permanece `20260901010500_historico_publicacao_fluxo`. Monitorar volume de `FLUXO_NAO_PUBLICAVEL` por código, conflitos de revisão e tentativas de usar capacidades ou referências ainda não habilitadas. Recuperação corrige o rascunho ou a configuração autoritativa do recurso e repete a validação; nunca alterar `estado` por SQL. Rollback de código preserva rascunhos e versões `EM_TESTE`, mas a imagem anterior não oferece novo caminho de promoção.

Na PR 072, a migration obrigatória passa a `20260901011000_execucoes_fluxo`. Monitorar conflito de início/transição, execução não terminal sem progresso e tentativa de alterar terminal. Reinício não executa ação de recuperação nesta etapa; deve apenas preservar e reler estado, versão, nó e revisão. Não “destravar” execução com `UPDATE` ou `DELETE`. Rollback preserva tabela, enum, índices, trigger e registros; a imagem anterior os ignora sem remover histórico. Worker e `retomar_em` operacional entram somente na PR 073.

Na PR 073, a migration obrigatória passa a `20260901011500_agendamento_execucoes_fluxo`. Ela acrescenta apenas a constraint de agendamento e reforça o trigger contra retomada prematura. O Compose inclui `worker_fluxos` sem porta, Redis ou storage; ele recebe somente o contrato de conexão PostgreSQL e reinicia automaticamente. Monitorar idade e quantidade de retomadas vencidas, ciclos com falha e execuções `EXECUTANDO` sem progresso. Perder Redis não exige reconstrução manual: reiniciar o worker basta para reler o banco. Nunca alterar `retomar_em`, estado ou revisão por SQL. Rollback de imagem preserva a migration e as execuções agendadas; uma imagem anterior não as retoma, portanto o worker PR 073 deve continuar ativo até promover a versão compatível seguinte.

## 21. Operação dos nós de mensagem da PR 074

A migration obrigatória passa a `20260901012000_nos_mensagem_lista`. Ela cria `passo_execucao_fluxo`, seus índices, unicidade por revisão e proteção de histórico. O mesmo `worker_fluxos` recupera agendamentos e, em seguida, processa lotes `EXECUTANDO`; continua sem porta, Redis ou storage.

Monitorar execuções `EXECUTANDO` sem avanço, passos `INICIADO` antigos, crescimento de `FALHA_TEMPORARIA`, `AUTORIDADE_AUTOMACAO_PERDIDA`, `JANELA_CANAL_FECHADA`, `DEFINICAO_FLUXO_INVALIDA` e volume de `FALLBACK`. Um passo `INICIADO` não deve ficar visível após commit normal, porque início, término e avanço compartilham transação. Cada execução usa uma transação própria: definição fixa inconsistente termina aquela execução, preserva a auditoria controlada e não bloqueia o restante do lote. Não finalizar passo nem avançar nó por SQL. Reiniciar o worker é seguro; `FOR UPDATE SKIP LOCKED`, revisão da execução e unicidade do passo impedem dois efeitos locais.

Rollback da imagem preserva passos e mensagens já enfileiradas. Não remover a migration. Se a imagem anterior não conhecer a tabela, manter o worker PR 074 parado apenas depois de confirmar que não há execução ativa dependente dos novos nós; mensagens `NA_FILA` permanecem responsabilidade da caixa de saída e nunca devem ser apagadas para “corrigir” o fluxo.

## 22. Operação de condição e variável da PR 075

Não há migration nova; a marca obrigatória permanece `20260901012000_nos_mensagem_lista`. API e todas as instâncias de `worker_fluxos` devem usar a mesma imagem PR 075 antes de publicar versão que contenha `CONDICAO` ou `DEFINIR_VARIAVEL`.

Monitorar `VARIAVEL_INDISPONIVEL`, `CONFIGURACAO_VARIAVEL_INVALIDA`, `LIMITE_ITERACOES_EXCEDIDO`, execuções `EXECUTANDO` sem avanço e passo `INICIADO` antigo. Crescimento de falha por variável ausente indica contrato de entrada ou caminho incorreto; corrigir em nova versão, nunca preenchendo contexto por SQL. Estouro recorrente é uma saída de negócio configurada, mas ausência de avanço depois dele é incidente e bloqueia promoção.

No aceite, usar dois workers e um fluxo sintético que percorra atribuição decimal/booleana, condição verdadeira, condição falsa, auto-ciclo limitado e variável ausente. Confirmar uma revisão por passo, saída do ciclo após o limite, conclusão única e ausência de nomes/literais em passo e auditoria. Reiniciar worker não pode zerar contador, trocar versão ou repetir revisão.

Rollback de imagem preserva contexto e passos. Antes de voltar a um worker PR 074, confirmar que nenhuma execução não terminal aponta para nós da PR 075; a versão antiga trata definição não suportada como inválida e pode finalizar a execução afetada.

## 23. Operação de espera e calendário da PR 076

A migration obrigatória passa a `20260901012500_espera_resposta_fluxo`. Ela amplia a constraint de `retomar_em` para `AGUARDANDO_RESPOSTA` e substitui o trigger para permitir retomada antecipada somente com a marca explícita de resposta. É aditiva sobre dados existentes e não cria calendário, fluxo ou capacidade por padrão.

Monitorar quantidade e idade de `AGUARDANDO_RESPOSTA`/`AGUARDANDO_SISTEMA` vencidos, `RETOMADA_ESPERA_PREMATURA`, `CONTEXTO_ESPERA_INVALIDO`, `CALENDARIO_INDISPONIVEL`, `CALENDARIO_INVALIDO`, passos `AGENDADO` sem revisão posterior e divergência de imagem entre workers. Timeout normal é saída de negócio; backlog vencido é incidente operacional.

No aceite, usar dois workers, calendários reais aberto/fechado e fluxos sintéticos para resposta, timeout e instante. Reiniciar ambos antes do prazo e confirmar reconstrução pelo PostgreSQL, um único vencedor, um passo por revisão e ausência de payload em passo/auditoria. Também testar que o banco recusa retomada antecipada sem marca e que a prontidão exige a migration nova.

Não alterar marca, prazo, estado, nó ou revisão por SQL para liberar atendimento. Corrigir calendário por seu serviço administrativo ou publicar nova versão do fluxo. Rollback preserva a migration e todas as esperas; antes de usar worker PR 075, comprovar que nenhuma execução não terminal está em nó da PR 076, pois a imagem anterior não interpreta esses contratos.

## 24. Operação dos nós de identidade e contexto da PR 077

Não há migration nova; a marca obrigatória permanece `20260901012500_espera_resposta_fluxo`. Implantar API e todos os `worker_fluxos` com a imagem PR 077 antes de publicar `IDENTIFICAR_CONTATO`, `SOLICITAR_DADOS_CONTATO`, `SELECIONAR_CLIENTE` ou `SELECIONAR_CONTRATO`.

Monitorar `CONFIGURACAO_IDENTIDADE_INVALIDA`, `CONFIGURACAO_SELECAO_CONTEXTO_INVALIDA`, crescimento de `NAO_IDENTIFICADO`/`NAO_SELECIONADO`, conflitos de versão de contexto e volume de `FALLBACK`. Resultado não selecionado é caminho de negócio; contexto divergente, auditoria ausente após mutação ou escolha de vínculo temporário é incidente. O aceite usa múltiplos vínculos reais, incluindo um revogado/temporário, comprova seleção exata e idempotente, contrato pertencente ao cliente e nenhuma escolha por ordem/preferência. Passos e logs não contêm variável nem UUID selecionado; a auditoria conserva somente UUIDs internos dos vínculos alterados, sem dado pessoal ou identificador ERP externo.

Não inserir ou trocar `contexto_atendimento` por SQL e não promover vínculo para contornar a matriz. Corrigir o vínculo pelo caso de uso autorizado ou encaminhar ao humano. Rollback preserva contextos e auditoria; antes de usar worker PR 076, comprovar que nenhuma execução não terminal aponta para nós da PR 077.

## 25. Operação dos nós de fatura da PR 078

Não há migration nova; a marca obrigatória permanece `20260901012500_espera_resposta_fluxo`. Implantar API e todos os `worker_fluxos` com a mesma imagem PR 078 antes de publicar `CONSULTAR_FATURAS` ou `ENVIAR_FATURA`. A tabela `composicao_segunda_via` já existe desde a PR 049.

Nenhum provedor ERP real é registrado nesta etapa. O comportamento esperado em staging sem integração configurada é a saída `ERP_INDISPONIVEL`, sem mensagem, composição, auditoria de envio ou seleção fabricada. Simulador pertence somente aos testes. Não cadastrar um fake no container da aplicação para transformar o aceite em falso sucesso.

Monitorar `ERP_INDISPONIVEL`, `CONSULTA_ERP_FALHOU`, `SELECAO_FATURA_NECESSARIA`, `FATURA_NAO_ENCONTRADA`, `FATURA_NAO_SELECIONADA`, `CONTEXTO_FINANCEIRO_DIVERGENTE` e crescimento de `DADOS_INCOMPLETOS`. Também alertar para chamada externa mantendo transação aberta, dado financeiro em passo/log/auditoria, composição sem mensagem correspondente ou efeito depois de revisão/contexto divergente.

No aceite automatizado, um provedor determinístico exclusivo de teste cobre zero, uma e várias faturas pagáveis, ausência do ERP, resposta parcial e composição protegida. No runtime real sem provedor, validar ao menos consulta e envio seguindo `ERP_INDISPONIVEL`, prontidão, estabilidade dos dois workers e ausência de efeitos parciais. Rollback preserva seleção protegida, passos e composições existentes; antes de usar worker PR 077, comprovar que nenhuma execução não terminal aponta para estes nós.

## 26. Operação do nó de formulário da PR 079

Não há migration nova; a marca obrigatória permanece `20260901012500_espera_resposta_fluxo`, e as tabelas `formulario_canal`/`submissao_formulario_canal` continuam sendo as criadas na PR 050. Implantar API e todos os `worker_fluxos` com a mesma imagem PR 079 antes de publicar `SOLICITAR_FORMULARIO_WHATSAPP`.

Sem adapter real de envio estruturado caracterizado, o comportamento obrigatório é `FALLBACK` textual para formulário ativo da conta. Não registrar simulador, copiar referência externa para a definição nem converter fallback em `ENVIADO`. Monitorar `FORMULARIO_INDISPONIVEL`, `CONFIGURACAO_FORMULARIO_INVALIDA`, `IDEMPOTENCIA_SUBMISSAO_FORMULARIO_DIVERGENTE`, crescimento de fallback, submissão sem evento e evento duplicado.

No aceite, usar formulário sintético ativo da conta exata e outro inativo/de outra conta. Confirmar uma única mensagem no caso ativo, falha sem mensagem nos demais, passo sem UUID do formulário ou texto e replay sem segunda mensagem. Para submissão, usar mensagem de entrada sintética e repetir mensagem/referência; deve existir uma submissão e um evento, sem resposta ou token no evento/log. Rollback preserva formulários, submissões, mensagens e passos; antes de usar worker PR 078, comprovar que nenhuma execução não terminal aponta para o novo nó.

## 27. Operação dos nós de protocolo e OS da PR 080

Não há migration nova. Implantar API e todas as instâncias de `worker_fluxos` com a mesma imagem antes de publicar os nós. Sem `ADAPTADOR_ERP` real, o aceite obrigatório é `INDISPONIVEL`, zero operação recuperável nova, zero protocolo/OS e zero auditoria de sucesso.

Em teste isolado com adapter determinístico, comprovar uma operação por execução+nó, replay estável, protocolo oficial sem nova chamada, OS somente com confirmação explícita e auditoria `FLUXO` sem usuário. Monitorar `RESULTADO_INCERTO`, operação vencida para reconciliação, `CONTEXTO_ORDEM_SERVICO_FLUXO_INVALIDO` e divergência de idempotência. Nunca corrigir protocolo, OS, execução ou operação por SQL. Rollback preserva operações, protocolos, OS e auditoria; não voltar ao worker anterior enquanto execução não terminal apontar para os novos nós.

## 28. Operação dos nós de desbloqueio da PR 081

Não há migration nova. Implantar API e todas as instâncias de `worker_fluxos` com a mesma imagem e manter `20260901012500_espera_resposta_fluxo` como marca de prontidão. Sem provider ERP, validar `INDISPONIVEL` na verificação, `FALHA` na execução e ausência de operação, reserva, histórico ou auditoria de sucesso. Com adapter determinístico exclusivo de teste, comprovar consulta separada, nova elegibilidade antes da escrita, uma chave por execução+nó e auditoria `FLUXO` sanitizada.

Monitorar operações `RESULTADO_INCERTO`, reservas antigas e concorrência por contrato. Nunca liberar reserva, criar histórico ou marcar sucesso por SQL. Rollback preserva todo histórico; antes de voltar ao worker PR 080, interromper novas execuções e comprovar que nenhum nó da PR 081 permanece não terminal.

## 29. Operação dos nós de fila e encerramento da PR 082

A migration obrigatória passa a `20260901013000_espera_atendente_fluxo`. Ela amplia a constraint e o trigger de agendamento para `AGUARDANDO_ATENDENTE`, preservando as regras anteriores de espera por sistema e resposta. Implantar API e todos os `worker_fluxos` com a mesma imagem antes de publicar os novos nós.

Monitorar esperas por atendente vencidas, `TRANSFERENCIA_PARA_FILA_NEGADA`, `CONTEXTO_ESPERA_ATENDENTE_INVALIDO`, `RETOMADA_ESPERA_ATENDENTE_INVALIDA`, `ENCERRAMENTO_POR_FLUXO_NEGADO`, histórico de fila aberto sem atendimento correspondente e divergência de imagem entre workers. Timeout é saída de negócio; backlog vencido, duas atribuições abertas ou execução ativa depois de assunção/encerramento são incidentes.

No aceite, comprovar transferência para fila ativa, timeout recuperado após reinício, concorrência de dois workers, suspensão após resgate humano e encerramento com fallback congelado. Passos e logs não podem conter motivo, usuário fabricado ou dado de cliente. Não alterar fila, histórico, marcador, `retomar_em`, estado ou revisão por SQL. Rollback preserva atribuições e encerramentos; antes de usar worker PR 081, comprovar que nenhuma execução não terminal depende desses nós.

## 30. Operação da corrida resgate × envio automático da PR 083

A migration obrigatória passa a `20260901013500_corrida_resgate_envio_automatico`. Antes de acrescentar a origem às mensagens novas, ela cancela automáticas legadas `NA_FILA`. Se encontrar uma automática legada `ENVIANDO`, a implantação para: reconciliar o resultado externo antes de prosseguir. Nunca alterar esse estado por suposição.

Implantar API e futuro despachante de mensageria com a mesma versão. Monitorar duração e timeout do canal, espera do lock `autoridade-saida`, cancelamentos por resgate, `ENVIANDO` antigo e divergência entre execução/atribuição. O limite do transporte é oito segundos dentro de uma transação de dez; o cliente HTTP real precisa honrar o sinal de cancelamento. No aceite, provar as duas ordens: resgate primeiro cancela sem chamada; aceite primeiro termina `ENVIADA` e só depois permite o resgate. Também confirmar que falha temporária volta a `NA_FILA` e é cancelada pelo resgate, sem conteúdo em evento, auditoria ou log.

Rollback preserva as colunas e mensagens terminais. Antes de usar imagem PR 082, parar o consumidor de saída e comprovar que não existe automática da PR 083 em `NA_FILA` ou `ENVIANDO`; a imagem anterior não conhece a coordenação persistida.

## 31. Operação do editor visual da PR 084

Não há migration. Implantar API com as rotas administrativas e web com o SDK gerado no mesmo release; o worker não recebe provider, estado ou regra nova. Manter `20260901013500_corrida_resgate_envio_automatico` como marca de prontidão e confirmar que todas as instâncias de API/worker continuam homogêneas.

No aceite, criar um rascunho por uma sessão autorizada, salvar posição e parâmetros com revisão esperada, comprovar conflito de revisão concorrente e confirmar que o ponteiro publicado não muda. Depois, validar uma definição inválida sem promoção, preparar uma válida e publicar por comando separado; uma execução já iniciada deve conservar a versão anterior. Monitorar `ACESSO_NEGADO`, `ORIGEM_WEB_INVALIDA`, `CSRF_INVALIDO`, conflitos de revisão e falhas de validação sem registrar a definição. Rollback do web/API não exige alteração de dados e preserva versões criadas; não modificar estado ou ponteiro por SQL.

## 32. Operação do simulador da PR 085

O simulador não possui fila, worker, tabela, migration, credencial de canal ou provider próprio. Implante API e web do mesmo commit e mantenha as instâncias da API homogêneas. A disponibilidade do endpoint depende somente do processo da API e da autorização já existente; Meta, MK, Redis e workers podem estar indisponíveis sem que o teste fictício faça chamada a eles.

O smoke de staging deve executar os sete cenários, comprovar `efeitosReaisExecutados: false`, término limitado e nenhuma alteração em fluxo, versão, mensagem, operação recuperável ou auditoria de domínio. Inspecione também a interface para aviso de dados fictícios, passos visíveis e comportamento com “Reduzir Movimento”. Se a simulação elevar latência ou memória, retire a versão da API; não aumente o limite de 200 passos e não habilite adapter como mitigação. Reversão não exige ação no banco.

## 33. Operação do shell web da PR 086

O shell depende de API e SSE sob a mesma origem autorizada. Monitore falhas de autenticação agregadas sem identificador em claro, expiração de sessão e reconexões anormais do stream. Estado saudável não mostra conexão, cursor ou horário de sincronização. Reversão da web não requer migration e não reativa sessão revogada.

A correção cumulativa PR096C faz o console reconhecer `MFA_NECESSARIO` tanto no erro direto do SDK quanto no formato encapsulado compatível. O aceite precisa provar o desafio `403` real e a abertura da etapa TOTP sem registrar senha ou código. O procedimento e a evidência estão em [docs/operacoes/PR-096C.md](docs/operacoes/PR-096C.md).

## 34. Operação da lista web da PR 087

A migration `20260901014000_marcador_leitura_web` é aditiva e passa a ser a marca de prontidão. A lista limita cada consulta a 60 itens e filtra no PostgreSQL depois de resolver filas autorizadas. Monitore latência por filtro e plano dos índices de atendimento, conversa, mensagem, SLA, janela e marcador pessoal. Reversão de imagem preserva a tabela e não requer apagar marcadores.

## 35. Operação do shell e autenticação mobile da PR 097

Não há migration. O app usa `EXPO_PUBLIC_API_URL`, com `https://omni.up100.com.br` como staging padrão, e `EXPO_PUBLIC_VERSAO_APLICATIVO`; HTTP é aceito somente para host local em Development Build. Os identificadores nativos são `br.com.up100.vyntraomni` em iOS e Android. Publicação em loja continua fora desta PR.

O aceite precisa compilar/exportar as duas plataformas, validar a matriz Expo, confirmar no código e em teste que access token não é persistido, exercitar login comum/MFA, rotação, logout, bloqueio local e os estados QR `AGUARDANDO_CONFIRMACAO → CONFIRMADO`. O ensaio web deve gerar um token, apresentar a prévia do mesmo aparelho, exigir confirmação e comprovar que fechar/cancelar, expirar ou reutilizar não cria segunda sessão. Nunca registrar token, senha, MFA, QR ou comprovante em evidência.

Monitorar apenas códigos agregados de autenticação e pareamento. Falha de biometria é local e não deve virar log remoto com identidade. Rollback do app exige nova build instalada; rollback do web pode retirar a superfície de geração sem invalidar sessões mobile existentes. Reverter API não é permitido para versão anterior aos contratos de autenticação já aceitos.

O procedimento detalhado, os estados locais, a custódia da sessão e as evidências de staging ficam em [docs/operacoes/PR-097.md](docs/operacoes/PR-097.md).

## 36. Operação da política de versão mobile da PR 098

Não há migration, imagem de servidor ou binário de loja publicado por esta PR. A build mobile deve declarar `EXPO_PUBLIC_VERSAO_APLICATIVO` igual à versão distribuída. Antes de elevar a mínima, cadastrar mensagem curta e URL HTTPS no host oficial da loja da plataforma, revisar a prévia e confirmar com a revisão esperada. Fazer rollout da nova build e observar adoção antes de bloquear versões antigas, salvo correção crítica de segurança.

O aceite comprova avaliação antes do cofre, bloqueio sem adiamento, promoção de respostas 426 vindas de login/refresh/QR, allowlist da loja, aviso recomendado apenas no Perfil e reavaliação silenciosa no primeiro plano. Indisponibilidade da avaliação na abertura fria fecha o acesso; indisponibilidade posterior preserva a última política válida.

Monitorar códigos agregados de falha da avaliação e proporção de `ATUALIZACAO_OBRIGATORIA`, sem usuário, token ou identificador do aparelho. Reverter a build só é seguro enquanto a versão anterior permanece permitida. O runbook detalhado está em [docs/operacoes/PR-098.md](docs/operacoes/PR-098.md).

## 37. Operação da réplica e autorização offline da PR 099

Desenvolvimento e staging geram uma chave Ed25519 exclusiva, não sobrescrevem material existente e montam a chave privada somente na API. `pnpm ambiente:configuracao-mobile` e `pnpm staging:configuracao-mobile` exibem exclusivamente a variável pública que deve ser injetada na build correspondente; nenhuma chave privada é impressa. Produção deve fornecer o mesmo contrato por cofre aprovado, com identificador de chave único e backup protegido.

Na rotação, primeiro distribuir a build contendo as chaves públicas atual e nova; depois trocar identificador e arquivo privado da API; manter a chave pública antiga na allowlist por pelo menos quatro horas após a última assinatura antiga; só então removê-la em outra build. Perda da chave privada impede novas autorizações, mas não autoriza reduzir validação. Vazamento exige retirar a chave da API, bloquear novas emissões, elevar a versão mínima para uma build sem a chave pública comprometida e tratar o intervalo residual como incidente.

Esta PR não exige migration PostgreSQL e não autoriza deploy cumulativo por si só. O runbook detalhado está em [docs/operacoes/PR-099.md](docs/operacoes/PR-099.md).

## 38. Operação do motor de sincronização mobile da PR 100

Não há migration PostgreSQL nem dependência nova. O schema SQLCipher local avança de `user_version = 1` para `2`; como PostgreSQL é a fonte oficial, falha de migration bloqueia o cache e permite reconstrução segura, nunca fallback em SQLite sem cifra. A build precisa conter a chave pública do ambiente já descrita na PR 099.

O aceite deve provar validação fechada dos contratos, snapshot/autorização/cursor no mesmo commit, preservação de rascunhos e pendências, marca de reconstrução após qualquer avanço, recuperação por `409`, REST paginado seguido do handoff sem lacuna e `CONFIRMAR` posterior ao snapshot. Em primeiro plano o canal reconecta com atraso entre um e trinta segundos; em segundo plano permanece fechado. Estado saudável não aparece na interface.

Monitore somente contadores agregados de reconstrução, contrato inválido, `401/403`, desconexão `4003`, atraso de cursor e duração/tamanho do snapshot. Nunca registre token, segredo do aparelho, autorização offline, conteúdo, identificador de contato ou payload integral. Reverter a build exige uma versão que aceite `user_version = 2` ou descarte a réplica autenticada e faça snapshot novo; não rebaixe o schema local em SQL. O runbook detalhado está em [docs/operacoes/PR-100.md](docs/operacoes/PR-100.md).

## 39. Operação da lista de atendimentos mobile da PR 101

Não há migration PostgreSQL nem dependência nova. O schema SQLCipher avança para `user_version = 3` e cria `resumo_atendimento`; a migration marca qualquer réplica existente para reconstrução completa antes de liberar leitura offline. Snapshot, tabela derivada, autorização e cursor continuam no mesmo commit. Reversão exige uma build que aceite a versão 3 ou descarte o arquivo local e obtenha novo snapshot; nunca reduza `user_version` por SQL.

O aceite deve validar os seis filtros, limite de 60 itens, ordenação por `ultima_atividade_em`, contagens, prévia, não lidas, SLA e janela Meta. Uma alteração confirmada deve mover a conversa pelo `conversa_id` estável sem pull-to-refresh e sem faixa técnica em operação saudável. Com “Reduzir Movimento”, a atualização permanece imediata sem animação espacial. Simule também `SEM_CONEXAO`, `CONECTANDO` e `SINCRONIZANDO`, comprovando que a faixa desaparece ao normalizar e que cache sujo não é apresentado offline.

Monitore duração e tamanho do snapshot e tempo das consultas locais, sempre de forma agregada. Não registre nomes, telefones, prévias, contatos, conversas ou filtros associados a usuário. O runbook detalhado está em [docs/operacoes/PR-101.md](docs/operacoes/PR-101.md).

## 40. Operação da timeline e detalhes mobile da PR 102

Não há migration PostgreSQL ou dependência nova. API, SDK, web e app devem vir do mesmo commit porque a timeline compartilhada passa a incluir a projeção opcional `campos_formulario`, enquanto o mobile acrescenta rotas próprias autenticadas pelo vínculo do aparelho. O schema SQLCipher permanece em `user_version = 3`.

O aceite deve provar paginação para cima sem salto visual, retorno de Detalhes na mesma posição, marcador confirmado online, countdown da janela Meta, separadores de atendimento/origem, notas e eventos `Somente equipe` e formulário aberto com mascaramento. Testar identidade sem username/telefone, BSUID permitido/negado, contato sem vínculo, múltiplos vínculos, conflito de versão na troca, ERP indisponível e funcionamento da janela recente offline.

Monitore latência e códigos agregados das cinco rotas mobile, sem IDs, nomes, mensagens, formulário, documento, token ou segredo. Reversão de API/web deve ser coordenada com a build instalada; cliente novo tolera ausência de `campos_formulario`, mas rotas mobile ausentes retiram detalhes/paginação online. A conversa recente autorizada continua disponível offline até o vencimento da autorização. O runbook detalhado está em [docs/operacoes/PR-102.md](docs/operacoes/PR-102.md).

## 41. Operação do composer mobile da PR 103

Não há migration, dependência ou mudança de schema SQLCipher. API, contrato OpenAPI, SDK e app devem sair do mesmo commit. Antes da distribuição, validar resposta rápida por `/`, restauração do rascunho após reinício, preservação após falha, envio com chave idempotente, bloqueio de texto fora da janela Meta e envio de modelo aprovado somente com os parâmetros completos.

Sem conexão, o aceite termina no rascunho: não deve nascer mensagem local com aparência de enviada nem operação remota. Ações do sistema ainda indisponíveis precisam continuar visivelmente desabilitadas. Testar também sessão/aparelho revogados entre abertura e escrita, além de folhas e foco do campo com “Reduzir Movimento”. Observar apenas latência, resultado e códigos agregados das quatro rotas mobile, nunca texto, parâmetro, rascunho, token ou segredo. O rollback coordenado remove as rotas e o composer online; o rascunho criptografado continua recuperável por uma build compatível. O runbook detalhado está em [docs/operacoes/PR-103.md](docs/operacoes/PR-103.md).

## 42. Operação do offline e reconciliação mobile da PR 104

Não há migration PostgreSQL nem dependência nova. O schema SQLCipher avança para `user_version = 4`; uma build anterior não deve abrir essa base. API, OpenAPI/SDK e app precisam ser distribuídos de forma coordenada, mas esta PR não executa deploy nem publica binário.

O aceite deve colocar uma pendência offline e, antes da reconexão, cobrir separadamente mensagem do cliente, mensagem pela web, transferência e retorno, encerramento/reabertura, troca de contexto, janela expirada, perda de acesso e falha transitória. Somente a observação invariável pode entrar em `NA_FILA`; os demais casos mostram `Revisão necessária` com `Editar`, `Descartar` e `Enviar mesmo assim`. Confirmar que a reconciliação não começa em `Conectando...`/`Sincronizando...`, que novo comando continua recusável pelo backend e que mídia não cria pendência.

Monitorar somente contagens e resultados agregados de reconciliação, latência e códigos canônicos, sem texto, contato, conversa, atendimento, observações, token ou segredo do aparelho. Para rollback, usar uma build que reconheça `user_version = 4` ou descartar a réplica autenticada e obter snapshot novo; nunca reduzir o schema local por SQL. O runbook detalhado está em [docs/operacoes/PR-104.md](docs/operacoes/PR-104.md).

## 43. Operação de mídia e ações ERP mobile da PR 105

Não há migration PostgreSQL nem mudança de schema SQLCipher. `expo-file-system` passa a ser dependência direta do app para o seletor nativo, embora já estivesse resolvido no conjunto Expo. API, OpenAPI/SDK e app precisam ser distribuídos do mesmo commit; esta PR não executa deploy nem publica binário.

O aceite deve testar todos os formatos permitidos, arquivo acima de cada teto, MIME divergente, cancelamento, falha de upload, sessão/aparelho revogado e janela Meta encerrada. Para ERP, cobrir permissão ausente, contexto alterado entre prévia e confirmação, ERP indisponível, repetição idempotente e resultado em reconciliação. Faturas nunca podem cair para snapshot e capacidades sem caso de uso permanecem desabilitadas.

Observar somente volume, latência, tamanho/categoria agregados e códigos canônicos; nunca registrar arquivo, nome, mensagem, fatura, contrato, protocolo, resposta ERP, token ou segredo. Rollback é coordenado entre API e app; mídia já aceita permanece no pipeline normal e operações ERP persistidas continuam sua reconciliação. O runbook detalhado está em [docs/operacoes/PR-105.md](docs/operacoes/PR-105.md).

## 44. Operação das notificações mobile da PR 106

Não há migration, dependência, mudança do OpenAPI ou deploy. A entrega reutiliza `expo-notifications` e os contratos da PR 057. O aceite precisa cobrir os cinco tipos, payload extra/incoerente, rajada do mesmo contato, várias conversas, primeiro plano, segundo plano, abertura a frio, sequência ainda não aplicada, destino removido após sync, falha de rede, logout e troca de usuário.

O badge conta grupos em memória e não deve ser tratado como métrica de entrega. Monitorar apenas resultado agregado do provedor já normalizado, latência de convergência e códigos de falha; nunca payload, UUID, nome ou conteúdo. Rollback do app remove a aba funcional, mas não muda eventos, réplica ou estado do atendimento. O adapter real de entrega continua desligado sem credenciais/destinos aprovados. O runbook detalhado está em [docs/operacoes/PR-106.md](docs/operacoes/PR-106.md).

## 45. Operação da revogação mobile da PR 107

Redução de escopo deve bloquear a réplica imediatamente, alcançar a sequência e a versão da invalidação e só então liberar o novo conjunto autorizado. Revogação de sessão ou aparelho exige limpeza de cofre, réplica, pendências, rascunhos e notificações antes do login. Nunca reativar autorização offline removida nem corrigir cursor, versão ou escopo por SQL.

O deploy cumulativo usa imagens imutáveis `pr-107` para API, web, proxy, migração e dois workers homogêneos. A chave privada Ed25519 fica somente no cofre da VM; a build mobile recebe exclusivamente a chave pública. Reversão de servidor não pode regressar contratos já consumidos pelo app. O procedimento e as evidências ficam em [docs/operacoes/PR-107.md](docs/operacoes/PR-107.md).

## 46. Operação do diagnóstico e desempenho mobile da PR 108

Não há migration, endpoint, dependência, telemetria ou envio automático. Antes de distribuir a build, testar leitores de tela, fonte ampliada, contraste, áreas de toque e todos os caminhos com “Reduzir Movimento”. Exercitar lista, timeline e avisos nos tetos documentados e confirmar que uma conversa alterada não redesenha os demais cartões nem mostra infraestrutura no estado saudável.

O usuário precisa abrir `Perfil → Diagnóstico`, revisar e confirmar antes de compartilhar. O relatório deve permanecer abaixo de 2 KiB e nunca conter nome, contato, fila, UUID, mensagem, nota, formulário, credencial, token, segredo, autorização offline ou payload. Monitorar travamento e uso agregado de memória apenas pelo mecanismo aprovado no piloto; não adicionar SDK de telemetria por conveniência. Rollback remove a tela e os ajustes de apresentação sem alterar SQLCipher ou servidor. O runbook detalhado está em [docs/operacoes/PR-108.md](docs/operacoes/PR-108.md).

## 47. Operação da cópia segura do atendimento da PR 109

A migration obrigatória passa a `20260902000500_copia_segura_atendimento`. A cópia interna exige protocolo oficial, concessão explícita `EXPORTAR_HISTORICO`, MFA da conta privilegiada, sessão/origem/CSRF e confirmação na interface. O token não deve aparecer em URL, log, auditoria ou evidência; precisa ser consumido pela mesma sessão em até 15 minutos. Segundo consumo, sessão diferente, expiração ou perda de permissão retornam a mesma indisponibilidade genérica.

O arquivo é texto simples, no máximo 5 MiB e dez mil mensagens. Conferir que contém apenas o atendimento solicitado, até o instante emitido, sem mídia, formulário, reação, nota, evento, chave de storage ou identificador interno. Registros de emissão/consumo são imutáveis; não limpar por SQL. O link público permanece desativado e esta entrega não cria URL anônima nem comentário no MK. Rollback preserva a tabela e invalida naturalmente os tokens curtos. O runbook detalhado está em [docs/operacoes/PR-109.md](docs/operacoes/PR-109.md).

## 48. Operação dos relatórios mínimos da PR 110

Não há migration nem materialização periódica. Cada leitura agrega PostgreSQL no mesmo snapshot consistente e só pelas filas autorizadas; portanto o painel não substitui auditoria, observabilidade ou relatório fiscal. Os períodos permitidos são 24 horas, 7 dias e 30 dias, sempre terminando no instante da consulta. Monitorar duração e erro por período de forma agregada, sem fila, usuário ou conteúdo em logs técnicos.

Validar zero denominador, ausência de filas, permissão parcial e os estados terminais/não terminais de mensagens, fluxo e ERP. Mudança de fórmula exige nova versão no contrato e documentação antes do deploy. Reversão remove apenas rota e tela, sem perder fatos. O runbook detalhado está em [docs/operacoes/PR-110.md](docs/operacoes/PR-110.md).

## 49. Observabilidade e alertas da PR 111

Não há migration nem serviço externo novo. Cada processo da API mantém contadores HTTP locais com buckets fixos; agregação entre réplicas pertence ao coletor externo e não deve somar p95. A cada minuto, o monitor interno lê contagem e idade do item mais antigo no PostgreSQL, avalia as regras v1 e escreve somente a transição `ALERTA_OPERACIONAL_ATIVO` ou `ALERTA_OPERACIONAL_RESOLVIDO`. O coletor de logs deve encaminhar a transição ativa ao canal de plantão e deduplicar por ambiente, código e componente.

Limites iniciais: caixa de saída acima de 300 segundos, operação recuperável acima de 900 segundos e execução de fluxo vencida acima de 300 segundos. Qualquer PostgreSQL, Redis ou Object Storage configurado e indisponível é crítico. A rota `/api/v1/administracao/observabilidade` exige sessão atual e `ADMINISTRAR_INTEGRACOES`; nunca usar a rota pública de saúde para expor backlog. Validar alertas com dados sintéticos revertidos, resolução após drenagem e ausência de rota, UUID, nome, mensagem, credencial e payload no log. O runbook detalhado está em [docs/operacoes/PR-111.md](docs/operacoes/PR-111.md).

## 50. Deploy compatível da PR 112

Cada publicação recebe `VYNTRA_RELEASE` imutável e informa `VYNTRA_RELEASE_ANTERIOR`. `VYNTRA_CONFIRMAR_DEPLOY=PUBLICAR_<release>` é obrigatório. O comando valida que o Docker é local, renderiza o Compose, constrói as cinco imagens, executa uma única vez `migrar` e aguarda API/web/worker antes de atualizar o proxy. A prontidão inclui a migration obrigatória, impedindo tráfego prematuro.

Na reversão, usar `VYNTRA_CONFIRMAR_DEPLOY=REVERTER_<release>_PARA_<anterior>` e o comando `reverter`. Não rodar migration, não apagar tabela e não editar `_prisma_migrations`. A imagem anterior deve ter sido preservada e ser compatível com todas as migrations aditivas do release candidato. A API possui 15 segundos para drenar dentro de `stop_grace_period: 25s`; worker possui 30 segundos. SSE e WebSocket reconectam pelo cursor; worker não adquire novo ciclo depois do sinal. O runbook executável está em [docs/operacoes/PR-112.md](docs/operacoes/PR-112.md).
