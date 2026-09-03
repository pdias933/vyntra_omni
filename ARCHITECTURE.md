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

O shell web é uma fronteira autenticada única. Ele usa o SDK OpenAPI para login, confirmação de sessão e logout, mantém identidade somente em memória e usa o transporte SSE nativo do navegador para observar `PERMISSOES_ALTERADAS`. O evento não concede acesso: ele invalida a composição corrente e força nova confirmação no backend.

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

`ServicoMfa` valida TOTP/código sem emitir autoridade. O consumo do contador ou do hash de recuperação ocorre na mesma transação que cria a sessão; duas APIs concorrentes têm no máximo um vencedor. `ServicoProtecaoMfa` cifra o segredo TOTP com AES-256-GCM autenticado e deriva hashes de recuperação por HMAC-SHA-256 usando chave montada por arquivo. O PostgreSQL guarda apenas envelope cifrado, contador e hashes. O provisionador do primeiro administrador é composição separada, one-shot e restrita a staging; ele não integra o módulo HTTP normal.

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

Na PR 106, `CaixaAvisosMobile` é uma projeção efêmera de interface limitada a cem grupos, sem persistência e sem conteúdo de conversa. `CoordenadorAvisosMobile` coalesce rajadas pelo maior `sequencia_observada`; `MotorSincronizacaoMobile.aguardarSequencia` só libera quando o SQLCipher não está marcado para reconstrução, o cursor alcançou o alvo e o WebSocket está `CONECTADO`. A navegação então resolve atendimento/conversa novamente na réplica autorizada. O push continua sendo apenas gatilho: não aplica lote, não escolhe recurso e não cria leitura.

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

A PR 099 acrescenta ao snapshot completo mobile uma autorização interna assinada Ed25519; chamadas web mantêm o contrato sem esse campo. O payload fechado vincula usuário, sessão, dispositivo, hash da instalação, `sequencia_base`, `versao_permissoes`, filas, escopos mínimos e validade. A API lê a chave privada exclusivamente por arquivo secreto e o aplicativo conhece apenas uma allowlist versionada de chaves públicas empacotadas. O prazo é o menor entre quatro horas e a validade absoluta do refresh. Assinatura não substitui RBAC online: ela limita somente leitura da réplica, rascunho e criação local de pendência de texto; ação externa, dado sensível e exportação não são escopos emitidos.

No cliente, SQLCipher protege o arquivo SQLite com chave aleatória no SecureStore. A abertura aplica a chave antes de ler schema/dados, valida integridade e executa migrations locais por `user_version`. A PR 100 substitui réplica, autorização e `sequencia_base` em uma única transação; a existência isolada do refresh token nunca cria cache offline autorizado.

Como a projeção incremental é minimizada e não contém entidades completas, o cliente não a inventa nem a usa como substituta da timeline. O lote e seu cursor entram atomicamente em `evento_sincronizacao` e marcam a réplica para reconstrução. Um snapshot completo validado, com sequência igual ou posterior e autorização Ed25519 verificada antes da escrita, substitui apenas as tabelas de cache e limpa a marca. Só então o WebSocket recebe `CONFIRMAR`. Queda intermediária deixa um estado detectável que força snapshot na próxima abertura.

O handoff concreto é REST paginado, snapshot quando houve qualquer avanço de cursor e WebSocket aberto pelo cursor convergente. A recepção é serial; duplicatas já cobertas pelo snapshot são confirmadas sem reaplicação. `PRONTO`, evento e envelope possuem schemas fechados e limites de tamanho. Resposta `409`, cursor sujo, autorização próxima do vencimento ou cem páginas incrementais convergem para reconstrução completa. Em segundo plano o canal fecha; em primeiro plano reconecta com atraso exponencial limitado e renova access uma vez diante de `401`.

A PR 101 acrescenta ao snapshot a projeção mínima da lista mobile sem criar uma segunda autoridade. A consulta resolve usuário, `VISUALIZAR_FILA`, filas e as 200 conversas da janela de trabalho dentro do mesmo `REPEATABLE READ`; somente então combina contato, marcador pessoal, última mensagem, relógio SLA, janela Meta e identidade WhatsApp. A identidade secundária já sai mascarada e nenhum conjunto amplo é carregado para filtro posterior no app.

No SQLCipher, `resumo_atendimento` é uma tabela de leitura derivada, não uma entidade de domínio. Snapshot e projeção entram no mesmo commit e a versão local 3 exige reconstrução para instalações anteriores. Os seis filtros executam consultas locais limitadas e parametrizadas; observadores recebem notificação somente depois do commit. Qualquer avanço incremental mantém a réplica suja até o próximo snapshot, portanto a interface não pode usar a projeção parcial como autoridade offline. `conversa_id` estabiliza a animação e `ultima_atividade_em` determina a ordem.

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

A lista web resolve primeiro as filas autorizadas e executa no PostgreSQL a consulta limitada dos atendimentos. Filtro, estado aberto, não lidos, SLA, janela e automação fazem parte da query; conteúdo não é carregado para filtragem posterior. A chave visual é `conversa_id`, enquanto a ordenação usa `ultima_atividade_em` confirmada. Eventos SSE provocam nova leitura silenciosa; nenhuma memória do navegador vira fonte da ordem.

A PR 088 aplica a mesma fronteira à timeline web. O endpoint recebe um atendimento apenas como ponto de entrada, confirma sessão e `VISUALIZAR_FILA` antes de consultar conteúdo, resolve no backend as filas visíveis e pagina no PostgreSQL a conversa única do contato. Mensagens e eventos históricos exigem interseção de fila ou `VISUALIZAR_HISTORICO_TRANSVERSAL`; notas resolvem separadamente `VISUALIZAR_NOTA_INTERNA` e `VISUALIZAR_NOTAS_TRANSVERSAIS`. A resposta nunca delega filtro ao navegador. O cursor opaco usa instante+identificador em ordem estável, e o marcador pessoal usa versão esperada para impedir que abas concorrentes apaguem uma decisão mais nova.

Na PR 089, o composer web não grava `Mensagem` diretamente. Texto e mensagem aprovada passam por `ServicoMensagensSaida`, que revalida responsável, fila, modo humano, janela, catálogo aprovado e idempotência dentro da transação. O UUID gerado no cliente serve apenas como chave de repetição; não concede autoridade. Pesquisa de respostas rápidas e mensagens aprovadas confirma `ENVIAR_MENSAGEM` antes de buscar o catálogo e limita resultado no PostgreSQL. Resposta rápida preenche o composer, mas envio continua sendo um novo comando autorizado. Texto fora da janela é bloqueado no backend com indicação canônica para escolher mensagem aprovada.

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

Consultas reais e operações ERP seguem fronteiras distintas:

```text
Console web/mobile
   ↓ serviço de aplicação + autorização + controle de recurso
ConsultasErp (token CONSULTAS_ERP)
   ↓ adapter somente leitura
DTO externo
   ↓
MK Solutions
```

```text
Motor de Fluxos / escrita ERP
   ↓ serviço de domínio recuperável
AdaptadorErp (token ADAPTADOR_ERP)
   ↓ sem provider real enquanto escritas não forem caracterizadas
INDISPONIVEL
```

```text
ServicoMensageria
   ↓ contrato CanalMensageria
AdaptadorMetaCloud
   ↓ payload externo
Meta Cloud API
```

Nenhum adapter expõe credencial, DTO bruto ou código externo ao domínio. [FLOWS.md](FLOWS.md) e [INTEGRATIONS.md](INTEGRATIONS.md) detalham os contratos.

Na PR 074, o worker passa a selecionar execuções `EXECUTANDO` diretamente no PostgreSQL com `FOR UPDATE SKIP LOCKED`, isolando uma execução por transação. O executor lê a versão fixada na execução, cria um `PassoExecucaoFluxo` sanitizado e delega qualquer saída ao contato para `ServicoMensagensSaida`. O commit reúne mensagem `NA_FILA`, evento, caixa de saída, passo final e avanço de revisão/nó. Uma queda anterior ao commit não deixa efeito parcial; depois do commit, o novo nó e a intenção de envio são recuperáveis. Definição fixa inconsistente falha somente sua própria execução com código controlado, sem envenenar o lote. O executor não importa porta, adapter ou vocabulário Meta e não depende de Redis.

`ENVIAR_BOTOES_OU_LISTA` degrada para texto enumerado pelo serviço de domínio enquanto não existir capacidade estruturada real comprovada e conectada. O resultado é `FALLBACK`, nunca `SUCESSO` fictício. A futura implementação do formato interativo deverá continuar entrando pelo domínio e manter a mesma saída nominal.

Na PR 075, `CONDICAO` e `DEFINIR_VARIAVEL` são interpretados no mesmo executor transacional, sem motor de expressão. O catálogo compartilhado valida tipo, literal e operador na publicação e o runtime repete a validação defensiva. Decimais são strings canônicas comparadas em escala inteira, datas são ISO UTC canônicas e inteiros ficam no intervalo seguro da plataforma; não há conversão implícita entre representações.

O contexto protegido da execução recebe dois namespaces internos: `variaveisFluxo` e `iteracoesFluxo`. A troca de contexto, o passo sanitizado e o avanço de revisão/nó permanecem no mesmo commit do PostgreSQL. Passos registram somente tipo, resultado e código canônico; `ServicoExecucoesFluxo` não copia contexto para auditoria. A análise do grafo recusa todo subciclo formado apenas por nós sem limite e exige que a saída `FALHA` de cada nó limitado deixe seu componente cíclico.

Na PR 076, o executor acrescenta `AGUARDAR` e `HORARIO_ATENDIMENTO`. Esperas são materializadas em estado, `retomar_em` e contexto protegido no mesmo commit que finaliza o passo como `AGENDADO`; nenhuma instância mantém timer longo. O processo de recuperação seleciona tanto espera de sistema quanto de resposta vencida e devolve a execução ao mesmo nó. Uma resposta recebida usa `ServicoExecucoesFluxo.retomarPorResposta`, marca a evidência no contexto e vence a corrida por estado/revisão; a retomada genérica continua proibida antes do prazo. PostgreSQL replica essa condição no trigger.

O calendário entra pelo `ServicoCalendarios`, nunca por adapter ou cópia de períodos no nó. O executor fornece ID e instante à autoridade de domínio e recebe somente `ABERTO` ou `FECHADO`; ausência e configuração inválida viram falhas nominais sanitizadas. O módulo do worker importa o módulo de calendários, mas continua sem HTTP, Redis, storage ou integração externa. Publicação exige capacidade `HORARIO_ATENDIMENTO` habilitada e uma referência `CALENDARIO` ativa resolvida no backend.

### Fronteira de formulários da PR 079

O executor depende de `ServicoFormularios`, não do adapter Meta. O serviço confirma no PostgreSQL que o UUID versionado aponta para formulário ativo da conta de origem; a mensagem de fallback continua passando por `ServicoMensagensSaida`, portanto autoridade BOT, janela do canal, evento, caixa de saída, idempotência e avanço permanecem atômicos. A ausência de porta externa caracterizada impede o caminho `ENVIADO` no runtime, sem provider simulado ou payload fabricado.

Na entrada, o adapter é responsável por descriptografar e normalizar o protocolo externo. `ServicoFormularios.registrarSubmissao` recebe somente o contrato interno, deriva o contexto da mensagem de entrada já persistida, serializa os dados de forma canônica para comparação e grava uma única submissão imutável. O módulo emite um evento mínimo para a sequência global; projeção e mascaramento continuam separados no `ProjetorSubmissaoFormulario`. Nenhum token, estrutura externa ou resposta do formulário atravessa para `ExecucaoFluxo` ou `PassoExecucaoFluxo`.

Na PR 077, o executor importa `ModuloContextosCliente` e delega identificação e seleção a `ServicoContextosCliente`; ele não consulta tabelas de vínculo diretamente nem chama ERP. O serviço resolve o contato pelo atendimento, aplica a matriz automatizável, valida chaves compostas e persiste a escolha versionada na mesma transação do passo e do avanço. `SELECIONAR_CLIENTE` e `SELECIONAR_CONTRATO` leem apenas uma variável UUID sensível do contexto protegido. `SOLICITAR_DADOS_CONTATO` usa `ServicoMensagensSaida`; sem capacidade oficial caracterizada, uma mensagem textual pelo pipeline normal resulta em `FALLBACK`, com janela, timeline e caixa de saída preservadas.

Na PR 078, o executor delega fatura a `ServicoFaturasFluxo`; somente esse serviço conhece a porta ERP e `ServicoFinanceiroErp`. O primeiro trecho transacional fixa execução, nó, revisão e contexto financeiro. A consulta de rede ocorre depois do commit, sem manter lock PostgreSQL. Um segundo trecho relê a execução e revalida nó, revisão, conta, contato, contrato e versão do contexto antes de aplicar o resultado; se qualquer autoridade mudou, descarta a resposta e segue falha segura. Duas leituras concorrentes podem alcançar o ERP, mas apenas uma revisão confirma o passo, e a operação é somente leitura.

Não existe provider ERP registrado no grafo da aplicação. A injeção opcional permanece fechada e produz `ERP_INDISPONIVEL` até um adapter real aprovado ser ligado; o simulador participa apenas de teste. Seleção e opções financeiras ficam no contexto/composição protegidos. `ENVIAR_FATURA` cria texto automático pelo domínio e persiste `ComposicaoSegundaVia` e auditoria no mesmo commit. Bytes de PDF não atravessam contexto nem mensagem: sem armazenamento privado de saída, o nó declara `DADOS_INCOMPLETOS`.

