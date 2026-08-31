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

A implementação local está em `compose.yaml` e sobe somente `api`, `postgres`, `redis`, `minio` e o inicializador efêmero do volume MinIO. Use os comandos versionados da raiz:

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

## 14. Health checks

### `/saude/vivo`

Responde se o processo está vivo. Não faz consulta pesada a todas as dependências.

### `/saude/pronto`

Responde se a instância pode receber tráfego, verificando dependências mínimas e estado de inicialização/migration.

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

Fica no PostgreSQL/armazenamento próprio, com retenção longa e imutabilidade lógica. Não desaparece com rotação de Docker.

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
- runbooks acessíveis;
- capacidades Meta/MK confirmadas;
- RPO/RTO medidos e aceitos;
- deploy de produção manual.
