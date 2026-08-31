# Domínio — Omnichannel V1

## 1. Linguagem do domínio

Todo nome de entidade, estado, evento, serviço, erro, log de negócio e permissão deve ser escrito em português.

Exceções existem somente na fronteira externa. Por exemplo, o adapter da Meta pode receber `sent`, `delivered`, `read` e `failed`, mas deve convertê-los imediatamente em `ENVIADA`, `ENTREGUE`, `LIDA` e `FALHOU`. Da mesma forma, nomes de endpoints do MK permanecem restritos ao `AdaptadorMkSolutions`.

`BSUID`, `username`, `WhatsApp`, `Meta Cloud API`, `WhatsApp Flows`, `SSE`, `WebSocket`, `APNs`, `FCM`, `PPPoE` e nomes de produtos são termos externos/técnicos preservados quando necessário. Eles não justificam modelar o restante do domínio em inglês.

## 2. Visão conceitual

```text
Instalação (uma empresa)
├── ContasWhatsApp
├── Usuários ── Perfis/Permissões ── Filas
├── Contatos
│   ├── IdentidadesWhatsApp
│   ├── VínculosCliente ── SnapshotsCliente/Contrato
│   └── Conversa única
│       ├── Mensagens
│       ├── NotasInternas
│       ├── SubmissõesFormulario
│       ├── EventosConversa
│       └── Atendimentos
│           ├── ProtocoloErp
│           ├── Contexto cliente/contrato
│           ├── Atribuição fila/usuário
│           ├── HistóricoAtribuição
│           └── ExecuçãoFluxo
├── EventosDomínio / ItensCaixaSaída
├── OperaçõesIntegração
└── RegistrosAuditoria
```

## 3. Glossário canônico

| Termo | Definição |
|---|---|
| `Instalação` | Ambiente isolado de uma única empresa. Não existe `tenant_id` compartilhando dados entre empresas na V1. |
| `ContaWhatsApp` | Número/conta empresarial conectada à Meta, com identidade, credenciais externas no adaptador, calendário e fluxo de entrada. |
| `Contato` | Pessoa ou prospecto que conversa com a empresa. Pode tratar de clientes ERP diferentes e pode não possuir telefone. |
| `IdentidadeWhatsApp` | Identidade técnica observada na Meta, baseada em BSUID e atributos opcionais como username, telefone e nome de perfil. |
| `Conversa` | Timeline contínua e única do contato na instalação. Não “fecha”. |
| `Atendimento` | Unidade operacional com protocolo, conta de origem, fila, responsável, contexto, início, encerramento e métricas. |
| `Mensagem` | Conteúdo externo trocado com o contato. Nunca representa nota ou evento interno. |
| `NotaInterna` | Conteúdo visível apenas à equipe; não participa do pipeline de envio externo. |
| `EventoConversa` | Fato operacional exibível na timeline, como transferência ou encerramento. Não é mensagem. |
| `SubmissaoFormulario` | Resposta estruturada recebida de um WhatsApp Flow, protegida e vinculada ao contato e atendimento. |
| `VinculoCliente` | Associação entre um contato e um cliente do ERP; pode ser verificada, manual ou temporária. |
| `ContextoAtendimento` | Cliente e contrato selecionados para as ações daquele atendimento. |
| `SnapshotCliente` | Modelo de leitura persistente de contingência, sincronizado do ERP e armazenado no PostgreSQL. |
| `Fila` | Escopo operacional configurável no qual atendimentos aguardam resgate. |
| `Atribuição` | Combinação atual de fila, responsável, modo e `versao_atribuicao`. |
| `Resgate` | Operação atômica que transforma um pendente ou automação em atendimento de um humano. |
| `ProtocoloErp` | Protocolo oficial retornado pelo ERP; nunca é substituído por sequência paralela local. |
| `EventoDominio` | Fato persistido após alteração relevante, com `sequencia_evento` atribuída pelo servidor. |
| `ItemCaixaSaida` | Trabalho persistente criado na mesma transação do fato de negócio para processamento assíncrono. |
| `RegistroAuditoria` | Registro imutável de quem fez o quê, por qual origem e em qual contexto. |
| `Fluxo` | Definição administrativa versionada do comportamento automatizado. |
| `ExecucaoFluxo` | Instância persistente de uma versão de fluxo vinculada a um atendimento. |

