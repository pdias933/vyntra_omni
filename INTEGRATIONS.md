# Integrações — Omnichannel V1

## 1. Regra de fronteira

Domínio, web, mobile e Motor de Fluxos não conhecem endpoint, token, DTO ou código de erro de fornecedor.

```text
Caso de uso
  ↓
Serviço de domínio
  ↓
Porta/contrato interno
  ↓
Adapter
  ↓
API externa
```

O adapter:

- valida resposta externa;
- normaliza nomes e estados para português;
- remove/sanitiza dados desnecessários;
- classifica falhas como temporárias, definitivas ou de configuração;
- aplica timeout, circuit breaker e limite de concorrência;
- não expõe credencial ou payload bruto.

Limites de payload nunca excedem o teto interno aprovado. Para mídia, vale o menor valor entre imagem 8 MB, áudio 16 MB, vídeo 32 MB, PDF 20 MB e a capacidade real caracterizada do provedor.

## 2. Meta Cloud API

### 2.1 Escopo

`AdaptadorMetaCloud` é a única fronteira com a API oficial. A V1 prevê:

- múltiplas contas/números;
- webhooks de mensagem, estado e identidade;
- texto, imagem, áudio, vídeo e PDF;
- reply/citação, reação e preview de link quando suportados;
- botões/listas e templates;
- janela de atendimento do canal;
- WhatsApp Flows preparados;
- solicitação de compartilhamento de contato quando disponível;
- composição de segunda via/Pix/linha/link conforme capacidades liberadas.

Capacidade prevista não é prova de habilitação na conta. A versão da API, payloads e recursos comerciais devem ser verificados antes do adapter final.

Cada origem empresarial é identificada no domínio por `conta_whatsapp_id` UUID. Nome, telefone de exibição e identificadores externos são metadados da conta, não credenciais. Tokens, segredos, certificados e demais materiais de autenticação permanecem no cofre/configuração privada do `AdaptadorMetaCloud`, associados ao UUID interno e separados por ambiente. O cadastro nasce inativo e não habilita tráfego externo; ativação e teste real pertencem às PRs do adaptador.

### 2.2 Identidade

O adapter recebe termos externos e os converte:

| Entrada Meta | Saída interna |
|---|---|
| BSUID/`user_id` | identificador técnico associado a `IdentidadeWhatsApp` |
| `username` | nome de usuário opcional |
| `wa_id`/telefone | telefone E.164 opcional |
| `wamid`/ID da mensagem | `identificador_externo_mensagem` |
| nome de perfil | nome de perfil opcional |
| evento de mudança do identificador | atualização do mesmo contato + histórico de alias |

O schema não pode exigir telefone. Username não é chave. Uma atualização de BSUID não cria contato novo sem antes processar o vínculo anterior→atual informado pelo provedor.

Antes de congelar constraints, validar o escopo real de unicidade do BSUID no Business Portfolio configurado e os eventos disponíveis na versão usada.

### 2.3 Estados de mensagem

| Externo | Domínio |
|---|---|
| `sent` | `ENVIADA` |
| `delivered` | `ENTREGUE` |
| `read` | `LIDA` |
| `failed` | `FALHOU` |

`ENVIADA` só é persistida após a Meta aceitar o envio. Status repetido ou fora de ordem não retrocede a máquina.

### 2.4 Webhook de entrada

```text
HTTP webhook
  ↓ assinatura + tamanho + schema + conta
normalização no adapter
  ↓
transação: identidade/contato + atendimento + mensagem + evento + item de caixa de saída
  ↓ commit
resposta ao provedor
  ↓
Motor de Fluxos, tempo real, push e demais efeitos
```

`identificador_externo_mensagem + conta_whatsapp_id` possui unicidade no domínio. Repetição retorna resultado idempotente sem duplicar timeline.

### 2.5 Envio

```text
Comando interno MensagemSaida
  ↓ persistido NA_FILA
worker
  ↓ AdaptadorMetaCloud
Meta aceita
  ↓
identificador_externo_mensagem + ENVIADA
```

Falhas:

