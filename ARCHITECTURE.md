# Arquitetura — Omnichannel V1

## 1. Estilo arquitetural

A V1 é um **monólito modular TypeScript**, orientado por domínio e adapters, implantado como uma instalação single-tenant.

Não é um conjunto de microserviços. `api-1` e `api-2` são duas instâncias do mesmo backend para troca de versão e drenagem de tráfego. `worker-1` e `worker-2` executam o mesmo conjunto de processadores recuperáveis.

Princípios:

- PostgreSQL é a fonte da verdade.
- O backend é a autoridade de identidade, autorização, estado, regras e envio externo.
- Redis é descartável do ponto de vista do negócio.
- Toda integração externa passa por contrato interno e adapter.
- Realtime é transporte; sincronização por eventos é a garantia de convergência.
- Persistir precede distribuir e processar.
- O código define capacidades; configuração define comportamento.
- Termos do domínio ficam em português; vocabulário externo para no adapter.
- Mudanças de schema e API são compatíveis durante deploy.

### 1.1 Fontes de verdade e precedência de interface

- PostgreSQL contém o estado de negócio confirmado.
- O backend é autoridade de identidade, autorização, transições, ordenação e efeitos externos.
- `EventoDominio` confirmado e `sequencia_evento` formam a fonte de convergência dos clientes.
- SQLite, TanStack Query e estado de componentes são projeções locais substituíveis; nunca se tornam autoridade de negócio.
- SSE, WebSocket e push transportam fatos ou avisos; não criam estado.
- `PRODUCT.md` define comportamento aprovado, `MOBILE.md` define experiência mobile e este documento define fronteiras técnicas.
- As [referências visuais](design/references/README.md) são conceituais: orientam linguagem, hierarquia e comportamento, mas não prevalecem sobre requisito escrito, segurança ou invariante.
- Com a infraestrutura saudável, realtime, sincronização, novas tentativas, cursores e transportes permanecem invisíveis na interface.

## 2. Stack congelada

| Camada | Escolha da V1 |
|---|---|
| Linguagem | TypeScript |
| Backend | NestJS |
| Persistência | PostgreSQL + Prisma |
| Fila/cache/locks | Redis + BullMQ |
| Garantia assíncrona | Caixa de Saída Transacional no PostgreSQL |
| API | REST versionada (`/api/v1`) + OpenAPI |
| Web | React + TypeScript + Vite |
| Realtime web | SSE |
| Mobile | React Native + Expo Prebuild |
| Animação e gestos mobile | React Native Reanimated + React Native Gesture Handler |
| Acessibilidade de movimento | Preferência nativa “Reduzir Movimento”; estado nunca depende da animação |
| Realtime mobile | WebSocket em primeiro plano |
| Background mobile | APNs/FCM |
| Réplica local mobile | SQLite |
| Dados remotos nos clientes | TanStack Query + SDK gerado |
| Editor de fluxos | XYFlow/React Flow |
| Mídias | Object storage compatível com S3 |
| Proxy | Nginx |
| Contêineres | Docker Compose |
| Logs | Pino estruturado |
| Telemetria | OpenTelemetry básico |

Não adicionar Next.js como segundo backend, Elasticsearch/OpenSearch, Kubernetes, event store separado ou outro broker na V1 sem decisão arquitetural formal.

### 2.1 Fronteiras de apresentação

Mobile e web compartilham contratos, identidade, semântica de estados e linguagem visual, mas não uma composição de tela comum.

- Mobile é uma experiência nativa de mensageria: um foco principal por vez, gestos naturais, bottom sheets, haptics, skeletons e transições fluidas.
- Web explora densidade, teclado, múltiplos painéis e espaço próprios de desktop.
- É proibido comprimir um CRM web no celular ou ampliar o app para produzir a web.
- Componentes conceituais podem compartilhar especificação e tokens semânticos; layout, navegação e interação permanecem específicos de cada plataforma.
- Tokens semânticos compartilhados cobrem SLA, janela Meta, conexão, falha, sucesso e informação; cor bruta não define regra de negócio.
- Reanimated/Gesture Handler apresentam uma mudança já aplicada. Animação nunca decide estado, segura comando nem atrasa trabalho.
- “Reduzir Movimento” muda a apresentação, não o resultado, a ordem nem a disponibilidade da ação.
- O bottom sheet de ações envia comandos aos serviços de aplicação; não chama adapter nem contém autorização de negócio.

## 3. Estrutura proposta do repositório

```text
/
├── apps/
│   ├── api/
│   ├── web/
│   └── mobile/
├── packages/
│   ├── api-client/          # gerado de OpenAPI
│   ├── contratos/           # tipos sem regra de negócio duplicada
│   ├── configuracao/
│   ├── eslint-config/
│   └── typescript-config/
├── design/
│   └── references/          # linguagem/hierarquia conceitual; não pixels
├── PRODUCT.md
├── DOMAIN.md
├── ARCHITECTURE.md
├── SECURITY.md
├── FLOWS.md
├── MOBILE.md
├── INTEGRATIONS.md
├── OPERATIONS.md
├── AGENTS.md
├── ROADMAP.md
├── pnpm-workspace.yaml
└── turbo.json
```

O pacote `contratos` não vira um “domínio compartilhado” executando no frontend. Regras e transições continuam no backend. Web e mobile recebem contratos de transporte pelo SDK gerado.

## 4. Módulos do backend

```text
Autenticacao
Usuarios
SessoesUsuario
Dispositivos
Autorizacao

ContasWhatsApp
Contatos
IdentidadesWhatsApp
VinculosCliente
SnapshotsCliente

Conversas
Atendimentos
Filas
Atribuicoes
Mensagens
Midias
NotasInternas
Formularios

Eventos
Sincronizacao
Notificacoes

Fluxos
ExecucaoFluxos

Integracoes
├── Meta
├── Erp
│   └── MkSolutions
├── SessaoAcesso
└── Push

Calendarios
Sla
ControleRecursos
Releases
Auditoria
Observabilidade
Saude
```

`ContasWhatsApp` é um módulo de domínio real e persistente. Ele usa UUID interno estável, aceita múltiplas contas, cria cada registro como `INATIVA` e não conhece token, segredo, certificado, SDK ou DTO da Meta. A configuração protegida do adaptador referencia esse UUID; mensagens e atendimentos futuros persistem o mesmo `conta_whatsapp_id` para preservar a origem. Não existe exclusão da entidade com histórico.