## 4. Identidade, contato e cliente ERP

### 4.1 `Contato`

Campos conceituais mínimos:

```text
Contato
id: UUID
nome_exibicao
estado: NORMAL | BLOQUEADO
bloqueado_em?
bloqueado_ate?
motivo_bloqueio?
criado_em
ultima_interacao_em
```

Somente administrador pode bloquear/desbloquear. O bloqueio exige motivo, pode expirar e nunca apaga histórico ou vínculos.

`SILENCIADO` foi cogitado na conversa, mas sua autoridade e seus efeitos não foram definidos; portanto, não é estado canônico da V1 até uma decisão formal.

Dois contatos não são mesclados automaticamente porque apontam para o mesmo cliente ERP. Marido e esposa podem falar sobre o mesmo contrato e continuam sendo contatos distintos.

### 4.2 `IdentidadeWhatsApp`

```text
IdentidadeWhatsApp
id: UUID
contato_id
portfolio_empresarial_externo_id
identificador_externo_estavel
nome_usuario?
telefone_e164?
nome_perfil?
conta_whatsapp_ultima_observacao_id?
criada_em
atualizada_em
```

Regras:

- BSUID é a chave externa de correlação no escopo empresarial; o UUID do `Contato` continua sendo a chave de domínio.
- Username e telefone são opcionais, pesquisáveis e mutáveis.
- Alteração informada pela Meta atualiza a identidade e preserva contato, conversa e histórico.
- Identificadores anteriores devem permanecer em histórico/alias auditável para deduplicação e diagnóstico.
- O telefone nunca é chave primária de `Contato`, `Conversa` ou `Atendimento`.
- Uma identidade nova sem correlação confiável cria contato separado. Eventual mesclagem manual é decisão futura; na V1, contatos permanecem separados.

### 4.3 `VinculoCliente`

```text
VinculoCliente
id
contato_id
cliente_externo_id
tipo: VERIFICADO | MANUAL | TEMPORARIO
preferencial
metodo_verificacao
verificado_em?
verificado_por_usuario_id?
criado_em
revogado_em?
```

Um contato pode possuir vários vínculos. O vínculo diz “este contato pode tratar deste cliente”; não diz que o telefone do contato pertence ao cadastro do cliente.

A criação, alteração, escolha como preferencial e revogação são auditadas. CPF por si só é identificador, não autenticação forte universal; cada ação consulta a política de risco aplicável.

### 4.4 `ContextoAtendimento`

O atendimento mantém:

```text
cliente_externo_ativo_id?
contrato_externo_ativo_id?
vinculo_cliente_id?
origem_contexto
contexto_alterado_em?
contexto_alterado_por?
```

Trocar o contexto não troca contato, conversa ou protocolo. Toda troca gera evento e auditoria. A ação de ERP deve declarar explicitamente qual cliente e contrato utiliza; nunca usa implicitamente “o primeiro contrato”.

## 5. Conversa, conta de origem e timeline

### 5.1 Uma conversa por contato

Invariante de V1:

```text
UNIQUE (contato_id) em Conversa
```

A timeline é única na instalação, independentemente da conta WhatsApp usada. Cada item preserva sua origem:

```text
Mensagem.conta_whatsapp_id
Atendimento.conta_whatsapp_origem_id
EstadoJanelaCanal.contato_id + conta_whatsapp_id
```

Transferência interna nunca altera `conta_whatsapp_origem_id`. Respostas do atendimento saem pela conta de origem na V1.

### 5.2 Resolução de atendimento na entrada

Ao persistir uma mensagem de entrada:

1. resolver ou criar a `IdentidadeWhatsApp` e o `Contato`;
2. obter a `Conversa` única;
3. deduplicar/validar a entrada e atualizar a janela da conta como `ABERTA` com base nessa mensagem aceita;
4. procurar atendimento aplicável para o mesmo contato e conta de origem;
5. reabrir o mesmo atendimento se estiver em `ENCERRADO_REABRIVEL` e dentro de 30 minutos — a própria entrada já reabriu a janela no passo anterior;
6. caso contrário, criar novo `Atendimento`, iniciar protocolo ERP e fluxo de entrada da conta;
7. persistir a mensagem vinculada ao atendimento resolvido, a janela e os eventos na mesma transação, antes de distribuir qualquer efeito.

