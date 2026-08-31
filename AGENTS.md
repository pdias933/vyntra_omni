# AGENTS.md — regras do projeto Omnichannel V1

Estas instruções valem para todo o repositório. Arquivos `AGENTS.md` mais próximos podem acrescentar regras específicas, mas não podem enfraquecer segurança, invariantes ou escopo sem decisão formal.

## 1. Antes de alterar código

Leia os documentos relacionados à tarefa:

1. `SECURITY.md` para qualquer autenticação, autorização, dado, upload, integração ou endpoint.
2. `DOMAIN.md` para entidades, estados, eventos e invariantes.
3. `PRODUCT.md` para confirmar que a tarefa pertence à V1.
4. `ARCHITECTURE.md` e `INTEGRATIONS.md` para fronteiras técnicas.
5. `FLOWS.md`, `MOBILE.md` ou `OPERATIONS.md` quando aplicável.

Se os documentos conflitarem, não escolha silenciosamente. Pare a parte afetada, registre o conflito e peça/obtenha uma decisão. Segurança, invariantes e escopo têm a precedência descrita no `README.md`.

Para mudança de interface, leia conjuntamente `PRODUCT.md`, `MOBILE.md`, `ARCHITECTURE.md` e [as referências conceituais](design/references/README.md). A precedência é:

1. segurança, autorização e invariantes;
2. requisitos escritos de produto e mobile;
3. referências visuais conceituais;
4. implementação existente.

Nunca copie uma referência quando ela contradizer texto aprovado. Imagens orientam linguagem, hierarquia e comportamento; não são especificação pixel a pixel.

## 2. Escopo que não deve ser ampliado

A V1 é WhatsApp, single-tenant por instalação, monólito modular TypeScript.

Não implementar sem tarefa/decisão explícita:

- IA, transcrição automática de áudio, visão, intenção, resumo ou copiloto;
- ACS, ONU/ONT, Wi-Fi, telemetria ou massivas;
- outros canais além do WhatsApp;
- multitenancy compartilhado;
- colaboração simultânea de atendentes;
- criador interno de campanhas;
- editor completo de WhatsApp Flows;
- HTTP genérico, webhooks arbitrários ou código executável em fluxos;
- Kubernetes, microserviços ou OpenSearch;
- integração PPPoE fictícia;
- código morto para recursos futuros.

## 3. Linguagem obrigatória

Use português em:

- entidades, campos e enums de domínio;
- serviços/casos de uso;
- eventos, permissões e códigos de erro;
- migrations e nomes de negócio no banco;
- logs de negócio e diagnóstico;
- testes e fixtures do domínio.

Termos externos permanecem originais apenas dentro do adapter. Converta na entrada:

```text
sent → ENVIADA
delivered → ENTREGUE
read → LIDA
failed → FALHOU
```

Não propague DTOs/nomenclatura Meta ou MK para domínio, UI ou Motor de Fluxos.

## 4. Arquitetura

- Backend NestJS é um monólito modular.
- PostgreSQL é a fonte da verdade.
- Redis/BullMQ são recuperáveis e nunca a única cópia de negócio.
- Alteração, `EventoDominio` e `ItemCaixaSaida` devem compartilhar transação quando houver efeito assíncrono.
- Persistir antes de enviar realtime, push, Meta ou ERP.
- Controller recebe/valida formato e delega; não contém regra de negócio.
- Domínio não importa NestJS, Prisma, Redis ou SDK externo.
- UI envia comando e renderiza estado; não decide transição.
- Motor de Fluxos chama serviço de domínio, nunca adapter/URL.
- Web usa REST + SSE. Mobile usa REST + WebSocket em primeiro plano, push em background e sync por `sequencia_evento`.
- SDK web/mobile é gerado de OpenAPI; não copiar DTO manualmente.

### 4.1 Guardas obrigatórias de experiência