- indisponibilidade/timeout recuperável: retorna à fila com backoff e permite `REPROCESSAR_AGORA` ao administrador;
- destinatário inválido: `FALHOU`, sem nova tentativa automática;
- template rejeitado/inválido: `FALHOU`, desabilita uso incompatível e alerta;
- janela expirada para texto livre: bloqueada pelo domínio antes do adapter.

### 2.6 Templates

- sincronizar catálogo e estado da conta;
- organizar internamente por finalidade/fila sem duplicar o objeto externo;
- enviar apenas versão/idioma/aprovação válidos;
- fora da janela, oferecer template aprovado;
- enviar template não reabre a janela; resposta do contato reabre.

### 2.7 Segunda via e pagamentos

O domínio produz:

```text
ComposicaoFatura
fatura_id
valor
vencimento
documento_pdf?
pix_copia_cola?
linha_digitavel?
codigo_barras?
link_pagamento?
```

O adapter escolhe a representação suportada pela conta/versão. Se a experiência nativa de copiar Pix/código não estiver habilitada, usa fallback seguro com texto/documento apropriado. O domínio nunca conhece o nome do payload de pagamento da Meta.

### 2.8 WhatsApp Flows

`AdaptadorMetaCloud` mantém IDs, versões, criptografia e payloads externos. Entrega ao domínio somente `SubmissaoFormulario` validada e mapeada.

Validar no ambiente real:

- ciclo de publicação/imutabilidade;
- data channel e chaves;
- formato da submissão;
- versões de cliente suportadas;
- fallback quando indisponível;
- campos/categorias liberados para a conta.

### 2.9 Porta interna e simulador contratual

A PR 019 materializa `CanalMensageria` e `ConsumidorEventosMensageria`. O primeiro recebe apenas `ComandoEnvioMensagem` interno e devolve aceite ou falha normalizada; o segundo recebe mensagem/estado já convertidos para português. A chave idempotente é obrigatória, e aceite significa somente que o provedor aceitou o envio — é então que o caso de uso pode avançar para `ENVIADA`.

`AdaptadorMetaCloudSimulado` é um test double determinístico. Ele cobre aceite, falhas temporária/definitiva/configuração, repetição de envio, duplicidade concorrente na entrada e conversão `sent`/`delivered`/`read`/`failed`. Vocabulário externo permanece nesse arquivo. O simulador não representa o DTO HTTP oficial, não carrega credencial, não é registrado no runtime de produção e sua memória não é autoridade de idempotência real. O adapter real continua bloqueado até versão/capacidades oficiais e fixtures sanitizadas serem caracterizadas.

## 3. Porta `AdaptadorErp`

Contrato interno dividido por consulta e escrita.

### 3.1 Consultas

```text
localizarClientes(telefone?, documento?, nome?, id_externo?)
consultarCliente(cliente_externo_id)
listarContratos(cliente_externo_id)
consultarContrato(contrato_externo_id)

consultarSituacaoFinanceira(cliente/contrato)
listarFaturas(contrato)
consultarFatura(fatura)
obterDocumentoFatura(fatura)
obterDadosPagamento(fatura)

listarAtendimentos(cliente/contrato)
consultarAtendimento(protocolo)
listarOrdensServico(cliente/contrato)
consultarOrdemServico(ordem)
```

### 3.2 Escritas

```text
verificarDesbloqueioConfianca(contrato)
executarDesbloqueioConfianca(contrato, chave_idempotencia)

criarAtendimento(dados, chave_idempotencia)
adicionarComentarioAtendimento(protocolo, comentario, chave_idempotencia)
encerrarAtendimento(protocolo, motivo, chave_idempotencia)

criarOrdemServico(dados, chave_idempotencia)
atualizarOrdemServico(ordem, dados, chave_idempotencia)
```

Adicionar método ao contrato exige caso de uso real e semântica comum. Não copiar cada endpoint de fornecedor para a porta.

Cada método declara sua linha na matriz de risco. Consulta mascarada e criação de protocolo são inicialmente de baixo risco; financeiro resumido, listagem de faturas e sessão/contexto temporário são médios; envio de documento/Pix/linha, vínculo persistente, desbloqueio, desconexão e criação/alteração de OS são altos. O adapter nunca reduz os controles: alto risco exige ERP em tempo real, cliente/contrato explícitos, revalidação, prévia, confirmação, idempotência e auditoria no serviço de domínio. Capacidade ou prova não caracterizada retorna indisponibilidade/negação segura.

