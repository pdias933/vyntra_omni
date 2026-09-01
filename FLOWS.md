# Fluxos — Omnichannel V1

## 1. Dois conceitos diferentes

### Motor de Fluxos

Componente interno chamado de “Flow Engine” na conversa de origem. No produto e no código, seu nome canônico é `Motor de Fluxos`. Ele decide o comportamento do atendimento: mensagens, condições, calendário, consultas ERP, seleção de contrato, envio de fatura, roteamento e encerramento.

### WhatsApp Flows

Produto externo da Meta para formulários estruturados dentro do WhatsApp. O Motor de Fluxos pode solicitar um formulário e reagir à submissão, mas não é o editor nem o mecanismo de execução do formulário da Meta.

Regra central:

> O código implementa os tipos de nó e as garantias do motor. O administrador configura o comportamento através de versões de fluxo.

## 2. Objetivos da V1

- substituir regras hardcoded do bot por configuração versionada;
- permitir vários fluxos e associação por conta WhatsApp;
- suportar rascunho, teste, publicação e reversão;
- manter execuções ativas na versão com que começaram;
- retomar após reinício sem devolver o cliente ao início;
- permitir diagnóstico por nó e passo;
- permitir resgate humano de atendimento ainda na automação;
- impedir código arbitrário e acesso direto a integrações.

A V1 não tenta construir um n8n. O editor visual é propositalmente simples.

## 3. Modelo

### 3.1 `Fluxo`

```text
Fluxo
id
nome
descricao?
tipo:
  ATENDIMENTO
  AUTENTICACAO
  FINANCEIRO
  COMERCIAL
  SUPORTE
  OUTRO
ativo
versao_publicada_id?
criado_por
criado_em
atualizado_em
```

### 3.2 `VersaoFluxo`

```text
VersaoFluxo
id
fluxo_id
numero_versao
estado:
  RASCUNHO
  EM_TESTE
  PUBLICADA
  ARQUIVADA
definicao
criada_por
criada_em
publicada_por?
publicada_em?
```

`definicao` contém nós, conexões, posições e configurações com schema versionado. Depois da primeira publicação, a definição é imutável, mesmo quando a versão é arquivada ou reativada por reversão.

### 3.3 `ExecucaoFluxo`

```text
ExecucaoFluxo
id
atendimento_id
fluxo_id
versao_fluxo_id
estado:
  EXECUTANDO
  AGUARDANDO_RESPOSTA
  AGUARDANDO_SISTEMA
  AGUARDANDO_ATENDENTE
  SUSPENSA_POR_ATENDIMENTO_HUMANO
  CONCLUIDA
  FALHOU
  CANCELADA
no_atual_id
contexto_criptografado_ou_protegido
retomar_em?
revisao
codigo_finalizacao?
iniciada_em
atualizada_em
finalizada_em?
```

Máquina de execução:

```text
EXECUTANDO
  ├── nó espera contato ───────────────> AGUARDANDO_RESPOSTA
  ├── nó espera tempo/operação ────────> AGUARDANDO_SISTEMA
  ├── transferência para fila ─────────> AGUARDANDO_ATENDENTE
  ├── fim válido ──────────────────────> CONCLUIDA
  ├── falha terminal tratada ──────────> FALHOU
  └── cancelamento explícito ──────────> CANCELADA

AGUARDANDO_RESPOSTA ── resposta válida ─┐
AGUARDANDO_SISTEMA ── tempo/resultado ───┼──> EXECUTANDO

qualquer estado não terminal ── resgate humano ──> SUSPENSA_POR_ATENDIMENTO_HUMANO
AGUARDANDO_ATENDENTE ── resgate humano ──────────> SUSPENSA_POR_ATENDIMENTO_HUMANO
```

`CONCLUIDA`, `FALHOU`, `CANCELADA` e `SUSPENSA_POR_ATENDIMENTO_HUMANO` são terminais para essa execução. Cancelamento exige causa de domínio e auditoria; reinício técnico nunca cancela nem conclui por conta própria.

### 3.4 `PassoExecucaoFluxo`

```text
PassoExecucaoFluxo
id
execucao_fluxo_id
no_id
tipo_no
estado: INICIADO | CONCLUIDO | FALHOU
entrada_sanitizada
saida_sanitizada
codigo_erro?
iniciado_em
finalizado_em?
```

Passos são diagnóstico de execução, não local para armazenar payload sensível integral.

## 4. Ciclo de versão