- Mobile deve parecer mensageria nativa premium, nunca CRM web comprimido.
- Web compartilha identidade e semântica, mas possui composição desktop própria; não ampliar literalmente o app.
- Estado saudável não mostra atualização, horário de sync, cursor ou infraestrutura.
- A lista usa somente `Meus`, `Pendentes`, `Não lidos`, `SLA`, `Expirando` e `Em automação`; não duplicar esses estados em cards.
- Nova mensagem reorganiza a lista pela última atividade confirmada; `conversa_id` apenas preserva a identidade visual durante a animação.
- A conversa mantém cabeçalho com contato, contexto essencial e indicador/countdown da janela Meta quando relevante; não repete atalhos de cliente, contrato, histórico, mídias ou notas abaixo dela.
- Nome/avatar abre Detalhes do Contato; voltar preserva timeline e rascunho. Essa tela concentra identidade WhatsApp, cliente ERP, documento mascarado, vínculos e contexto/contrato ativo trocável; contato não identificado oferece `Vincular a cliente`.
- `/` abre respostas rápidas. O botão ERP/sistema fica ao lado de anexos com o campo vazio e abre bottom sheet; quando existe texto, o envio recebe prioridade. Efeito real exige seleção, prévia e confirmação.
- Mensagens suportam swipe para responder/citar, toque longo, navegação até a citação original, áudio, mídia em tela cheia, PDF, busca e estados de envio/entrega/leitura/falha.
- Nota ou evento interno deve ser impossível de confundir com mensagem ao cliente e trazer `Somente equipe`.
- Timeline continua por contato; origem, data, atendimento e protocolo aparecem como metadados/separadores discretos.
- App e web exibem card de WhatsApp Flow com `Ver formulário` e mascaramento/permissão.
- Usar cor para estado e ação, não decoração.
- Reanimated, Gesture Handler, haptics, skeletons e microinterações não podem bloquear trabalho e devem respeitar “Reduzir Movimento”.
- UI oculta ou desabilitada nunca substitui autorização no backend.

## 5. Invariantes inegociáveis

- Uma instalação representa uma empresa.
- Um contato possui uma timeline contínua na instalação.
- Mensagem e atendimento preservam conta WhatsApp de origem.
- Protocolo exibido é oficial do ERP; indisponibilidade gera protocolo pendente, não número local parecido.
- Atendimento e janela Meta são estados separados.
- `ENVIADA` só após aceitação da Meta.
- Um atendimento possui no máximo um responsável humano atual.
- Resgate/transferência/assunção são atômicos e incrementam `versao_atribuicao`.
- Resgate humano suspende o fluxo antes de qualquer nova resposta automática.
- Nota interna nunca entra no pipeline Meta ou transcrição pública.
- Snapshot serve para identificação/contexto, nunca para escrita.
- Toda escrita externa sensível é idempotente e auditada.
- Chave idempotente sempre possui escopo e assinatura do comando; chave e token de concessão persistem somente como hash.
- Timeout, resposta perdida ou concessão expirada viram `RESULTADO_INCERTO`; nunca repetir efeito externo ambíguo sem reconciliar.
- Evento só é distribuído após commit.
- Alteração com efeito assíncrono usa `ServicoTransacaoDominio`; evento e caixa de saída não podem ser persistidos por transações independentes.
- Remover permissão invalida stream e cache local.
- Encerramento, expiração, deploy ou nova tentativa não apagam histórico/auditoria.

Não atualize estado com `update` genérico. Use caso de uso/método de domínio que valida a transição.

## 6. Segurança

Proibido:

- adicionar dependência sem justificar necessidade, manutenção, licença e superfície de ataque;
- desativar validação/autorização para fazer o caso passar;
- usar `any`, cast ou coerção para contornar contrato sensível;
- inserir segredo, token, certificado ou dado real em código/fixture;
- logar payload completo da Meta/MK, CPF, Pix, linha digitável ou formulário sensível;
- implementar autorização somente escondendo botão;
- aceitar URL arbitrária, SQL, JavaScript ou shell em fluxo;
- filtrar autorização somente no frontend ou depois de carregar tudo;
- enfraquecer controle para corrigir teste;
- retornar stack/detalhe externo ao usuário.

Toda leitura/escrita valida sessão + usuário + permissão + fila/escopo + recurso + estado. Padrão é negar.

Use os serviços centralizados de autorização, proteção de dados, idempotência, auditoria, sanitização e validação de arquivo.

`ServicoIdempotencia` deve participar da transação local que registra a intenção quando aplicável. A chamada externa ocorre após commit, sob concessão persistente. Não substitua constraint/versão PostgreSQL por lock apenas em Redis e não altere estado de operação recuperável diretamente para “forçar” nova tentativa.

`RegistroAuditoria` é somente de acréscimo. Código de aplicação usa `ServicoAuditoria`; não chama `update`, `delete`, `upsert` ou `truncate`, não desabilita seus triggers e não cria rota administrativa de mutação. Uma ação que exige auditoria falha se o registro não puder participar da mesma transação local.

## 7. Banco e migrations

- Nunca editar migration já aplicada.
- Migrations de produção seguem expandir→migrar→contrair.
- Não renomear/remover coluna usada pela versão antiga no mesmo deploy.
- Backfill grande é job observável e retomável, não bloqueio de startup.
- Preferir constraints reais para unicidade e coerência.
- SQL bruto somente quando Prisma não atende, com justificativa, parâmetros, teste e revisão de plano.
- Toda query de timeline/busca aplica autorização no banco; não filtrar em memória.
- Índice de CPF é HMAC/índice protegido, não hash simples.