Na PR 019, a porta de mensageria é código puro e não registra integração real no módulo da aplicação. O simulador Meta implementa a porta, normaliza estados externos e entrega eventos internos a um consumidor; repetição compatível reaproveita resultado e chave incompatível falha. Esse armazenamento em memória existe somente para teste. Produção continuará exigindo persistência/idempotência PostgreSQL, webhook autenticado e caixa de saída nos PRs próprios.

Na PR 020, `AdaptadorErp` separa consultas e escritas e devolve somente modelos internos normalizados. Seu simulador contratual diferencia indisponibilidade anterior à escrita, quando não há efeito externo, de resposta perdida após possível criação. A segunda situação retorna `RESULTADO_INCERTO` e só pode avançar por reconciliação. O simulador não é provider da aplicação; `OperacaoIntegracao`, caixa de saída e protocolo persistente continuam pertencendo aos PRs de domínio.

Na PR 060, busca e detalhe de cliente/contrato entram por `ServicoConsultasClienteContratoErp`. O caso de uso valida a entrada, delega à porta genérica e aceita de volta somente a allowlist do modelo normalizado, com coerência entre cliente e contrato e limite de resultados. Ausência, indisponibilidade e resposta externa inválida permanecem resultados distintos. Nenhuma rota nem provider MK é registrada: a fronteira real segue bloqueada até caracterização de respostas reais, enquanto os módulos internos permanecem independentes do fornecedor.

Na PR 061, `ServicoFinanceiroErp` compõe a fatura corrente com dois complementos independentes: documento PDF e dados de pagamento. A fatura-base precisa existir em `TEMPO_REAL`; cada complemento é validado e declara `DISPONIVEL` ou `INDISPONIVEL` com motivo. O resultado é `COMPLETA` somente quando ambos existem e são válidos, ou `PARCIAL` sem preencher lacunas. PDF fica em bytes normalizados para o pipeline privado de mídia, nunca em URL externa. Não há fallback financeiro para `SnapshotCliente`, controller ou provider MK real nesta etapa.

Na PR 117, a aplicação pode registrar uma implementação real somente em `CONSULTAS_ERP`; `ADAPTADOR_ERP` continua ausente. Isso impede que a presença de consultas habilite por descoberta desbloqueio, protocolo, ordem de serviço, comentário, encerramento ou nós do Motor de Fluxos. O modo `MK_MODO` nasce `DESATIVADO`; `CARACTERIZACAO` não injeta a porta e `SOMENTE_LEITURA` injeta apenas o provider de consulta. Os controles PostgreSQL `MK_CONSULTAS_CADASTRAIS_REAIS` e `MK_CONSULTAS_FINANCEIRAS_REAIS` nascem independentes e desligados. Nesta PR, somente o controle financeiro possui consumidor de runtime: a consulta autenticada do console verifica sessão, RBAC, fila, contexto e rollout antes da rede. O controle cadastral fica reservado e não deve ser ligado até existir um caso de uso interno que correlacione UUIDs locais sem expor identificadores do ERP em rota pública.

Contrato e financeiro recebem cliente+contrato explícitos, e detalhe financeiro recebe também a fatura exata. A listagem MK caracterizada cobre somente uma janela declarada de um mês e une, sem duplicidade, as consultas de abertas e pagas; erro externo `003` nessas listas significa ausência. Uma fatura pode relacionar mais de um contrato, mas o contrato consultado deve aparecer exatamente uma vez. Fatura paga nunca fornece complemento pagável. Essa cobertura parcial atravessa domínio, OpenAPI e interface, e o Motor de Fluxos a recusa em vez de assumir uma visão integral. O adapter solicita uma credencial temporária descartável para cada chamada externa, com o código mínimo fixo da rota (`6`, `8`, `9` ou `22`), e recusa autenticação que anuncie serviço divergente ou adicional. Não há token global configurável, cache de credencial nem repetição automática após erro externo não caracterizado. O transporte usa origem HTTPS em allowlist, resolução DNS pública fixada à conexão, caminhos exatos somente de leitura, redirecionamento recusado, prazo absoluto incluindo espera por vaga, teto de corpo, limite de concorrência e circuit breaker. DTO e códigos externos terminam no adapter. Conexão cadastrada é apenas um modelo de leitura cadastral ainda sem rota de runtime; não alimenta `AdaptadorSessaoAcesso` e não prova presença online.

Na PR 021, `AdaptadorSessaoAcesso` é uma porta independente de `AdaptadorErp`, com leitura, desconexão e reconciliação próprias. O simulador nasce `DESATIVADO`, preserva apenas estados explicitamente fornecidos e recusa desconectar `DESCONHECIDA`. A migration semeia `SESSAO_ACESSO` desativado e sem alvos; nenhuma rota ou provider real é registrado. A integração real permanece condicional ao PR 068.

Na PR 025, o módulo `contextos-cliente` separa vínculos persistentes da seleção usada por um atendimento. O repositório recebe a transação do caso de uso, valida o alvo por chaves compostas e executa troca por versão esperada. O serviço central de autorização verifica a permissão e o recurso antes da mutação; a auditoria participa da mesma transação. Não há controller de vínculo/contexto nem consulta ao MK nesta etapa. `contexto_atendimento.atendimento_id` fica reservado até a tabela `Atendimento` da PR 028, quando uma migration aditiva deve acrescentar a FK sem reescrever esta migration aplicada.

Na PR 026, `snapshots-cliente` é um módulo persistente e interno: serializa por vínculo, exige vínculo ativo e mantém um documento protegido corrente no PostgreSQL. Hash+instante capturado distinguem replay, atraso e conflito; versão esperada protege a substituição. A leitura calcula idade no servidor e declara origem `SNAPSHOT`. Não há controller, escrita ERP, cache obrigatório ou provider MK. Se Redis for acrescentado depois, será apenas uma projeção descartável reconstruída dessa autoridade.

Na PR 062, o módulo recebe lotes incrementais ou reconciliações comprovadamente completas. Tombstone e ausência completa convertem o snapshot em `EXCLUIDO` ou `OBSOLETO` sem apagar o último documento; motivo, instante e versão são persistidos e expostos na leitura. Atualização posterior mais nova volta a `ATUAL`. O serviço não interpreta cursor/paginação MK e não registra job externo enquanto essa semântica não for caracterizada. A migration é aditiva e snapshots existentes nascem `ATUAL`.

Na PR 064, `desbloqueios-confianca` implementa a consulta de elegibilidade. Uma leitura consistente autoriza sessão, permissão e fila, valida o contrato contra o contexto ativo do atendimento e lê o último registro confirmado. A transação termina antes da consulta externa. `ServicoElegibilidadeDesbloqueioConfianca` então chama `ConsultasErp`, exige resposta normalizada `TEMPO_REAL` e combina a decisão externa com o intervalo local de 30 dias.

