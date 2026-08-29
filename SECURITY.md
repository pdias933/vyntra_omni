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
- acesso ao cache sem rede exige autorização offline assinada e de duração limitada; revogação de aparelho totalmente offline fica sujeita apenas a essa janela máxima, que deve ser aprovada antes do piloto.

### 4.2 Pareamento QR

O QR:

- contém somente token efêmero, nunca senha ou refresh token;
- é aleatório, de uso único e validade curta;
- é vinculado à sessão web que o criou;
- exige confirmação no backend/web antes de emitir sessão mobile;
- é invalidado após uso, expiração, logout ou cancelamento;
- possui rate limit e auditoria de criação, tentativa e vínculo.

O valor exato da validade será configurado após teste de UX; a faixa inicial proposta é 60–120 segundos.

### 4.3 Web

- cookie de sessão `HttpOnly`, `Secure` e `SameSite`;
- máximo de duas sessões simultâneas;
- terceira sessão exige aviso/confirmação antes de revogar a mais antiga;
- expiração após 12 horas de inatividade;
- logout global e revogação administrativa;
- reautenticação pode ser exigida para mudanças críticas de integração, permissão ou segurança;
- SSE reutiliza o cookie e valida origem/escopo.

### 4.4 Login e força bruta

- rate limit por conta, IP, dispositivo e endpoint, sem depender de um único sinal;
- atraso progressivo e bloqueio técnico temporário;
- resposta que não confirma se o usuário existe;
- auditoria e alerta de padrão anômalo;
- política de senha e MFA devem ser definidas antes do piloto; até lá, nenhuma implementação deve inventar requisitos incompatíveis.

## 5. Autorização: RBAC + fila + recurso

### 5.1 Papéis base

- `ADMINISTRADOR`: administração global da instalação e todas as filas, respeitando permissões específicas para dado sensível/exportação.
- `SUPERVISOR`: supervisiona apenas filas autorizadas; pode assumir atendimentos desse escopo.
- `ATENDENTE`: atua somente nas filas e ações explicitamente concedidas.
- Perfil personalizado: papel base com permissões adicionadas/removidas.

Financeiro, Suporte e Comercial são filas, não papéis.

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
VISUALIZAR_DADO_SENSIVEL
EXPORTAR_HISTORICO

ADMINISTRAR_USUARIOS
ADMINISTRAR_FILAS
ADMINISTRAR_INTEGRACOES
ADMINISTRAR_RELEASES
```

Consultar e executar são permissões diferentes. Editar um fluxo não concede publicar. Administrador também deixa auditoria ao ver dado sensível ou exportar histórico.

### 5.4 Timeline única com menor privilégio

A timeline é única por contato, mas a API filtra conteúdo por atendimento e permissão, conforme [ARCHITECTURE.md](ARCHITECTURE.md). Um atendimento transferido permanece inteiramente disponível à equipe que agora o conduz; atendimentos históricos de filas sem interseção exigem permissão transversal. O cliente nunca recebe itens omitidos nem metadados que permitam inferir conteúdo restrito.

Essa matriz deve ser aprovada no PR de RBAC. Até então, aplica-se `default deny`.

## 6. Identidade do contato e risco da ação

BSUID/identificador externo resolve correlação técnica; não prova autorização para agir em nome de qualquer cliente ERP. Username e telefone também não são prova isolada.

Regras:

- vínculo persistente registra método, autor, data e revogação;
- CPF é identificador e pode sustentar a primeira validação aprovada, mas não é autenticação forte universal;
- contexto temporário não vira vínculo preferencial sozinho;
- número reciclado, mudança de identidade ou erro de associação permitem revogação auditada;
- ações usam o cliente/contrato explícitos do atendimento;
- respostas de identificação evitam confirmar excessivamente a existência de cadastro.

Antes de liberar ações ERP no piloto, o produto deve aprovar uma matriz por ação:

```text
ação
nível de risco
vínculo aceito
revalidação exigida
dados que podem ser exibidos
confirmação necessária
permissão humana/Motor de Fluxos
```

Enquanto uma ação não estiver nessa matriz, ela fica negada. Em especial, não presumir que CPF sozinho autoriza alteração cadastral, desconexão, desbloqueio ou exportação.

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

Histórico e mídia têm retenção inicial indefinida por decisão de produto. Isso não remove obrigações de minimização e eliminação legal. Antes do piloto deve existir política de retenção/LGPD, processo excepcional de remoção e auditoria `RETENCAO_APLICADA`. Atendente, supervisor e administrador não apagam registros individuais para esconder rastros.

## 8. Segurança de mídia e transcrição

### 8.1 Upload

- allowlist: imagem, áudio, vídeo e PDF;
- validar extensão, MIME, assinatura real e tamanho;
- normalizar nome e ignorar caminho informado pelo usuário;
- scan de malware quando aplicável antes da disponibilização;
- limites por tipo e conta configurados no servidor;
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
- expiração, revogação e limite de acesso precisam ser decididos antes do PR da transcrição; até lá, não criar link público permanente.

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
- snapshot desatualizado nunca executa escrita;
- cada escrita externa exige idempotência e auditoria.

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

## 14. Threat model da V1

| Ameaça | Controle obrigatório |
|---|---|
| Sessão mobile roubada | Refresh rotativo, Keychain/Keystore, vínculo ao dispositivo, limite de dois e revogação remota. |
| Aparelho revogado permanece offline | Autorização offline com validade máxima, bloqueio do cache ao expirar e limpeza na próxima conexão. |
| Navegador esquecido | Duas sessões, 12 h de inatividade, revogação e reautenticação sensível. |
| QR fotografado/repetido | Token efêmero, uso único, confirmação e rate limit. |
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
| Exportação em massa | Permissão específica, limites e auditoria. |
| Token da transcrição descoberto | Entropia alta, conteúdo sanitizado, política de expiração/revogação. |
| Enumeração de cliente | Rate limit e resposta sem confirmação excessiva. |

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