## 8. Integrações

- Não inventar DTO/campo do MK ou Meta.
- Antes de congelar adapter, usar contrato oficial vigente e fixtures sanitizadas de chamadas reais controladas.
- Classificar erro externo em código interno estável.
- Aplicar timeout, circuit breaker, limite de concorrência e sanitização no adapter.
- `AdaptadorMkSolutions` implementa `AdaptadorErp`; nome MK não aparece no domínio.
- `AccessSessionAdapter`/`AdaptadorSessaoAcesso` é separado do ERP.
- Não afirmar sessão `ATIVA` a partir de conexão apenas cadastrada no ERP.
- Não implementar provedor PPPoE até existir fonte confiável aprovada.

## 9. Motor de Fluxos

- Versão publicada é imutável.
- Execução continua na versão em que iniciou.
- Publicar exige validação, permissão e auditoria.
- Ciclo sempre tem limite; integração sempre tem timeout/saída de falha.
- Espera longa persiste `retomar_em`; worker não dorme.
- Passos são sanitizados.
- Publicar configuração não concede capacidade nova.
- Simulador não chama produção externa nem altera dados reais.

## 10. Mobile e sincronização

- SQLite é réplica/cache.
- Persistir cursor apenas depois de aplicar lote local.
- Após sync, WebSocket conecta com cursor e recebe backfill antes do vivo.
- Eventos são aplicados idempotentemente por `sequencia_evento`.
- Push avisa; nunca vira fonte da verdade.
- Pendência offline sincroniza antes de enviar.
- Mudança relevante produz `REVISAO_NECESSARIA`.
- “Enviar mesmo assim” não ignora autorização, janela ou atribuição.
- Perda de permissão remove/inutiliza dado local correspondente.
- Fechar app/stream não muda disponibilidade do usuário.

## 11. Testes obrigatórios por tipo de mudança

### Domínio

- transição válida e inválida;
- invariantes/constraints;
- idempotência;
- relógio controlado para janela/calendário.

### Concorrência

- dois resgates têm um vencedor;
- resgate versus passo do Motor de Fluxos deixa uma autoridade;
- clique duplo em escrita externa produz um efeito.

### Meta/webhook

- assinatura inválida;
- replay/duplicidade;
- status fora de ordem;
- falha temporária e definitiva;
- texto livre com janela expirada.

### Autorização

- usuário de outra fila;
- UUID conhecido sem acesso;
- endpoint admin chamado por atendente;
- permissão removida durante stream/sync;
- histórico transversal e dado sensível.

### Mobile/sync

- evento entre sync e WebSocket;
- lote repetido;
- cursor antigo/ressincronização;
- resposta web durante offline;
- transferência/assunção durante offline;
- sessão/dispositivo revogado.
- estado saudável sem indicador técnico de sync;
- faixa `Sem conexão` → `Conectando...` → `Sincronizando...` → oculto;
- nova mensagem sobe a conversa sem perder foco, seleção ou rascunho;
- retorno de Detalhes preserva posição da timeline e composer;
- fluxo equivalente com “Reduzir Movimento” ativo;
- ação ERP com seleção, prévia, confirmação e cancelamento;
- nota/evento interno visualmente distinto e marcado `Somente equipe`;
- card de WhatsApp Flow com `Ver formulário` e dado mascarado.

### Operações

- reinício após commit e antes do efeito;
- Redis apagado;
- worker retomando job;
- migration compatível com versão anterior;
- health/readiness.

Não use apenas mocks quando o risco está em constraint, transação ou concorrência do PostgreSQL.

## 12. Tamanho e formato do PR

Cada PR deve ter um objetivo principal e ser reversível/revisável. Evite misturar:

- refactor amplo + feature;
- migration + remoção imediata de compatibilidade;
- vários adapters;
- backend, web e mobile completos de uma feature grande;
- mudança de arquitetura não solicitada.

Descrição mínima:

```text
Objetivo
Escopo incluído
Fora do escopo
Invariantes afetados
Riscos de segurança/dados
Migration/compatibilidade
Testes executados
Evidência de aceite
Rollback/flag
Documentos atualizados
```

Funcionalidade incompleta vai desativada por controle de recurso; não por código comentado.

## 13. Comandos de verificação