```text
RASCUNHO → EM_TESTE → PUBLICADA → ARQUIVADA
                         ↑            │
                         └─ reversão ─┘
```

Regras:

- salvar rascunho não altera produção;
- testar não altera produção;
- publicar é ação explícita com `PUBLICAR_FLUXO`;
- publicar atualiza atomicamente `Fluxo.versao_publicada_id`, usado somente por novas execuções, e arquiva a versão antes ativa;
- execução existente continua na versão original;
- reversão autorizada arquiva a versão atual, reativa uma versão imutável anterior e move o ponteiro para novas execuções;
- nenhuma versão, definição ou histórico é apagado pela reversão;
- publicação e reversão geram auditoria.

Exemplo:

```text
Atendimento 1001 → v8
Atendimento 1002 → v8

publica v9

Atendimento 1003 → v9
```

## 5. Nós da V1

| Nó | Responsabilidade |
|---|---|
| `INICIO` | Ponto único de entrada da versão. |
| `ENVIAR_MENSAGEM` | Solicitar envio de texto/mídia já suportado pelo domínio. |
| `ENVIAR_BOTOES_OU_LISTA` | Apresentar opções estruturadas. |
| `CONDICAO` | Escolher saída por valor/resultado permitido. |
| `DEFINIR_VARIAVEL` | Gravar valor tipado no contexto. |
| `AGUARDAR` | Aguardar resposta ou instante futuro sem prender worker. |
| `HORARIO_ATENDIMENTO` | Consultar calendário da conta/fila. |
| `IDENTIFICAR_CONTATO` | Resolver vínculos/contexto segundo a política. |
| `SOLICITAR_DADOS_CONTATO` | Solicitar compartilhamento de contato pela capacidade oficial disponível. |
| `SOLICITAR_FORMULARIO_WHATSAPP` | Solicitar formulário Meta previamente cadastrado. |
| `SELECIONAR_CLIENTE` | Escolher cliente entre vínculos/resultados autorizados. |
| `SELECIONAR_CONTRATO` | Escolher contrato explicitamente. |
| `CONSULTAR_FATURAS` | Chamar serviço financeiro em tempo real. |
| `ENVIAR_FATURA` | Enviar composição aprovada de PDF/Pix/linha/link. |
| `VERIFICAR_DESBLOQUEIO_CONFIANCA` | Consultar elegibilidade sem executar. |
| `EXECUTAR_DESBLOQUEIO_CONFIANCA` | Executar após política, confirmação e idempotência. |
| `CONSULTAR_SESSAO_ACESSO` | Consultar porta `AccessSessionAdapter` quando habilitada. |
| `CRIAR_ATENDIMENTO` | Garantir atendimento/protocolo conforme regra ERP. |
| `CRIAR_ORDEM_SERVICO` | Criar OS via serviço de domínio e adapter. |
| `TRANSFERIR_PARA_FILA` | Encaminhar ao setor configurado. |
| `AGUARDAR_ATENDENTE` | Manter pendente humano e informar o contato. |
| `ENCERRAR_ATENDIMENTO` | Encerrar explicitamente com motivo configurado. |

O rótulo externo “PPPoE” pode aparecer na apresentação administrativa da integração; o contrato interno usa `SESSAO_ACESSO`.

A matriz de risco ERP também limita o Motor de Fluxos. Consulta mascarada de baixo risco usa contexto explícito e autorização da capacidade. Risco médio exige vínculo verificado ou revalidação estruturada e dado em tempo real quando necessário. Risco alto usa serviço de domínio específico, cliente/contrato explícitos, revalidação, prévia/confirmabilidade compatível com automação, idempotência e auditoria; capacidade não caracterizada fica desabilitada. CPF/CNPJ sozinho não autoriza risco alto. `DESCONECTAR_SESSAO_ACESSO` é exclusivamente humano e não existe como nó. Publicar configuração nunca concede uma capacidade que o fluxo não possua.

## 6. Configuração tipada

Cada tipo de nó possui schema próprio. Exemplos:

```text
ENVIAR_MENSAGEM
mensagem: "Olá {{cliente.nome}}, como posso ajudar?"
aguardar_resposta: true
```

```text
TRANSFERIR_PARA_FILA
fila_id: UUID
mensagem_contato: "Vou encaminhar você ao setor financeiro."
```

```text
HORARIO_ATENDIMENTO
calendario: USAR_FILA_ATUAL
saida_dentro_horario: UUID do nó
saida_fora_horario: UUID do nó
```