Na PR 065, `ServicoExecucaoDesbloqueioConfianca` acrescenta a escrita sem registrar rota nem adapter real. A primeira transação autoriza e fixa escopo, assinatura e chave da operação. Depois da verificação externa, uma segunda transação adquire advisory lock pelo contrato, revalida a autoridade e a janela de 30 dias, cria uma reserva única e concede a execução. A chamada ERP ocorre fora da transação. Confirmação volta ao mesmo lock e grava histórico imutável, conclusão idempotente, auditoria sanitizada e liberação da reserva atomicamente. Resposta ambígua conserva a reserva e só entra em reconciliação; efeito comprovadamente ausente libera a reserva. A porta ERP continua recebida pelo caso de uso, sem provider MK ou simulador no grafo da aplicação.

Na PR 066, `ordens-servico` aplica o mesmo limite transacional às criações e alterações de OS. O serviço fixa autorização, atendimento, fila, cliente, contrato, protocolo oficial, assinatura e operação antes de conceder o efeito; chama a porta ERP fora da transação e só materializa uma confirmação normalizada. A criação confirma `OrdemServicoErp`, operação e auditoria juntas. A atualização adquire advisory lock pela ordem, verifica a versão esperada e cria uma reserva única; na confirmação, altera a versão, acrescenta histórico imutável, conclui a operação, audita e libera a reserva na mesma transação. Resultado ambíguo conserva a operação e, em atualização, a reserva até reconciliação. O módulo não publica controller nem registra adapter real ou simulado.

Na PR 067, `acoes-atendimento-erp` cobre comentário de finalização e encerramento por protocolo oficial. Comentário confirmado registra somente hash, operação e auditoria, sem mudar o atendimento. Encerramento adquire lock e reserva exclusiva, revalida RBAC/contexto/versões e chama a porta fora da transação. Somente a confirmação externa percorre a máquina de estado local e, em uma transação, fecha a atribuição, acrescenta evento, registra o efeito, conclui idempotência, audita e libera a reserva. Falha anterior ao efeito preserva o estado; resultado ambíguo conserva a reserva até reconciliação. A política do link público é um retorno fechado e não possui gerador, rota ou adapter. O módulo não registra provider MK real ou simulador.

Na PR 109, `copias-atendimento` materializa uma exportação interna independente do link público. A emissão persiste apenas hash do token, atendimento, autor, sessão e janela de validade; não congela nem duplica conteúdo. O consumo ocorre uma vez, sob a mesma sessão e autorização atual, projetando mensagens até `gerada_ate_em` diretamente da fonte da verdade. A consulta não alcança tabelas de notas ou eventos e exclui relações de formulário, reações e bytes/metadados de mídia. O registro terminal é imutável e não pode ser apagado. Nenhuma rota anônima, URL pública ou envio ao MK é criado.

Na PR 110, `relatorios-operacionais` executa uma leitura `REPEATABLE READ`, resolve `VISUALIZAR_FILA` para cada fila ativa e injeta somente os IDs aprovados nas agregações PostgreSQL. Atendimento, SLA, mensagem, execução e operação ERP são agrupados na fonte; nenhum payload protegido é carregado para calcular o painel. O DTO retorna contagens, nomes das filas autorizadas, intervalo e versão da fórmula. O web usa exclusivamente o SDK OpenAPI e não recalcula autoridade ou indicadores a partir do cache do navegador.

Na PR 027, `conversas` resolve exclusivamente por `contato_id` sob lock transacional. A conta WhatsApp ativa entra como uma participação da conversa — não como chave para criar outra timeline — e primeiro/último instante aceitam entrega fora de ordem sem regredir atividade. PostgreSQL impõe uma conversa por contato e uma participação por conversa+conta. O módulo é interno, sem controller; mensagens e atendimentos futuros ainda deverão carregar seus próprios `conta_whatsapp_id`.

Na PR 069, `fluxos` introduz o catálogo interno do Motor de Fluxos. `ServicoCatalogoFluxos` autoriza com `EDITAR_FLUXO`, normaliza e limita a definição e mantém criação, versionamento, lock e auditoria na transação fornecida. O repositório Prisma usa PostgreSQL como autoridade para unicidade, revisão e ponteiro composto. Uma constraint diferida valida o ponteiro ao final do commit; índice parcial impede duas versões `PUBLICADA`; trigger protege definição e atribuição histórica depois da publicação. O módulo exporta somente o serviço interno e não antecipa controller, editor, executor, worker ou integração externa.

Na PR 070, `ServicoPublicacaoFluxos` concentra as transições de ponteiro sob `PUBLICAR_FLUXO` ou `REVERTER_FLUXO`. A transação externa serializa o fluxo, compara revisão e estado, arquiva a versão atual, promove ou reativa o alvo, troca o ponteiro e acrescenta histórico e auditoria. `HistoricoPublicacaoFluxo` é append-only e sua revisão resultante é única por fluxo. O serviço permanece interno e sem controller; o validador da PR 071 é o portão que produzirá `EM_TESTE` antes de qualquer exposição administrativa.

Na PR 071, `ValidadorPublicacaoFluxo` é puro e recebe definição desconhecida mais um contexto já resolvido no backend. Ele aplica schema fechado, catálogo de nós, análise de alcance e disponibilidade de variáveis, componentes fortemente conectados para limitar ciclos, referências ativas, capacidades habilitadas e saídas obrigatórias. `ProvedorContextoValidacaoFluxo` é a porta interna para compor esse contexto a partir de autoridades da instalação; sua implementação conservadora não anuncia capacidade ou referência externa. `ServicoValidacaoPublicacaoFluxos` autoriza antes da leitura, serializa o fluxo e promove condicionalmente apenas `RASCUNHO` válido para `EM_TESTE`, com auditoria na mesma transação. Não há controller, executor, worker, Redis ou migration nova.

Na PR 072, o módulo interno `execucoes-fluxo` separa máquina pura, serviço e persistência Prisma. `ServicoExecucoesFluxo.iniciar` consulta o ponteiro publicado sob o mesmo lock de publicação; o `INSERT ... SELECT` confirma novamente atendimento automatizável, fluxo ativo e versão ainda publicada. O índice parcial no PostgreSQL arbitra inícios concorrentes. Transições usam `estado + revisao` esperados e auditoria na mesma transação. O trigger do banco replica a matriz, exige incremento unitário de revisão, torna identidade e terminais imutáveis e proíbe exclusão. Recriar API ou serviço apenas relê o registro; não existe estado de execução no Redis. Ainda não há controller, worker, fila ou executor de nó.