`Contatos` resolve a identidade já normalizada sob transação PostgreSQL. Um advisory lock transacional estreito por portfólio+identificador estável evita dois contatos para a mesma primeira observação; a constraint única permanece a garantia final. O módulo não recebe payload Meta, não usa telefone/username como chave e não consulta ERP para decidir identidade.

### 4.1 Dependências permitidas

```text
Interface/API
    ↓
Serviços de aplicação
    ↓
Domínio
    ↓
Portas/contratos internos
    ↓
Adapters e infraestrutura
```

Regras:

- Controller valida formato e delega; não contém regra de autorização, fila ou ERP.
- Serviço de aplicação coordena transação e chama o domínio.
- Domínio não importa SDK da Meta, cliente MK, Redis, NestJS ou componentes de UI.
- Adapter converte DTO/código externo para tipos/erros internos.
- Motor de Fluxos chama serviços de domínio, nunca URL ou adapter diretamente.
- UI não decide transição de estado; envia comando e renderiza o resultado do backend.

## 5. Componentes em execução

```text
                         Internet
                            │
                    Cloudflare / WAF
                            │ HTTPS
                          Nginx
                 ┌──────────┴──────────┐
                 │                     │
              Web estática       Balanceamento API
                                       │
                              ┌────────┴────────┐
                              │                 │
                            API 1             API 2
                              │                 │
                              └────────┬────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  │                    │                    │
              PostgreSQL            Redis           Object Storage S3
                  │                    │                    │
       estado + caixa de saída  jobs/locks/cache       arquivos privados
                  │
             Worker 1 / 2
                  │
          ┌───────┼──────────┬───────────┐
          │       │          │           │
        Meta      MK       Push       Realtime
```

PostgreSQL e Redis ficam na mesma VM na implantação inicial; storage de mídia fica fora da VM. A mesma VM continua sendo um ponto único de falha aceito pela meta de recuperação da V1. Duas APIs na mesma VM melhoram deploy, não oferecem alta disponibilidade contra perda da VM.

O staging mínimo antecipa somente as fronteiras já implementadas: uma API, PostgreSQL, Redis e storage S3 em um projeto Compose exclusivo. Redes, volumes e segredos não são compartilhados com desenvolvimento ou produção. Como a PR 005 usa uma única VM e dados exclusivamente sintéticos/sanitizados, seu Garage roda em nó único sem redundância; essa topologia valida contrato S3 e operação, mas é explicitamente inválida para produção. Serviços futuros entram no staging apenas no PR que implementar sua capacidade real.

## 6. Persistência e transações

### 6.1 PostgreSQL

Armazena:

- usuários, sessões revogáveis e RBAC;
- contatos, identidades e vínculos;
- conversa, atendimentos, mensagens, notas e formulários;
- snapshots do ERP;
- filas, calendários, SLAs e atribuições;
- fluxos, versões, execuções e passos;
- eventos de domínio e caixa de saída;
- operações externas idempotentes;
- flags, políticas de versão e auditoria.

O acesso inicial usa Prisma 7 estável com o adaptador oficial `pg`. `ServicoPrisma` cria o cliente/pool de forma tardia, limita cada processo a cinco conexões e encerra o pool com o módulo. URL autenticada continua vindo de arquivo secreto; desenvolvimento pode compô-la em memória a partir de usuário, banco, host e arquivo de senha.

`Auditoria` depende de uma porta somente de acréscimo. Prisma executa o `INSERT`; constraints e triggers PostgreSQL, criados pela migration, materializam coerência de ator/contexto e bloqueiam `UPDATE`, `DELETE` e `TRUNCATE`. O trigger é o uso excepcional de SQL bruto porque Prisma não modela triggers; ele não recebe entrada dinâmica.

`ServicoTransacaoDominio` delimita a unidade de trabalho para efeitos assíncronos. A alteração principal roda primeiro; `EventoDominio` recebe `sequencia_evento` do PostgreSQL e cada `ItemCaixaSaida` referencia esse evento, tudo no mesmo callback transacional Prisma. Falha de validação, constraint ou persistência reverte o conjunto inteiro. Repositórios de evento e caixa de saída não abrem transações próprias e não publicam nada.

Usuários, perfis, permissões e filas também residem no PostgreSQL. Perfil é referência opcional do usuário; permissões são ajustes granulares por código fechado; acesso de fila é relação explícita e revogável. `CredencialSenha`, `SessaoWeb` e `TentativaLoginWeb` permanecem separados do usuário e de autorização. `ServicoAutorizacao` combina o contexto emitido pela sessão autenticada, usuário/perfil ativos, matriz e ajustes de permissão, fila/escopo e verificação do recurso/estado em `default deny`.

### 6.1.1 Autenticação web

`ServicoAutenticacaoWeb` normaliza o identificador, reserva a tentativa sob advisory lock transacional curto, verifica Argon2id fora da transação e cria sessão/auditoria na mesma transação. O lock usa somente chaves internas derivadas de identificador+IP e IP e existe porque Prisma não oferece primitiva equivalente; ele fecha a corrida do limite sem manter a derivação criptográfica dentro da transação. Usuário desconhecido executa derivação simulada e recebe a mesma resposta de senha incorreta. O token de 256 bits e o CSRF são entregues em cookies `__Host`; o PostgreSQL recebe apenas SHA-256 dos segredos de alta entropia.

O cookie da sessão é `HttpOnly`, `Secure`, `SameSite=Strict`, sem `Domain` e com `Path=/`. O cookie CSRF é legível pelo cliente para envio em `x-csrf-token`, mas seu hash é vinculado à sessão; mutações exigem cookie, header idêntico e origem HTTPS na allowlist. CORS usa a mesma allowlist e credenciais explícitas.

Rotação usa `updateMany` condicionado pelo token atual, estado e expiração: concorrentes têm um vencedor e o segredo anterior perde autoridade. A última atividade confirmada renova a janela de inatividade de 12 horas, com persistência limitada por intervalo para evitar escrita por evento SSE. Perfil privilegiado não recebe sessão somente com senha; enquanto TOTP/código de recuperação não estiver disponível, o backend responde `MFA_NECESSARIO` e permanece em negação segura.