```text
AGUARDAR
tipo: RESPOSTA | ATE_INSTANTE
tempo_limite?
retomar_em?
saida_tempo_esgotado
```

Configuração não pode conter segredo, URL externa, SQL, JavaScript, shell ou expressão arbitrária.

## 7. Variáveis

Namespaces de leitura controlada:

```text
contato.nome_exibicao
contato.nome_usuario?
contato.telefone?

cliente.id
cliente.nome
cliente.documento_mascarado

contrato.id
contrato.plano
contrato.endereco

fatura.id
fatura.valor
fatura.vencimento

atendimento.id
atendimento.protocolo?
atendimento.fila

canal.janela_aberta
```

Administrador pode definir variáveis tipadas do fluxo, por exemplo `cliente_deseja_aguardar`. Não pode ler credencial, CPF completo ou payload bruto de integração.

Templates de texto passam por validação. Valor ausente não vira `undefined` visível; segue saída de erro/configuração.

## 8. Execução persistente

### 8.1 Passo normal

1. adquirir controle da execução com versão/estado esperado;
2. validar que o atendimento ainda está em modo `BOT` quando o nó pretende responder;
3. registrar passo iniciado;
4. executar regra local ou persistir comando assíncrono;
5. aplicar saída em transação;
6. registrar passo concluído/falho, nó seguinte, evento e `ItemCaixaSaida`;
7. liberar a execução.

### 8.2 Espera

`AGUARDAR` nunca deixa worker dormindo:

```text
estado = AGUARDANDO_SISTEMA ou AGUARDANDO_RESPOSTA
retomar_em = instante
```

Um job recuperável retoma depois. Reinício não altera o nó ou contexto.

### 8.3 Integração externa

Nó não faz chamada HTTP direta. Ele solicita uma operação de domínio:

```text
CONSULTAR_FATURAS
  ↓
ServicoFinanceiro.consultarFaturas
  ↓
AdaptadorErp
```

O resultado normalizado escolhe uma saída explícita:

```text
SUCESSO
SEM_RESULTADO
INDISPONIVEL
TEMPO_LIMITE_EXCEDIDO
FALHA_CONFIGURACAO
```

Erros técnicos não deixam o contato sem resposta. Toda operação externa relevante possui saída de falha configurada ou política segura obrigatória.

## 9. Loops e limites

Repetição é permitida somente com limite mensurável:

```text
CPF inválido
  ↓ tentar novamente, maximo_tentativas = 3
  ↓
TRANSFERIR_PARA_FILA
```

O validador rejeita ciclo sem contador/saída. O executor também impõe teto defensivo de passos por execução/janela para proteger contra configuração maliciosa.

Timeouts e limites finais são configurados por tipo de nó no servidor, não aumentados arbitrariamente no editor.

## 10. Validação antes de publicar

A publicação exige:

- exatamente um `INICIO` alcançável;
- todos os caminhos obrigatórios conectados;
- nós críticos não órfãos;
- tipos e versões de schema suportados;
- filas, templates, formulários e recursos existentes/ativos;
- variáveis obrigatórias definidas antes do uso;
- ciclos limitados;
- saídas de falha/timeout quando exigidas;
- capacidade do nó habilitada na instalação;
- permissão de publicação do ator;
- nenhuma configuração proibida ou segredo.

Erros são específicos:

```text
FLUXO_NAO_PUBLICAVEL
O nó "Enviar fatura" não possui saída para ERP indisponível.
```

## 11. Atendimento humano e automação

Atendimentos em automação são visíveis no filtro `EM_AUTOMACAO`, com:

- contato e protocolo;
- fluxo e versão;
- nó atual;
- tempo sem progresso;
- último erro normalizado;
- ação `Resgatar` para usuários autorizados.

Resgate:

```text
Atendimento modo BOT
+ ExecucaoFluxo ativa
        ↓ transação atômica
Atendimento modo HUMANO / responsável definido
+ ExecucaoFluxo SUSPENSA_POR_ATENDIMENTO_HUMANO
```

Envio automático e resgate serializam a autoridade de saída pelo atendimento. O despachante só muda uma mensagem automática de `NA_FILA` para `ENVIANDO` após revalidar modo, execução e `versao_atribuicao`; o resgate cancela as automáticas ainda `NA_FILA`. Se houver requisição já iniciada, o resgate só conclui depois de resolver seu resultado dentro do tempo limite: apenas mensagem aceita pela Meta antes do commit permanece `ENVIADA` no histórico. Depois do commit, nenhum novo envio automático pode ser iniciado ou aceito.

