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

### 3.1 Funcionários e escopos de acesso

`Usuario` representa o funcionário dentro da instalação, separado de credencial e sessão. Ele possui nome de exibição, estado e perfil opcional. Usuário sem perfil permanece sem capacidade, e perfil não concede fila por simples associação.

`CredencialSenha` associa um identificador normalizado único ao usuário e conserva somente o hash Argon2id da senha. Identificador não é identidade pública, senha nunca é recuperável e revogar a credencial não apaga usuário, auditoria ou sessões históricas.

`SessaoWeb` é uma sessão de navegador com identificador próprio, token opaco armazenado somente por hash, proteção CSRF vinculada, última atividade, limite de inatividade e versão de rotação. O segredo apresentado pelo navegador nunca é persistido. Rotação substitui token e CSRF atomicamente e renova a atividade; logout ou revogação alteram estado e motivo sem remover histórico. Um usuário possui no máximo duas sessões web ativas. Ao alcançar o limite, uma nova autenticação válida primeiro exige confirmação explícita e somente então revoga a sessão mais antiga sob serialização do PostgreSQL.

`TentativaLoginWeb` registra somente hash do identificador, IP, resultado e instante. Ela sustenta os limites técnicos sem guardar identificador ou senha em claro.

`DispositivoMobile` é o vínculo revogável entre um usuário e uma instalação do app. Conserva somente hashes do identificador da instalação e do segredo de vínculo, plataforma, versão e metadado de modelo sanitizado. O mesmo identificador com segredo divergente não é aceito como o aparelho anterior.

Um usuário possui no máximo dois `DispositivoMobile` ativos. O limite considera aparelho, não quantidade de sessões: logout não libera automaticamente a vaga. Ao entrar por uma terceira instalação, `ultimoAcessoEm`, `criadoEm` e `id` formam a ordenação determinística; o mais antigo é revogado junto de todas as suas sessões antes da criação do novo. Estado revogado nunca volta a ativo: restauração ou troca de vínculo exige nova identidade de instalação conforme política de segurança.

`SessaoMobile` pertence simultaneamente a usuário e dispositivo. Access e refresh tokens opacos são armazenados somente por hash; estado, expirações absoluta/curta, versão, rotação e motivo de revogação permanecem históricos. `TokenRefreshMobileUsado` registra o hash consumido para detectar replay sem conservar o segredo bruto. `TentativaLoginMobile` limita abuso por identificador+IP+instalação e por IP usando apenas hashes e metadados mínimos.

`PareamentoQr` é a autorização efêmera criada por uma `SessaoWeb` para iniciar uma `SessaoMobile`. Conserva somente os hashes do token mostrado no QR e do comprovante entregue ao app. Depois do resgate, guarda o vínculo normalizado do aparelho e uma prévia sanitizada para a confirmação web. `TentativaResgatePareamentoQr` registra IP, hash da instalação, resultado e instante para limitar abuso sem armazenar o token apresentado.

`ControleRecurso` representa a decisão operacional de expor código já implantado. Possui estado, desligamento emergencial, percentual determinístico e alvos explícitos por usuário/fila; administrador só é alvo quando a configuração disser. `PoliticaVersaoMobile` existe uma vez por plataforma e conserva versões mínima/recomendada, mensagem, URL oficial da loja e versão otimista. Ambos são configuração persistente auditável, não estado efêmero de cliente ou Redis.

Máquina de estados do pareamento:

```text
AGUARDANDO_RESGATE ──resgate único──→ AGUARDANDO_CONFIRMACAO
AGUARDANDO_CONFIRMACAO ──confirmação web recente──→ CONFIRMADO
CONFIRMADO ──sessão mobile emitida──→ CONCLUIDO

AGUARDANDO_RESGATE | AGUARDANDO_CONFIRMACAO | CONFIRMADO
  ──prazo──→ EXPIRADO
  ──cancelamento/revogação web──→ CANCELADO
```

`CONCLUIDO`, `CANCELADO` e `EXPIRADO` são finais. Novo QR cancela o anterior da mesma sessão. Confirmação pertence à mesma sessão web criadora; conclusão pertence ao mesmo aparelho que resgatou. Somente o mobile recebe a sessão emitida.

`PerfilAcesso` combina um `PapelBase` — `ADMINISTRADOR`, `SUPERVISOR` ou `ATENDENTE` — com ajustes granulares em `PermissaoPerfil`. Cada ajuste é `CONCEDER` ou `NEGAR`, inclusive para negar uma capacidade herdada quando a matriz base for materializada pelo serviço central. Ausência de decisão efetiva significa negar.