Na PR 073, `ServicoRecuperacaoExecucoesFluxo` transforma `retomar_em` vencido em trabalho executável sem criar uma segunda autoridade. O repositório consulta o PostgreSQL em lotes com `FOR UPDATE SKIP LOCKED`; a mesma transação chama a máquina, altera por estado/revisão e audita. `worker-fluxos` é um processo Nest sem HTTP, porta, Redis ou storage e faz varreduras curtas de intervalo fixo, nunca um `sleep` por atendimento até o instante agendado. Reiniciar uma ou várias instâncias reconstrói a fila da consulta ao banco. Nesta etapa, `EXECUTANDO` significa apenas pronto para o executor futuro; nenhum nó é interpretado.

Na PR 105, o mobile consome somente rotas próprias e o SDK OpenAPI gerado. `AdaptadorSelecaoMidiaNativa` é a fronteira local com o seletor do sistema; ele valida a allowlist e o teto, conserva apenas metadados para a prévia e materializa o `File` somente na confirmação. O upload `multipart/form-data` reautentica sessão e aparelho na transação e delega ao mesmo `ServicoComposerWeb`, `ServicoMidias` e caixa de saída da web. O app não acessa S3 ou Meta e não existe fila local de bytes.

As ações ERP mobile reutilizam `ServicoContatoAcoesWeb` como caso de uso compartilhado, não como UI web. A consulta financeira devolve origem explícita; preparação e execução são rotas distintas, com nova autorização e contexto no servidor. Desbloqueio e OS continuam passando pelos serviços recuperáveis e idempotentes do domínio. O cliente apenas apresenta a prévia e envia a confirmação; não deriva contrato, protocolo, permissão, elegibilidade ou sucesso externo.

## 14. Observabilidade

Quatro sinais distintos:

- `RegistroAuditoria`: quem fez o quê;
- log técnico: o que falhou/aconteceu no software;
- métrica: volume, latência e saúde agregados;
- tracing: caminho de uma operação via `correlacao_id`.

Instrumentar inicialmente HTTP, webhook Meta, envio Meta, chamada MK, worker, fluxo, PostgreSQL, Redis e storage. Payload sensível nunca acompanha span ou log.

A PR 111 estabelece a base executável desse contrato. O middleware HTTP aceita somente `traceparent` W3C na versão 00 e cria um novo `span_id`; entrada inválida é descartada e substituída por IDs aleatórios. `trace_id`, `span_id` e `correlacao_id` atravessam somente logs estruturados submetidos à allowlist. Métricas HTTP usam contadores e buckets fixos por processo, sem caminho, parâmetro, fila, usuário ou entidade de negócio.

Backlogs são fotografias consistentes do PostgreSQL: quantidade e idade do item mais antigo para caixa de saída, operações recuperáveis e execuções vencidas do Motor de Fluxos. `ServicoObservabilidade` separa a coleta técnica interna da projeção HTTP autorizada. A rota web exige `ADMINISTRAR_INTEGRACOES`; o monitor interno emite apenas mudança de estado do alerta, permitindo que o coletor externo dispare notificação sem manter dashboard aberto. A saúde pública não recebe componente, contagem ou regra.

## 15. Evolução sem reescrita

### 14.1 Ciclo de vida e deploy compatível

A PR 112 torna a prontidão parte do estado de ciclo de vida: ao receber sinal, a instância primeiro declara `DRENAGEM_APLICACAO`, depois encerra os registros SSE, fecha WebSockets com indicação de reinício e aguarda recursos Nest/HTTP até o limite. O cliente retoma do último `sequencia_evento` aplicado, portanto a troca de imagem não cria uma segunda autoridade nem exige preservar a conexão antiga.

O worker para de adquirir novo lote assim que recebe o sinal, mas deixa o ciclo corrente terminar. Estados, concessões e agendamentos continuam no PostgreSQL; encerramento forçado depois do prazo mantém o mesmo caminho de recuperação já aprovado.

```text
construir release imutável
  → job único de migration aditiva
  → subir candidato e aguardar PRONTO
  → manter proxy no nome estável
  → smoke
falhou após migration
  → reativar imagens anteriores compatíveis
  → nunca desfazer schema
```

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
- contratos e respostas reais ainda não observados do MK, especialmente paginação, incremental, documentos, Pix, sessão e toda escrita;
- fonte real do `AccessSessionAdapter`;
- timeouts externos e limites que possam ser menores que os tetos internos aprovados;
- política jurídica/DPO de retenção, eliminação e conteúdo exportável antes de habilitar link público;
- autenticação, protocolo/callback, consentimento e opt-out reais antes de habilitar disparos vindos do ERP.

Visibilidade/notas, matriz inicial de risco, validade offline, QR, senha/MFA e tetos internos foram fechados no Portão Zero. O restante da arquitetura pode avançar respeitando `default deny`; condições externas acima mantêm somente o recurso dependente desligado.

### 13.8 Protocolo e OS pelo Motor de Fluxos

Na PR 080, `ServicoProtocolosOrdensFluxo` prepara o comando sob a transação curta do executor, mas chama `ServicoCriacaoProtocoloErp` ou `ServicoOrdensServicoErp` somente depois do commit. O adapter ERP é opcional; sua ausência resulta em `INDISPONIVEL` sem provider alternativo. A aplicação do passo relê execução, revisão e nó, enquanto a confirmação de OS revalida no próprio serviço de domínio atendimento BOT sem fila/responsável, execução/versão, vínculo automatizável, contrato e protocolo. A ação humana conserva fila obrigatória e RBAC; a automação não inventa esse escopo incompatível com a máquina de estados.

A chave é derivada deterministicamente de execução+nó e não depende da revisão, permitindo que um caminho de reconciliação revisite o nó sem gerar outra operação. Protocolo oficial existente evita a chamada. OS registra auditoria com ator `FLUXO`; não há sessão técnica, usuário sintético nem autorização herdada de quem publicou. Conteúdo e identificadores externos não entram no passo ou auditoria.

### 13.9 Desbloqueio pelo Motor de Fluxos

Na PR 081, `ServicoDesbloqueiosFluxo` é a fronteira entre o executor e os serviços existentes de elegibilidade/execução. O worker prepara tipo, ator interno, atendimento, contrato derivado e chave estável em uma transação curta; a consulta ou escrita ERP acontece depois do commit. Ao voltar, o executor relê execução, revisão e nó antes de persistir o passo e avançar.

`RepositorioDesbloqueiosConfiancaPrisma` possui uma projeção específica para fluxo: atendimento `AGUARDANDO/BOT` sem fila/responsável, vínculo verificado e execução `EXECUTANDO` da mesma versão. O caminho humano preserva fila e autorização central. A execução automática usa o mesmo domínio recuperável da ação humana, inclusive nova elegibilidade em tempo real, lock e reserva por contrato, mas audita como `FLUXO`. O adapter ERP continua opcional e nenhum simulador é registrado em runtime.