O histórico registra em qual nó a automação foi interrompida. Um novo atendimento futuro começa no fluxo publicado da conta; não retoma arbitrariamente a execução antiga.

### 11.1 Encerramento e reabertura após fluxo

Uma versão só pode publicar `ENCERRAR_ATENDIMENTO` se declarar uma fila humana de fallback ativa. O encerramento torna a `ExecucaoFluxo` terminal. Se o contato enviar nova mensagem em até 30 minutos e a regra de reabertura for válida, o mesmo atendimento/protocolo volta a `AGUARDANDO`, modo `FILA_HUMANA`, nessa fila e sem responsável. A execução anterior não retoma nó, espera ou escrita ERP. Depois da tolerância, nasce outro atendimento e uma nova execução usa a versão então publicada.

## 12. Simulador

O simulador é obrigatório na V1:

- painel lateral semelhante a uma conversa;
- dados fictícios e determinísticos;
- nenhum envio Meta e nenhuma escrita ERP;
- passos, entradas/saídas sanitizadas e caminho percorrido visíveis;
- cenários para sucesso, cliente não encontrado, ERP indisponível, timeout e fora do horário;
- testar não muda versão publicada.

Modo de teste com cliente real/controlado fica posterior ou exige ambiente isolado e decisão explícita.

## 13. Associação por conta WhatsApp

```text
ConfiguracaoContaWhatsApp
conta_whatsapp_id
fluxo_entrada_id
```

Várias contas podem apontar ao mesmo fluxo publicado; uma conta pode ter fluxo próprio. A publicação de nova versão afeta apenas novos atendimentos que entrarem pelo ponteiro publicado.

Transferência de fila não troca a conta de origem nem reinicia fluxo.

## 14. WhatsApp Flows na V1

### 14.1 Formulários aprovados

- identificação/autenticação;
- novo cadastro comercial.

Atualização cadastral, suporte avançado, agendamento, pesquisa de satisfação e aceites adicionais ficam para V1.1/futuro.

### 14.2 Cadastro e uso

O painel cadastra/sincroniza formulários preparados na Meta, seus identificadores/versões, finalidade, filas autorizadas e mapeamento de campos. Não existe editor completo desses formulários na V1.

Atendente ou nó solicita um formulário. O adapter traduz o comando interno para a capacidade da Meta.

### 14.3 Submissão

O adapter recebe o formato externo, valida, descriptografa quando o protocolo exigir e normaliza para:

```text
SubmissaoFormulario
id
contato_id
conversa_id
atendimento_id
formulario_id
versao_externa
dados_protegidos
resultado_validacao
recebida_em
```

Na timeline aparece um card, não JSON bruto. CPF e outros dados ficam mascarados conforme a permissão. O Motor de Fluxos recebe somente campos mapeados e permitidos.

### 14.4 Fallback

Se a conta/versão do aplicativo do contato não suportar o formulário, o nó segue uma saída explícita de fallback, normalmente solicitação de contato permitida ou fila humana. Não coleta dado sensível em mensagem comum por improviso.

## 15. Segurança e idempotência

- catálogo de nós controlado pelo código;
- publicação não amplia permissões;
- toda escrita usa serviço de domínio e chave idempotente;
- contexto não contém credencial externa;
- formulário e variáveis sensíveis criptografados/protegidos;
- passo/log sanitizado;
- usuário que edita pode não publicar;
- reversão e publicação auditadas;
- executor valida `versao_atribuicao`, modo e estado antes de responder;
- nenhuma IA silenciosa, nó generativo ou ACS na V1.

## 16. Critérios de aceite

- Publicar v9 não move execução em v8.
- Reiniciar API/worker no meio de `AGUARDAR` retoma no mesmo nó.
- Fluxo com ciclo ilimitado ou fila inexistente não publica.
- Duas tentativas do mesmo nó sensível geram uma única operação ERP.
- ERP indisponível segue saída configurada e não usa snapshot para escrita.
- Resgate concorrente com o passo do fluxo deixa uma única autoridade de envio.
- Depois do resgate, nenhum novo envio automático é criado.
- Simulador não chama Meta/MK e não altera produção.
- Submissão de formulário repetida não duplica vínculo/ação.
- Usuário sem `PUBLICAR_FLUXO` não publica via API manual.

## 17. Fundação persistente entregue na PR 069

