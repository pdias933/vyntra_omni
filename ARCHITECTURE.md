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

Usuários, perfis, permissões e filas também residem no PostgreSQL. Perfil é referência opcional do usuário; permissões são ajustes granulares por código fechado; acesso de fila é relação explícita e revogável. O schema não contém credencial nem sessão antes dos PRs próprios e não calcula autorização: a PR 012 combinará usuário ativo, perfil, permissão, fila, recurso e estado em um único serviço `default deny`.

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

### 8.3 WebSocket mobile sem lacuna

O protocolo precisa fechar a corrida entre sync e realtime:

1. mobile chama sincronização com seu cursor;
2. servidor retorna eventos e `sequencia_final` do lote/snapshot;
3. mobile aplica tudo atomicamente no SQLite;
4. mobile abre WebSocket autenticado com `apos=sequencia_final`;
5. gateway consulta/passa todo evento persistido após esse cursor antes de entrar no modo ao vivo;
6. cada evento exige confirmação local/aplicação idempotente; reconexão repete a partir do último aplicado.

Assim, evento criado entre os passos 2 e 4 é recuperado no passo 5. “Abrir WebSocket e esperar o próximo” sem backfill é proibido.

### 8.4 Push

Push contém apenas identificadores mínimos e texto não sensível. Ele avisa; não altera SQLite como fonte definitiva, não marca leitura e não carrega CPF, fatura ou conteúdo privado. Ao abrir o app, a sincronização decide o estado.

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

A referência inicial é retenção de 30 dias para eventos de sincronização, sujeita a medição e política operacional. Isso não limita histórico de conversa.

### 9.3 Alteração de permissão

`PERMISSOES_ALTERADAS` obriga:

1. pausar comandos e stream dependentes;
2. buscar autorização atual;
3. apagar/inutilizar do SQLite os dados que perderam escopo;
4. refazer snapshot se necessário;
5. reconectar com novo escopo.

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