### 13.10 Fila, espera humana e encerramento pelo Motor de Fluxos

O executor delega a mudança operacional a `ServicoAtribuicoesAtendimento`; ele não escreve atribuição, histórico, evento ou auditoria diretamente. O repositório bloqueia atendimento/histórico e fila pelas mesmas chaves usadas pelos casos humanos, relê a `ExecucaoFluxo` exata e aplica alteração condicional somente enquanto ela permanece `EXECUTANDO` na versão fixa e o atendimento conserva autoridade BOT.

A transferência confirma atribuição, intervalo histórico, evento e auditoria numa transação. A espera humana reutiliza o agendamento reconstruível: `AGUARDANDO_ATENDENTE + retomar_em` é consultado em lote pelos workers, sem Redis autoritativo ou temporizador em memória. A assunção humana e o timeout concorrem pelo estado persistido; somente um caminho progride. O encerramento passa pela máquina de atendimento, congela a fila de fallback, fecha histórico, conclui a execução e preserva o protocolo para eventual reabertura de 30 minutos.

### 13.11 Serialização entre automação e autoridade humana

Desde a PR 083, criação, despacho automático e toda mudança de atribuição usam o mesmo advisory lock transacional derivado do atendimento. A mensagem automática persiste `execucao_fluxo_origem_id` e `versao_atribuicao_origem`; o despachante relê atendimento, execução e versão sob esse lock antes de sair de `NA_FILA`.

O transporte ocorre com a transação e o lock ainda abertos, limitado a oito segundos e com sinal de cancelamento. Se o despacho vence, confirma `ENVIANDO → ENVIADA|NA_FILA|FALHOU` antes de liberar a autoridade; o resgate espera esse resultado. Se a mudança humana vence, o envio ainda não iniciado perde a validação e é cancelado. O resgate também cancela em lote as mensagens automáticas ainda `NA_FILA` no mesmo commit da atribuição. Assim, somente um aceite do canal confirmado antes do commit humano permanece enviado. Mensagem humana ou disparo transacional não recebe origem de execução e não entra nessa regra.

### 13.12 Editor visual web

A PR 084 adiciona um controller administrativo fino sobre `ServicoEditorFluxos`. Todas as rotas usam sessão web, origem, CSRF para escrita e RBAC central (`VISUALIZAR_FLUXO`, `EDITAR_FLUXO` e `PUBLICAR_FLUXO`). O serviço confirma que a versão pertence ao fluxo informado e delega criação/versionamento, validação e publicação aos serviços de domínio; o controller não decide estado.

O web consome exclusivamente o SDK gerado da OpenAPI. `@xyflow/react` 12.11.6, MIT, fornece apenas canvas, arestas, zoom e posição visual; nenhuma transição ou execução reside na biblioteca. O estado local é serializado no contrato interno fechado e a API o valida antes de persistir. A interface é uma composição desktop em três painéis, com cores semânticas, movimentos curtos e regra global de `prefers-reduced-motion`. Salvar, validar e publicar são comandos independentes; a confirmação de publicação mostra a troca de ponteiro e deixa claro que execuções existentes continuam na versão original.

### 13.13 Simulador isolado

A PR 085 adiciona `SimuladorFluxos` como função de aplicação pura: entrada fechada, cenário controlado e resultado determinístico. Ele depende apenas do modelo canônico interpretado pelo validador e não importa repositório, Prisma, Redis, serviço de mensagens, serviço ERP, provider externo, relógio de execução ou executor do Motor. Por isso uma simulação não pode se transformar acidentalmente em runtime por configuração de injeção.

O endpoint `POST /administracao/fluxos/simular` apenas valida sessão web, origem, CSRF e `TESTAR_FLUXO`, interpreta a definição e chama o simulador. A resposta contém contexto sintético, prévia canônica e passos sanitizados. Não há transação de domínio, escrita no banco, evento, auditoria com payload da definição nem chamada de rede. A interface usa o SDK OpenAPI gerado e pode enviar a definição local ainda não salva sem alterar rascunho, versão publicada ou execução existente.

### 13.14 Mídia e relações na conversa web

Na PR 090, `ServicoMensagensSaida` continua sendo a única fronteira de criação. O controller multipart não decide categoria: `ServicoMidias` detecta assinatura, compara MIME, aplica teto, calcula hash e grava metadados ligados à mensagem. `AdaptadorArmazenamentoS3` é o único componente que conhece endpoint, credenciais e comandos S3; usa bucket privado e chave opaca, sem URL pública ou assinada no domínio.

O download é deliberadamente intermediado. `ServicoComposerWeb` lê somente contexto e metadados, autoriza a fila atual em leitura consistente e depois recupera o binário; tamanho e hash são conferidos antes da resposta `private, no-store`. O web consome as rotas exclusivamente pelo SDK OpenAPI gerado e cria URL `blob:` apenas em memória para player/visualizador.

Citação e reação conservam relações internas reais. A timeline projeta uma citação somente quando o alvo também está no escopo autorizado. Na ausência de capacidade externa caracterizada, a resposta citada usa fallback textual e a reação é terminal interna, sem item de caixa de saída. Assim, a interface pode oferecer a interação sem declarar entrega inexistente ao cliente.

### 13.15 Busca e galeria autorizadas

`ServicoBuscaGaleriaWeb` resolve a conversa e os atendimentos históricos permitidos antes de tocar conteúdo. A consulta parametrizada recebe os UUIDs já autorizados e executa busca, filtro, ordenação e limite no PostgreSQL. Busca textual usa `to_tsvector`/`websearch_to_tsquery` em português; mídia/documento usa tipo canônico e links usam padrão HTTPS. Cursores combinam instante e UUID para paginação determinística.

A migration da PR 091 instala `pg_trgm` e cria índices aditivos: GIN para texto, GIN trigram para links e B-tree parcial por conversa/tipo/instante para mídia. O cliente recebe somente trecho, origem interna, tipo e metadados estritamente necessários. O painel web usa o SDK gerado e não possui fallback de filtragem em memória.

### 13.16 Contato, contexto e ações do console web

`ServicoContatoAcoesWeb` usa o atendimento somente como porta de entrada: resolve fila e contato, chama `ServicoAutorizacao` e apenas depois consulta identidade, vínculos, snapshots e contagens. Permissões de cliente, contrato, financeiro, dado sensível, ordem de serviço e desbloqueio são independentes. BSUID não é projetado sem permissão explícita; telefone continua mascarado.

