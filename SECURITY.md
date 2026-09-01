# Segurança — Omnichannel V1

## 1. Modelo de confiança

Nenhum cliente é confiável: aplicativo, web, WhatsApp Flow, webhook, ERP, worker, cache e configuração administrativa podem enviar dados inválidos, repetidos, antigos ou maliciosos.

O backend é a autoridade para:

- autenticação e sessão;
- identidade do contato e contexto de cliente;
- autorização RBAC e escopo por fila/recurso;
- estados e transições;
- janela Meta;
- elegibilidade e execução de ações ERP;
- idempotência;
- geração de URL de mídia/transcrição;
- filtragem de eventos realtime e sync.

Web e mobile nunca recebem credenciais da Meta, MK, storage ou banco e nunca chamam esses serviços diretamente.

`ContaWhatsApp` guarda somente identidade operacional e referência externa minimizada. Token, segredo, certificado ou material equivalente não pode ser coluna dessa entidade, campo de domínio, evento ou auditoria. O cadastro exige `ADMINISTRAR_INTEGRACOES`, começa `INATIVA`, usa constraints para identidade externa/telefone e conserva histórico sem operação de exclusão. Credenciais futuras ficam no cofre do ambiente e só são resolvidas dentro do adaptador por `conta_whatsapp_id`.

Eventos internos e itens da caixa de saída persistem somente dados minimizados e sanitizados. Eles não carregam payload externo bruto, segredo ou autorização; projeção ao cliente continua sujeita à permissão atual e só ocorre após commit.

Aplicações máquina-a-máquina usam um segredo aleatório de alta entropia por ambiente. `AplicacaoIntegracao` persiste somente SHA-256, compara em tempo constante e pode ser inativada. O segredo bruto não integra comando persistido, evento, auditoria ou log. Disparo transacional exige consentimento concedido no contato, conta e finalidade exatos; a validação ocorre no domínio e novamente no PostgreSQL antes de uma mensagem entrar em `NA_FILA`.

## 2. Ativos protegidos

- conversas, mensagens, mídias, formulários e notas internas;
- identidade WhatsApp, telefone, CPF/CNPJ e endereço;
- dados financeiros, Pix, linha digitável, faturas e contratos;
- protocolos, ordens de serviço e ações de desbloqueio;
- sessões de usuário e dispositivos;
- permissões, filas, fluxos, flags e releases;
- tokens/chaves da Meta, MK, push, storage e backups;
- auditoria, logs, métricas e diagnóstico;
- disponibilidade e integridade do atendimento.

## 3. Serviços de segurança centralizados

As verificações não ficam espalhadas em controllers. Todos os módulos reutilizam componentes equivalentes a:

```text
ServicoAutorizacao
ServicoProtecaoDados
ServicoAuditoria
ServicoIdempotencia
ServicoValidacaoArquivo
ServicoSanitizacaoLog
ServicoPoliticaIdentidade
```

Controller escondendo botão, filtro na UI ou `if` local não substitui esses serviços.

## 4. Autenticação e sessões

### 4.1 Mobile

- primeiro login por credencial ou pareamento QR;
- refresh token rotativo, opaco, vinculado ao dispositivo e armazenado em Keychain/Keystore;
- biometria destrava o aplicativo; não substitui autenticação no servidor;
- máximo de dois dispositivos móveis por usuário;
- terceiro dispositivo revoga automaticamente o mais antigo e informa o usuário;
- revogação por troca de senha, suspeita, aparelho perdido ou ação administrativa;
- sessão revogada deixa de sincronizar, abrir WebSocket ou emitir novas URLs de mídia. Uma URL S3 já assinada pode permanecer válida até seu TTL curto; revogação imediata exigiria download intermediado por token introspectável/revogável.
- acesso ao cache sem rede exige autorização offline assinada com validade máxima de 4 horas, vinculada a instalação, usuário, dispositivo, sessão, versão de permissões e escopos; revogação conhecida invalida imediatamente e aparelho totalmente offline bloqueia o cache ao expirar.

A PR 015 materializa a sessão mobile separada da web. Access e refresh tokens têm 256 bits aleatórios; o PostgreSQL recebe somente SHA-256. O access token vale 15 minutos e permanece apenas na memória do app. O refresh token tem limite absoluto de 30 dias, é guardado com o segredo de vínculo em Keychain/Keystore e rotaciona a cada renovação. Cada requisição autenticada apresenta access token, UUID do dispositivo e segredo da instalação; estado do usuário, dispositivo e sessão são revalidados no servidor. Refresh já utilizado é prova de replay: a sessão inteira é revogada e o fato auditado. A trilha de força bruta persiste somente hashes do identificador e da instalação, IP, resultado e instante; senha, tokens e segredo de vínculo nunca entram em log ou auditoria.

A PR 016 torna o PostgreSQL autoridade do limite de dois aparelhos. Login de uma instalação nova serializa todos os dispositivos do usuário, revoga o ativo com `ultimo_acesso_em` mais antigo e encerra suas sessões antes de criar o terceiro; a resposta informa que houve substituição. O usuário lista somente os próprios aparelhos ativos e pode revogar qualquer um, inclusive o atual. Revogação administrativa exige sessão web, CSRF, origem permitida e `ADMINISTRAR_USUARIOS`. Alvo de outro usuário converge para negação sem vazamento. Toda revogação informa motivo, encerra todas as sessões do aparelho e gera auditoria.

Após o commit, access e refresh daquele aparelho perdem autoridade imediatamente. Sincronização e WebSocket chamam `ServicoAutenticacaoMobile.autenticar` no handshake e novamente em heartbeat/comandos; uma conexão não conserva um contexto autenticado indefinidamente. A PR 056 materializou o gateway e a PR 058 acrescentou essa revalidação contínua: falha encerra a conexão com código privado `4003`, sem revelar o motivo interno ao cliente.

### 4.2 Pareamento QR

O QR:

- contém somente token efêmero, nunca senha ou refresh token;
- é aleatório, de uso único e validade curta;
- é vinculado à sessão web que o criou;
- exige confirmação no backend/web antes de emitir sessão mobile;
- é invalidado após uso, expiração, logout ou cancelamento;
- vale 90 segundos, admite somente um QR ativo por sessão web e a geração de outro invalida o anterior;
- possui rate limit e auditoria de criação, tentativa e vínculo.

O limite inicial é de 5 gerações em 10 minutos por usuário e 10 tentativas de resgate em 10 minutos por IP/dispositivo.

A PR 017 materializa esse protocolo em seis estados persistentes: `AGUARDANDO_RESGATE`, `AGUARDANDO_CONFIRMACAO`, `CONFIRMADO`, `CONCLUIDO`, `CANCELADO` e `EXPIRADO`. Token do QR e comprovante de resgate possuem 256 bits aleatórios e entram no PostgreSQL somente por SHA-256. O resgate troca o token visível no QR por um comprovante diferente, de uso exclusivo do app e vinculado ao hash do identificador da instalação, ao segredo de vínculo, à plataforma, à versão e ao modelo sanitizado. O navegador recebe apenas estado e prévia do aparelho; nunca recebe comprovante, access token ou refresh token.