O catálogo separa a identidade `Fluxo` da definição `VersaoFluxo`. Criar um fluxo também cria a versão 1 em `RASCUNHO` na mesma transação. O editor futuro altera somente rascunho e precisa apresentar `revisao` atual; uma revisão concorrente falha sem auditoria de alteração inexistente. Criar nova versão ocorre sob lock do fluxo e recebe o próximo número monotônico.

O ponteiro publicado é uma referência composta para garantir que a versão pertença ao mesmo fluxo, além de exigir estado `PUBLICADA` no commit. O contrato interno `obterVersaoPublicadaParaNovaExecucao` seleciona exatamente esse registro e nunca “a mais recente”. A PR 069 não expõe controller, não executa nó, não publica versão e não registra worker ou adapter. Publicação/reversão, validação semântica e `ExecucaoFluxo` permanecem, respectivamente, nos PRs 070, 071 e 072.

## 18. Publicação, arquivamento e reversão da PR 070

As três operações são serializadas por lock do fluxo e exigem `revisaoFluxoEsperada`. Publicação usa `PUBLICAR_FLUXO` e somente promove `EM_TESTE`; arquivamento usa a mesma capacidade e remove explicitamente o ponteiro; reversão usa `REVERTER_FLUXO` e somente reativa uma versão `ARQUIVADA`. Em publicação ou reversão, a versão atual é arquivada antes da promoção e a constraint diferida valida o estado final do commit.

Ponteiro, estados, revisão, `HistoricoPublicacaoFluxo` e `RegistroAuditoria` pertencem à mesma transação fornecida. Uma falha em qualquer escrita reverte o conjunto. Reversão conserva `publicada_por` e `publicada_em` originais; o ator da reversão aparece no histórico novo. O módulo continua sem controller. Até a PR 071 concluir a validação semântica e promover um rascunho válido a `EM_TESTE`, não existe caminho público para publicar.

## 19. Portão semântico da PR 071

`ValidadorPublicacaoFluxo` aceita somente `versaoSchema=1`, campos conhecidos, até 500 nós, 2.000 conexões e 200 variáveis. Há exatamente um `INICIO`, pelo menos um `FIM`, nenhum nó inalcançável e uma conexão única para cada saída nominal. Cada tipo possui saídas obrigatórias; falha, indisponibilidade, timeout, fallback ou resultado incerto não podem desaparecer quando forem parte de seu contrato.

Variáveis são declaradas com tipo controlado, sensibilidade e disponibilidade na entrada. Toda leitura precisa estar definida em todos os caminhos anteriores. Dado marcado sensível não pode alimentar nó de mensagem ao contato. Regras específicas de condição e atribuição permanecem no nó tipado da PR 075; a definição nunca aceita código, SQL, shell, credencial, endpoint ou URL arbitrária.

Ciclos são encontrados no grafo completo: cada componente cíclico exige `limiteIteracoes` entre 1 e 100 em ao menos um nó e uma aresta de saída. Referências exigidas por nó precisam existir e estar ativas. Nós não nativos exigem capacidade habilitada. Esses fatos vêm de `ProvedorContextoValidacaoFluxo`, composto no backend; o editor não os fornece e publicar configuração não os cria.

`ServicoValidacaoPublicacaoFluxos.prepararParaPublicacao` exige `PUBLICAR_FLUXO`, versão `RASCUNHO`, fluxo ativo e revisão esperada. Só relatório válido permite a alteração condicional para `EM_TESTE` e auditoria na mesma transação. Validação e publicação continuam operações separadas. A implementação conservadora inicial reconhece apenas nós nativos sem referência externa; demais nós permanecem não publicáveis até o PR que registrar sua capacidade real.

## 20. Máquina persistente da PR 072

Uma execução nasce somente no atendimento automatizável e fixa a versão indicada pelo ponteiro publicado sob lock. A inserção confirma no PostgreSQL que atendimento, fluxo e versão continuam coerentes. Replay do mesmo fluxo devolve a execução ativa; uma publicação posterior não troca seu `versao_fluxo_id`. Duas execuções não terminais do mesmo atendimento são recusadas por índice parcial.

A máquina aceita:

```text
EXECUTANDO
  → AGUARDANDO_RESPOSTA
  → AGUARDANDO_SISTEMA
  → AGUARDANDO_ATENDENTE
  → SUSPENSA_POR_ATENDIMENTO_HUMANO | CONCLUIDA | FALHOU | CANCELADA

AGUARDANDO_RESPOSTA
  → EXECUTANDO | SUSPENSA_POR_ATENDIMENTO_HUMANO | CANCELADA

AGUARDANDO_SISTEMA
  → EXECUTANDO | SUSPENSA_POR_ATENDIMENTO_HUMANO | FALHOU | CANCELADA

AGUARDANDO_ATENDENTE
  → SUSPENSA_POR_ATENDIMENTO_HUMANO | CANCELADA
```

