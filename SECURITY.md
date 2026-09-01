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

Após o commit, access e refresh daquele aparelho perdem autoridade imediatamente. Sincronização e WebSocket devem chamar `ServicoAutenticacaoMobile.autenticar` no handshake e novamente em heartbeat/comandos; uma conexão não pode conservar um contexto autenticado indefinidamente. O gateway ainda será materializado na PR 056, quando o fechamento físico da conexão ativa também será testado; até lá não existe transporte WebSocket a ser mantido ou cortado.

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