Interações simultâneas por contas empresariais diferentes podem gerar atendimentos distintos na mesma timeline. Protocolos nunca são fundidos automaticamente.

### 5.3 Composição da timeline

A API de timeline compõe, sem converter tudo em mensagem:

- `Mensagem`;
- `NotaInterna`;
- `EventoConversa`;
- `SubmissaoFormulario`;
- separadores de `Atendimento`.

O carregamento é paginado em web e mobile. A ordem causal/operacional é `sequencia_evento`; timestamps do servidor, da Meta e do dispositivo servem à exibição, ao contexto e ao diagnóstico, sem reordenar fatos já sequenciados.

Autorização é aplicada na consulta do PostgreSQL. A equipe do atendimento atual vê as mensagens cliente↔empresa do mesmo protocolo. Histórico de outro atendimento exige interseção com fila participante ou `VISUALIZAR_HISTORICO_TRANSVERSAL`. `NotaInterna` exige `VISUALIZAR_NOTA_INTERNA`, conserva a fila de criação e, sem interseção, exige `VISUALIZAR_NOTAS_TRANSVERSAIS`. Permissões transversais de mensagem e nota são independentes. Item negado e seus metadados não saem da API; continuidade essencial usa `EventoConversa` sanitizado.

## 6. Máquina de estados do atendimento

### 6.1 Estado principal

```text
AGUARDANDO
   ├────────────── resgate/transferência direta ──────────────> EM_ATENDIMENTO
   ├──────── encerramento pelo Motor de Fluxos/humano ──────> ENCERRADO_REABRIVEL
   └────────────── nunca fecha por expiração Meta

EM_ATENDIMENTO
   ├────────────── transferência para fila ───────────────────> AGUARDANDO
   └────────────── encerramento explícito ────────────────────> ENCERRADO_REABRIVEL

ENCERRADO_REABRIVEL
   ├── reabertura válida em até 30 min e janela Meta aberta ─> estado aberto coerente
   └── prazo expirou ou reabertura ficou impossível ─────────> ENCERRADO

ENCERRADO
   └── nova interação cria outro Atendimento
```

Definições:

- `AGUARDANDO`: atendimento aberto sem humano responsável; pode estar no bot ou em fila humana.
- `EM_ATENDIMENTO`: humano responsável atual.
- `ENCERRADO_REABRIVEL`: encerrado, mas ainda dentro da tolerância de 30 minutos e da janela Meta.
- `ENCERRADO`: encerramento definitivo daquele protocolo.

Não há fechamento automático por inatividade na V1. Inatividade gera alertas/SLA; somente humano autorizado ou nó publicado do fluxo encerra.

### 6.2 Atributos ortogonais

O estado não incorpora bot, fila, janela Meta ou espera. Esses conceitos ficam separados:

```text
modo_atendimento:
  BOT
  FILA_HUMANA
  HUMANO

motivo_espera:
  PROCESSANDO_BOT
  AGUARDANDO_HUMANO
  FORA_DO_HORARIO
  AGUARDANDO_CLIENTE
  NENHUM
```

Combinações válidas importantes:

| Estado | Modo | Responsável | Interpretação |
|---|---|---|---|
| `AGUARDANDO` | `BOT` | nulo | Automação conduz o atendimento. |
| `AGUARDANDO` | `FILA_HUMANA` | nulo | Pendente visível a uma fila. |
| `EM_ATENDIMENTO` | `HUMANO` | usuário | Um humano é autoridade de resposta. |
| `ENCERRADO_REABRIVEL`/`ENCERRADO` | qualquer modo histórico | sem ação | Nenhum envio automático continua por causa do modo anterior. |

Uma execução de fluxo de atendimento não pode enviar depois que `modo_atendimento` passa para `HUMANO`.

### 6.3 Encerramento e reabertura

O encerramento registra:

```text
encerrado_em
encerrado_por_tipo: USUARIO | FLUXO
encerrado_por_id?
motivo_encerramento
pode_reabrir_ate
estado_e_modo_anteriores
finalizado_definitivamente_em?
finalizado_definitivamente_por: SISTEMA?
```

A reabertura manual é comando de domínio, não atualização direta de coluna. Ela valida prazo, janela Meta já aberta, autorização e atribuição atual e resulta em `EM_ATENDIMENTO`, modo `HUMANO`, com o operador autorizado como responsável.