A troca de contexto deriva fila e identificadores externos dos vínculos persistidos, usa versão esperada e delega a mutação auditada a `ServicoContextosCliente`. Consulta financeira encerra a leitura/autorização local antes de chamar `CONSULTAS_ERP`, exige o controle financeiro e devolve somente resultado normalizado em `TEMPO_REAL`; provider ausente, controle desligado ou falha nunca cai para snapshot. Ações sensíveis continuam dependendo separadamente de `ADAPTADOR_ERP`: preparar revalida permissão/contexto/elegibilidade e executar recebe confirmação literal, gera efeito somente pelos serviços recuperáveis e idempotentes existentes. O web consome tudo pelo SDK OpenAPI gerado.

### 13.17 Administração de usuários e RBAC

A PR 093 projeta usuários, perfis, ajustes de permissão, filas, quantidades de sessões/dispositivos e auditoria recente somente depois de `ADMINISTRAR_USUARIOS`. Trocar perfil e filas é uma operação transacional com versão esperada. O backend valida perfil e filas ativos, impede auto-rebaixamento administrativo e preserva pelo menos um administrador ativo. Depois da escrita, `ServicoInvalidacaoPermissoes` incrementa a versão e publica `PERMISSOES_ALTERADAS` no mesmo commit; a auditoria sanitizada fecha a unidade. Revogação de sessões web e dispositivos mobile reutiliza os serviços de autenticação existentes.

### 13.18 Administração operacional

A PR 094 resolve separadamente `ADMINISTRAR_INTEGRACOES`, `ADMINISTRAR_FILAS` e `ADMINISTRAR_CALENDARIOS` antes de consultar cada projeção. Contas de canal não expõem identificadores externos; filas agregam somente contagens operacionais, calendário e limites SLA. O estado de integração vem da presença do provider no runtime, nunca de variável declarada pelo cliente: adapter ausente aparece como `NAO_CONFIGURADA`. Desde a PR 117, somente `CONSULTAS_ERP` presente aparece `PARCIAL`, com consultas habilitáveis e escritas desativadas; apenas um futuro `ADAPTADOR_ERP` completo poderá aparecer `ATIVA`.

Criação/inativação de fila e override temporário de calendário reutilizam `ServicoFilas` e `ServicoCalendarios`, preservando RBAC, locks, invalidação e auditoria existentes. Política SLA é somente projetada nesta etapa; não existe editor que grave limites sem um serviço de domínio correspondente.

### 13.19 Administração do Motor de Fluxos

A PR 095 completa a superfície administrativa iniciada no editor visual: o catálogo permite alternar entre fluxos, o histórico imutável permite inspecionar qualquer versão e somente rascunhos aceitam edição. Simulação continua puramente fictícia; validar e publicar são comandos distintos. Publicação exige confirmação visual e afeta apenas novas execuções.

Reversão não copia nem reescreve a versão arquivada. O endpoint autenticado encaminha a versão alvo e a revisão esperada ao `ServicoPublicacaoFluxos`, que autoriza `REVERTER_FLUXO`, bloqueia o fluxo, compara a revisão, arquiva a versão atual, reativa a anterior e acrescenta histórico e auditoria na mesma transação. Execuções existentes permanecem presas à versão com que nasceram.

### 13.20 Saúde, recuperação e releases

A PR 096 separa saúde pública mínima de diagnóstico administrativo. `/saude/vivo` e `/saude/pronto` continuam sem sessão e sem detalhes. `/administracao/saude` autentica e autoriza `ADMINISTRAR_INTEGRACOES` antes de observar componentes, contagens ou operações; a projeção omite entidade, payload protegido, token, segredo e identificador externo. Dependência ausente aparece `NAO_CONFIGURADO`, nunca saudável por inferência.

`Reprocessar agora` não executa integração no processo HTTP e não altera o estado da operação. Sob revisão esperada, apenas antecipa `proxima_acao_em` para operações em `AGUARDANDO_NOVA_TENTATIVA` ou `RESULTADO_INCERTO`, preservando respectivamente os caminhos de execução e reconciliação do worker. Estado terminal não reabre. A antecipação e sua auditoria são atômicas.

O painel desktop consome esse contrato e os contratos de release já existentes exclusivamente pelo SDK gerado. Saúde atualiza silenciosamente; controles de recurso, desligamento emergencial e políticas mobile exigem preview e confirmação. O PostgreSQL continua autoridade para rollout e versão mínima obrigatória.

### 13.21 Shell e autenticação mobile

A PR 097 conecta o app ao contrato OpenAPI existente por um único `AdaptadorAutenticacaoHttp`. A composição `ServicoAutenticacaoAplicativo → GerenciadorSessaoMobile → CofreSessaoMobile` mantém regra de transporte, token em memória e custódia nativa separados. O adapter conhece os nomes HTTP; telas e navegação recebem somente sessão projetada em português e nunca importam DTO de Meta/MK.

```text
Tela de entrada / QR / bloqueio
  ↓ ServicoAutenticacaoAplicativo
AdaptadorAutenticacaoHttp ── SDK OpenAPI ── API
  ↓
GerenciadorSessaoMobile
  ├── access token somente em memória
  └── CofreSessaoMobile: refresh + instalação + dispositivo + vínculo
```

React Navigation fornece pilha e abas, Gesture Handler delimita a raiz nativa, Reanimated aplica transições reduzíveis e Safe Area/Screens preservam o comportamento de cada plataforma. Nenhuma dessas bibliotecas participa de autorização. O QR é renderizado no web a partir do token emitido pelo backend e lido pela câmera mobile; nenhum cliente cria, prolonga, confirma sozinho ou persiste essa autoridade.

### 13.22 Política de versão no cliente mobile

Na PR 098, `ServicoPoliticaVersaoAplicativo` coordena dois adapters finos: o primeiro usa exclusivamente o SDK OpenAPI para a avaliação pública; o segundo conhece `Linking` e a allowlist das lojas. A composição raiz impede que a inicialização da autenticação execute antes de uma avaliação `PERMITIDA`.

```text
Aplicacao
  ├── ServicoPoliticaVersaoAplicativo
  │     ├── AdaptadorPoliticaVersaoHttp → SDK gerado → API
  │     └── AdaptadorLojaAplicativo → App Store / Google Play
  └── autenticação e shell somente quando PERMITIDA
```

A decisão local serve à experiência, não à autoridade: todos os portões autenticados continuam exigindo a versão no backend. Um `426` vindo de credencial, refresh ou pareamento converge para o mesmo estado global obrigatório. Reavaliação em primeiro plano conserva a última política válida quando a rede falha, impedindo que indisponibilidade remova um bloqueio já conhecido.

### 13.23 Timeline e detalhes no mobile

`ControladorConsoleMobile` expõe timeline, marcador, detalhes, financeiro e troca de contexto usando bearer, UUID do dispositivo e segredo do vínculo. Leituras autenticam antes de delegar aos mesmos serviços autorizados do console; mutações revalidam sessão e aparelho dentro da transação. Depois da troca de contexto, uma segunda autenticação antecede a projeção devolvida, fechando a janela de revogação entre escrita e leitura.