Geração exige sessão web+CSRF+origem. Confirmação exige a mesma sessão web e autenticação realizada há no máximo 10 minutos. Resgate, consulta e conclusão são serializados no PostgreSQL; uma conclusão confirmada cria dispositivo/sessão mobile e finaliza o pareamento no mesmo commit. Logout ou qualquer revogação da sessão web cancela seus pareamentos pendentes. Tentativas persistentes e locks independentes por IP, instalação e token impedem que concorrência ou múltiplas APIs contornem os limites; Redis não é autoridade.

### 4.3 Web

- cookie de sessão `HttpOnly`, `Secure` e `SameSite`;
- máximo de duas sessões simultâneas;
- terceira sessão exige aviso/confirmação antes de revogar a mais antiga;
- expiração após 12 horas de inatividade;
- logout global e revogação administrativa;
- reautenticação pode ser exigida para mudanças críticas de integração, permissão ou segurança;
- SSE reutiliza o cookie e valida origem/escopo.
- o shell confirma a sessão antes de renderizar conteúdo protegido e volta ao login em expiração ou revogação;
- senha, token de sessão e CSRF não entram em `localStorage` ou `sessionStorage`; o JavaScript lê somente a cópia não `HttpOnly` do CSRF para mutações;
- `PERMISSOES_ALTERADAS` invalida a composição atual e provoca nova autorização no backend; itens de navegação nunca são fonte de autoridade.

A PR 058 faz o SSE revalidar a sessão em cada ciclo de consulta. Sessão revogada encerra o stream. Mudança de permissão entrega primeiro `PERMISSOES_ALTERADAS` ao usuário exato e então conclui a resposta, obrigando nova consulta autorizada; o cookie não congela o escopo existente na abertura.

O token de sessão e o token CSRF possuem 256 bits aleatórios e são persistidos somente por hash. O cookie de sessão usa o prefixo `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` e não declara `Domain`; o CSRF é vinculado à sessão e deve coincidir em cookie e header. Toda mutação de autenticação também exige `Origin` HTTPS presente na allowlist. Rotação troca ambos os segredos por atualização atômica condicionada ao token atual e renova o limite de inatividade.

A PR 014 serializa por usuário a contagem e a criação no PostgreSQL. Duas sessões permanecem ativas; a terceira tentativa válida responde `CONFIRMACAO_REVOGACAO_SESSAO_NECESSARIA` sem criar ou revogar sessão. Uma repetição com confirmação explícita revoga a mais antiga e cria a nova na mesma transação. Atividade confirmada renova a janela de 12 horas em intervalos controlados; sessão vencida perde autoridade imediatamente. Logout global, revogação remota pelo próprio usuário e revogação administrativa são condicionais, protegidos por CSRF/origem e auditados. Revogação administrativa também exige `ADMINISTRAR_USUARIOS` no serviço central.

Tentativas usam janela persistente de 15 minutos: cinco falhas por identificador normalizado+IP ou cinquenta por IP bloqueiam novas verificações. O identificador aparece nessa trilha somente por SHA-256; senha nunca é registrada. Usuário inexistente executa Argon2id simulado e recebe a mesma resposta de senha incorreta. Conta privilegiada sem segundo fator concluído não recebe sessão (`MFA_NECESSARIO`).

### 4.4 Credenciais, MFA e força bruta

- senha aceita de 12 a 128 caracteres, inclusive espaços, sem regra artificial de composição;
- senha comum ou conhecida como comprometida é recusada; não há troca periódica sem indício de risco;
- armazenamento usa Argon2id calibrado para 100–250 ms no servidor; ponto inicial: 64 MiB, 3 iterações e paralelismo 1;
- MFA é obrigatório para Administrador e quem administra usuários/integrações, publica fluxo ou exporta histórico;
- fatores da V1: TOTP e códigos de recuperação de uso único; SMS/WhatsApp não servem como fator único;
- MFA para todos os atendentes pode ser configurado depois sem remover a obrigação dos privilegiados; WebAuthn pode ser acrescentado por decisão própria sem enfraquecer TOTP;
- ação administrativa crítica e confirmação de novo aparelho exigem autenticação realizada há no máximo 10 minutos;
- recuperação de credencial invalida sessões e refresh tokens e gera auditoria/alerta.

- rate limit por conta, IP, dispositivo e endpoint, sem depender de um único sinal;
- atraso progressivo e bloqueio técnico temporário;
- resposta que não confirma se o usuário existe;
- auditoria e alerta de padrão anômalo;
- 5 falhas em 15 minutos por conta+IP bloqueiam por 15 minutos; o teto adicional é 50 tentativas em 15 minutos por IP.

## 5. Autorização: RBAC + fila + recurso

### 5.1 Papéis base

- `ADMINISTRADOR`: administração global da instalação e todas as filas, respeitando permissões específicas para dado sensível/exportação.
- `SUPERVISOR`: supervisiona apenas filas autorizadas; pode assumir atendimentos desse escopo.
- `ATENDENTE`: atua somente nas filas e ações explicitamente concedidas.
- Perfil personalizado: papel base com permissões adicionadas/removidas.

Financeiro, Suporte e Comercial são filas, não papéis.

O schema não atribui perfil ao criar usuário, não cria vínculo automático de fila e não semeia concessão. `PermissaoPerfil` registra ajuste explícito `CONCEDER` ou `NEGAR`; a matriz efetiva dos papéis e a decisão central entram na PR 012. Até essa decisão existir, ausência de regra, perfil ou escopo permanece negação.

A matriz conservadora inicial da PR 012 é:

- `ADMINISTRADOR`: visualizar filas, administrar usuários/filas/integrações/releases e visualizar/editar/testar/publicar/reverter fluxos;
- `SUPERVISOR`: visualizar/resgatar/transferir/receber/encerrar/reabrir/assumir atendimentos, adicionar/visualizar nota e solicitar formulário nas filas vinculadas;
- `ATENDENTE`: visualizar/resgatar/transferir/receber/encerrar atendimentos, adicionar/visualizar nota e solicitar formulário nas filas vinculadas.

Um ajuste `NEGAR` sempre prevalece sobre a matriz; `CONCEDER` libera capacidade ausente. `VISUALIZAR_HISTORICO_TRANSVERSAL`, `VISUALIZAR_NOTAS_TRANSVERSAIS`, `VISUALIZAR_DADO_SENSIVEL` e `EXPORTAR_HISTORICO` não pertencem a papel base algum. Administrador alcança todas as filas ativas para permissões que já possui, mas isso não cria permissão sensível, transversal ou de exportação.

### 5.2 Regra de decisão

Toda leitura/escrita valida:

```text
sessão válida
E usuário ativo
E permissão da ação
E acesso à fila/escopo
E acesso ao recurso concreto
E estado atual permite a ação
```

Ausência de regra significa negar. O backend retorna `403 PERMISSAO_NEGADA`, sem vazar existência ou conteúdo do recurso.