### 3.3 Ciclo do protocolo ERP

O `Atendimento` nasce com UUID interno e protocolo `PENDENTE`. A criação externa é uma `OperacaoIntegracao` persistida com chave de idempotência e item de caixa de saída; o UUID nunca é apresentado como protocolo alternativo.

Se o ERP confirmar o protocolo, uma transação local grava o valor oficial imutável, muda o vínculo para `OFICIAL` e conclui a operação recuperável. Se ocorrer timeout ou perda de resposta depois de possível criação externa, a operação muda para `RESULTADO_INCERTO`: o adaptador consulta por chave/referência segura e não repete a criação às cegas.

Backoff, limite de tentativas, campos de comentário e comportamento do ERP em encerramento/reabertura só podem ser congelados após a caracterização real do MK.

A PR 063 materializa o orquestrador interno desse ciclo. A intenção idempotente e o protocolo pendente nascem juntos; execução e reconciliação usam concessões distintas. Resultado incerto, exceção inesperada durante a chamada e concessão expirada convergem para reconciliação. Somente uma resposta normalizada `EFEITO_AUSENTE` libera outra criação; `CONFIRMADO` aplica uma vez o número oficial e encerra a tentativa na mesma transação. A chave é recebida novamente pelo worker e persiste apenas como hash. Nenhum DTO, endpoint, credencial ou provider MK foi acrescentado.

### 3.4 Contrato mínimo e simulador

A PR 020 materializa `AdaptadorErp` como composição de `ConsultasErp` e `EscritasErp`. A fatia inicial cobre localização de clientes, contratos, faturas, criação de atendimento/protocolo e reconciliação dessa criação. Consultas retornam modelos normalizados com origem `TEMPO_REAL`; indisponibilidade é explícita e não se apresenta como snapshot. Novos métodos entram somente junto do caso de uso que fixa sua semântica comum.

`AdaptadorErpSimulado` recebe apenas dados sintéticos e relógio controlado. Criação confirmada devolve protocolo oficial determinístico; indisponibilidade anterior à chamada declara que não existe efeito externo; perda de resposta cria o efeito simulado, devolve `RESULTADO_INCERTO` e permite encontrá-lo apenas pela reconciliação. Repetição compatível reaproveita o resultado e chave divergente falha. A memória existe somente para testes: produção continua exigindo `OperacaoIntegracao`, idempotência PostgreSQL, caixa de saída e auditoria.

O simulador não contém DTO MK, credencial, endpoint ou inferência sobre campos reais e não é registrado no runtime. `AdaptadorMkSolutions` permanece bloqueado até a caracterização da seção 4.3; `AdaptadorSessaoAcesso` continua uma porta separada.

A PR 060 completa a semântica interna de busca e detalhe com `consultarCliente` e `consultarContrato`. `ServicoConsultasClienteContratoErp` valida critérios antes da porta e revalida a resposta normalizada: limites, identificadores relacionados, estados canônicos e allowlist de campos. Campo desconhecido ou contrato pertencente a outro cliente falha fechado como `RESPOSTA_CONSULTA_ERP_INVALIDA`; ausência exata é distinta de indisponibilidade. Toda resposta bem-sucedida informa `TEMPO_REAL`. O serviço, a porta e seus consumidores não conhecem nomes MK, famílias WSMK ou DTOs externos. O adapter real continua sem provider até existirem fixtures reais aprovadas; os testes desta etapa usam somente o simulador sintético.

A PR 061 acrescenta `consultarFatura`, `obterDocumentoFatura` e `obterDadosPagamentoFatura` à porta interna. `ServicoFinanceiroErp` valida vínculo fatura↔contrato, estado, valor, vencimento, assinatura e teto do PDF, formato de Pix e linha digitável. Documento e pagamento têm disponibilidade independente; ausência ou capacidade não habilitada produz resposta `PARCIAL` com motivo explícito, nunca valor inventado. Fatura inexistente e ERP indisponível continuam distintos. Sucesso sempre declara `TEMPO_REAL`; financeiro não usa snapshot como fallback. O documento cru é convertido pelo adapter em bytes internos e não transporta URL, Base64 ou nomenclatura do fornecedor.