Quando o monorepo estiver inicializado, a raiz deve fornecer:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm verificar:dependencias
pnpm verificar:expo
pnpm verificar:segredos
pnpm build
```

Para o ambiente Docker de desenvolvimento:

```text
pnpm ambiente:preparar
pnpm ambiente:validar
pnpm ambiente:subir
pnpm ambiente:estado
pnpm ambiente:parar
```

Não versione `.segredos/`, não substitua arquivos secretos por senha funcional em `.env.example` e não imprima `docker compose config` já interpolado. Não regenere parte do conjunto de segredos com volumes existentes: restaure/rotacione a credencial ou faça reset destrutivo explicitamente autorizado. O wrapper local deve fixar o Compose/projeto, aceitar apenas endpoint Docker por socket local e recusar contexto remoto. `ambiente:parar` preserva dados; remoção de volumes exige alvo/projeto conferido e autorização explícita. O MinIO comunitário fixado no Compose é uma exceção exclusiva de desenvolvimento, não uma dependência autorizada para staging/produção.

Execute os comandos relevantes à mudança e o conjunto completo antes de declarar PR pronto. CI também executa scanner de dependências e secret scan.

Scripts de instalação de dependências são default deny por `strictDepBuilds`, e comandos não podem disparar instalação implícita. Não use `dangerouslyAllowAllBuilds`; uma necessidade real exige revisão do pacote e entrada explícita, estreita e documentada em `allowBuilds`.

Não invente comando alternativo silenciosamente; atualize scripts/documentação se a ferramenta mudar.

## 14. Documentação e decisões

Atualize no mesmo PR quando mudar:

- estado/invariante → `DOMAIN.md`;
- escopo/comportamento → `PRODUCT.md`;
- componente/transporte → `ARCHITECTURE.md`;
- ameaça/controle/permissão → `SECURITY.md`;
- nó/versão/executor → `FLOWS.md`;
- offline/UX/sync → `MOBILE.md`;
- linguagem visual/comportamento de tela → `PRODUCT.md`, `MOBILE.md` e `design/references/README.md`;
- adapter/contrato externo → `INTEGRATIONS.md`;
- deploy/backup/alerta → `OPERATIONS.md`.
- execução de PR → `ROADMAP.md`, atualizando `Estado` e reavaliando o `Effort` recomendado antes de declarar a entrega pronta.

Mudança grande exige ADR curto com contexto, opções, decisão, consequências e plano de migração.

## 15. Pare e peça decisão quando

- a tarefa exige item fora da V1;
- documentos aprovados conflitam;
- uma tarefa de interface contradiz a linguagem/referência conceitual ou exige transformar imagem em especificação de pixel ainda não decidida;
- API real não confirma o campo/capacidade;
- seria necessário novo segredo, provedor ou dependência material;
- a matriz de risco de identidade não autoriza a ação;
- a política de retenção/LGPD é necessária e ainda não existe;
- a mudança destrutiva não tem migração compatível;
- não há como preservar idempotência, autorização ou histórico.

Não use “melhor esforço” para ação financeira, identidade, autorização ou perda de dados.

## 16. Definition of Done

Uma alteração está pronta somente quando:

- atende critério de aceite explícito;
- preserva invariantes e terminologia;
- possui autorização no backend;
- é idempotente/recuperável quando necessário;
- possui testes proporcionais ao risco;
- não vaza dado/segredo em log ou resposta;
- OpenAPI/SDK/clients estão coerentes;
- migration é compatível;
- observabilidade e erro operacional são úteis;
- docs/ADR foram atualizados;
- a linha da PR em `ROADMAP.md` reflete o estado real e o `Effort` recomendado;
- mudança de interface possui evidência nos clientes afetados para estado saudável sem infraestrutura, preservação de contexto/rascunho e “Reduzir Movimento” quando aplicável;
- lint, typecheck, testes, build e scanners passam;
- liberação gradual/flag e reversão estão definidas quando aplicável.

## 17. Regras de code review

Ao revisar, priorize achados que possam:

- expor contato, fila, histórico ou dado sensível;
- duplicar/perder mensagem ou escrita ERP;
- permitir dois responsáveis;
- enviar automação após resgate humano;
- usar snapshot para mutação;
- mostrar `ENVIADA` antes da Meta;
- quebrar sincronização/cursor/offline;
- tornar migration incompatível;
- colocar segredo/payload em log;
- transportar vocabulário/DTO externo para o domínio;
- introduzir escopo futuro/código morto.
- expor infraestrutura ou sincronização no estado saudável;
- reintroduzir atualização manual ou `Última atualização` como fluxo normal;
- duplicar filtros em cards ou atalhos na conversa;
- transformar web em app ampliado ou mobile em CRM comprimido;
- usar animação como condição para aplicar estado/comando;
- omitir “Reduzir Movimento”;
- exibir dado sensível sem mascaramento e permissão.

Formatação que o CI corrige não deve obscurecer risco funcional.