`ServicoAutorizacao` executa essa ordem e só então chama o verificador do recurso concreto. UUID inexistente, recurso de outra fila, ausência de permissão e estado que impede a ação produzem o mesmo erro externo. Sessão ausente, revogada ou expirada produz apenas `401 NAO_AUTENTICADO`. Quando houver mutação, autorização e consulta do recurso podem participar da mesma transação curta; o recurso deve ser filtrado no banco, não carregado em massa para filtragem em memória.

### 5.3 Permissões iniciais

Lista de base a ser congelada no PR de RBAC:

```text
VISUALIZAR_FILA
RESGATAR_ATENDIMENTO
TRANSFERIR_ATENDIMENTO
RECEBER_TRANSFERENCIA
ENCERRAR_ATENDIMENTO
REABRIR_ATENDIMENTO
ASSUMIR_ATENDIMENTO
ADICIONAR_NOTA_INTERNA
VISUALIZAR_NOTA_INTERNA

CONSULTAR_CLIENTE
VINCULAR_CLIENTE
ALTERAR_CONTEXTO_CLIENTE
CONSULTAR_CONTRATO
CONSULTAR_FINANCEIRO
ENVIAR_FATURA
VERIFICAR_DESBLOQUEIO_CONFIANCA
EXECUTAR_DESBLOQUEIO_CONFIANCA
CONSULTAR_SESSAO_ACESSO
DESCONECTAR_SESSAO_ACESSO
CRIAR_ORDEM_SERVICO

SOLICITAR_FORMULARIO_WHATSAPP

VISUALIZAR_FLUXO
EDITAR_FLUXO
TESTAR_FLUXO
PUBLICAR_FLUXO
REVERTER_FLUXO

VISUALIZAR_HISTORICO_TRANSVERSAL
VISUALIZAR_NOTAS_TRANSVERSAIS
VISUALIZAR_DADO_SENSIVEL
EXPORTAR_HISTORICO

ADMINISTRAR_USUARIOS
ADMINISTRAR_FILAS
ADMINISTRAR_INTEGRACOES
ADMINISTRAR_RELEASES
```

Consultar e executar são permissões diferentes. Editar um fluxo não concede publicar. Administrador também deixa auditoria ao ver dado sensível ou exportar histórico.

### 5.4 Timeline única com menor privilégio

A timeline é única por contato, mas a API filtra conteúdo por atendimento e permissão, conforme [ARCHITECTURE.md](ARCHITECTURE.md). Quem conduz o atendimento atual vê todas as mensagens cliente↔empresa do mesmo protocolo, inclusive anteriores à transferência. Atendimento histórico exige interseção com ao menos uma fila participante ou `VISUALIZAR_HISTORICO_TRANSVERSAL`.

Nota exige `VISUALIZAR_NOTA_INTERNA` e permanece vinculada à fila em que foi criada. Nota sem interseção de fila exige `VISUALIZAR_NOTAS_TRANSVERSAIS`; nem Administrador recebe essa permissão implicitamente. Permissão transversal de mensagens não concede a de notas. Conteúdo negado não sai da API; quando necessário, somente um separador neutro, sem data, fila, autor ou assunto, pode indicar descontinuidade. Contexto essencial entre filas vira `EventoConversa` sanitizado, nunca nota privada usada como atalho.

A projeção web materializada na PR 088 resolve esses dois escopos de forma independente antes de buscar texto, dados de formulário ou conteúdo de nota. Nota nova grava a fila vigente; o preenchimento histórico é aditivo e registros legados sem fila permanecem negados, salvo permissão transversal explícita. Cursor e identificadores de rota não concedem acesso. Marca de leitura usa chave usuário+conversa e concorrência otimista; toda escrita exige cookie válido, origem permitida e dupla apresentação do CSRF.

## 6. Identidade do contato e risco da ação

BSUID/identificador externo resolve correlação técnica; não prova autorização para agir em nome de qualquer cliente ERP. Username e telefone também não são prova isolada.

A resolução inicial exige `ContaWhatsApp` ativa e usa somente portfólio+identificador estável normalizado. Username, telefone e nome de perfil são atributos opcionais e mutáveis, não chaves nem prova de identidade civil. Auditoria da criação registra apenas presença desses atributos, sem seus valores. Concorrência é serializada no PostgreSQL e a constraint única impede contatos duplicados para a mesma identidade técnica.

Alteração de identificador exige o par explícito anterior→atual já normalizado. As duas chaves são bloqueadas em ordem determinística; alias e evento são persistidos na mesma transação. Conflito, origem ausente ou evento fora de ordem não autoriza merge e produz `SEPARADA_INCERTA`. Auditoria registra somente o resultado, nunca os identificadores, username ou telefone.

Regras:

- vínculo persistente registra método, autor, data e revogação;
- CPF é identificador e pode sustentar a primeira validação aprovada, mas não é autenticação forte universal;
- contexto temporário não vira vínculo preferencial sozinho;
- número reciclado, mudança de identidade ou erro de associação permitem revogação auditada;
- ações usam o cliente/contrato explícitos do atendimento;
- respostas de identificação evitam confirmar excessivamente a existência de cadastro.

A matriz inicial aprovada classifica:

| Risco | Ações iniciais | Controles mínimos |
|---|---|---|
| Baixo | Criar protocolo; consultar cliente/contrato com dados mascarados | contexto explícito, RBAC, anti-enumeração e auditoria quando aplicável |
| Médio | Situação financeira resumida; listar faturas; consultar sessão; trocar contexto temporário | vínculo verificado sem sinal de risco ou revalidação no atendimento; origem em tempo real quando necessária; prévia |
| Alto | Enviar PDF/Pix/linha digitável; criar vínculo persistente; desbloquear; desconectar sessão; criar/alterar OS | ERP em tempo real, cliente e contrato explícitos, revalidação, prévia, confirmação, idempotência e auditoria |

Cada ação concreta registra:

```text
ação
nível de risco
vínculo aceito
revalidação exigida
dados que podem ser exibidos
confirmação necessária
permissão humana/Motor de Fluxos
```

CPF/CNPJ sozinho nunca autoriza risco alto. `REVALIDADO_NO_ATENDIMENTO` exige fator estruturado aprovado e conferido no ERP; risco alto exige segundo fator independente aprovado ou encaminhamento humano. Enquanto capacidade, prova ou linha concreta não estiver caracterizada, a ação fica negada. Desconexão de sessão é somente humana na V1 e não existe como nó do Motor de Fluxos.

## 7. Proteção de dados

### 7.1 CPF/CNPJ

- valor completo criptografado em repouso;
- busca exata por HMAC/índice protegido com chave gerenciada, não hash simples;
- versão mascarada pronta para exibição: `11X.XXX.XXX.84`;
- nunca em push, log comum, erro, analytics, nome de arquivo ou mensagem automática;
- visualização completa exige permissão específica e gera auditoria;
- rotação de chave e reindexação devem possuir procedimento próprio.

### 7.2 Logs e telemetria