Criação e revogação por limite usam advisory lock transacional derivado apenas do UUID do usuário. Dentro dessa seção serializada, o serviço conta sessões válidas, exige confirmação antes da terceira e, quando confirmado, revoga a mais antiga antes de inserir a nova. O limite não depende de Redis nem de uma instância específica da API. Logout global, revogação própria e administrativa alteram estado e gravam auditoria na mesma transação; a rota administrativa ainda passa por `ServicoAutorizacao` e pelo recurso concreto.

### 6.1.2 Autenticação mobile

`ServicoAutenticacaoMobile` compartilha credencial/MFA com a autenticação web, mas possui repositório, sessão e ciclo de tokens próprios. O backend emite segredos opacos de 256 bits, persiste somente hashes e exige um vínculo criptográfico adicional da instalação. O access token vale 15 minutos; o limite absoluto do refresh é 30 dias e não é ampliado por rotação.

Renovação serializa o hash do refresh no PostgreSQL, registra o hash consumido e troca access/refresh em uma alteração condicional. A segunda apresentação do refresh consumido revoga a sessão e audita replay. Login no mesmo dispositivo revoga sessões anteriores desse vínculo antes de criar uma nova. Rate limit e criação do dispositivo/sessão são transacionais; Redis não é autoridade.

No app, `CofreSessaoMobile` usa SecureStore, que delega a Keychain/Keystore. Identificador da instalação, segredo de vínculo, UUID do dispositivo e refresh ficam no cofre com política restrita ao aparelho. O access token existe somente em memória no `GerenciadorSessaoMobile`; SQLite e AsyncStorage não recebem tokens. Contratos HTTP continuam no SDK OpenAPI gerado; essas classes cuidam apenas da custódia local.

Limite e revogação serializam a coleção de dispositivos por UUID do usuário com advisory lock parametrizado. Uma instalação nova lista os ativos em ordem determinística, revoga aparelhos excedentes e suas sessões, e só então cria dispositivo/sessão. Listagem própria projeta apenas UUID, plataforma, modelo sanitizado, versão e instantes; hashes nunca saem do repositório. Revogação própria e administrativa usam alterações condicionadas por usuário+estado e auditoria na mesma transação. A administrativa reutiliza a sessão web já validada e ainda passa pelo serviço central de autorização.

`ServicoAutenticacaoMobile.autenticar` é o portão único também para sincronização e tempo real: valida access, vínculo, usuário, dispositivo e sessão em cada nova decisão. O gateway da PR 056 deverá revalidar em handshake, heartbeat e comando, além de fechar conexões ao receber a projeção de revogação; não poderá reter autoridade apenas porque um WebSocket já abriu. Nesta etapa ainda não há gateway ou endpoint de sincronização, portanto a PR 016 entrega a autoridade revogável e os contratos, sem criar transporte fictício.

### 6.1.3 Pareamento QR

`ServicoPareamentoQr` coordena web e mobile sem transformar um cliente no emissor da identidade do outro. A web cria um token aleatório de 90 segundos sob sessão+CSRF+origem; o mobile o resgata uma vez e recebe outro comprovante efêmero. O PostgreSQL conserva somente hashes e a máquina de estados. A web consulta apenas estado e prévia sanitizada do aparelho, confirma pela mesma sessão com autenticação recente e nunca observa a credencial mobile.

Na conclusão, o mesmo aparelho reapresenta comprovante, identificador da instalação e segredo de vínculo. Uma única transação serializa o pareamento, reutiliza `ServicoAutenticacaoMobile` para aplicar o limite de dois aparelhos, cria a sessão e marca `CONCLUIDO`. A resposta com access/refresh sai somente pelo endpoint mobile. Advisory locks curtos por usuário, token, IP, instalação e pareamento fecham corridas entre réplicas; unicidade parcial garante um pareamento ativo por sessão web. Redis não participa da autoridade.

O fluxo HTTP possui contratos separados no SDK OpenAPI: criar/consultar/confirmar/cancelar na web e resgatar/consultar/concluir no mobile. Scanner e telas serão consumidores desses contratos; a API não depende de biblioteca de QR nem recebe imagem. Revogar a sessão web cancela pareamentos pendentes na mesma transação.

### 6.1.4 Controles de recurso e versão

`ServicoReleases` consulta o PostgreSQL e devolve configuração efetiva, sem confiar em decisão do web/mobile. O desligamento emergencial antecede alvos e percentual; a faixa percentual é hash estável de código+usuário. Alterações administrativas serializam código ou plataforma, usam versão esperada e auditam na mesma transação. Redis não participa da autoridade.

`ServicoAutenticacaoMobile` verifica a política em entrada, pareamento, emissão, autenticação e refresh. Assim, ocultar ou adulterar a tela obrigatória não contorna a mínima. A rota pública de avaliação permanece separada para permitir UX pré-login; configurações autenticadas acrescentam somente controles já autorizados.

### 6.1.5 Autorização central

```text
contexto de sessão autenticada
  → usuário e perfil ativos
  → papel base + CONCEDER/NEGAR
  → fila ativa + vínculo quando exigido
  → consulta filtrada do recurso concreto
  → estado permite a ação
  → AutorizacaoConcedida efêmera
```

O repositório projeta somente o usuário, o perfil e a fila solicitada; não carrega coleção para filtrar em memória. O verificador específico do módulo recebe o contexto já autorizado e retorna apenas acesso/estado. Recurso inexistente e recurso conhecido sem acesso convergem para `PERMISSAO_NEGADA` sem metadados diferenciadores.

O serviço aceita `TransacaoPrisma` opcional e a repassa à leitura do contexto e ao verificador. Casos de uso mutáveis devem usá-la junto da alteração/constraint do agregado quando for necessário fechar corrida entre decisão e escrita. `ServicoAutenticacaoWeb` fornece o contexto a partir da sessão web real; nenhum cliente pode construir esse objeto diretamente.

Migrations rodam em um contêiner/job único antes da API. A API não executa migration no startup e só fica pronta quando a migration obrigatória consta como concluída.

### 6.2 Redis

Usos permitidos:

- BullMQ;
- locks efêmeros;
- rate limiting;
- cache reconstruível;
- coordenação de gateways realtime;
- presença técnica de conexão.

Usos proibidos:

- única cópia de mensagem, atendimento, execução de fluxo ou operação ERP;
- única prova de idempotência de escrita;
- autoridade de disponibilidade do usuário;
- sequência de sincronização não persistida.

### 6.3 Caixa de Saída Transacional

Para toda alteração com efeito posterior:

```text
BEGIN
  alterar agregado
  inserir EventoDominio
  inserir ItemCaixaSaida
COMMIT
```

O worker lê itens pendentes, adquire lease/lock, executa o efeito e registra resultado/tentativa. Se morrer depois do commit, outro worker retoma. O consumidor precisa ser idempotente porque entrega “pelo menos uma vez” é esperada.

A PR 009 materializa criação e vínculo transacionais. A PR 010 acrescenta idempotência, concessão temporária, histórico de tentativas e reconciliação persistentes; distribuição SSE/WebSocket/push e workers específicos permanecem em suas PRs próprias.

### 6.3.1 Operações recuperáveis

`ServicoIdempotencia` é a porta central para comandos que não podem produzir efeito duplicado. O registro usa chave com escopo e assinatura do comando; criação concorrente é resolvida pela unicidade no PostgreSQL. A execução ou reconciliação adquire concessão por alteração condicional de `estado + versao + proxima_acao_em`, cria uma tentativa e recebe token que não é armazenado em claro.

```text
transação local: intenção + idempotência + evento + caixa de saída
  ↓ COMMIT
worker adquire concessão
  ↓ chamada externa fora da transação
transação curta: resultado confirmado ou incerteza
  ↓
reconciliação antes de qualquer repetição ambígua
```

Reinício de API/worker não perde a operação. Uma concessão expirada vira `RESULTADO_INCERTO`; o PostgreSQL agenda a reconciliação e mantém o histórico. Redis pode acelerar seleção/coordenação, mas não autoriza repetição nem substitui o estado persistido.

A PR 063 aplica esse protocolo à criação de atendimento no ERP. `ServicoCriacaoProtocoloErp` prepara `ProtocoloErp(PENDENTE)` e registro idempotente na mesma transação, chama a porta externa apenas depois de adquirir uma concessão e impede que `executarCriacao` atravesse um estado incerto. Somente `reconciliarCriacao` pode tratar esse estado. Confirmação da criação ou reconciliação atualiza o protocolo para `OFICIAL` e conclui a operação idempotente dentro da mesma transação PostgreSQL. O adaptador é argumento do executor e não provider do módulo: a fundação fica utilizável pelo worker sem habilitar uma integração MK ainda não caracterizada.

### 6.4 Fronteiras transacionais críticas

Devem ser uma única transação local:

- mensagem recebida + atendimento resolvido + evento + item de caixa de saída;
- resgate/transferência + histórico de atribuição + evento + auditoria;
- mudança de permissão + evento de invalidação + auditoria;
- publicação de versão de fluxo + troca de ponteiro publicado + auditoria;
- comando ERP local + `OperacaoErp` + idempotência + item de caixa de saída.

Uma chamada HTTP externa não deve permanecer dentro de uma transação PostgreSQL longa. Persiste-se a intenção; worker executa; domínio aplica o resultado em nova transação.

## 7. API e contratos

### 7.1 REST

REST recebe comandos e consultas. Rotas conceituais:

```text
/api/v1/autenticacao/...
/api/v1/atendimentos/...
/api/v1/conversas/...
/api/v1/filas/...
/api/v1/sincronizacao?apos=...
/api/v1/eventos/stream
/api/v1/webhooks/meta
/api/v1/integracoes/erp/disparos
/api/v1/saude/...
```

O desenho exato de endpoints deve seguir casos de uso, não CRUD automático das tabelas.

### 7.2 OpenAPI e SDK

NestJS publica OpenAPI. `mobile` e `web` usam cliente TypeScript gerado. Não copiar DTO manualmente nem duplicar enum de estado no frontend.

Contratos incompatíveis criam nova versão ou seguem estratégia aditiva. O backend deve suportar a versão mobile atual e a imediatamente anterior durante a transição, salvo bloqueio crítico de segurança controlado por `PoliticaVersaoAplicativo`.

### 7.3 Erros

Erros internos têm código estável em português e mensagem adequada ao usuário, por exemplo:

```json
{
  "codigo": "ATENDIMENTO_JA_RESGATADO",
  "mensagem": "Este atendimento acabou de ser resgatado por outro usuário.",
  "correlacao_id": "..."
}
```

Não devolver stack, token, CPF, payload externo ou detalhes que permitam enumeração.

## 8. Eventos, SSE, WebSocket e push

### 8.1 Fluxo único de eventos

Todos os clientes observam os mesmos `EventoDominio`, adaptados e filtrados por autorização:

```text
PostgreSQL
   ↓ evento confirmado
Distribuidor
   ├── SSE → web
   ├── WebSocket → app ativo
   └── Push → app em background/fechado
```

Não há três modelos de evento. Há três transportes para o mesmo fato persistido.

A PR 052 materializa o primeiro limite dessa distribuição: `ProjetorEventoCliente` recebe o fato confirmado e a autorização atual, nega sessão/recurso fora de escopo e produz contratos discriminados `WEB`, `MOBILE` ou `PUSH`. Web/mobile recebem somente chaves primitivas em allowlist e compatíveis com a classificação; tipo interno não publicado vira `RECURSO_ATUALIZADO`. Push aceita somente os cinco avisos da V1, sequência e identificadores mínimos de navegação, nunca `dados`, conteúdo ou o objeto interno. Transporte algum pode ignorar esse projetor.

A PR 053 materializa a recuperação incremental em `GET /api/v1/sincronizacao`. O cursor representa a última `sequencia_evento` aplicada e a consulta varre, em ordem, no máximo 100 fatos mais um indicador de continuação. A autorização vigente é resolvida dentro do PostgreSQL: conteúdo de fila inacessível é substituído por objeto vazio antes de alcançar o serviço, enquanto a sequência varrida ainda avança o cursor. Isso evita inferência de conteúdo, repetição infinita em lacunas de autorização e identidade declarada pelo cliente. Cursor fora da retenção de 30 dias recebe `RESSINCRONIZACAO_COMPLETA_NECESSARIA`; cursor futuro ou malformado é inválido. No cliente, replay é idempotente e o cursor só muda depois de todo o lote passar pela validação e aplicação local.

### 8.2 SSE web