Na entrada do contato, a ordem transacional da seção 5.2 prevalece. Se o encerramento anterior foi do Motor de Fluxos, o atendimento reabre em `AGUARDANDO`, modo `FILA_HUMANA`, na fila humana de fallback congelada no encerramento e sem responsável. A `ExecucaoFluxo` anterior permanece terminal e nunca retoma nó ou escrita ERP. Publicar fluxo capaz de encerrar exige fila de fallback ativa. Contexto e protocolo são preservados e `versao_atribuicao` é incrementada com evento/auditoria.

O sistema apenas promove `ENCERRADO_REABRIVEL` para `ENCERRADO` quando a tolerância termina; ele não inicia o encerramento. Depois de `ENCERRADO`, uma nova interação gera outro atendimento e protocolo e usa o fluxo atualmente publicado.

## 7. Janela Meta — máquina independente

Existe um estado por `Contato + ContaWhatsApp`:

```text
ABERTA   -- 24h após a última mensagem do contato naquela conta
EXPIRADA -- fora dessa janela
```

O estado é derivado de `ultima_mensagem_contato_em` e da regra vigente, não alterado por mensagem da empresa.

Regras:

- alertas em 1 hora, 30 minutos e 10 minutos antes da expiração;
- expirar a janela não encerra, arquiva ou transfere atendimento;
- texto livre é rejeitado pelo domínio antes de chamar o adapter quando a janela está expirada;
- template aprovado pode ser enviado fora da janela;
- enviar template não reabre a janela; somente nova mensagem do contato reabre;
- lista e conversa continuam visíveis com indicação de janela expirada.

## 8. Filas e atribuição

### 8.1 Campos atuais

```text
fila_atual_id?
usuario_responsavel_id?
modo_atendimento
versao_atribuicao: inteiro crescente por Atendimento
resgatado_em?
ultima_transferencia_em?
```

### 8.2 Resgate atômico

O resgate de pendente só pode vencer se, na mesma operação atômica:

```text
estado = AGUARDANDO
fila_atual_id = fila esperada
usuario_responsavel_id IS NULL
versao_atribuicao = versao esperada
usuário tem VISUALIZAR_FILA e RESGATAR_ATENDIMENTO
```

O vencedor recebe:

```text
estado = EM_ATENDIMENTO
modo_atendimento = HUMANO
usuario_responsavel_id = usuário
versao_atribuicao = versao_atribuicao + 1
```

O perdedor recebe conflito de domínio e o responsável vencedor, sem sobrescrever o estado.

Resgatar um atendimento em `BOT` também suspende atomicamente a `ExecucaoFluxo` como `SUSPENSA_POR_ATENDIMENTO_HUMANO`.

### 8.3 Transferência para fila

```text
fila_atual_id = fila_destino
usuario_responsavel_id = null
estado = AGUARDANDO
modo_atendimento = FILA_HUMANA
versao_atribuicao++
```

Exige acesso/permite transferência para a fila destino segundo a política. Protocolo, conversa, conta de origem, mensagens, contexto e notas não mudam.

### 8.4 Transferência direta

Antes da alteração, validar:

- destinatário `DISPONIVEL`;
- acesso à fila destino;
- permissão para receber atendimento;
- fila destino explícita se o usuário pertence a várias filas.

Depois:

```text
fila_atual_id = fila_destino
usuario_responsavel_id = destinatário
estado = EM_ATENDIMENTO
modo_atendimento = HUMANO
versao_atribuicao++
```

Não existe aceite. O destinatário é notificado imediatamente.

### 8.5 Assunção de supervisor

Supervisor pode assumir atendimento no escopo de suas filas; administrador, em qualquer fila. A operação troca responsável, incrementa a versão, revoga autoridade de envio do anterior e gera `ATENDIMENTO_ASSUMIDO_POR_SUPERVISOR` quando aplicável.

### 8.6 Histórico de atribuição

```text
HistoricoAtribuicao
id
atendimento_id
fila_id?
usuario_responsavel_id?
tipo:
  ENTRADA_FILA
  RESGATE
  TRANSFERENCIA_FILA
  TRANSFERENCIA_USUARIO
  ASSUNCAO_SUPERVISOR
  REABERTURA
iniciado_em
finalizado_em?
executado_por_usuario_id?
```