Proibido registrar:

```text
senha, sessão, refresh token, token Meta/MK
segredo de webhook, chave privada, chave de API
CPF/CNPJ completo sem necessidade legal específica
Pix Copia e Cola, linha digitável ou código de barras completo
formulário sensível integral
PDF/conteúdo de mídia
payload bruto de autenticação, Meta ou MK
senha Wi-Fi futura ou dados de cartão
```

Sanitização ocorre antes do logger e antes de anexar atributos a spans. `correlacao_id`, IDs internos, códigos normalizados e duração são suficientes para diagnóstico comum.

### 7.3 Retenção

Prazos de histórico, mídia, auditoria e backup e suas bases legais dependem de política aprovada por jurídico/DPO antes do piloto. Até lá, não há autoeliminação nem exclusão individual por atendente, supervisor ou administrador. A implementação deve suportar categorias de retenção, bloqueio legal, anonimização/eliminação controlada e auditoria `RETENCAO_APLICADA`. Eventos incrementais permanecem disponíveis por 30 dias; isso não define retenção do histórico de negócio.

## 8. Segurança de mídia e transcrição

### 8.1 Upload

- allowlist: imagem, áudio, vídeo e PDF;
- validar extensão, MIME, assinatura real e tamanho;
- normalizar nome e ignorar caminho informado pelo usuário;
- scan de malware quando aplicável antes da disponibilização;
- tetos internos iniciais: imagem 8 MB, áudio 16 MB, vídeo 32 MB e PDF 20 MB;
- limite efetivo é o menor entre teto interno e capacidade validada do provedor; excesso vira placeholder seguro sem download irrestrito;
- bucket privado e criptografado;
- download após autorização, por URL assinada curta;
- hash e metadados no PostgreSQL;
- conteúdo nunca é renderizado como HTML executável.

### 8.2 Link de transcrição

- token criptograficamente aleatório e não sequencial;
- vínculo a um único atendimento/protocolo;
- somente mensagens cliente↔empresa e metadados públicos necessários;
- nunca inclui nota, diagnóstico, formulário sensível, log ou ação ERP interna;
- sanitização e proteção contra indexação;
- acesso e exportação auditados quando identificáveis;
- mídia é excluída por padrão;
- se juridicamente liberado, validade padrão de 72 horas, máxima de 7 dias e revogação imediata; token é armazenado por HMAC;
- o recurso público permanece desligado até aprovação jurídica/DPO da política e do conteúdo exportável.

### 8.3 Limites operacionais iniciais

- busca de identidade: 30 requisições por minuto por usuário;
- escrita ERP sensível: 10 por minuto por usuário e 30 por hora por instalação/ação, além de idempotência;
- API transacional ERP: 60 por minuto por credencial, com burst de 20;
- webhook Meta não recebe teto baixo genérico: usa limite de tamanho, assinatura, concorrência e backpressure medidos.

Os valores são configuráveis por ambiente. Caracterização real pode reduzi-los; aumento exige revisão de risco e evidência operacional.

## 9. Web, API e realtime

- consultas ORM/parametrizadas; SQL bruto é excepcional e revisado;
- schema validation e limites em toda entrada;
- proteção CSRF compatível com cookie e validação de origem;
- CORS explícito por ambiente;
- conteúdo do contato sempre escapado/sanitizado contra XSS;
- CSP e headers de segurança no proxy/web;
- SSE/WebSocket autenticados e filtrados no servidor;
- revogação ou perda de fila encerra/renova stream e invalida cache;
- UUID desconhecido e UUID não autorizado produzem resposta indistinguível quando necessário;
- nenhum endpoint recebe URL arbitrária para backend acessar;
- paginação, limites de busca e exportação evitam exfiltração em massa.
- a lista resolve permissão e filas antes de consultar conteúdo e aplica seus seis filtros no PostgreSQL; não carrega atendimentos de outras filas para filtrar no JavaScript;
- telefone secundário é mascarado e BSUID, identificadores externos e conteúdo técnico não entram nos cards.

## 10. Webhook e Meta

Antes de aceitar efeito:

1. verificar método, tamanho e content type;
2. verificar assinatura no corpo esperado pelo provedor;
3. validar schema e conta destinatária;
4. normalizar identidade e evento no adapter;
5. deduplicar por identificador externo/chave de evento;
6. persistir mensagem/evento/item de caixa de saída;
7. confirmar rapidamente ao provedor;
8. processar automação e notificações após commit.

Replay ou duplicidade retorna sucesso compatível sem repetir o efeito. Status fora de ordem é aplicado apenas se representar avanço válido da máquina de mensagem.

## 11. Integrações e SSRF

- destinos definidos por configuração segura/allowlist, não por nó de fluxo ou usuário;
- timeouts, circuit breaker, limite de concorrência e resposta máxima;
- credenciais separadas por ambiente e menor privilégio;
- usuário MK exclusivo, serviços mínimos e IP allowlist/VPN quando possível;
- consultas e escritas podem usar perfis separados;
- URL com token/query sensível nunca é logada;
- resposta externa é tratada como não confiável e validada pelo adapter;
- simulador Meta não recebe segredo, não é registrado no runtime e nunca substitui assinatura, deduplicação PostgreSQL ou validação do webhook real;
- simulador ERP não recebe segredo nem DTO MK, não é registrado no runtime e separa efeito comprovadamente ausente de efeito incerto; memória de teste nunca substitui operação/idempotência PostgreSQL;
- sessão de acesso fica sob controle `SESSAO_ACESSO` desativado; conexão cadastrada nunca prova `ATIVA`, e desconexão exige fonte confiável, estado explícito, confirmação, autorização, idempotência, auditoria e reconciliação de incerteza;
- snapshot desatualizado nunca executa escrita;
- cada escrita externa exige idempotência e auditoria.

### 11.1 Idempotência segura

- a chave de idempotência é UUID aleatório, obrigatória e única apenas dentro de escopo explícito;
- o PostgreSQL armazena somente SHA-256 da chave; a assinatura do comando impede reutilização com conteúdo diferente;
- a assinatura é produzida no backend a partir do comando canônico validado e minimizado; CPF, telefone, linha digitável e outros valores sensíveis ou de domínio pequeno não recebem hash simples;
- token de concessão tem alta entropia, é entregue uma vez e persiste somente como hash;
- concorrência é decidida por constraint e alteração condicional, nunca por verificação exclusiva em memória/Redis;
- expiração, timeout ou resposta perdida produzem `RESULTADO_INCERTO` e exigem reconciliação antes de nova execução;
- códigos e resultados persistidos são normalizados e sanitizados; payload externo bruto, segredo e token não entram no histórico.

## 12. Segurança do Motor de Fluxos