## 4. `AdaptadorMkSolutions`

É a primeira implementação de `AdaptadorErp`.

### 4.1 Capacidades esperadas

- localizar cliente por CPF/CNPJ, telefone e nome;
- sincronização incremental de clientes alterados;
- consultar contratos e conexões cadastradas;
- obter planos, velocidades, status e endereços quando retornados;
- consultar situação financeira e faturas;
- obter segunda via, Pix e linha digitável/código;
- verificar e executar desbloqueio de confiança;
- criar atendimento/protocolo;
- inserir comentário/link da transcrição;
- alterar/encerrar atendimento quando necessário;
- criar/atualizar OS, vinculando ao protocolo;
- listar chamados/OS quando a API permitir.

Parte dessas capacidades depende de APIs especiais/licenciamento/liberação comercial. Nenhuma funcionalidade deve ser marcada pronta apenas porque aparece em documentação pública.

### 4.2 Clientes internos

A documentação mistura estilos. O adapter pode conter:

```text
AdaptadorMkSolutions
├── ClienteMkRegrasLegadas
└── ClienteMkRest
```

Essa divisão não atravessa a fronteira. O restante do sistema só conhece respostas normalizadas.

### 4.3 Caracterização obrigatória

Antes de congelar DTOs, executar chamadas reais controladas e guardar fixtures sanitizadas de:

- cliente por documento, telefone e nome;
- contratos, conexões, plano, velocidade, status e endereço;
- faturas e situação financeira;
- formato da segunda via: bytes, Base64, URL, HTML ou outro;
- Pix, linha digitável/código de barras;
- protocolo de atendimento, campos obrigatórios e comentários;
- elegibilidade, sucesso e erros do desbloqueio;
- criação, alteração e vínculo de OS;
- paginação, datas de alteração, limites e códigos de erro.

Não inventar campos ausentes nem transformar imagem de documentação em contrato.

A PR 059 registrou a caracterização pública em `docs/integracoes/PR-059-CARACTERIZACAO-MK-SOLUTIONS.md`. As fontes oficiais comprovam perfil de webservice, restrição por IP, token expirável, famílias gerais e um catálogo especial sujeito a contratação/liberação. Como não foi fornecido ambiente real, os exemplos públicos de saída são imagens e não há semântica pública suficiente de paginação ou erros, a fixture permanece `FIXTURE_PUBLICA_SANITIZADA`: respostas `NAO_OBSERVADA`, DTO `NAO_CONGELADO` e paginação `NAO_DOCUMENTADA` quando aplicável. `ValidadorCaracterizacaoMkSolutions` só permite ativação com evidência `AMBIENTE_REAL` completa. Nenhum provider MK foi registrado.

### 4.4 Segurança MK

- usuário exclusivo da instalação;
- menor conjunto de serviços;
- leitura/escrita separadas quando possível;
- HTTPS obrigatório;
- IP allowlist e VPN/rede privada quando disponíveis;
- token/credencial em secret manager;
- não logar URL completa quando houver segredo/query sensível;
- timeout curto por operação, circuit breaker e limite de concorrência;
- sanitizar toda resposta antes de log/trace;
- registrar somente código normalizado, duração, tentativa e correlação.

### 4.5 Desbloqueio de confiança

Fluxo obrigatório:

```text
identidade/contexto autorizado
  ↓
verificarDesbloqueioConfianca em tempo real
  ↓
regra interna de um a cada 30 dias
  ↓
confirmação/política da ação
  ↓
OperacaoErp idempotente
  ↓
executar no MK
  ↓
auditoria + evento
```

Não assumir que um parâmetro externo isolado implementa toda a política de 30 dias.