Esse histórico é fonte de métricas de espera/responsabilidade; não deve ser reconstruído somente a partir de logs.

## 9. Disponibilidade do usuário

```text
DISPONIVEL
INDISPONIVEL
```

Disponibilidade é um estado operacional explícito no servidor. Não deriva de heartbeat, app aberto, navegador conectado ou push ativo. Conexão técnica e disponibilidade operacional são conceitos independentes.

## 10. Máquina de estados da mensagem

### 10.1 Mensagem de saída no backend

```text
NA_FILA
  ├── worker inicia ──────────────────────────────────────────> ENVIANDO
  └── cancelamento antes da aceitação Meta ─────────────────> CANCELADA

ENVIANDO
  ├── Meta aceita e retorna identificador ───────────────────> ENVIADA
  ├── erro temporário ───────────────────────────────────────> NA_FILA
  └── erro definitivo ───────────────────────────────────────> FALHOU

ENVIADA ── webhook de entrega ───────────────────────────────> ENTREGUE
ENTREGUE ─ webhook de leitura ───────────────────────────────> LIDA
```

Regras:

- `ENVIADA` só existe após aceitação real da Meta.
- Erro temporário retorna a `NA_FILA` com motivo, tentativa e próxima execução; administrador pode pedir reprocessamento imediato.
- Número inválido ou outra falha definitiva vira `FALHOU` sem nova tentativa automática.
- Template inválido/rejeitado vira `FALHOU`, bloqueia novos usos incompatíveis e gera alerta administrativo.
- `FALHOU` é terminal para aquela tentativa. Editar/reencaminhar cria nova mensagem/tentativa ligada à anterior.
- Depois de `ENVIADA`, o atendente não edita, cancela nem exclui.
- Remover uma falha da visualização operacional nunca remove auditoria ou evidência técnica.

Campos mínimos:

```text
id
identificador_externo_mensagem?
mensagem_cliente_id?
conversa_id
atendimento_id
conta_whatsapp_id
direcao: ENTRADA | SAIDA
tipo: TEXTO | IMAGEM | AUDIO | VIDEO | PDF | INTERATIVA | TEMPLATE | REACAO
estado_saida?
responde_a_mensagem_id?
mensagem_alvo_reacao_id?
usuario_remetente_id?
contato_remetente_id?
criada_dispositivo_em?
recebida_servidor_em
enviada_em?
entregue_em?
lida_em?
falhou_em?
codigo_falha?
```

`identificador_externo_mensagem` é único por conta quando presente. `mensagem_cliente_id`, combinado com dispositivo/usuário ou comando, implementa idempotência da criação.

### 10.2 Mensagem de entrada

Mensagens de entrada são persistidas antes de automação, notificação ou confirmação. Elas não reutilizam artificialmente o estado de envio. Deduplicação ocorre por identificador externo e conta.

Leitura interna e lembrete pessoal são conceitos separados:

```text
LeituraConversa: lida_em, lida_por
MarcacaoPessoal: marcada_nao_lida
```

Abrir a conversa registra leitura real. “Marcar como não lida” não desfaz o fato; só cria lembrete do usuário.

### 10.3 Estados locais do mobile

```text
RASCUNHO
AGUARDANDO_CONEXAO
REVISAO_NECESSARIA
```

Fluxo:

```text
RASCUNHO -- usuário toca Enviar sem rede --> AGUARDANDO_CONEXAO

AGUARDANDO_CONEXAO
  ├── sync sem mudança relevante e autorização válida --> comando ao backend/NA_FILA
  └── timeline, janela, permissão ou atribuição mudou --> REVISAO_NECESSARIA

REVISAO_NECESSARIA
  ├── editar --> RASCUNHO
  ├── descartar --> removida localmente
  └── enviar mesmo assim --> novo comando validado pelo backend
```

Nenhuma opção ignora RBAC, janela Meta ou `versao_atribuicao` vigente.

## 11. Protocolo ERP

Estado canônico do vínculo com o ERP:

```text
PENDENTE → OFICIAL
```

O atendimento nasce com UUID interno e protocolo `PENDENTE`. Somente um valor confirmado pelo ERP muda o estado para `OFICIAL`; o valor oficial é imutável. Tentativa, timeout, falha e reconciliação pertencem à `OperacaoIntegracao`, não viram estados do protocolo. Resposta perdida ou resultado incerto exige reconciliação conservadora, nunca nova criação cega. A política operacional detalhada será fechada com o contrato real do MK no PR correspondente.