- catálogo de nós controlado pelo código;
- publicar não concede capacidade nem permissão nova;
- nós sensíveis chamam o mesmo serviço de domínio usado por humanos;
- nenhuma execução de JavaScript, SQL, shell ou expressão sem sandbox/contrato aprovado;
- nenhum HTTP genérico ou URL arbitrária na V1;
- schema por tipo de nó;
- referências a fila, template, formulário e recurso são validadas antes de publicar;
- ciclos têm limite de tentativas;
- nós externos têm timeout e saídas de falha;
- versão publicada é imutável;
- execução persistente impede perda após reinício;
- resgate humano suspende automação de modo atômico;
- contexto de execução não armazena segredo desnecessário.

O contexto usado para validar publicação é fornecido exclusivamente pelo backend. Cliente, editor ou definição não podem declarar que uma capacidade está habilitada nem que fila, calendário, modelo ou formulário está ativo. O provedor conservador nega toda referência e capacidade externa até que uma autoridade real seja registrada. Problemas devolvem apenas código e identificadores internos controlados; definição e parâmetros não entram em erro ou auditoria. Uma validação inválida não muda estado nem produz auditoria de sucesso.

`ExecucaoFluxo` não aceita versão, nó ou contexto declarados pelo cliente. O início resolve a versão publicada no servidor e o banco confirma ponteiro, estado e pertencimento no mesmo comando de inserção. Identidade da execução é imutável; uma publicação posterior não a migra. Transição usa comando fechado, código canônico, relógio válido e revisão esperada. Contexto protegido nunca entra em auditoria. Terminal é append-only no sentido operacional: runtime não atualiza, exclui ou retoma o registro, inclusive após reinício.

Agendamento aceita somente `Date` válido, instante futuro e execução `EXECUTANDO` na revisão esperada. O banco limita `retomar_em` a `AGUARDANDO_SISTEMA` e recusa retomada prematura. Workers não recebem payload, segredo ou contexto em fila externa: consultam apenas registros vencidos no PostgreSQL, sob bloqueio de linha sem espera e transição condicional. Redis apagado, job duplicado ou dois workers não ampliam autoridade nem repetem a retomada. Log de falha usa somente código canônico e auditoria não inclui contexto protegido.

Nós de identidade da PR 077 nunca buscam ou criam vínculo por telefone, username, preferência ou primeiro resultado. Seleção exige UUID interno sensível recebido de forma estruturada, pertencimento exato ao contato e vínculo não revogado com prova automatizável. A política aceita `VERIFICADO` com instante de verificação ou `MANUAL` com instante e usuário verificador; `TEMPORARIO` falha fechado até possuir validade/revalidação formal. Contrato precisa pertencer ao cliente já selecionado. O fluxo não cria, verifica, revoga nem torna vínculo preferencial. Passo e log não carregam variável nem UUID escolhido; a auditoria da mutação conserva somente referências UUID internas de vínculo, nunca nome de variável, dado pessoal ou identificador ERP externo. Essa seleção não substitui revalidação e ERP em tempo real exigidos por ações de maior risco.

Nós de fatura da PR 078 possuem parâmetros, referências e variáveis vazios: uma definição não pode versionar identificador externo, valor, Pix, linha, documento ou URL. O contexto precisa fixar contrato automatizável e a consulta precisa responder `TEMPO_REAL`. Nunca há fallback para snapshot. Mais de uma fatura pagável falha sem escolha implícita. A chamada ERP ocorre fora da transação e sua aplicação compara execução, nó, revisão, conta, contato, contrato e versão do contexto sob nova transação. Resposta tardia perde autoridade.

Fatura, valor e meios de pagamento permanecem apenas em contexto/composição/mensagem protegidos. Passo registra resultado e, quando existir, UUID interno da mensagem; log e auditoria não recebem referência externa, Pix, linha, valor ou PDF. A auditoria da composição usa apenas UUIDs internos e flags. Documento sem caminho privado de mídia não é convertido em Base64, URL ou texto e força `DADOS_INCOMPLETOS`. Adapter ausente, timeout normalizado ou indisponibilidade percorre `ERP_INDISPONIVEL`; simulador nunca habilita produção.

Exemplo de desbloqueio:

```text
No EXECUTAR_DESBLOQUEIO_CONFIANCA
  ↓
ServicoDesbloqueio
  ↓ valida identidade/contexto
  ↓ valida permissão/capacidade do fluxo
  ↓ valida contrato e regra de 30 dias
  ↓ valida idempotência
  ↓ exige ERP em tempo real
  ↓
AdaptadorErp
```

A PR 064 materializa a fase de verificação. Autorização e correspondência exata entre fila, atendimento e contrato ativo são resolvidas no PostgreSQL antes da consulta ERP. A resposta precisa ser `TEMPO_REAL`; snapshot, contrato divergente e campo não normalizado são recusados. A política local considera somente registros confirmados e imutáveis dos 30 dias anteriores.

A PR 065 materializa a execução com confirmação explícita, permissão distinta e revalidação imediatamente antes da escrita. Um lock transacional e uma reserva única por contrato fecham a corrida entre chaves idempotentes diferentes. O efeito externo não ocorre dentro de transação longa; a confirmação posterior atualiza histórico, operação e auditoria atomicamente. Resposta perdida, inválida ou exceção mantém a operação incerta e a reserva ativa até reconciliação. O adapter não escolhe `confirmado_em`, não recebe snapshot e não pode reduzir o intervalo local. Auditoria guarda somente resultado normalizado e identificadores internos, sem contrato externo ou payload ERP.

A PR 066 protege criação e atualização de ordem de serviço com prévia e confirmação explícita, `CRIAR_ORDEM_SERVICO`, escopo de fila, atendimento aberto e correspondência exata entre cliente, contrato e protocolo oficial. O comando assinado inclui todo o conteúdo mutável; reutilizar a chave com conteúdo diferente é negado. A criação é única pela operação e pelo identificador externo. Atualizações usam versão otimista, lock e reserva exclusiva para impedir duas chaves sobre a mesma versão. Resposta perdida ou formato externo inválido nunca autoriza repetição cega; reconciliação conserva ou libera a reserva conforme a prova do efeito. Descrição protegida não aparece em auditoria, log ou histórico em claro, e snapshot não participa da decisão.

A PR 067 exige confirmação explícita, `ENCERRAR_ATENDIMENTO`, atendimento aberto, fila e protocolo oficial exatos para comentário de finalização e encerramento ERP. Conteúdo e motivo participam da assinatura idempotente, mas somente seu hash entra no registro imutável; auditoria e evento não carregam o texto. Uma reserva exclusiva impede dois encerramentos concorrentes. Falha anterior ao efeito não fecha o atendimento; resposta perdida conserva estado e reserva até reconciliação. A transição local, o fechamento da atribuição, o evento, o registro externo, a conclusão e a auditoria são atômicos após confirmação. Link público continua sem token, URL, rota ou envio enquanto o portão jurídico/DPO e a capacidade real do MK não forem aprovados.

## 13. Auditoria

`RegistroAuditoria` é imutável para usuários da plataforma:

```text
id
tipo_evento
origem: USUARIO | FLUXO | SISTEMA | INTEGRACAO
usuario_id?
fluxo_id?
versao_fluxo_id?
atendimento_id?
contato_id?
fila_id?
acao
entidade_tipo?
entidade_id?
dados_anteriores_sanitizados?
dados_novos_sanitizados?
endereco_ip?
dispositivo_id?
sessao_id?
correlacao_id
criado_em
```