A PR 064 acrescenta à porta de consulta `verificarElegibilidadeDesbloqueio`. O adapter devolve apenas contrato e decisão booleana normalizados; campo externo desconhecido, contrato divergente ou origem diferente de `TEMPO_REAL` falha fechado. O serviço combina essa decisão com `RegistroDesbloqueioConfianca`, que preserva somente ações confirmadas, e informa separadamente `ERP_NAO_AUTORIZOU` e `INTERVALO_30_DIAS`. A janela local é de 30 × 24 horas. A verificação exige contexto ativo e RBAC, mas não adquire concessão, não chama escrita e não registra desbloqueio. Indisponibilidade e capacidade não habilitada continuam explícitas; snapshot é recusado.

A PR 065 acrescenta `executarDesbloqueioConfianca` e `reconciliarDesbloqueioConfianca` à porta de escrita. A execução normalizada pode ser `CONFIRMADO`, `INDISPONIVEL` sem possibilidade de efeito ou `RESULTADO_INCERTO`; somente a reconciliação distingue efeito confirmado de comprovadamente ausente. O serviço exige confirmação explícita, permissão de execução, contexto exato, elegibilidade ERP em tempo real e uma reserva única por contrato antes de chamar o adapter. Repetição compatível devolve o mesmo resultado; outra chave não atravessa uma reserva pendente. Código, resposta ou campo não normalizado falha de modo conservador e nunca libera repetição cega. O adapter MK real continua desligado até sua capacidade e seus contratos serem observados e aprovados.

A PR 066 acrescenta quatro operações à porta de escrita: criar e reconciliar criação de ordem de serviço, atualizar e reconciliar atualização. Os comandos usam exclusivamente o modelo interno e carregam atendimento, chave idempotente, cliente, contrato e protocolo oficial; criação/atualização acrescentam assunto e descrição, enquanto atualização referencia a ordem externa já confirmada. Os resultados distinguem confirmação, indisponibilidade anterior ao efeito e resultado incerto. O serviço local mantém versão, reserva e histórico; o adapter não decide autorização, contexto nem concorrência. Nenhum DTO, endpoint ou comportamento não observado do MK foi inventado, e o provider real permanece desligado.

A PR 067 acrescenta comentário, encerramento e suas reconciliações à porta de escrita. Os comandos internos carregam atendimento, protocolo oficial, chave e conteúdo específico; resultados distinguem `CONFIRMADO`, `INDISPONIVEL` sem efeito possível e `RESULTADO_INCERTO`. Capacidade não habilitada é explícita. O serviço, não o adapter, decide autorização, versões, reserva e transição local. A evidência pública da PR 059 ainda marca comentário e alteração/encerramento como `NAO_OBSERVADA`; portanto nenhum DTO, endpoint ou provider MK real foi criado. O link público não entra na porta nem é enviado como comentário: permanece desligado pela decisão jurídica aprovada.

## 5. `SnapshotCliente` (Customer Snapshot)

### 5.1 Natureza

É modelo de leitura persistente de contingência no PostgreSQL. Redis pode cachear, mas o snapshot sobrevive à perda de Redis.

Estrutura conceitual:

```text
ClienteSnapshot
├── TelefoneClienteSnapshot
├── EnderecoClienteSnapshot
└── ContratoSnapshot
    └── ConexaoCadastradaSnapshot?
```

Campos:

- IDs externos;
- nome/razão social;
- documento criptografado, máscara e HMAC de busca;
- telefones e e-mail;
- situação cadastral;
- contratos, plano, velocidade, status;
- situação financeira resumida conhecida, quando a API a fornecer;
- endereço e vencimento quando disponíveis;
- identificadores de conexão cadastrada;
- `sincronizado_em`.

### 5.2 Uso permitido

- identificar contato/cliente;
- mostrar nome e documento mascarado;
- exibir vínculos e contratos conhecidos;
- mostrar plano, velocidade, endereço e status conhecidos;
- mostrar situação financeira resumida somente como `SNAPSHOT`, com data de sincronização visível;
- escolher contexto e transferir ao humano;
- informar origem `SNAPSHOT` e horário.

### 5.3 Uso proibido

- afirmar fatura/financeiro atual;
- gerar Pix atual;
- executar desbloqueio;
- criar/encerrar protocolo;
- criar/alterar OS;
- executar qualquer escrita;
- decidir automaticamente com base em dado potencialmente velho.

### 5.4 Sincronização

`ServicoSincronizacaoErp` faz:

- incremental por marcador/data confirmados na API real;
- upsert idempotente;
- refresh sob demanda ao iniciar atendimento quando MK está disponível;
- marcação de origem e idade;
- alerta de atraso/falha;
- reconciliação sem apagar dado válido por resposta parcial.

Semântica de “alterado desde”, paginação, exclusões e tombstones deve ser caracterizada antes de depender do incremental para completude. Se a API não informar exclusões de modo confiável, executar reconciliação completa periódica ou marcar registros como obsoletos; dado antigo nunca pode ser apresentado como ativo sem origem e idade.

A PR 062 implementa o consumidor interno dessa semântica sem inventar o contrato MK. O incremental aceita no máximo 100 alterações e só exclui diante de `TOMBSTONE_ERP`; a reconciliação aceita ausências apenas quando o chamador declara que a enumeração foi confirmada completa. IDs repetidos no mesmo lote são recusados. O PostgreSQL persiste `ATUAL`, `OBSOLETO` ou `EXCLUIDO`, motivo, instante e versão, preservando o último documento protegido. Observação posterior reativa; sinal mais antigo é ignorado. Como paginação e cursor MK continuam não caracterizados, nenhum job/provider externo é registrado e lote incompleto nunca pode se declarar completo.

## 6. `AccessSessionAdapter` separado

O contrato solicitado fica separado do ERP. Nome canônico em português no domínio: `AdaptadorSessaoAcesso`; nome técnico/compatibilidade: `AccessSessionAdapter`.

```text
listarSessoes({
  contrato_id,
  conexao_id?,
  nome_usuario?
})

consultarSessao({ sessao_id })

desconectarSessao({
  sessao_id,
  motivo,
  chave_idempotencia
})
```

Resposta pode conter, se a fonte fornecer:

```text
sessao_id
estado: ATIVA | INATIVA | DESCONHECIDA
nome_usuario?
ip?
iniciada_em?
duracao?
origem_dado
obtida_em
```

O contrato faz parte da V1. A implementação real é condicional a uma fonte confiável validada:

- endpoint oficial do MK, se contratado e semanticamente correto;
- FreeRADIUS;
- Huawei;
- MikroTik;
- outro AAA/controlador aprovado.

“Conexão cadastrada/ativa no ERP” não é sinônimo de “sessão PPPoE ativa agora”. O adapter deve converter os estados externos para os estados canônicos acima e nunca informar `ATIVA` sem validar a fonte. A falta dessa integração não bloqueia o restante do piloto; o recurso fica desligado por controle de recurso.

`desconectarSessao` é escrita sensível. O caso de uso exige sessão válida, permissão `DESCONECTAR_SESSAO_ACESSO`, contexto de cliente/contrato autorizado, confirmação explícita, `OperacaoIntegracao` idempotente e auditoria. A UI e o Motor de Fluxos nunca chamam essa porta diretamente.

### 6.1 Contrato e simulador desligado

A PR 021 materializa `AdaptadorSessaoAcesso` com `listarSessoes`, `consultarSessao`, `desconectarSessao` e `reconciliarDesconexao`. Leituras bem-sucedidas informam `TEMPO_REAL` e instante de obtenção; fonte ausente, recurso desligado e indisponibilidade são resultados distintos. Desconexão de estado `DESCONHECIDA` é negada, e resposta perdida permanece incerta até reconciliação.

`AdaptadorSessaoAcessoSimulado` exige que cada fixture declare `ATIVA`, `INATIVA` ou `DESCONHECIDA`; ele nunca deriva estado de contrato/conexão. O simulador nasce `DESATIVADO`, não é provider da aplicação e sua memória não substitui controle de recurso, autorização, auditoria ou idempotência PostgreSQL. A migration cria `SESSAO_ACESSO` desativado, sem administradores, usuários, filas ou percentual liberado. Nenhuma fonte PPPoE/AAA real foi escolhida.

## 7. Disparos transacionais vindos do ERP

O ERP é dono da regra/configuração do disparo; o omnichannel é gateway.

Contrato conceitual:

```text
POST /api/v1/integracoes/erp/disparos

chave_idempotencia
finalidade
cliente/contato alvo
conta_whatsapp
template
parametros
referencia_erp
callback_id?
```