## 12. Snapshot e integração

Estado normalizado de uma integração:

```text
DISPONIVEL
DEGRADADA
INDISPONIVEL
```

Toda consulta ao ERP informa origem:

```text
TEMPO_REAL
SNAPSHOT
```

`SNAPSHOT` pode sustentar identificação, nome, documento mascarado, vínculos, contratos conhecidos, plano, velocidade e endereços. Fatura atual, Pix, financeiro atual, desbloqueio, protocolo, OS e qualquer escrita exigem `TEMPO_REAL`.

## 13. Eventos e sincronização

```text
EventoDominio
id
sequencia_evento: inteiro monotônico global na instalação
tipo
entidade_tipo
entidade_id
atendimento_id?
conversa_id?
usuario_ator_id?
classificacao_dados
dados_protegidos_minimizados
criado_em
```

```text
ItemCaixaSaida
id
evento_dominio_id
tipo
destino
estado: PENDENTE | PROCESSADO
dados_protegidos_minimizados
disponivel_em
criado_em
processado_em?
```

`EventoDominio` é o fato interno persistente, não o payload enviado aos clientes. Um projetor autorizado cria `PayloadEventoCliente` mínimo e sanitizado para web/mobile conforme usuário, fila e recurso; push recebe uma projeção ainda menor. O objeto interno nunca é distribuído diretamente.

Regras:

- a sequência é atribuída apenas pelo servidor;
- a sequência é global e monotônica na instalação; rollback pode produzir lacunas, nunca reutilização ou reordenação;
- alteração principal, evento e `ItemCaixaSaida` são gravados na mesma transação quando houver efeito assíncrono;
- cada item referencia exatamente o evento que originou o efeito e nasce `PENDENTE`; nenhum publicador observa item antes do commit;
- SSE, WebSocket e push distribuem somente projeções de eventos já confirmados no PostgreSQL;
- cliente aplica eventos em ordem de sequência e de forma idempotente;
- projeções são filtradas e sanitizadas no servidor conforme a permissão atual;
- retirada de permissão gera `PERMISSOES_ALTERADAS` e obriga limpeza/invalidação do cache local;
- retenção inicial de eventos incrementais: 30 dias; cursor antigo demais exige ressincronização completa;
- histórico de conversa e auditoria não herdam essa retenção de 30 dias.

Eventos de referência:

```text
MENSAGEM_RECEBIDA
MENSAGEM_ENVIADA
MENSAGEM_ENTREGUE
MENSAGEM_LIDA
MENSAGEM_FALHOU
ATENDIMENTO_CRIADO
ATENDIMENTO_RESGATADO
ATENDIMENTO_TRANSFERIDO
ATENDIMENTO_ENCERRADO
ATENDIMENTO_REABERTO
CONTEXTO_CLIENTE_ALTERADO
NOTA_INTERNA_CRIADA
JANELA_META_PROXIMA_EXPIRACAO
JANELA_META_EXPIRADA
FORMULARIO_RECEBIDO
ERP_INDISPONIVEL
ERP_REESTABELECIDO
PERMISSOES_ALTERADAS
```

### 13.1 `RegistroAuditoria`

`RegistroAuditoria` é um fato de segurança somente de acréscimo, separado de `EventoDominio` e de log técnico. Registra tipo, ação, origem (`USUARIO`, `FLUXO`, `SISTEMA` ou `INTEGRACAO`), ator compatível, contexto opcional, entidade afetada, correlação e instantâneo anterior/novo já sanitizado.

Regras:

- origem `USUARIO` exige `usuario_id`; origem `FLUXO` exige `fluxo_id` e `versao_fluxo_id`; as demais não simulam ator humano;
- `entidade_tipo` e `entidade_id` aparecem juntos ou ambos ficam ausentes;
- valores sensíveis não persistem em claro nos instantâneos;
- o serviço e o repositório não oferecem edição ou remoção;
- encerramento, transferência, deploy, nova tentativa ou rotação de log não afetam auditoria;
- alteração de negócio e auditoria compartilham transação quando constituem um único efeito.

### 13.2 Idempotência e operações recuperáveis