Eventos obrigatórios:

- resgate, transferência, assunção, encerramento e reabertura;
- vínculo/desvínculo e alteração de contexto;
- desbloqueio, desconexão e OS;
- nota interna criada/editada;
- permissão, fila e usuário alterados;
- dispositivo vinculado/revogado;
- fluxo publicado/revertido;
- contato bloqueado/desbloqueado;
- dado sensível visualizado;
- histórico exportado;
- retenção legal aplicada.

Auditoria não recebe segredo/payload integral e possui acesso próprio por permissão.

Controles de persistência obrigatórios:

- `ServicoAuditoria` valida origem/ator, identificadores e contexto e sanitiza os dados antes de delegar;
- a porta de persistência expõe somente acréscimo;
- a tabela bloqueia `UPDATE`, `DELETE` e `TRUNCATE` por trigger, além de não conceder essas operações a `PUBLIC`;
- não existe endpoint para usuário ou administrador alterar/apagar registro;
- erro técnico de persistência não pode ser convertido em sucesso da ação auditável;
- quando a auditoria acompanhar uma alteração de negócio, ambas devem participar da mesma transação local;
- eliminação/anonimização futura por retenção exige migration/procedimento privilegiado próprio e `RETENCAO_APLICADA`; não se contorna o trigger no runtime comum.

## 14. Threat model da V1

| Ameaça | Controle obrigatório |
|---|---|
| Sessão mobile roubada | Refresh rotativo, Keychain/Keystore, vínculo ao dispositivo, limite de dois e revogação remota. |
| Aparelho revogado permanece offline | Autorização offline vinculada com validade máxima de 4 horas, bloqueio do cache ao expirar e limpeza na próxima conexão. |
| Navegador esquecido | Duas sessões, 12 h de inatividade, revogação e reautenticação sensível. |
| QR fotografado/repetido | Token de 90 segundos, uso único, um ativo por sessão web, confirmação e rate limit. |
| Brute force/credential stuffing | Rate limit, atraso progressivo, bloqueio temporário e alerta. |
| IDOR/BOLA | Usuário + permissão + fila + recurso em toda leitura/escrita. |
| Escalada de privilégio | `default deny`, autorização central e auditoria. |
| Webhook falso/replay | Assinatura, schema, conta, deduplicação e persistência idempotente. |
| Clique duplo/nova tentativa | Chave idempotente persistente em envio e escrita ERP. |
| Corrida no resgate | Update/lock atômico com estado/fila/versão esperados. |
| SQL injection | Prisma/queries parametrizadas; SQL bruto revisado. |
| XSS | Escape/sanitização, CSP; mensagem nunca vira HTML confiável. |
| CSRF | SameSite, token/proteção quando necessária e validação de origem. |
| SSRF | Destinos permitidos; sem URL arbitrária no fluxo. |
| Upload malicioso/renomeado | Allowlist, MIME, assinatura, tamanho e scan. |
| Path traversal | Chave interna de storage; ignorar caminho/nome externo. |
| Mídia descoberta | Bucket privado, autorização e URL assinada curta. |
| CPF em log/push | Máscara, criptografia, HMAC de busca e sanitização central. |
| Segredo em Git/log | Secret manager, secret scan e proibição de payload bruto. |
| Contaminação de staging por produção | Projeto, banco, Redis, storage, volumes e credenciais exclusivos; sem importador; marcador de dados sintéticos/sanitizados e confirmação operacional. |
| Backup roubado | Criptografia, cópia externa e acesso mínimo. |
| MK comprometido/fora | Adapter, validação, timeout, circuit breaker e snapshot somente leitura. |
| Meta indisponível | Caixa de saída persistente, nova tentativa classificada e painel de reprocessamento. |
| Redis reiniciado | Nenhum estado irrecuperável no Redis. |
| Deploy durante conversa | Persistência prévia, workers recuperáveis e migração compatível. |
| Pendência offline antiga | Sync primeiro, `versao_atribuicao` e `REVISAO_NECESSARIA`. |
| Permissão removida | Evento, encerramento do escopo e limpeza do cache local. |
| Stream indevido | Autenticação e filtragem por autorização atual. |
| Fluxo mal configurado | Validação, timeout, tentativas e versionamento. |
| Fluxo malicioso | Sem código/SQL/shell/HTTP arbitrário; capacidades controladas. |
| Supply chain | Lockfile, dependência justificada, scanner e atualização controlada. |
| Administrador malicioso | Auditoria imutável inclusive para administrador. |
| Rollout ou versão manipulados | `ADMINISTRAR_RELEASES`, CSRF/origem, versão otimista, advisory lock, constraints e auditoria transacional; kill switch prevalece. |
| App antigo ignora tela de atualização | Backend retorna `426` em login, pareamento, autenticação e renovação abaixo da mínima. |
| Exportação em massa | Permissão específica, limites e auditoria. |
| Token da transcrição descoberto | Recurso desligado sem política jurídica; quando liberado, entropia alta, HMAC, conteúdo sanitizado, 72 h padrão/7 dias máximo e revogação. |
| Enumeração de cliente | Rate limit e resposta sem confirmação excessiva. |

Vínculo e contexto obedecem a uma defesa adicional contra associação indevida: atributos do WhatsApp não provam identidade ERP, resultado preferencial não vira escolha implícita e contrato precisa pertencer ao vínculo/contato por FK composta. A troca humana passa pelo serviço central com `ALTERAR_CONTEXTO_CLIENTE`, usa concorrência otimista e audita na mesma transação sem guardar identificador externo. A PR 025 não publica rota para criar vínculos; essa capacidade continua `default deny` até a revalidação aprovada do caso de uso.

O snapshot da PR 026 aceita apenas o vocabulário interno permitido e documento/telefone mascarados. Campo bruto ou desconhecido falha antes do lock/persistência. Origem, idade, hash e versão permanecem explícitos; captura atrasada não regride o dado e divergência no mesmo instante falha fechada. O módulo não publica controller nem ação ERP. Snapshot, ainda que recente, nunca concede permissão, comprova identidade de alto risco ou autoriza escrita; Redis não participa dessa autoridade.

A conversa única da PR 027 não amplia visibilidade. Ela consolida identidade da timeline, enquanto autorização por atendimento/fila e permissões transversais continuam obrigatórias na consulta futura. Conta participante não concede acesso nem apaga a origem dos itens. Resolução exige contato existente e conta ativa, serializa por contato e não publica controller; FKs restritivas preservam origem histórica após desativação.

O catálogo da PR 069 exige `EDITAR_FLUXO` no backend antes de qualquer escrita. Definições aceitam somente JSON finito, em objeto, com profundidade controlada e até 256 KiB; nenhuma definição pode transportar função ou tipo não serializável. Essa validação estrutural não substitui o validador semântico da PR 071: até ele existir, o catálogo não oferece publicação. Auditoria guarda IDs, tipo, número, revisão e versão de schema, nunca a definição integral. PostgreSQL impede exclusão de qualquer versão, alteração do conteúdo publicado/arquivado, publicação simultânea de duas versões e ponteiro para versão de outro fluxo ou em estado incorreto. Execução futura deve persistir o ID selecionado e não confiar no ponteiro mutável depois de iniciar.

