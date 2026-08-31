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

Se o ERP confirmar o protocolo, uma transação local grava o valor oficial imutável, muda o vínculo para `OFICIAL`, associa o histórico já existente, gera evento e agenda a informação ao contato. Se ocorrer timeout ou perda de resposta depois de possível criação externa, a operação muda para `RECONCILIACAO_NECESSARIA`: o adaptador consulta por chave/referência segura e não repete a criação às cegas.

Backoff, limite de tentativas, campos de comentário e comportamento do ERP em encerramento/reabertura só podem ser congelados após a caracterização real do MK.

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