Estado, revisão, instante e auditoria mudam juntos. O PostgreSQL recusa transição fora dessa matriz, identidade alterada, revisão que não seja a próxima, exclusão e qualquer update de terminal. Terminal guarda código canônico e `finalizada_em`, mantém nó/contexto para diagnóstico e nunca possui `retomar_em`.

O módulo não executa nó e não cria `PassoExecucaoFluxo`. Também não agenda retomada: a semântica de `retomar_em` e os jobs reconstruíveis entram na PR 073.

## 21. Agendamento e recuperação da PR 073

`agendarRetomada` aceita somente uma execução `EXECUTANDO`, sua revisão atual e instante futuro. O commit resulta em:

```text
estado = AGUARDANDO_SISTEMA
retomar_em = instante futuro
revisao = revisao anterior + 1
```

O worker não agenda um temporizador por execução e não usa Redis como fila autoritativa. A cada varredura curta, o PostgreSQL seleciona no máximo 50 execuções vencidas, ordenadas por `retomar_em` e UUID, usando `FOR UPDATE SKIP LOCKED`. Cada selecionada percorre `RETOMAR`, limpa `retomar_em` e fica `EXECUTANDO` com nova revisão e auditoria no mesmo commit. Outro worker ignora a linha bloqueada; uma repetição posterior não a encontra como vencida.

Queda antes do commit deixa o agendamento disponível para nova varredura. Queda depois do commit deixa o estado `EXECUTANDO` persistido para o executor dos próximos PRs. Não há chamada Meta/ERP, avanço de nó ou escrita de contexto nesta etapa. Reiniciar o worker ou apagar o Redis não perde nem duplica a autoridade do job.

## 22. Nós de mensagem e lista da PR 074

O executor seleciona `ExecucaoFluxo.estado=EXECUTANDO` com `FOR UPDATE SKIP LOCKED`, uma execução por transação, relê exclusivamente `versao_fluxo_id` fixado e localiza `no_atual_id` nessa definição imutável. Ele suporta nesta etapa `INICIO`, `FIM`, `ENVIAR_MENSAGEM` e `ENVIAR_BOTOES_OU_LISTA`; as demais capacidades continuam negadas até sua PR. Uma definição fixa inconsistente encerra somente aquela execução como `FALHOU/DEFINICAO_FLUXO_INVALIDA`; ela não reverte nem bloqueia as demais execuções prontas.

Parâmetros publicados são fechados:

```text
ENVIAR_MENSAGEM
texto: 1..4096 caracteres

ENVIAR_BOTOES_OU_LISTA
texto: 1..3000 caracteres
opcoes: 1..10 itens únicos
  id: identificador controlado
  titulo: 1..80 caracteres
  descricao?: 1..120 caracteres
```

Campo extra, byte nulo, opção repetida ou fallback acima de 4.096 caracteres impede publicação. A execução repete a validação defensiva. Enquanto não existe capacidade estruturada real comprovada, lista/botões cria texto numerado pelo serviço de domínio e percorre `FALLBACK`. Não finge mensagem interativa.

O passo usa a revisão anterior ao avanço como ordinal único. Entrada sanitizada registra somente `tipoNo`; saída registra `resultado` e, quando houve criação, `mensagemId`. Conteúdo nunca entra no passo. `INICIO` segue `SUCESSO`; `FIM` conclui a execução. Os nós de saída seguem exatamente:

```text
ENVIAR_MENSAGEM
  SUCESSO | FALHA_TEMPORARIA | FALHA_DEFINITIVA

ENVIAR_BOTOES_OU_LISTA
  SUCESSO | FALLBACK | FALHA_TEMPORARIA | FALHA_DEFINITIVA
```

Antes de persistir, `ServicoMensagensSaida` confirma a revisão e que o atendimento ainda é BOT sem responsável. `MENSAGEM`, `EventoDominio`, `ItemCaixaSaida`, passo final, revisão e próximo nó confirmam na mesma transação. Perda de autoridade ou janela fechada não produz mensagem e segue falha definitiva. Falha técnica que impede a própria transação causa rollback e nova varredura, sem fabricar sucesso ou passo parcial.