A PR 070 separa editar, publicar e reverter no RBAC. Lock e revisão esperada impedem corrida de dois administradores; checks condicionais e a constraint diferida tornam estados e ponteiro indivisíveis no commit. Apenas `EM_TESTE` pode ser publicada e apenas `ARQUIVADA` pode ser reativada. A reversão não altera conteúdo, autoria ou instante original. Cada transição acrescenta histórico imutável e auditoria sanitizada, sem copiar a definição. O serviço não possui controller; publicação externa continua bloqueada até o validador integral da PR 071.

## 15. Regras de código seguro

- Não adicionar dependência sem necessidade, análise e justificativa.
- Não desativar validação, autorização ou teste para “fazer funcionar”.
- Não usar `any`, coerção ou cast para contornar contrato sensível.
- Não inserir segredo, certificado ou dado real em fixture.
- Não logar payload completo da Meta/MK.
- Não implementar segurança somente na UI.
- Não alterar migration já aplicada; criar migration compatível.
- Não incluir nó de código arbitrário no fluxo.
- Não reduzir controle de segurança para corrigir falha de teste.
- Não usar dados de produção em staging/dev.

## 16. Portões antes de produção

Testes mínimos:

- acessar UUID de outra fila/usuário;
- chamar endpoint administrativo como atendente;
- dois resgates simultâneos;
- webhook Meta repetido e assinatura inválida;
- desbloqueio/OS/protocolo repetidos;
- sessão e QR revogados/expirados;
- upload com extensão falsa, MIME falso e arquivo excessivo;
- XSS em mensagem, username, nota e formulário;
- enumeração por CPF/telefone/protocolo;
- aplicativo reconectando após perda de permissão;
- stream tentando ouvir recurso não autorizado;
- fluxo com referência inválida, loop sem limite e nó sensível sem permissão;
- backend/worker reiniciado entre commit e efeito externo;
- Redis apagado;
- restauração real de backup;
- secret scan, dependências e baseline OWASP ASVS/Mobile.

Falha em teste de segurança crítico bloqueia deploy; não é candidata a feature flag.

## 17. Controles dos nós de mensagem

- O executor nunca chama adapter, URL ou SDK de canal; somente o serviço de domínio pode criar uma saída.
- No instante do commit, execução e atendimento precisam conservar autoridade `EXECUTANDO` e `AGUARDANDO/BOT/PROCESSANDO_BOT`, na revisão esperada e sem responsável humano.
- Mensagem automática não recebe usuário falso; `usuario_remetente_id` permanece nulo e a origem de automação é operacional.
- Texto e opções são validados por schema fechado antes da publicação e novamente no serviço. Nulo, campos extras, IDs duplicados e limite excedido falham fechados.
- `PassoExecucaoFluxo`, evento e auditoria não carregam texto, opções, contexto protegido ou dado do cliente. Somente tipo, resultado, códigos e UUID da mensagem podem aparecer.
- Fallback estruturado não pode ser rotulado como sucesso. Falha temporária, falha definitiva e perda de autoridade possuem saídas distintas.
- Passo e execução usam revisão/constraint no PostgreSQL; repetição da mesma revisão não cria outro efeito.
- Mensagem, evento, caixa de saída, passo e avanço do nó pertencem à mesma transação. Falha parcial resulta em rollback.

## 18. Controles de condição e variável

- `CONDICAO` e `DEFINIR_VARIAVEL` aceitam schema fechado; campo adicional invalida a definição.
- Não existe avaliação de expressão, JavaScript, função, SQL, shell, URL ou chamada externa nesses nós.
- Tipo do literal precisa coincidir exatamente com a declaração. `"1"`, `1` e `true` nunca são equivalentes por coerção.
- Decimal usa representação canônica em string e comparação inteira escalada; não usa ponto flutuante para decidir rota.
- Data/hora exige ISO UTC canônico com milissegundos; UUID exige forma canônica minúscula.
- Variável marcada `sensivel` não pode receber literal versionado por `DEFINIR_VARIAVEL`.
- Valores ficam apenas no contexto protegido. Entrada/saída de passo e auditoria recebem tipo, resultado e código controlado, nunca nome ou valor da variável.
- Variável ausente ou contexto de tipo divergente segue `FALHA/VARIAVEL_INDISPONIVEL`; configuração inconsistente segue `FALHA/CONFIGURACAO_VARIAVEL_INVALIDA`.
- Contador persistido malformado falha fechado como `CONTEXTO_ITERACOES_INVALIDO`; nunca é zerado para contornar o limite.
- Cada ciclo precisa atravessar ao menos um nó limitado, sem subciclo ilimitado, e a `FALHA` do limite precisa sair do ciclo. Excesso segue `FALHA/LIMITE_ITERACOES_EXCEDIDO`.
- O contador fica no PostgreSQL junto ao contexto e à revisão. Redis, memória do worker e repetição de job não são autoridade para o limite.

## 19. Controles de espera e calendário

- `AGUARDAR` aceita somente `RESPOSTA` com timeout inteiro de 1 a 86.400 segundos ou `ATE_INSTANTE` com ISO UTC canônico; campos, referências e variáveis extras invalidam a publicação.
- O timeout e a evidência mínima da espera ficam no contexto protegido. Texto recebido, identificador externo e dado do contato não são copiados para passo, auditoria ou log.
- Resposta só retoma execução em `AGUARDANDO_RESPOSTA`, no mesmo nó e revisão; sinal ausente, repetido, tardio ou malformado falha fechado.
- Máquina e trigger recusam retomada prematura. A exceção de resposta exige marca explícita na nova versão do contexto e alteração condicional do registro.
- Vencimento é reconstruído por consulta ao PostgreSQL; Redis, timer em memória e relógio do cliente não têm autoridade.
- `HORARIO_ATENDIMENTO` exige exatamente uma referência ativa a `CALENDARIO` e capacidade habilitada pelo backend. A definição não contém fuso, feriado, período ou override duplicado.
- Calendário ausente/inválido percorre `FALHA`; não assume aberto, não usa horário do dispositivo e não cai para configuração inventada.
- Passo de agendamento e passo de retomada usam revisões distintas. Concorrência entre resposta e timeout tem um único vencedor pelo lock e pela revisão esperada.

## 20. Controles de formulário da PR 079

- a definição referencia somente UUID interno; identificador externo, token, chave, URL, payload e criptografia pertencem ao adapter;
- o executor confirma formulário ativo e mesma conta de origem antes de qualquer mensagem;
- sem capacidade Meta real comprovada, somente o fallback textual pelo serviço de domínio é permitido e a saída `ENVIADO` é proibida;
- a submissão deriva contato, conversa, atendimento e conta da mensagem de entrada persistida;
- locks e unicidades por mensagem e referência tornam replay idempotente; conteúdo divergente falha fechado;
- respostas são dados protegidos, não entram em passo, log, evento ou auditoria e só chegam ao card após mapeamento e mascaramento por permissão;
- submissão e evento confirmam na mesma transação e o registro imutável não oferece update/delete operacional.