- conexão autenticada por cookie web;
- `Last-Event-ID` contém a última `sequencia_evento` aplicada;
- heartbeat técnico;
- buffering do Nginx desativado para a rota;
- reconexão não muda disponibilidade do usuário.

O handoff para o modo ao vivo também é sem lacuna:

1. autenticar e registrar uma assinatura temporariamente bufferizada no distribuidor;
2. capturar no PostgreSQL uma marca d’água `sequencia_limite`;
3. consultar e enviar os eventos autorizados em `(Last-Event-ID, sequencia_limite]`;
4. drenar, em ordem, os eventos bufferizados `> sequencia_limite`, descartando duplicados;
5. somente então marcar o stream como ao vivo.

Se o buffer/distribuidor falhar, a conexão fecha e o navegador reconecta pelo último ID realmente aplicado; “consultar backlog e depois assinar” é proibido.

A PR 055 materializa esse handoff em `GET /api/v1/sincronizacao/eventos`. A conexão usa somente cookie web e trata `Last-Event-ID` como sequência aplicada. Uma assinatura baseada na fonte autoritativa PostgreSQL começa em modo buffer antes da marca d’água; backlog e buffer passam pelo mesmo serviço incremental e pelo projetor autorizado. Heartbeats não carregam ID e não mudam disponibilidade. O stream publica `X-Accel-Buffering: no`; falha, ordem inválida ou mais de mil projeções no buffer encerram a resposta para que o navegador retome do último evento que de fato recebeu.

### 8.3 WebSocket mobile sem lacuna

O protocolo precisa fechar a corrida entre sync e realtime:

1. mobile chama sincronização com seu cursor;
2. servidor retorna eventos e `sequencia_final` do lote/snapshot;
3. mobile aplica tudo atomicamente no SQLite;
4. mobile abre WebSocket autenticado com `apos=sequencia_final`;
5. gateway consulta/passa todo evento persistido após esse cursor antes de entrar no modo ao vivo;
6. cada evento exige confirmação local/aplicação idempotente; reconexão repete a partir do último aplicado.

Assim, evento criado entre os passos 2 e 4 é recuperado no passo 5. “Abrir WebSocket e esperar o próximo” sem backfill é proibido.

A PR 056 materializa esse contrato em `/api/v1/sincronizacao/eventos-mobile?apos=<sequencia>`. O upgrade só ocorre depois de validar access token, UUID do dispositivo e segredo de vínculo pelo serviço de autenticação mobile; cookie web não é aceito. A assinatura PostgreSQL começa bufferizada antes da marca d’água, entrega projeções `MOBILE` autorizadas e envia `PRONTO` somente depois do handoff. O envelope `EVENTO` carrega `sequencia_evento`, e o app responde `CONFIRMAR` apenas depois da aplicação idempotente local. Confirmações são cumulativas e monotônicas. Ping/pong detecta conexão morta; pressão de saída, buffer ou confirmações pendentes excessivas fecham o canal para retomada pelo último cursor aplicado. Redis não participa de autenticação, autorização, ordem ou recuperação.

A PR 058 acrescenta revalidação de sessão no heartbeat e antes de aceitar cada confirmação. Falha fecha o canal com `4003 AUTORIZACAO_INVALIDADA`. Uma projeção `PERMISSOES_ALTERADAS` é enviada primeiro e encerra o canal com `4003 ESCOPO_ALTERADO`, permitindo que o app use a sequência e a versão recebidas como limite mínimo do snapshot de recuperação.

### 8.4 Push

Push contém apenas identificadores mínimos e texto não sensível. Ele avisa; não altera SQLite como fonte definitiva, não marca leitura e não carrega CPF, fatura ou conteúdo privado. Ao abrir o app, a sincronização decide o estado.

A PR 057 materializa esse limite com `CompositorAvisoMobile` e `PortaEntregaAvisoMobile`. O compositor aceita somente projeção `PUSH` autorizada, cinco tipos fechados, sequência observada e UUIDs de conversa/atendimento. Títulos e corpos são genéricos e definidos no servidor; chave de agrupamento é a conversa ou, sem ela, o atendimento. Resultado externo é normalizado para `ACEITO`, `DESTINO_INVALIDO` ou `INDISPONIVEL`. Termos de provedor ficam no adapter, e nenhum simulador é registrado em produção. No app, o adapter nativo Expo aplica allowlist ao payload; recebimento solicita sincronização e abertura, inclusive a frio, aguarda a sincronização antes de navegar. Push não escreve réplica, não avança cursor e não marca leitura. O adapter de envio real continua desligado até credenciais e destinos externos serem configurados de forma aprovada.

### 8.5 Estado técnico invisível na interface

O estado saudável não exibe botão de atualizar, `Última atualização`, cursor, WebSocket, SSE, fila ou indicador de sincronização.

Somente exceções transitórias podem produzir uma faixa superior:

- `SEM_CONEXAO` → `Sem conexão`;
- `CONECTANDO` → `Conectando...`;
- `SINCRONIZANDO` → `Sincronizando...`.

A faixa desaparece automaticamente quando a projeção volta ao estado normal. Falha de uma mensagem aparece na própria mensagem e não transforma toda a interface em painel técnico.

Ao aplicar uma nova mensagem confirmada:

```text
evento confirmado
  → aplicação idempotente na projeção
  → recalcular ordem por última atividade confirmada/sequencia_evento
  → preservar identidade visual do item por conversa_id
  → animar somente a diferença visual
```

Com “Reduzir Movimento”, a mesma alteração ocorre sem deslocamento elaborado. Aplicação do fato, comando e navegação nunca esperam a animação.

## 9. Sincronização

### 9.1 Incremental

`GET /api/v1/sincronizacao?apos={sequencia}` devolve eventos autorizados em ordem, paginação e cursor final. O cliente persiste o cursor somente depois de aplicar a transação local.

O filtro de autorização usa a permissão atual, não a que existia quando o evento foi gerado.

### 9.2 Ressincronização completa

Se o cursor estiver fora da retenção incremental ou o servidor não puder garantir continuidade:

```text
RESSINCRONIZACAO_COMPLETA_NECESSARIA
```

O app substitui de forma segura sua réplica autorizada com snapshot contendo:

- filas e permissões atuais;
- atendimentos próprios e pendentes autorizados;
- conversas/timelines recentes autorizadas;
- não lidas e marcadores pessoais;
- configurações e flags;
- cursor base para o realtime.

O snapshot é produzido sob uma leitura consistente do PostgreSQL e vinculado a uma `sequencia_base` capturada no mesmo ponto lógico. O cliente aplica conteúdo e cursor na mesma transação SQLite; depois recupera estritamente eventos `> sequencia_base` pelo protocolo sem lacuna. Uma alteração concorrente fica inteira no snapshot ou inteira no backfill, nunca dividida entre os dois.

A PR 054 materializa esse contrato em `GET /api/v1/sincronizacao/completa`. O backend abre uma transação `REPEATABLE READ` e somente-leitura, captura primeiro a maior `sequencia_evento` e consulta sob o mesmo snapshot lógico permissões, filas, atendimentos abertos ou reabríveis, controles e políticas. A réplica de trabalho contém até 200 conversas mais recentes autorizadas e até 200 mensagens e notas por conversa; histórico além dessa janela continua pertencendo ao PostgreSQL e será carregado sob demanda, não descartado. Os CTEs de autorização precedem qualquer leitura de conteúdo. No SQLite, substituir a réplica e persistir `sequencia_base` são duas operações da mesma transação; rascunhos e comandos pendentes ficam em armazenamento separado e seguem para reconciliação.

A referência inicial é retenção de 30 dias para eventos de sincronização, sujeita a medição e política operacional. Isso não limita histórico de conversa.

### 9.3 Alteração de permissão

`PERMISSOES_ALTERADAS` obriga:

1. pausar comandos e stream dependentes;
2. buscar autorização atual;
3. apagar/inutilizar do SQLite os dados que perderam escopo;
4. refazer snapshot se necessário;
5. reconectar com novo escopo.

A PR 058 materializa `usuario.versao_permissoes`, iniciada em 1. Conceder/revogar acesso de fila e inativar uma fila incrementam a versão dos usuários efetivamente afetados e acrescentam `PERMISSOES_ALTERADAS` na mesma transação PostgreSQL; operação idempotente sem mudança não incrementa. O evento tem entidade `USUARIO`, alcança somente seu alvo e carrega motivo, fila quando aplicável e a nova versão. SSE e WebSocket entregam o evento antes de encerrar; SSE também revalida a sessão a cada ciclo de consulta.

O snapshot completo publica `versao_permissoes`. O coordenador mobile aceita a recuperação somente se `snapshot.versaoPermissoes >= evento.dados.versaoPermissoes` e `snapshot.sequenciaBase >= evento.sequenciaEvento`. A substituição deve remover explicitamente todo registro ausente do novo conjunto autorizado. Rascunhos e comandos pendentes permanecem separados, são reconciliados sob o novo escopo e só comandos ainda autorizados retomam. Se snapshot, substituição ou reconexão falhar, a área autenticada fica bloqueada; cache antigo nunca volta a ser exibido como fallback.

### 9.4 Projeções de lista e timeline

- A lista deriva do estado autorizado já aplicado e se reorganiza automaticamente.
- Uma conversa que recebe mensagem sobe suavemente, preservando identidade estável, foco, seleção e rascunhos não relacionados.
- A timeline é projetada por `Contato`, não por número empresarial.
- Número/conta de origem, atendimento, protocolo e data permanecem metadados dos itens e podem gerar separadores discretos.
- Notas, eventos internos e formulários usam variantes de apresentação distintas de mensagem externa; `Somente equipe` faz parte do contrato de exibição dos itens internos.
- Estado de conexão local não altera atendimento, disponibilidade ou ordenação de negócio.

## 10. Autorização da timeline única

A timeline única não torna todo o histórico automaticamente visível a qualquer atendente.

Padrão conservador da V1:

- o usuário autorizado ao atendimento atual vê todo o conteúdo externo desse protocolo, inclusive partes produzidas antes de uma transferência;
- atendimentos históricos aparecem com conteúdo somente quando o usuário tem acesso a pelo menos uma fila participante daquele atendimento ou possui `VISUALIZAR_HISTORICO_TRANSVERSAL`;
- itens não autorizados não são retornados à web/mobile nem ao usuário autenticado; a UI pode exibir apenas um separador neutro indicando que existe histórico restrito, sem metadados sensíveis;
- nota interna exige `VISUALIZAR_NOTA_INTERNA`, conserva a fila de criação e, sem interseção, exige `VISUALIZAR_NOTAS_TRANSVERSAIS`; essa permissão não é herdada de `VISUALIZAR_HISTORICO_TRANSVERSAL` nem do papel Administrador;
- informação essencial entre filas vira `EventoConversa` sanitizado, não nota privada usada como atalho;
- administrador não recebe automaticamente permissão para revelar dado sensível completo; a permissão específica e auditoria continuam necessárias.

Essa matriz aprovada reconcilia “timeline contínua” com menor privilégio. O PR de RBAC deve implementá-la nas consultas/índices sem ampliar permissões.

## 11. Mídia

Fluxo:

```text
upload/Meta
  ↓ validação de tamanho, tipo, MIME e assinatura
  ↓ scan quando aplicável
object storage privado
  ↓ metadados + hash no PostgreSQL
download autorizado pelo backend
  ↓ URL assinada de curta duração
cliente
```

Nunca usar caminho fornecido pelo usuário como chave física. O backend gera `storage_key`. Banco não guarda binário de mídia.

## 12. Busca

A V1 usa PostgreSQL com índices adequados, `pg_trgm` e full text search quando necessário. Toda busca incorpora autorização no plano da consulta; não se busca tudo para filtrar em memória.

CPF exato usa índice protegido/HMAC gerenciado por chave, nunca hash simples de espaço pequeno. Conteúdo de mensagem, nome, username, protocolo e contrato recebem índices separados conforme medição. OpenSearch só será avaliado após evidência de gargalo.

## 13. Fluxos e integrações

O Motor de Fluxos e os adapters seguem estes caminhos:

```text
ExecucaoFluxo
   ↓ No CONSULTAR_FATURAS
ServicoFinanceiro
   ↓ contrato AdaptadorErp
AdaptadorMkSolutions
   ↓ DTO externo
MK Solutions
```

```text
ServicoMensageria
   ↓ contrato CanalMensageria
AdaptadorMetaCloud
   ↓ payload externo
Meta Cloud API
```