```text
TelaConversaMobile / TelaDetalhesContatoMobile
  ↓ ServicoAtendimentosMobile (renovação única após 401)
AdaptadorAtendimentosHttp → SDK OpenAPI gerado
  ↓ bearer + vínculo do aparelho
ControladorConsoleMobile
  ├── ServicoTimelineWeb → timeline única autorizada
  └── ServicoContatoAcoesWeb → contexto, Snapshot e ERP em tempo real
```

A réplica SQLCipher fornece somente a janela recente já incluída no snapshot autorizado. Histórico anterior é paginado no PostgreSQL e nunca inventado a partir de eventos mínimos. A pilha nativa conserva a instância da conversa enquanto Detalhes está aberta. Formulários passam pelo projetor central: somente campos declarados na estrutura interna entram no DTO e `VISUALIZAR_DADO_SENSIVEL` decide revelar ou mascarar o valor. O JSON protegido integral, referência externa e identificadores do ERP não chegam ao app ou à web.

### 13.24 Composer mobile

`ComposerMobile` é estado de apresentação: texto e rascunho usam vocabulário do produto, enquanto o adapter é a única camada que conhece as rotas OpenAPI. A API autentica bearer, dispositivo e segredo do vínculo antes de reutilizar o serviço central de composição. Escritas repetem essa autenticação dentro da transação que cria a mensagem.

```text
ComposerMobile
  ├── RepositorioReplicaLocal → rascunho SQLCipher por conversa
  └── ServicoAtendimentosMobile → renovação única após 401
        ↓
AdaptadorAtendimentosHttp → SDK OpenAPI gerado
        ↓ bearer + vínculo do aparelho
ControladorConsoleMobile → ServicoComposerWeb → domínio de mensagens
```

Respostas rápidas apenas preenchem o campo; catálogo e envio de modelo aprovado continuam autoritativos no backend. Texto livre fora da janela Meta retorna `JANELA_META_EXPIRADA`, mesmo que o cliente tente contornar o bloqueio visual. O rascunho é removido somente depois da resposta positiva. A PR 103 conserva o texto offline como rascunho; a PR 104 acrescenta a caixa de saída local reconciliável descrita a seguir.

### 13.25 Offline e reconciliação mobile

O SQLCipher `user_version = 4` separa a pendência de texto da réplica substituível. Sua criação captura `sequencia_observada`, versões de atribuição, estado e contexto, responsável e expiração exata da janela Meta; no mesmo commit remove o rascunho correspondente. Snapshot e lotes podem substituir projeções de negócio, mas nunca apagam essas pendências. Logout ou revogação integral continuam limpando toda a base autenticada.

```text
AGUARDANDO_CONEXAO
  ↓ REST convergente → WebSocket aberto → sessão revalidada
POST /mobile/.../mensagens/texto/reconciliar
  ↓ lock autoridade-saida:<atendimento>
comparar atribuição + estado + contexto + janela + eventos da conversa
  ├── sem mudança → ServicoMensagensSaida → NA_FILA
  └── divergência → REVISAO_NECESSARIA
```

O cliente não decide se a observação ainda é válida. A rota mobile autentica bearer, dispositivo e segredo do vínculo, e `ServicoMensagensSaida` adquire a mesma trava transacional usada por resgate, transferência e despacho automático antes de autorizar e comparar a observação. Qualquer evento da conversa posterior à sequência capturada é conservadoramente relevante; versões impedem que transferir e devolver, fechar e reabrir ou trocar e restaurar contexto aparentem igualdade.

Falha transitória não altera a pendência. Revisão local permite editar ou descartar; “enviar mesmo assim” usa o envio normal com nova chave idempotente e continua sujeito ao estado, responsabilidade, RBAC e janela Meta atuais. Mídia não entra nessa caixa local.

### 13.26 Invalidação de escopo mobile

A PR 107 liga `PERMISSOES_ALTERADAS` ao motor de sincronização em vez de tratá-lo como atualização comum. O evento precisa pertencer ao usuário autenticado e carregar versão inteira crescente. Antes de consultar o servidor, o repositório marca `precisa_ressincronizar`, inutiliza a autorização offline e o shell deixa de renderizar a réplica anterior.

```text
PERMISSOES_ALTERADAS (WebSocket ou lote REST)
  ↓ validar usuário + sequência + versão
invalidar autorização local → ESCOPO_ATUALIZANDO
  ↓
snapshot autenticado e assinado, sem recursos ausentes
  ↓ commit SQLCipher único + poda de rascunhos/pendências sem escopo
limpar avisos órfãos → novo WebSocket → PRONTO
  ↓
reconciliar pendências → CONECTADO
```

No caminho WebSocket, o coordenador fecha a conexão que carregava a autoridade anterior e abre outra pelo cursor do snapshot. O adapter só resolve a abertura após processar `PRONTO`; portanto, socket fisicamente aberto não dispara comandos pendentes. No caminho REST incremental, encontrar qualquer invalidação abandona a projeção parcial e força snapshot igual ou posterior ao maior evento do lote.

Perda de fila/permissão conserva somente os outros escopos presentes no snapshot. Rascunho ou pendência cuja conversa saiu do conjunto também é apagado; ausência de `ENVIAR_MENSAGEM` elimina toda a caixa de saída e seus rascunhos. `AUTORIZACAO_INVALIDADA` no canal, ou `401`/`403` depois da renovação prevista, representa revogação integral: o serviço para o motor, limpa sessão e réplica e publica `ACESSO_REVOGADO`; o shell então retorna à entrada. Nenhum desses estados depende de Redis, push ou decisão do cliente.

### 13.27 Diagnóstico e limites do cliente mobile

A PR 108 mantém o diagnóstico inteiramente no cliente: `ServicoDiagnosticoMobile` compõe dados técnicos já disponíveis do runtime, motor de sincronização e adapter push. Não existe endpoint, tabela, telemetria ou upload automático. A apresentação recebe apenas servidor público, versões, classe de aparelho, estados fechados, sequência global e até dez códigos canônicos; a serialização final possui teto de 2 KiB e só alcança o compartilhamento nativo após confirmação humana.

As listas continuam sendo projeções, não autoridades. `FlatList`/`Animated.FlatList` limitam janela e lote renderizado, e a lista de atendimentos preserva a referência dos itens invariáveis para que a atualização de uma conversa não invalide todos os cartões. O servidor limita o snapshot a 200 conversas e 200 mensagens/notas por conversa; o cliente recusa envelope acima de 64 MiB, consulta 60 cartões por filtro e 200 itens na timeline local. O conjunto efêmero de respostas push fica limitado a 200 e nenhum cache local persiste bytes de mídia. Esses limites são fail-closed e não autorizam truncar silenciosamente dado necessário a um comando.