## 21. Controles de protocolo e OS da PR 080

- `CRIAR_ATENDIMENTO` não aceita protocolo, identificador externo ou chave do editor; protocolo oficial existente impede nova escrita;
- `CRIAR_ORDEM_SERVICO` exige schema fechado, `confirmacaoExplicita: true` e capacidade habilitada, sem transformar publicação em permissão humana;
- cliente, contrato e protocolo são derivados no servidor e revalidados pelo serviço de domínio imediatamente antes da confirmação;
- autoridade de fluxo exige atendimento `AGUARDANDO/BOT` sem fila/responsável, vínculo verificado e execução `EXECUTANDO` da mesma versão; fila permanece obrigatória no caminho humano e nunca é fabricada para o fluxo;
- chamadas ERP ocorrem fora da transação; resposta perdida permanece incerta e só reconciliação pode confirmar ou provar ausência;
- chave estável por execução+nó impede duplicação em retry ou reinício;
- auditoria de OS usa `FLUXO`, nunca usuário/sessão fictícios, e omite assunto, descrição, IDs externos e protocolo;
- sem adapter real registrado, os dois nós seguem `INDISPONIVEL` e não criam efeito; fixture/simulador não pode mudar essa regra.

## 22. Controles de desbloqueio do Motor de Fluxos da PR 081

- verificação e execução permanecem casos de uso distintos; consultar nunca escreve nem reserva;
- nenhum nó aceita fila, contrato, chave, payload ERP, referência ou variável; tudo é derivado e validado no servidor;
- execução exige `confirmacaoExplicita: true` e repete a elegibilidade ERP em tempo real, mesmo após uma verificação elegível;
- autoridade automática exige atendimento `AGUARDANDO/BOT` sem fila/responsável, execução/versão corrente e vínculo automatizável verificado;
- ação humana continua exigindo fila, sessão e RBAC; fluxo não herda nem fabrica essas credenciais;
- lock e reserva única por contrato bloqueiam chaves concorrentes; chave estável execução+nó bloqueia retry divergente;
- resposta perdida nunca vira sucesso: conserva a operação incerta e só reconciliação pode confirmar ou provar ausência;
- passo, log e auditoria não recebem contrato, motivo ERP, chave ou instante da política; efeito confirmado é auditado como `FLUXO`;
- ausência de provider falha antes de criar operação, e simulador não pode ocupar a porta de runtime.

## 23. Controles de fila e encerramento da PR 082

- fila é uma referência interna ativa resolvida pelo backend; nome, ID externo, usuário e sessão não são aceitos na definição;
- publicação e execução defensiva exigem `TRANSFERIDO → AGUARDAR_ATENDENTE` na mesma fila antes de alterar o atendimento;
- lock e alteração condicional revalidam atendimento BOT sem fila/responsável e execução/fluxo/versão exatos;
- transferência, histórico de atribuição, evento e auditoria confirmam juntos e usam ator `FLUXO`, sem usuário técnico;
- `retomar_em` em `AGUARDANDO_ATENDENTE` é futuro e reconstruível; resgate e timeout concorrem pelo PostgreSQL, nunca por memória ou Redis;
- encerramento exige fila de fallback ativa, congela a reabertura e torna a execução terminal; nova mensagem não retoma automação antiga;
- motivo de encerramento permanece no registro protegido do atendimento e não entra em passo, evento, auditoria ou log;
- estado, fila ou autoridade divergente falham fechados e não são corrigidos por escolha implícita ou SQL operacional.

## 24. Controles da corrida resgate × envio automático da PR 083

- mensagem automática persiste execução de origem e versão de atribuição; ausência desses campos impede o caminho automático coordenado;
- criação, despacho e mutação de atribuição usam a mesma chave advisory textual por atendimento, sem byte nulo;
- o despachante só sai de `NA_FILA` depois de reler modo, responsável, execução e versão sob o lock;
- `ENVIANDO`, chamada ao canal e resultado ficam na mesma transação limitada; o transporte recebe `AbortSignal` e deve interromper a requisição no prazo;
- resgate cancela automáticas `NA_FILA` no mesmo commit da autoridade humana; mensagem humana e disparo transacional não são alcançados;
- aceite anterior ao commit humano permanece `ENVIADA`; depois do commit, criação, início e aceite novos são recusados;
- migration cancela legado automático ainda `NA_FILA` e para com erro se encontrar legado `ENVIANDO`, que exige reconciliação;
- evento e auditoria registram somente a quantidade cancelada, nunca conteúdo, destino ou credencial.

## 25. Controles do editor visual da PR 084

- leitura exige `VISUALIZAR_FLUXO`; criação e salvamento exigem `EDITAR_FLUXO`; validar/publicar exige `PUBLICAR_FLUXO`, sem herança implícita entre permissões;
- toda escrita web valida cookie, sessão, origem e CSRF; `PUT` integra a lista CORS explícita, sem origem ampla;
- fluxo e versão são relidos juntos e vínculo divergente falha fechado, bloqueando IDOR/BOLA entre versões;
- rascunho exige revisão esperada e alteração concorrente retorna conflito; estado imutável nunca é convertido pelo controller;
- o navegador não envia capacidades habilitadas, referências ativas, estado, ponteiro publicado, autoria ou credenciais; essas autoridades vêm do backend;
- definição é objeto fechado e tipado, sem JSON bruto na UI, URL, expressão, código, SQL, shell, segredo ou payload de adapter;
- posição visual aceita somente coordenadas finitas limitadas e não altera semântica, ordem ou execução;
- salvar não publica; validar não publica; publicação exige comando próprio e estado `EM_TESTE`;
- erros e auditoria não carregam definição, parâmetros, valores de variável ou conteúdo sensível.

## 26. Controles do simulador da PR 085

- toda chamada exige sessão web válida, origem autorizada, CSRF e `TESTAR_FLUXO`; editar ou visualizar não concedem teste implicitamente;
- o simulador não registra provider externo e não importa executor, serviço de mensagens, ERP, Prisma ou Redis;
- dados de contato são constantes sintéticas e mascaradas, claramente marcadas como simulação;
- parâmetros, textos autorais, referências, identificadores externos e variáveis sensíveis não são refletidos na resposta;
- o percurso termina em no máximo 200 passos e também limita visitas por nó, impedindo consumo ilimitado por ciclo;
- saída ausente, cenário incompatível ou limite atingido são estados visíveis e conservadores;
- a resposta fixa `efeitosReaisExecutados` como falso e não cria mensagem, atendimento, operação recuperável, evento ou auditoria de conteúdo;
- logs e erros não recebem a definição nem a prévia; métricas devem contar somente código e duração agregados.