Nenhum adapter expõe credencial, DTO bruto ou código externo ao domínio. [FLOWS.md](FLOWS.md) e [INTEGRATIONS.md](INTEGRATIONS.md) detalham os contratos.

Na PR 019, a porta de mensageria é código puro e não registra integração real no módulo da aplicação. O simulador Meta implementa a porta, normaliza estados externos e entrega eventos internos a um consumidor; repetição compatível reaproveita resultado e chave incompatível falha. Esse armazenamento em memória existe somente para teste. Produção continuará exigindo persistência/idempotência PostgreSQL, webhook autenticado e caixa de saída nos PRs próprios.

Na PR 020, `AdaptadorErp` separa consultas e escritas e devolve somente modelos internos normalizados. Seu simulador contratual diferencia indisponibilidade anterior à escrita, quando não há efeito externo, de resposta perdida após possível criação. A segunda situação retorna `RESULTADO_INCERTO` e só pode avançar por reconciliação. O simulador não é provider da aplicação; `OperacaoIntegracao`, caixa de saída e protocolo persistente continuam pertencendo aos PRs de domínio.

Na PR 060, busca e detalhe de cliente/contrato entram por `ServicoConsultasClienteContratoErp`. O caso de uso valida a entrada, delega à porta genérica e aceita de volta somente a allowlist do modelo normalizado, com coerência entre cliente e contrato e limite de resultados. Ausência, indisponibilidade e resposta externa inválida permanecem resultados distintos. Nenhuma rota nem provider MK é registrada: a fronteira real segue bloqueada até caracterização de respostas reais, enquanto os módulos internos permanecem independentes do fornecedor.

Na PR 061, `ServicoFinanceiroErp` compõe a fatura corrente com dois complementos independentes: documento PDF e dados de pagamento. A fatura-base precisa existir em `TEMPO_REAL`; cada complemento é validado e declara `DISPONIVEL` ou `INDISPONIVEL` com motivo. O resultado é `COMPLETA` somente quando ambos existem e são válidos, ou `PARCIAL` sem preencher lacunas. PDF fica em bytes normalizados para o pipeline privado de mídia, nunca em URL externa. Não há fallback financeiro para `SnapshotCliente`, controller ou provider MK real nesta etapa.

Na PR 021, `AdaptadorSessaoAcesso` é uma porta independente de `AdaptadorErp`, com leitura, desconexão e reconciliação próprias. O simulador nasce `DESATIVADO`, preserva apenas estados explicitamente fornecidos e recusa desconectar `DESCONHECIDA`. A migration semeia `SESSAO_ACESSO` desativado e sem alvos; nenhuma rota ou provider real é registrado. A integração real permanece condicional ao PR 068.

Na PR 025, o módulo `contextos-cliente` separa vínculos persistentes da seleção usada por um atendimento. O repositório recebe a transação do caso de uso, valida o alvo por chaves compostas e executa troca por versão esperada. O serviço central de autorização verifica a permissão e o recurso antes da mutação; a auditoria participa da mesma transação. Não há controller de vínculo/contexto nem consulta ao MK nesta etapa. `contexto_atendimento.atendimento_id` fica reservado até a tabela `Atendimento` da PR 028, quando uma migration aditiva deve acrescentar a FK sem reescrever esta migration aplicada.

Na PR 026, `snapshots-cliente` é um módulo persistente e interno: serializa por vínculo, exige vínculo ativo e mantém um documento protegido corrente no PostgreSQL. Hash+instante capturado distinguem replay, atraso e conflito; versão esperada protege a substituição. A leitura calcula idade no servidor e declara origem `SNAPSHOT`. Não há controller, escrita ERP, cache obrigatório ou provider MK. Se Redis for acrescentado depois, será apenas uma projeção descartável reconstruída dessa autoridade.

Na PR 062, o módulo recebe lotes incrementais ou reconciliações comprovadamente completas. Tombstone e ausência completa convertem o snapshot em `EXCLUIDO` ou `OBSOLETO` sem apagar o último documento; motivo, instante e versão são persistidos e expostos na leitura. Atualização posterior mais nova volta a `ATUAL`. O serviço não interpreta cursor/paginação MK e não registra job externo enquanto essa semântica não for caracterizada. A migration é aditiva e snapshots existentes nascem `ATUAL`.

Na PR 064, `desbloqueios-confianca` implementa a consulta de elegibilidade. Uma leitura consistente autoriza sessão, permissão e fila, valida o contrato contra o contexto ativo do atendimento e lê o último registro confirmado. A transação termina antes da consulta externa. `ServicoElegibilidadeDesbloqueioConfianca` então chama `ConsultasErp`, exige resposta normalizada `TEMPO_REAL` e combina a decisão externa com o intervalo local de 30 dias.

Na PR 065, `ServicoExecucaoDesbloqueioConfianca` acrescenta a escrita sem registrar rota nem adapter real. A primeira transação autoriza e fixa escopo, assinatura e chave da operação. Depois da verificação externa, uma segunda transação adquire advisory lock pelo contrato, revalida a autoridade e a janela de 30 dias, cria uma reserva única e concede a execução. A chamada ERP ocorre fora da transação. Confirmação volta ao mesmo lock e grava histórico imutável, conclusão idempotente, auditoria sanitizada e liberação da reserva atomicamente. Resposta ambígua conserva a reserva e só entra em reconciliação; efeito comprovadamente ausente libera a reserva. A porta ERP continua recebida pelo caso de uso, sem provider MK ou simulador no grafo da aplicação.

Na PR 066, `ordens-servico` aplica o mesmo limite transacional às criações e alterações de OS. O serviço fixa autorização, atendimento, fila, cliente, contrato, protocolo oficial, assinatura e operação antes de conceder o efeito; chama a porta ERP fora da transação e só materializa uma confirmação normalizada. A criação confirma `OrdemServicoErp`, operação e auditoria juntas. A atualização adquire advisory lock pela ordem, verifica a versão esperada e cria uma reserva única; na confirmação, altera a versão, acrescenta histórico imutável, conclui a operação, audita e libera a reserva na mesma transação. Resultado ambíguo conserva a operação e, em atualização, a reserva até reconciliação. O módulo não publica controller nem registra adapter real ou simulado.