`Fila` é um escopo operacional, nunca um papel. Financeiro, Suporte e Comercial são exemplos configuráveis de fila. `AcessoUsuarioFila` registra explicitamente quais filas pertencem ao escopo do usuário e conserva revogação coerente; permissão de uma ação e acesso à fila são condições independentes.

Regras:

- não existe perfil, permissão ou fila atribuída por padrão ao criar usuário;
- perfil inativo, usuário inativo ou acesso revogado não autoriza ação;
- código de permissão vem do catálogo fechado no schema e não de texto livre;
- `VISUALIZAR_DADO_SENSIVEL`, `EXPORTAR_HISTORICO` e `VISUALIZAR_NOTAS_TRANSVERSAIS` continuam específicos e não decorrem apenas de ser Administrador;
- credencial válida autentica identidade, mas não concede perfil, fila ou permissão;
- sessão web só produz contexto autenticado enquanto estiver ativa, não expirada e vinculada a usuário ativo.
- sessão mobile só produz contexto autenticado enquanto usuário, dispositivo e sessão estiverem ativos, o access token não tiver expirado e o vínculo apresentado coincidir;
- refresh mobile é de uso único; reutilização revoga a sessão e exige nova autenticação.
- dispositivo revogado invalida todas as suas sessões e deixa de produzir contexto para REST, sincronização ou WebSocket;
- contagem, escolha do mais antigo, revogação e criação do terceiro compartilham a mesma serialização/transação PostgreSQL.
- pareamento QR vale 90 segundos, possui no máximo uma instância ativa por sessão web e nunca persiste token ou comprovante bruto;
- resgate, confirmação e conclusão do pareamento são transições condicionais de uso único; revogação da sessão web cancela qualquer pareamento ainda ativo;
- confirmação de pareamento exige a sessão web criadora e autenticação recente; a sessão mobile só é emitida ao aparelho vinculado no resgate.

### 3.2 Decisão central de autorização

`AutorizacaoConcedida` é uma prova efêmera produzida pelo backend, não entidade persistente nem autorização transferível ao cliente. Ela só existe depois de validar, nesta ordem, sessão, usuário/perfil, permissão efetiva, escopo de fila e recurso/estado concreto.

Para permissões de fila, Administrador alcança toda fila ativa e os demais papéis exigem `AcessoUsuarioFila` ativo. Permissões globais continuam exigindo recurso e estado verificáveis dentro do escopo da instalação. Ajuste `NEGAR` vence papel base; ajuste `CONCEDER` pode acrescentar capacidade. Ausência, inatividade ou inconsistência sempre negam.

O verificador do recurso retorna apenas `acessivel` e `estadoPermiteAcao`. Recurso inexistente, conhecido sem acesso ou em estado incompatível não muda o contrato de erro. Caso de uso que altera estado deve usar a mesma transação para autorização, consulta filtrada e alteração quando a corrida for relevante, além das constraints/condições específicas do agregado.

## 4. Identidade, contato e cliente ERP

### 4.1 `ContaWhatsApp`

`ContaWhatsApp` representa uma origem empresarial estável dentro da instalação, sem carregar credencial do provedor:

```text
ContaWhatsApp
id: UUID
nome_exibicao
portfolio_empresarial_externo_id
identificador_canal_externo
telefone_exibicao_e164?
estado: ATIVA | INATIVA
versao
criado_em
atualizado_em
```

O UUID interno é a referência usada por mensagens, atendimentos, janela do canal, eventos e configuração de integração. Uma instalação pode possuir várias contas; nome de exibição não é chave e nenhuma conta ocupa posição de singleton. A combinação da identidade externa não pode se repetir e o telefone de exibição, quando conhecido, usa E.164.

Cadastro sempre começa `INATIVA`. Ativação só poderá ocorrer depois de configuração e validação explícitas no adaptador real. Tokens, segredos, certificados e outros materiais de autenticação não são atributos da entidade, não entram em auditoria e ficam em cofre/configuração do adaptador, associados pelo UUID interno. Conta com histórico não é excluída: desativação preserva a origem dos fatos já registrados.

### 4.2 `Contato`

Campos conceituais mínimos:

```text
Contato
id: UUID
nome_exibicao?
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

### 4.3 `IdentidadeWhatsApp`

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

A PR 023 materializa `Contato` e `IdentidadeWhatsApp`. O serviço recebe do adaptador apenas a observação já normalizada, obtém o portfólio pela `ContaWhatsApp` ativa e serializa por `portfolio + identificador_externo_estavel` antes de consultar/criar. Reobservação devolve o mesmo contato. Nome de perfil, username e telefone podem estar ausentes; nenhum deles participa da chave, e a ausência não gera valor inventado. O primeiro nome de exibição usa nome de perfil ou username observado, sem transformar telefone em identidade do contato.

A PR 024 acrescenta `AliasIdentidadeWhatsApp` e `EventoAlteracaoIdentidadeWhatsApp`. Somente um par explícito anterior→atual de conta ativa pode substituir o identificador corrente. A alteração preserva `IdentidadeWhatsApp`, `Contato` e todo vínculo/timeline futuro; o valor anterior passa a resolver pelo alias. Repetição do mesmo par é idempotente. Se o anterior não existe, aponta apenas para alias antigo incompatível ou o atual já pertence a outro contato, o resultado é `SEPARADA_INCERTA`: o identificador atual permanece ou nasce em contato separado, sem merge automático.

### 4.4 `VinculoCliente`

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

### 4.5 `ContextoAtendimento`

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

A materialização da PR 025 usa FKs compostas para impedir contrato de outro vínculo ou vínculo de outro contato. Inicialização exige alvo ativo e origem explícita; troca humana exige `ALTERAR_CONTEXTO_CLIENTE` e versão esperada. Auditoria guarda apenas referências internas. Criação/revalidação de vínculo permanece sem rota pública. Até a PR 028, `atendimento_id` é UUID reservado; a tabela `Atendimento` acrescentará a FK por migration aditiva.

### 4.6 `SnapshotCliente`

Um vínculo ativo possui no máximo um snapshot corrente. O snapshot contém somente campos internos normalizados em `dados_protegidos`; documento e telefone entram apenas mascarados, e CPF/CNPJ bruto ou campo externo desconhecido é recusado. O PostgreSQL conserva origem `INTEGRACAO_ERP`, instante capturado, hash do conteúdo, instantes de persistência/atualização e versão.

A PR 062 torna a atualidade explícita por `ATUAL`, `OBSOLETO` ou `EXCLUIDO`. `EXCLUIDO` exige tombstone inequívoco do ERP; `OBSOLETO` exige ausência confirmada por reconciliação completa. Ambos preservam o último documento protegido, registram motivo/instante e incrementam versão. Lote parcial, atraso presumido ou falha não marcam obsolescência. Uma observação posterior e mais nova pode reativar o snapshot; replay ou evidência antiga não regressa estado.

Atualizações são serializadas por vínculo. Captura mais antiga não substitui a atual; repetição do mesmo instante/conteúdo é idempotente; mesmo instante com conteúdo diferente é conflito. A leitura retorna `origem: SNAPSHOT` e `idade_segundos`, sem afirmar que o dado é tempo real. A PR 026 não inventa limiar de obsolescência: tombstones, política de idade e reconciliação serão materializados com a sincronização real da PR 062.

O snapshot sustenta somente leitura de identificação/contexto permitida. Ele nunca comprova situação financeira atual, sessão de acesso, protocolo, elegibilidade ou execução de escrita no ERP. Redis pode futuramente acelerar uma leitura, mas sua perda não remove nem altera o snapshot do PostgreSQL.

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

A PR 027 materializa `Conversa` com unicidade por `contato_id`, sem estado/data de fechamento. `ParticipacaoContaConversa` registra cada conta observada na mesma timeline e seus intervalos de interação. Resolução serializa pelo contato, exige conta ativa e atualiza somente máximos/mínimos: interação atrasada pode antecipar a primeira origem, mas nunca regride a última atividade. A participação não substitui a origem obrigatória de cada `Mensagem` e `Atendimento` futuros.

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

A porta interna de mensageria não altera esta máquina. `ACEITA` é resultado técnico normalizado da tentativa externa e autoriza o caso de uso a persistir `ENVIADA`; não é um estado adicional de `Mensagem`. Falhas saem do adapter como `TEMPORARIA`, `DEFINITIVA` ou `CONFIGURACAO`, com código interno estável. Evento recebido pelo domínio já usa `MENSAGEM_RECEBIDA`, `ESTADO_MENSAGEM_ATUALIZADO`, estados em português e identidade normalizada.

### 10.2 Mensagem de entrada

Mensagens de entrada são persistidas antes de automação, notificação ou confirmação. Elas não reutilizam artificialmente o estado de envio. Deduplicação ocorre por identificador externo e conta.

Leitura interna e lembrete pessoal são conceitos separados:

```text
LeituraConversa: lida_em, lida_por
MarcacaoPessoal: marcada_nao_lida
```

Abrir a conversa registra leitura real. “Marcar como não lida” não desfaz o fato; só cria lembrete do usuário.

`MarcadorLeituraConversaUsuario` materializa essa dimensão por usuário+conversa. Ele conserva a última mensagem realmente lida, o instante correspondente, a marca pessoal e uma versão. A lista calcula novas entradas depois desse ponto; ausência do marcador não concede acesso e não altera o estado de entrega da mensagem.

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

O atendimento nasce com UUID interno e protocolo `PENDENTE`. Somente um valor confirmado pelo ERP muda o estado para `OFICIAL`; o valor oficial é imutável. Tentativa, timeout, falha e reconciliação pertencem à operação recuperável, não viram estados do protocolo. Resposta perdida ou resultado incerto exige reconciliação conservadora, nunca nova criação cega.

A porta ERP materializada na PR 020 não antecipa a entidade persistente: `INDISPONIVEL` com `efeitoExternoPossivel: false` mantém o protocolo pendente; `RESULTADO_INCERTO` significa que o efeito pode existir e exige `reconciliarCriacaoAtendimento`. Apenas `CONFIRMADO`, vindo da criação ou da reconciliação, contém `protocoloOficial`. O simulador nunca gera número local de contingência.

A PR 063 liga o protocolo pendente a uma operação PostgreSQL com escopo, assinatura do comando, concessão e histórico de tentativas. `PENDENTE` ou falha comprovadamente anterior ao efeito permite execução; `RESULTADO_INCERTO` permite somente reconciliação. Se a reconciliação comprovar `EFEITO_AUSENTE`, uma nova execução pode ser agendada com a mesma chave; indisponibilidade mantém o caminho conservador. A confirmação grava o protocolo oficial e conclui a operação na mesma transação local. Repetição compatível devolve a conclusão existente, e valor oficial divergente continua sendo conflito.

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

### 12.1 Elegibilidade de desbloqueio de confiança

A verificação é leitura e não produz efeito externo. Ela exige atendimento aberto, fila autorizada, contrato ativo exatamente igual ao contexto atual e permissão `VERIFICAR_DESBLOQUEIO_CONFIANCA`. Depois da autorização local, uma nova consulta ao ERP precisa responder com origem `TEMPO_REAL`; indisponibilidade ou capacidade ausente não cai para snapshot.

O resultado final é elegível somente quando o ERP autoriza e não existe desbloqueio confirmado do mesmo contrato nos 30 dias anteriores. O intervalo é de 30 × 24 horas a partir de `confirmado_em`; no instante exato do término, a restrição local deixa de bloquear. `RegistroDesbloqueioConfianca` é histórico imutável ligado ao atendimento e à operação recuperável que confirmou o efeito.

A execução é um comando separado com `confirmacao_explicita`, chave idempotente e permissão `EXECUTAR_DESBLOQUEIO_CONFIANCA`. Após uma nova verificação ERP em tempo real, o backend serializa pelo contrato, revalida autorização, contexto e histórico e cria uma única `ReservaDesbloqueioConfianca`. A reserva impede duas chaves distintas de produzirem efeitos concorrentes. Confirmação externa grava histórico, conclui a operação, audita e libera a reserva na mesma transação. Resposta perdida mantém operação e reserva em estado incerto; somente reconciliação pode confirmar o efeito ou comprovar ausência e liberar nova tentativa. O instante confirmado é o instante local de recebimento da confirmação normalizada, não um relógio fornecido pelo ERP.

### 12.2 Ordem de serviço do ERP

`OrdemServicoErp` é o registro local de uma criação externa confirmada. Ela pertence a um único `Atendimento`, fixa o protocolo oficial e o contexto de cliente/contrato usados no efeito, preserva o identificador externo somente na fronteira de integração e nasce na versão 1. Assunto e descrição atual são protegidos; a descrição também possui hash para comparação sem exposição. Uma operação recuperável de criação só pode produzir uma ordem, e um identificador externo confirmado só pode pertencer a uma ordem.

Cada alteração confirmada incrementa a versão exatamente uma vez e acrescenta `HistoricoAtualizacaoOrdemServicoErp`, imutável e único pela operação e pela versão resultante. `ReservaAtualizacaoOrdemServicoErp` permite somente uma operação pendente por ordem; outra chave não pode atravessá-la. Confirmação externa atualiza a ordem, acrescenta o histórico, conclui a idempotência, audita e libera a reserva atomicamente. Resposta perdida mantém a reserva até a reconciliação confirmar o efeito ou comprovar sua ausência.

Criação e atualização exigem `confirmacao_explicita`, chave idempotente, atendimento aberto, escopo de fila, contexto corrente e `ProtocoloErp(OFICIAL)` exatamente correspondentes. A permissão aprovada `CRIAR_ORDEM_SERVICO` governa as duas mutações na V1; uma atualização não amplia esse poder para outras capacidades ERP. Snapshot nunca autoriza nenhuma delas, e a mesma chave não pode representar comandos com assunto, descrição ou contexto diferentes.

### 12.3 Comentário e encerramento no ERP

`RegistroAcaoAtendimentoErp` prova uma ação externa confirmada, ligada a uma única operação recuperável e classificada como `COMENTARIO` ou `ENCERRAMENTO`. Protocolo oficial e hash do conteúdo são persistidos; comentário e motivo não entram em claro nesse histórico nem na auditoria. Comentário confirmado não altera estado, modo, atribuição ou timeline pública do atendimento.

O encerramento usa `ReservaEncerramentoAtendimentoErp`, única por atendimento, e fixa as versões de estado e atribuição observadas antes do efeito. A chamada externa ocorre fora da transação. Apenas `CONFIRMADO` aplica a transição `ENCERRAR` da máquina local, fecha o intervalo de atribuição, acrescenta evento, registra a ação, conclui a operação, audita e libera a reserva atomicamente. Indisponibilidade comprovadamente anterior ao efeito preserva o atendimento e libera a reserva; resposta perdida mantém atendimento aberto, operação incerta e reserva até reconciliação. Outra chave não atravessa a reserva.

Os dois comandos usam `ENCERRAR_ATENDIMENTO`, pois o comentário coberto pela V1 pertence ao fluxo de finalização, e exigem `confirmacao_explicita`, atendimento aberto, fila autorizada e `ProtocoloErp(OFICIAL)` exato. Não existe ação de comentário ERP genérico fora desse fluxo. Link público de transcrição não é uma ação disponível: a política retorna `DESATIVADO`, sem gerar token ou URL, até aprovação jurídica/DPO e evidência real do MK.

Sessão de acesso usa porta própria e estados `ATIVA`, `INATIVA` ou `DESCONHECIDA`. Conexão cadastrada, contrato ativo ou presença em snapshot nunca promove o estado para `ATIVA`. `NAO_CONFIGURADO` e `DESATIVADO` são disponibilidade do recurso/fonte, não estados da sessão. Desconexão só pode atingir sessão explicitamente `ATIVA`; resposta perdida vira `RESULTADO_INCERTO` e exige reconciliação.

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

## 16. Catálogo versionado do Motor de Fluxos

Desde a PR 069, `Fluxo` é a identidade estável de uma automação e `VersaoFluxo` é uma definição numerada pertencente a ela. Um fluxo nasce ativo com a versão 1 em `RASCUNHO`; novas definições sempre criam outra versão ou alteram um rascunho por revisão esperada. Nome normalizado é único, número é único dentro do fluxo e a definição é um objeto JSON controlado, limitado a 256 KiB e versionado por `versao_schema_definicao`.

```text
RASCUNHO → EM_TESTE → PUBLICADA → ARQUIVADA
```

`Fluxo.versao_publicada_id` pode ser nulo, mas, quando preenchido, aponta obrigatoriamente para uma versão do mesmo fluxo em `PUBLICADA`. Existe no máximo uma versão publicada por fluxo. Definição, numeração, autoria e instante de publicação de versões publicadas ou arquivadas são imutáveis no PostgreSQL, e nenhuma versão pode ser excluída. Mudança de estado e troca do ponteiro pertencem ao serviço de publicação da PR 070; o catálogo da PR 069 não publica por atalho.

Toda execução futura deve copiar `fluxo_id` e o `versao_fluxo_id` indicado no instante da criação. Publicar outra versão afeta somente execuções novas; execução já iniciada nunca consulta novamente o ponteiro nem migra de definição silenciosamente.

Na PR 070, toda troca do ponteiro incrementa `Fluxo.revisao` e acrescenta `HistoricoPublicacaoFluxo` com tipo `PUBLICACAO`, `ARQUIVAMENTO` ou `REVERSAO`, versão anterior, nova versão, ator e instante. Publicar aceita somente versão em `EM_TESTE`; arquivar deixa o fluxo sem versão publicada; reverter reativa uma versão `ARQUIVADA` sem alterar sua definição ou autoria original. A versão atual é arquivada na mesma transação. O histórico é imutável inclusive contra `TRUNCATE` e suas versões precisam pertencer ao fluxo.

Na PR 071, somente `ServicoValidacaoPublicacaoFluxos` pode promover `RASCUNHO` para `EM_TESTE`. A operação exige `PUBLICAR_FLUXO`, revisão esperada, fluxo ativo e validação integral da definição contra o contexto autoritativo obtido no servidor. A alteração condicional e a auditoria compartilham a transação. Definição inválida, capacidade desligada, referência inativa ou corrida de revisão preserva o rascunho e não registra sucesso.

## 17. Máquina persistente de `ExecucaoFluxo`

Desde a PR 072, iniciar uma automação fixa `atendimento_id`, `fluxo_id`, `versao_fluxo_id` e `no_atual_id`. O início só ocorre para atendimento `AGUARDANDO/BOT/PROCESSANDO_BOT`, sem responsável humano, e para a versão que ainda é o ponteiro `PUBLICADA` do fluxo ativo no instante da inserção. Repetir o início devolve a execução ativa do mesmo fluxo; nunca consulta um ponteiro novo para migrá-la. Um índice parcial impede duas execuções não terminais no mesmo atendimento.

Estados não terminais são `EXECUTANDO`, `AGUARDANDO_RESPOSTA`, `AGUARDANDO_SISTEMA` e `AGUARDANDO_ATENDENTE`. Estados terminais são `SUSPENSA_POR_ATENDIMENTO_HUMANO`, `CONCLUIDA`, `FALHOU` e `CANCELADA`. Terminal exige instante e código de finalização, não possui `retomar_em` e é imutável. Toda transição incrementa `revisao`, preserva a versão fixada e usa alteração condicional por estado e revisão esperados. PostgreSQL repete a matriz de transição, protege a identidade e recusa update/delete terminal.

O contexto nasce vazio e protegido; a PR 072 não oferece escrita arbitrária nele. `PassoExecucaoFluxo`, agendamento recuperável, worker e nós permanecem fora deste PR.

### Passos de execução e mensagens automáticas

`PassoExecucaoFluxo` registra uma tentativa de nó pela revisão corrente da execução. O par `execucao_fluxo_id + revisao_execucao` é único. O passo nasce `INICIADO` e termina uma única vez como `CONCLUIDO` ou `FALHOU`; identidade, entrada sanitizada e histórico são imutáveis. Conteúdo de mensagem, contexto protegido e dado de cliente não pertencem ao passo.

Uma mensagem automática só pode nascer quando a própria execução continua `EXECUTANDO` na revisão esperada e o atendimento permanece `AGUARDANDO/BOT/PROCESSANDO_BOT`, sem responsável humano. Ela não possui usuário remetente, preserva conversa, atendimento e conta de origem e entra em `NA_FILA`. Mensagem, evento, caixa de saída, passo e avanço do nó compartilham a transação. Perda da autoridade BOT produz falha definitiva do nó e nenhum envio.

## 18. Agendamento e recuperação de `ExecucaoFluxo`

Desde a PR 073, uma execução `EXECUTANDO` pode ser agendada para um instante estritamente futuro. A transição resulta em `AGUARDANDO_SISTEMA`, persiste `retomar_em` e incrementa a revisão. `retomar_em` só pode existir nesse estado; retomada anterior ao instante é recusada pela máquina e pelo PostgreSQL.

O job é a própria condição persistida `estado = AGUARDANDO_SISTEMA AND retomar_em <= agora`. Workers selecionam lotes ordenados com `FOR UPDATE SKIP LOCKED`, de modo que execuções distintas podem progredir em paralelo e uma execução possui somente um vencedor. A retomada muda para `EXECUTANDO`, limpa `retomar_em`, incrementa a revisão e audita na mesma transação.

Não existe identidade de job mantida apenas no Redis nem temporizador longo em memória. Queda antes do commit conserva a execução agendada; queda depois do commit conserva a execução já retomada. A PR 073 não executa o nó retomado, não altera contexto e não produz efeito Meta/ERP.

## 19. Esperas e horário de atendimento

Desde a PR 076, `retomar_em` pode existir em `AGUARDANDO_SISTEMA` ou `AGUARDANDO_RESPOSTA`, sempre estritamente depois de `atualizada_em`. A espera guarda sob `esperasFluxo[no_id]` apenas o tipo, o instante canônico e a marca booleana de resposta. Essa marca não é conteúdo da mensagem e nunca entra em passo ou auditoria.

`AGUARDAR/RESPOSTA` persiste o timeout e fica `AGUARDANDO_RESPOSTA`. A entrada válida marca a resposta e retoma antecipadamente na mesma transação; a máquina e o trigger recusam `RETOMAR` prematuro sem essa evidência. Ao vencer sem resposta, o worker retoma pelo mesmo mecanismo PostgreSQL e o nó segue `TIMEOUT`. `AGUARDAR/ATE_INSTANTE` usa `AGUARDANDO_SISTEMA` e segue `CONCLUIDO` ao vencer. O primeiro processamento termina seu passo como `AGENDADO`; a retomada cria novo passo na nova revisão e só então avança o grafo.

`HORARIO_ATENDIMENTO` não possui parâmetros nem variáveis e referencia exatamente um `Calendario` ativo. `ABERTO` segue `DENTRO_HORARIO`; `FECHADO` segue `FORA_HORARIO`; calendário ausente ou inválido segue `FALHA` com código canônico. Fuso, períodos, feriados, exceções e overrides continuam pertencendo ao agregado `Calendario`, não à versão do fluxo.

## 20. Identidade e contexto no Motor de Fluxos

Desde a PR 077, `IDENTIFICAR_CONTATO` confirma somente um `ContextoAtendimento` explícito cujo vínculo ainda pertence ao contato do atendimento e continua automatizável. Ausência de contexto, vínculo revogado, alvo divergente ou prova insuficiente resulta em `NAO_IDENTIFICADO`; nenhum candidato é escolhido.

A matriz conservadora permite ao fluxo selecionar somente vínculo `VERIFICADO` com `verificado_em`, ou `MANUAL` com `verificado_em` e usuário verificador. `TEMPORARIO` permanece fora da automação enquanto não existir validade/revalidação modelada. Isso limita seleção de contexto; não amplia autorização para ações de risco médio ou alto, que continuam aplicando a própria política e dado em tempo real.

`SELECIONAR_CLIENTE` recebe exatamente um `vinculo_cliente_id` escolhido em variável `UUID` sensível e limpa qualquer contrato anterior. `SELECIONAR_CONTRATO` exige contexto de cliente e recebe um `vinculo_contrato_id` ativo pertencente ao mesmo vínculo. A seleção cria ou incrementa a versão do contexto com origem `FLUXO`; repetição do mesmo alvo é idempotente. Auditoria conserva apenas UUIDs internos, fluxo e versão. Nome, documento, telefone, username e identificadores externos não entram no passo nem na auditoria.

## 21. Fatura no Motor de Fluxos

Desde a PR 078, a seleção de fatura pertence ao contexto protegido de `ExecucaoFluxo` e fixa versão do `ContextoAtendimento`, contrato externo, fatura externa, situação, valor e vencimento observados em `TEMPO_REAL`. Ela nunca entra em `PassoExecucaoFluxo`, auditoria ou log. Uma nova consulta substitui ou remove a seleção; um envio confirmado a consome, obrigando nova consulta antes de outro envio.

`CONSULTAR_FATURAS` considera pagável somente `ABERTA` ou `VENCIDA`. Zero resultado segue `NAO_ENCONTRADA`; exatamente um segue `ENCONTRADA`; mais de um segue `FALHA/SELECAO_FATURA_NECESSARIA`, pois ordem externa não é decisão de domínio. `INDISPONIVEL` segue `ERP_INDISPONIVEL`. Snapshot nunca participa.

`ENVIAR_FATURA` exige a seleção corrente, reconsulta base, documento e dados de pagamento e confirma novamente contrato e situação. `ComposicaoSegundaVia` é acrescentada no PostgreSQL com opções protegidas e hash. A mensagem automática, composição, evento, caixa de saída, auditoria sanitizada, passo e avanço compartilham o commit. A auditoria registra somente flags e UUIDs internos; referência externa, valor, Pix, linha e conteúdo ficam fora. Documento normalizado sem ponte privada de mídia não vira Base64, URL ou anexo fictício e força `DADOS_INCOMPLETOS`.

## 22. Formulário de canal no Motor de Fluxos

`SOLICITAR_FORMULARIO_WHATSAPP` possui exatamente uma referência interna `FORMULARIO_WHATSAPP`, nenhuma variável e somente `textoFallback`. O recurso precisa estar `ATIVO` e pertencer à `ContaWhatsApp` de origem do atendimento no instante da execução. Ausência, inatividade ou conta divergente segue `FALHA/FORMULARIO_INDISPONIVEL` sem mensagem. Na PR 079 não existe capacidade real registrada para a solicitação estruturada; um cadastro válido produz mensagem automática idempotente e segue `FALLBACK`, nunca `ENVIADO` fictício.

`SubmissaoFormularioCanal` nasce somente de mensagem de entrada e de `SubmissaoFormulario` já normalizada pelo adapter. Atendimento, conversa, contato e conta são derivados da mensagem persistida, não recebidos como autoridade do cliente. Locks por mensagem e referência precedem a consulta das duas chaves únicas. Repetição com o mesmo hash devolve o primeiro registro e não cria outro evento; reutilização divergente falha fechada. A submissão é imutável e o evento `SUBMISSAO_FORMULARIO_RECEBIDA` recebe somente a referência interna do formulário, que o sanitizador persiste como protegida, com classificação sensível.

## 23. Protocolo e ordem de serviço no Motor de Fluxos

`CRIAR_ATENDIMENTO` garante o `ProtocoloErp` do atendimento corrente. Protocolo já `OFICIAL` percorre `CRIADO` sem nova operação; `PENDENTE` usa a criação/reconciliação recuperável da PR 063 com chave estável por execução e nó. A definição não aceita protocolo, cliente, contrato, assunto externo ou chave idempotente.

`CRIAR_ORDEM_SERVICO` é risco alto. A versão guarda somente assunto, descrição e `confirmacaoExplicita: true`; cliente, contrato e protocolo oficial são derivados do atendimento. Antes de conceder e novamente antes de confirmar, o serviço exige atendimento `AGUARDANDO/BOT` sem fila atual nem responsável, execução `EXECUTANDO` da mesma versão, vínculo automatizável verificado, contrato ativo no contexto e protocolo oficial. Fila continua obrigatória para a ação humana, mas não é fabricada para automação. A auditoria usa origem `FLUXO`, sem usuário ou sessão fabricados. A mesma execução+nó representa uma única OS, inclusive em repetição e reconciliação.

## 24. Desbloqueio de confiança pelo Motor de Fluxos

`VERIFICAR_DESBLOQUEIO_CONFIANCA` e `EXECUTAR_DESBLOQUEIO_CONFIANCA` são nós distintos. A verificação não produz escrita: deriva o contrato do contexto ativo, exige autoridade automatizada exata e combina consulta ERP `TEMPO_REAL` com o histórico local imutável de 30 × 24 horas. O passo recebe somente `ELEGIVEL`, `NAO_ELEGIVEL`, `INDISPONIVEL` ou `FALHA`; contrato, motivos e instantes não entram no diagnóstico.

A execução exige `confirmacaoExplicita: true`, refaz a elegibilidade em tempo real e reutiliza o lock, a reserva única por contrato, a operação recuperável e a auditoria do serviço de domínio. Atendimento deve continuar `AGUARDANDO/BOT`, sem fila/responsável, com a mesma execução/versão e vínculo automatizável verificado. A definição não escolhe contrato, fila ou chave. A chave estável deriva de execução+nó; resposta ambígua segue `RESULTADO_INCERTO` e somente reconciliação pode confirmar. Auditoria confirmada usa origem `FLUXO`, sem usuário ou sessão fictícios.

## 25. Roteamento humano e encerramento pelo Motor de Fluxos

`TRANSFERIR_PARA_FILA` referencia exatamente uma fila interna ativa e somente pode sair por `TRANSFERIDO` para `AGUARDAR_ATENDENTE` da mesma fila, ou por `FALHA`. O serviço serializa atendimento, histórico e fila; confirma a identidade exata da execução/fluxo/versão e aceita apenas `AGUARDANDO/BOT/PROCESSANDO_BOT`, sem fila ou responsável. O commit muda para `AGUARDANDO/FILA_HUMANA/AGUARDANDO_HUMANO`, abre `ENTRADA_FILA`, incrementa versões e acrescenta evento/auditoria com ator `FLUXO`, sem fabricar usuário ou sessão.

`AGUARDAR_ATENDENTE` conserva a fila referenciada e persiste timeout em `retomar_em`, estado `AGUARDANDO_ATENDENTE` e marcador protegido do nó. Resgate humano confirmado faz a execução terminar em `SUSPENSA_POR_ATENDIMENTO_HUMANO`; vencimento reconstruído pelo PostgreSQL segue `TIMEOUT`. Fila, estado ou execução divergente seguem `FALHA`, sem reparar contexto implicitamente.

`ENCERRAR_ATENDIMENTO` exige motivo fechado e fila ativa de fallback. Sob a mesma autoridade BOT, aplica a máquina de atendimento para `ENCERRADO_REABRIVEL`, congela o fallback e a tolerância de 30 minutos e conclui a execução. Uma nova entrada válida pode reabrir na fila congelada, mas nunca retoma a execução terminal. Motivo fica no atendimento protegido e não entra em passo, evento, log ou auditoria.

## 26. Autoridade de saída automática

Mensagem automática é identificada pela execução de origem e pela `versao_atribuicao` observada quando nasceu. Ela só pode iniciar envio em `NA_FILA` se o atendimento ainda estiver `AGUARDANDO/BOT/PROCESSANDO_BOT`, sem responsável, na mesma versão de atribuição, e se a execução de origem não estiver cancelada, falha ou suspensa por atendimento humano.

Criação, despacho e mudança de autoridade serializam pelo atendimento. Sob esse lock, `NA_FILA → ENVIANDO` precede a chamada ao canal e o resultado volta a um estado persistente antes do commit. Resgate confirmado cancela todas as automáticas ainda `NA_FILA`; mensagem já aceita pelo canal permanece `ENVIADA`. Depois do commit humano, uma criação ou tentativa atrasada relê a autoridade, falha fechada e não chama o canal. Mensagens humanas e disparos transacionais não recebem origem de execução e conservam suas próprias regras.