Cada requisição cria no máximo uma mensagem. `chave_idempotencia` é obrigatória: mesma chave e mesmo corpo retornam o mesmo `disparo_id`; corpo diferente retorna `409`. A aceitação retorna `202` com `disparo_id` e estado `NA_FILA`; envio nunca é tratado como síncrono.

Processo:

1. autenticar sistema chamador;
2. validar finalidade, consentimento/política e conta/template;
3. deduplicar por chave/finalidade/referência e recusar reuso incompatível;
4. resolver contato/identidade sem criar vínculo inseguro;
5. persistir a mensagem como `NA_FILA`, já visível na timeline, junto do item de caixa de saída;
6. enviar via Meta;
7. atualizar a mensagem com aceitação/falha e gerar novo evento;
8. devolver/emitir `NA_FILA`, `ENVIADA`, `ENTREGUE`, `LIDA` ou `FALHOU` ao ERP.

Autenticação máquina-a-máquina usa credencial própria por ambiente, escopo mínimo, TLS e rotação. Callback não aceita URL da requisição: `callback_id` referencia destino previamente cadastrado, com assinatura e eventos idempotentes; consulta autenticada por `GET` é fallback obrigatório. O registro de idempotência dura pelo menos tanto quanto a mensagem.

O limite inicial é 60 requisições por minuto por credencial, com burst de 20. Finalidade pertence a allowlist transacional e consentimento/opt-out são verificados antes da fila. Endpoint e callback reais permanecem desligados até caracterizar capacidade do ERP e aprovar a política jurídica/DPO. Simuladores podem validar o contrato interno. Não construir lote, campanha ou criador de campanha na V1.

### 7.1 Núcleo interno materializado

A PR 051 materializa `AplicacaoIntegracao`, `ConsentimentoContatoCanal` e `DisparoTransacional`, sem publicar controller nem inventar DTO do MK. O segredo de alta entropia entra no PostgreSQL somente por SHA-256 e a autenticação usa comparação em tempo constante. Aplicação inativa falha fechada.

O consentimento é único por contato, conta WhatsApp e finalidade `MENSAGEM_TRANSACIONAL`. O disparo referencia o consentimento usado, conserva apenas o hash da chave idempotente e a assinatura do comando, e cria uma `Mensagem` de máquina `MODELO_APROVADO` em `NA_FILA`, sem usuário remetente. Repetição compatível recupera o mesmo disparo; reuso divergente é recusado. O estado devolvido ao chamador é sempre projetado da máquina de `Mensagem`, sem uma segunda fonte de verdade.

Constraints e trigger validam novamente aplicação ativa, consentimento vigente, contato, conta, direção, tipo e estado no instante do insert. O registro do disparo é imutável. A ativação externa continua bloqueada pelos portões de autenticação/callback do ERP e consentimento/opt-out jurídico; a base interna aprovada não autoriza tráfego real por si só.

## 8. Operações externas idempotentes

```text
OperacaoIntegracao
id
sistema
tipo
atendimento_id?
cliente_externo_id?
contrato_externo_id?
estado: PENDENTE | EXECUTANDO | RECONCILIACAO_NECESSARIA | CONCLUIDA | FALHOU
chave_idempotencia
executada_por_usuario_id?
executada_por_fluxo_id?
tentativas
codigo_erro?
criada_em
concluida_em?
```

A chave possui escopo explícito. Resposta HTTP perdida não autoriza repetir efeito. Quando a API externa não oferece idempotência, o adapter e a operação local implementam deduplicação/reconciliação conservadora.

## 9. Erros normalizados

Adapters convertem detalhes externos em códigos internos, por exemplo:

```text
INTEGRACAO_INDISPONIVEL
TEMPO_LIMITE_EXCEDIDO
LIMITE_EXTERNO_EXCEDIDO
CREDENCIAL_INVALIDA
CAPACIDADE_NAO_HABILITADA
RECURSO_EXTERNO_NAO_ENCONTRADO
DADOS_EXTERNOS_INVALIDOS
FALHA_TEMPORARIA
FALHA_DEFINITIVA
RECONCILIACAO_NECESSARIA
```