Na PR 067, `acoes-atendimento-erp` cobre comentário de finalização e encerramento por protocolo oficial. Comentário confirmado registra somente hash, operação e auditoria, sem mudar o atendimento. Encerramento adquire lock e reserva exclusiva, revalida RBAC/contexto/versões e chama a porta fora da transação. Somente a confirmação externa percorre a máquina de estado local e, em uma transação, fecha a atribuição, acrescenta evento, registra o efeito, conclui idempotência, audita e libera a reserva. Falha anterior ao efeito preserva o estado; resultado ambíguo conserva a reserva até reconciliação. A política do link público é um retorno fechado e não possui gerador, rota ou adapter. O módulo não registra provider MK real ou simulador.

Na PR 027, `conversas` resolve exclusivamente por `contato_id` sob lock transacional. A conta WhatsApp ativa entra como uma participação da conversa — não como chave para criar outra timeline — e primeiro/último instante aceitam entrega fora de ordem sem regredir atividade. PostgreSQL impõe uma conversa por contato e uma participação por conversa+conta. O módulo é interno, sem controller; mensagens e atendimentos futuros ainda deverão carregar seus próprios `conta_whatsapp_id`.

Na PR 069, `fluxos` introduz o catálogo interno do Motor de Fluxos. `ServicoCatalogoFluxos` autoriza com `EDITAR_FLUXO`, normaliza e limita a definição e mantém criação, versionamento, lock e auditoria na transação fornecida. O repositório Prisma usa PostgreSQL como autoridade para unicidade, revisão e ponteiro composto. Uma constraint diferida valida o ponteiro ao final do commit; índice parcial impede duas versões `PUBLICADA`; trigger protege definição e atribuição histórica depois da publicação. O módulo exporta somente o serviço interno e não antecipa controller, editor, executor, worker ou integração externa.

Na PR 070, `ServicoPublicacaoFluxos` concentra as transições de ponteiro sob `PUBLICAR_FLUXO` ou `REVERTER_FLUXO`. A transação externa serializa o fluxo, compara revisão e estado, arquiva a versão atual, promove ou reativa o alvo, troca o ponteiro e acrescenta histórico e auditoria. `HistoricoPublicacaoFluxo` é append-only e sua revisão resultante é única por fluxo. O serviço permanece interno e sem controller; o validador da PR 071 é o portão que produzirá `EM_TESTE` antes de qualquer exposição administrativa.

Na PR 071, `ValidadorPublicacaoFluxo` é puro e recebe definição desconhecida mais um contexto já resolvido no backend. Ele aplica schema fechado, catálogo de nós, análise de alcance e disponibilidade de variáveis, componentes fortemente conectados para limitar ciclos, referências ativas, capacidades habilitadas e saídas obrigatórias. `ProvedorContextoValidacaoFluxo` é a porta interna para compor esse contexto a partir de autoridades da instalação; sua implementação conservadora não anuncia capacidade ou referência externa. `ServicoValidacaoPublicacaoFluxos` autoriza antes da leitura, serializa o fluxo e promove condicionalmente apenas `RASCUNHO` válido para `EM_TESTE`, com auditoria na mesma transação. Não há controller, executor, worker, Redis ou migration nova.

Na PR 072, o módulo interno `execucoes-fluxo` separa máquina pura, serviço e persistência Prisma. `ServicoExecucoesFluxo.iniciar` consulta o ponteiro publicado sob o mesmo lock de publicação; o `INSERT ... SELECT` confirma novamente atendimento automatizável, fluxo ativo e versão ainda publicada. O índice parcial no PostgreSQL arbitra inícios concorrentes. Transições usam `estado + revisao` esperados e auditoria na mesma transação. O trigger do banco replica a matriz, exige incremento unitário de revisão, torna identidade e terminais imutáveis e proíbe exclusão. Recriar API ou serviço apenas relê o registro; não existe estado de execução no Redis. Ainda não há controller, worker, fila ou executor de nó.

Na PR 073, `ServicoRecuperacaoExecucoesFluxo` transforma `retomar_em` vencido em trabalho executável sem criar uma segunda autoridade. O repositório consulta o PostgreSQL em lotes com `FOR UPDATE SKIP LOCKED`; a mesma transação chama a máquina, altera por estado/revisão e audita. `worker-fluxos` é um processo Nest sem HTTP, porta, Redis ou storage e faz varreduras curtas de intervalo fixo, nunca um `sleep` por atendimento até o instante agendado. Reiniciar uma ou várias instâncias reconstrói a fila da consulta ao banco. Nesta etapa, `EXECUTANDO` significa apenas pronto para o executor futuro; nenhum nó é interpretado.

## 14. Observabilidade

Quatro sinais distintos:

- `RegistroAuditoria`: quem fez o quê;
- log técnico: o que falhou/aconteceu no software;
- métrica: volume, latência e saúde agregados;
- tracing: caminho de uma operação via `correlacao_id`.

Instrumentar inicialmente HTTP, webhook Meta, envio Meta, chamada MK, worker, fluxo, PostgreSQL, Redis e storage. Payload sensível nunca acompanha span ou log.

## 15. Evolução sem reescrita

Quando a carga justificar:

1. separar PostgreSQL/Redis da VM de aplicação;
2. escalar APIs/workers horizontalmente;
3. introduzir load balancer externo;
4. automatizar provisionamento de instalações isoladas;
5. extrair um módulo somente se houver limite comprovado de escala/equipe/isolamento.

Não criar abstrações vazias para IA, ACS, massivas ou outros ERPs na V1. As fronteiras documentadas bastam até existir um caso real.

## 16. Condições que ainda bloqueiam liberação específica

Antes dos PRs correspondentes, confirmar:

- versão/capacidades reais das APIs Meta na conta;
- contratos e respostas reais do MK;
- fonte real do `AccessSessionAdapter`;
- timeouts externos e limites que possam ser menores que os tetos internos aprovados;
- política jurídica/DPO de retenção, eliminação e conteúdo exportável antes de habilitar link público;
- autenticação, protocolo/callback, consentimento e opt-out reais antes de habilitar disparos vindos do ERP.

Visibilidade/notas, matriz inicial de risco, validade offline, QR, senha/MFA e tetos internos foram fechados no Portão Zero. O restante da arquitetura pode avançar respeitando `default deny`; condições externas acima mantêm somente o recurso dependente desligado.