`RegistroIdempotencia` representa a aceitação única de um comando dentro de um escopo. A chave fornecida pelo cliente é um UUID de alta entropia e nunca é persistida em claro: o banco guarda somente seu SHA-256, único por `escopo_tipo + escopo_id + chave_hash`. `assinatura_requisicao_hash` vincula a chave ao conteúdo canônico do comando; reutilizá-la para conteúdo diferente é erro, não uma nova operação.

```text
OperacaoRecuperavel
PENDENTE
  → EM_EXECUCAO
    → CONCLUIDA
    → FALHA_DEFINITIVA
    → AGUARDANDO_NOVA_TENTATIVA
    → RESULTADO_INCERTO
RESULTADO_INCERTO
  → EM_RECONCILIACAO
    → CONCLUIDA
    → FALHA_DEFINITIVA
    → AGUARDANDO_NOVA_TENTATIVA
    → RESULTADO_INCERTO
```

Cada aquisição cria uma `TentativaOperacao` numerada. Uma concessão possui validade e token aleatório devolvido uma única vez; somente o hash do token permanece no PostgreSQL. Versão e alteração condicional garantem um vencedor sob concorrência. Se o processo perder a resposta externa ou a concessão expirar, a operação vai para `RESULTADO_INCERTO`: a próxima ação é reconciliar o efeito no sistema externo, nunca repeti-lo às cegas.

Regras:

- `AGUARDANDO_NOVA_TENTATIVA` só autoriza nova execução após `proxima_acao_em`;
- `RESULTADO_INCERTO` só autoriza reconciliação;
- reconciliação que comprova ausência do efeito pode liberar nova tentativa;
- resultado e tentativas são persistentes; Redis não participa da decisão;
- assinatura de comando é calculada pelo backend sobre campos canônicos já validados e minimizados; dado sensível ou de espaço pequeno exige HMAC/índice protegido, não hash simples;
- o serviço pode participar da mesma transação da intenção, evento e auditoria, mas a chamada externa ocorre somente depois do commit.

## 14. Invariantes obrigatórios

1. Uma instalação contém dados de uma única empresa.
2. Um contato possui uma conversa contínua na instalação.
3. Conta de origem é preservada em toda mensagem e atendimento.
4. Toda mensagem cliente↔empresa operacional pertence a um atendimento, salvo evento técnico explicitamente documentado.
5. Notas internas e eventos nunca entram no pipeline Meta.
6. Protocolo exibido ao cliente é o protocolo oficial do ERP.
7. Atendimento e janela Meta nunca são o mesmo estado.
8. `ENVIADA` exige aceitação confirmada pela Meta.
9. Um atendimento possui no máximo um responsável humano atual.
10. Resgate, transferência e assunção são atômicos e incrementam `versao_atribuicao`.
11. Um humano responsável impede respostas automáticas do fluxo daquele atendimento.
12. Redis não é fonte da verdade.
13. Snapshot desatualizado não autoriza escrita.
14. Toda escrita externa sensível possui `chave_idempotencia`.
15. Todo acesso exige usuário + permissão + escopo de fila + recurso.
16. CPF completo nunca aparece em mensagem automática, push ou log comum.
17. Versão de fluxo publicada é imutável e execução não migra silenciosamente de versão.
18. Eventos só são distribuídos depois do commit.
19. Retirar permissão invalida acesso futuro e cache local correspondente.
20. Histórico e auditoria não são apagados por encerramento, expiração de janela, transferência, deploy ou nova tentativa.

## 15. Constraints e testes de domínio mínimos

O schema e os testes devem materializar, sempre que possível:

- unicidade de `Conversa.contato_id`;
- unicidade de identificadores externos de mensagem por conta;
- unicidade de versão numérica por fluxo;
- uma única versão publicada ativa por fluxo;
- uma única atribuição humana atual por atendimento;
- chaves idempotentes únicas por operação/escopo;
- check constraints coerentes entre estado, modo, fila e responsável;
- optimistic concurrency ou update condicional usando `versao_atribuicao`;
- testes concorrentes reais para resgate e assunção;
- testes de transição inválida para todas as máquinas de estado.

Detalhes de segurança, execução de fluxo e sincronização estão em [SECURITY.md](SECURITY.md), [FLOWS.md](FLOWS.md) e [ARCHITECTURE.md](ARCHITECTURE.md).