Mensagem ao usuário não expõe endpoint/código secreto. Log técnico pode guardar código externo sanitizado apenas dentro do contexto do adapter.

## 10. Saúde e observabilidade

Por integração:

- estado `DISPONIVEL`, `DEGRADADA` ou `INDISPONIVEL`;
- sucesso/erro e latência média/p95;
- circuit breaker;
- fila e tentativas;
- último sucesso/erro sanitizado;
- capacidade/licença ausente distinguida de indisponibilidade.

`correlacao_id` atravessa comando, worker e adapter. Métricas nunca incluem CPF, telefone integral, Pix ou conteúdo.

## 11. Estratégia de testes

- contratos de adapter com fixtures sanitizadas reais;
- simulador determinístico para domínio e Motor de Fluxos;
- testes de schema contra amostras da versão externa;
- webhook duplicado, fora de ordem, inválido e excessivo;
- timeout, 429, 5xx, resposta parcial e conteúdo inesperado;
- idempotência com resposta perdida;
- circuit breaker abre/fecha sem contaminar estado;
- snapshot usado apenas em consultas permitidas;
- write recusada quando origem é `SNAPSHOT`;
- segredo/payload não aparece em log;
- ambiente de staging usa números/clientes controlados e dados sanitizados.

## 12. Portões de validação

Não considerar integração concluída até documentar:

- versão real da Meta e recursos habilitados;
- payloads reais de identidade, mensagens, pagamentos e formulários;
- APIs especiais/licenças do MK;
- fixtures sanitizadas e contratos aprovados;
- regra real de protocolo/reabertura/comentário;
- comportamento real do desbloqueio;
- fonte e semântica de sessão PPPoE;
- segredos, allowlists, rate limits e callbacks por ambiente.

## 13. Integração dos nós de fatura da PR 078

O Motor de Fluxos acessa finanças apenas por `ServicoFaturasFluxo`, que normaliza o `ServicoFinanceiroErp`; o executor não importa adapter, SDK, DTO ou vocabulário do MK Solutions. A chamada ao ERP acontece fora da transação e a aplicação revalida toda a autoridade local ao retornar.

O token `ADAPTADOR_ERP` é opcional e nenhum provedor real ou simulado é registrado na aplicação nesta PR. Sem contrato real configurado, os nós falham fechados com `ERP_INDISPONIVEL`. O simulador determinístico existe somente nos testes e não habilita capacidade em staging ou produção.

Resposta financeira permanece em memória protegida e apenas a referência interna da fatura selecionada entra no contexto protegido. Pix, linha digitável, documento, identificador externo e bytes de PDF não entram em passo, auditoria ou log. Um PDF só poderá ser enviado por uma ponte privada de mídia explicitamente implementada; enquanto ela não existir, a composição é parcial e nunca usa snapshot ou URL fabricada.

## 14. Fronteira de WhatsApp Flows da PR 079

Até o envio estruturado ser caracterizado no ambiente real, `SOLICITAR_FORMULARIO_WHATSAPP` não chama a Meta e segue `FALLBACK` pelo serviço de mensagens. O adapter futuro deverá receber o UUID interno, resolver nele a referência externa e devolver somente aceite/falha normalizados; token, payload e criptografia não podem entrar na definição nem no passo.

Na recepção, o adapter entrega `SubmissaoFormularioNormalizada` sem conservar o token usado pelo protocolo. O domínio deriva conta, contato, conversa e atendimento da mensagem de entrada, compara um hash canônico e persiste uma única submissão por mensagem e por referência. Repetição compatível não emite novo evento; divergência é incidente de idempotência. Simulador e fixture não habilitam essa capacidade em staging ou produção.

## 15. Escritas ERP do Motor de Fluxos da PR 080

O executor não chama MK nem conhece DTO externo. `ServicoProtocolosOrdensFluxo` depende da porta interna `EscritasErp` e entrega comandos aos serviços de protocolo/OS já idempotentes. Identificadores externos vêm somente do contexto persistido; a definição não os transporta. `RESULTADO_INCERTO` exige a operação de reconciliação correspondente antes de outra tentativa. Ausência do provider real produz `INDISPONIVEL`, sem snapshot, simulador ou resposta fabricada.
