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
- A lista mobile consulta somente a projeção de snapshot já autorizada e íntegra; nunca carregue conjunto amplo para filtrar no app nem exiba réplica marcada para ressincronização.
- Evento realtime saudável atualiza a lista em silêncio; não faça cada mensagem piscar `Sincronizando...`.
- A conversa mantém cabeçalho com contato, contexto essencial e indicador/countdown da janela Meta quando relevante; não repete atalhos de cliente, contrato, histórico, mídias ou notas abaixo dela.
- Nome/avatar abre Detalhes do Contato; voltar preserva timeline e rascunho. Essa tela concentra identidade WhatsApp, cliente ERP, documento mascarado, vínculos e contexto/contrato ativo trocável; contato não identificado oferece `Vincular a cliente`.
- `/` abre respostas rápidas. O botão ERP/sistema fica ao lado de anexos com o campo vazio e abre bottom sheet; quando existe texto, o envio recebe prioridade. Efeito real exige seleção, prévia e confirmação.
- Mensagens suportam swipe para responder/citar, toque longo, navegação até a citação original, áudio, mídia em tela cheia, PDF, busca e estados de envio/entrega/leitura/falha.
- Nota ou evento interno deve ser impossível de confundir com mensagem ao cliente e trazer `Somente equipe`.
- Timeline continua por contato; origem, data, atendimento e protocolo aparecem como metadados/separadores discretos.
- Timeline mobile combina apenas a janela recente do snapshot autorizado com páginas online autorizadas; evento incremental mínimo nunca é transformado em item inventado. Abrir Detalhes deve preservar a instância, posição e rascunho da conversa.
- App e web exibem card de WhatsApp Flow com `Ver formulário` e mascaramento/permissão.
- `Ver formulário` só pode usar campos declarados e projetados pelo backend; JSON protegido integral nunca chega ao cliente, e ausência offline deve ser explícita.
- Usar cor para estado e ação, não decoração.
- Reanimated, Gesture Handler, haptics, skeletons e microinterações não podem bloquear trabalho e devem respeitar “Reduzir Movimento”.
- UI oculta ou desabilitada nunca substitui autorização no backend.

## 5. Invariantes inegociáveis

- Uma instalação representa uma empresa.
- Uma instalação pode possuir várias `ContaWhatsApp`; use sempre seu UUID interno estável como origem. Conta nasce `INATIVA`, não é singleton e não é excluída quando possui histórico.
- Token, segredo, certificado e credencial de canal pertencem somente ao adaptador/cofre. Nunca os adicione a `ContaWhatsApp`, DTO interno, evento, auditoria, log, web ou mobile.
- Um contato possui uma timeline contínua na instalação.
- `Conversa` é única por `Contato`, não por conta, fila ou atendimento, e nunca fecha. Registre contas participantes sem usar a participação para autorizar acesso; cada mensagem/atendimento continua preservando sua própria origem.
- `Contato` usa UUID interno; a identidade WhatsApp é correlacionada pelo identificador estável no portfólio. Username, telefone e nome de perfil são opcionais/mutáveis e nunca viram chave, prova de cliente ERP ou substituto inventado.
- Mudança de identidade só preserva contato diante de evento anterior→atual explícito e coerente. Mantenha alias e evento; origem ausente, conflito ou ordem incerta cria/mantém contato separado e nunca faz merge automático.
- Mensagem e atendimento preservam conta WhatsApp de origem.
- Protocolo exibido é oficial do ERP; indisponibilidade gera protocolo pendente, não número local parecido.
- Atendimento e janela Meta são estados separados.
- `ENVIADA` só após aceitação da Meta.
- Um atendimento possui no máximo um responsável humano atual.
- Resgate/transferência/assunção são atômicos e incrementam `versao_atribuicao`.
- Resgate humano suspende o fluxo antes de qualquer nova resposta automática.
- Nota interna nunca entra no pipeline Meta ou transcrição pública.
- Snapshot serve para identificação/contexto, nunca para escrita.
- `SnapshotCliente` é autoridade de contingência somente no PostgreSQL; exponha `origem=SNAPSHOT` e idade. Aceite apenas modelo interno protegido e mascarado, não invente limiar de obsolescência e nunca use Redis, atualidade aparente ou presença do snapshot para autorizar ação externa.
- Verificar desbloqueio e executar desbloqueio são casos de uso separados. A verificação exige contexto/contrato exatos, RBAC, consulta ERP `TEMPO_REAL` e histórico confirmado dos últimos 30 × 24 horas; ela nunca executa nem cria registro de sucesso.
- Executar desbloqueio exige confirmação explícita, permissão distinta, nova verificação em tempo real, lock e reserva única por contrato. Confirme histórico, operação e auditoria atomicamente; resposta ambígua mantém a reserva até reconciliação. Nunca aceite instante do ERP para reduzir a janela local nem use snapshot.
- Criar ou atualizar ordem de serviço exige confirmação explícita, `CRIAR_ORDEM_SERVICO`, contexto corrente e protocolo oficial exatos. Uma criação ou atualização corresponde a uma operação idempotente; atualização usa versão, lock, reserva exclusiva e histórico imutável. Confirme domínio, operação e auditoria atomicamente, mantenha a reserva em resultado ambíguo e nunca use snapshot.
- Comentário de finalização e encerramento ERP exigem confirmação explícita, `ENCERRAR_ATENDIMENTO`, fila e protocolo oficial exatos. Comentário não muda estado. Só feche o atendimento local após confirmação externa; resposta ambígua preserva o atendimento e a reserva até reconciliação. Não registre conteúdo em claro no histórico/auditoria e não gere, publique ou envie link de transcrição enquanto o portão jurídico/DPO e a capacidade real do MK estiverem pendentes.
- Toda escrita externa sensível é idempotente e auditada.
- Chave idempotente sempre possui escopo e assinatura do comando; chave e token de concessão persistem somente como hash.
- Timeout, resposta perdida ou concessão expirada viram `RESULTADO_INCERTO`; nunca repetir efeito externo ambíguo sem reconciliar.
- Evento só é distribuído após commit.
- Alteração com efeito assíncrono usa `ServicoTransacaoDominio`; evento e caixa de saída não podem ser persistidos por transações independentes.
- Mudança de escopo incrementa `versao_permissoes` e confirma `PERMISSOES_ALTERADAS` na mesma transação; o evento alcança somente o usuário afetado.
- Remover permissão entrega a invalidação antes de fechar SSE/WebSocket; o mobile aceita apenas snapshot com versão e sequência suficientes e substitui a réplica removendo ausentes.
- Usuário, perfil, permissão e acesso de fila são dimensões distintas; criar usuário não concede nenhuma delas implicitamente.
- Financeiro, Suporte e Comercial são filas configuráveis, nunca papéis ou permissões codificadas.
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

Todo caso de uso protegido chama `ServicoAutorizacao` antes de consultar conteúdo do recurso. O verificador específico aplica usuário/fila/recurso na query e devolve apenas acesso/estado; não use `findMany` seguido de filtro em memória. Recurso inexistente, outra fila e estado incompatível resultam em `PERMISSAO_NEGADA` indistinguível. Para escrita sujeita a corrida, passe a mesma `TransacaoPrisma` à autorização, verificação e alteração condicional.

Contexto de sessão web vem somente de `ServicoAutenticacaoWeb`. Nunca aceite `usuario_id`, `sessao_id`, papel ou permissão enviados pelo cliente como identidade autenticada. Token/cookie/CSRF bruto não entra em banco, log, evento, auditoria ou DTO de resposta; persista apenas hash. Mutação web autenticada exige cookie de sessão, dupla apresentação CSRF e origem permitida. Rotação deve substituir token e CSRF em alteração condicional atômica. Conta privilegiada sem MFA confirmado permanece sem sessão; não crie exceção temporária para Administrador.

MFA privilegiado usa TOTP/código de recuperação. Segredo TOTP permanece cifrado com chave fora do banco; recuperação permanece somente como HMAC e é de uso único. O contador/código é consumido na mesma transação que cria a sessão para bloquear replay entre instâncias. Bootstrap de Administrador é one-shot, fora do módulo HTTP e bloqueado fora de staging sintético/sanitizado; segredo nunca entra em Git, Compose, log, auditoria, fixture ou parâmetro de processo.

Limite de sessão web é autoridade do PostgreSQL. Contagem, eventual revogação da mais antiga e criação da nova compartilham serialização/transação; Redis não substitui esse controle. A terceira sessão exige confirmação explícita depois de credencial válida. Toda revogação informa motivo e gera auditoria; inatividade vencida nunca é renovada retroativamente.

Sessão mobile é separada da web e sempre vinculada ao dispositivo. Access token fica somente em memória; refresh, UUID do dispositivo, identificador e segredo da instalação ficam no SecureStore/Keychain/Keystore, nunca em SQLite ou AsyncStorage. Backend persiste apenas hashes, valida usuário+dispositivo+sessão a cada acesso, rotaciona access e refresh atomicamente e revoga a sessão quando um refresh consumido reaparece. Não aceite identidade, papel ou permissão declarados pelo app e não registre tokens/segredos em log, auditoria, evento ou telemetria.

Máximo de dois dispositivos mobile é autoridade do PostgreSQL. Para instalação nova, serialize por usuário, ordene por último acesso/criação/UUID, revogue o mais antigo e suas sessões antes de criar o terceiro; Redis não substitui a transação. Listagem/revogação própria filtra pelo usuário autenticado. Revogação administrativa passa por sessão web+CSRF+origem e `ADMINISTRAR_USUARIOS`. Sync/WS nunca preserva autoridade só porque conectou: revalide a sessão mobile no handshake, heartbeat e comando e feche a conexão após revogação. Enquanto o gateway não existir, não crie adaptador ou socket fictício.

Pareamento QR é autorização efêmera, não credencial compartilhada. Token e comprovante possuem 256 bits, persistem somente como hash e nunca entram em log/auditoria. Um QR ativo por sessão web, 90 segundos, resgate único, confirmação pela mesma sessão com autenticação recente e conclusão pelo mesmo vínculo do aparelho são invariantes do PostgreSQL. Web nunca recebe access/refresh/comprovante; mobile nunca confirma por conta própria. Revogação da sessão web cancela pareamentos ativos. Redis não substitui locks, constraints ou transições condicionais.

Não acrescente permissões transversais, dado sensível ou exportação a papel base. Ajuste `NEGAR` prevalece sobre matriz e `CONCEDER`; Administrador alcança filas ativas somente para permissões que efetivamente possui.

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
- Simulador Meta usa somente cenários/tipos internos e pode nomear estados externos dentro do adapter; não o registre como provider de produção nem trate memória como idempotência real.
- Simulador ERP distingue indisponibilidade anterior ao efeito de resposta perdida após possível efeito; o segundo caso exige reconciliação e nunca autoriza repetição cega. Não o registre como provider de produção nem trate memória como autoridade.
- Antes de congelar adapter, usar contrato oficial vigente e fixtures sanitizadas de chamadas reais controladas.
- Classificar erro externo em código interno estável.
- Aplicar timeout, circuit breaker, limite de concorrência e sanitização no adapter.
- `AdaptadorMkSolutions` implementa `AdaptadorErp`; nome MK não aparece no domínio.
- `AccessSessionAdapter`/`AdaptadorSessaoAcesso` é separado do ERP.
- Não afirmar sessão `ATIVA` a partir de conexão apenas cadastrada no ERP.
- A porta de sessão de acesso nasce sob `SESSAO_ACESSO=DESATIVADO`; simulador e presença de fixture nunca habilitam o recurso nem substituem uma fonte confiável.
- Não implementar provedor PPPoE até existir fonte confiável aprovada.

## 9. Motor de Fluxos

- Versão publicada é imutável.
- Execução continua na versão em que iniciou.
- Publicar exige validação, permissão e auditoria.
- Ciclo sempre tem limite; integração sempre tem timeout/saída de falha.
- Espera longa persiste `retomar_em`; worker não dorme.
- Passos são sanitizados.
- Condição e atribuição usam somente tipos/operadores do catálogo; nunca acrescente expressão, coerção implícita ou código executável.
- Valores e contadores ficam no contexto protegido do PostgreSQL e nunca em passo, auditoria ou log.
- Todo subciclo atravessa limite persistido, e a saída `FALHA` do nó limitado deixa o ciclo.
- Publicar configuração não concede capacidade nova.
- Simulador não chama produção externa nem altera dados reais.
- Identificação do fluxo confirma contexto explícito; nunca escolha primeiro vínculo, preferencial, telefone ou username.
- Seleção de cliente/contrato usa UUID interno sensível e serviço de domínio; não crie ou revalide vínculo no executor.
- Vínculo temporário não é automatizável sem validade/revalidação formal, e seleção nunca substitui a política de risco da ação seguinte.

## 10. Mobile e sincronização

- SQLite é réplica/cache.
- A réplica autenticada usa SQLCipher; a chave fica somente no cofre nativo e deve ser aplicada antes de qualquer consulta. Refresh/access token nunca entram nela.
- Autorização offline é envelope Ed25519 fechado, vinculado a sessão+usuário+dispositivo+instalação+versão de permissões+filas, por no máximo quatro horas e nunca concede ação ERP, exportação, dado sensível ou envio efetivo.
- Somente snapshot mobile recebe autorização offline. A build aceita exclusivamente chaves públicas allowlisted; chave desconhecida, assinatura/vínculo inválido, expiração, integridade falha ou recuo de relógio bloqueiam a área autenticada.
- Persistir cursor apenas depois de aplicar lote local.
- Todo avanço de cursor deve deixar a réplica marcada para reconstrução até que autorização e snapshot de sequência igual ou posterior sejam confirmados atomicamente.
- Após sync, WebSocket conecta com cursor e recebe backfill antes do vivo.
- Eventos são aplicados idempotentemente por `sequencia_evento`.
- Projeção incremental mínima nunca vira entidade completa inventada: sincronize o snapshot autorizado antes de confirmar o evento ao servidor.
- Snapshot, autorização offline e cursor são um único commit SQLCipher; rascunhos e pendências ficam fora da substituição.
- Push avisa; nunca vira fonte da verdade.
- Notificações mobile aceitam somente os cinco tipos aprovados, agrupam pela conversa/contato e mantêm texto genérico; não adicione conteúdo protegido ao payload ou à caixa.
- Abrir aviso exige sincronizar até `sequencia_observada`, confirmar réplica íntegra/tempo real conectado e reler o destino autorizado; nunca navegue primeiro para sincronizar depois.
- A caixa de notificações é efêmera e limitada, não uma tabela de domínio. Limpe-a em logout, troca de usuário e revogação integral.
- Pendência offline nasce somente com autorização assinada vigente, captura sequência, versões de atribuição/estado/contexto e janela observadas, e sincroniza antes de enviar.
- Reconciliação automática só começa após REST convergir e o WebSocket alcançar `CONECTADO`; `CONECTANDO` ou `SINCRONIZANDO` nunca executa pendência.
- `CONECTADO` exige o marcador `PRONTO` já validado e aplicado; abertura física do WebSocket não basta.
- O backend adquire `autoridade-saida:<atendimento_id>` e revalida sessão, aparelho, RBAC, fila, recurso, responsabilidade, estado, contexto, timeline e janela antes de criar a mensagem.
- Mudança relevante produz `REVISAO_NECESSARIA`; falha transitória conserva `AGUARDANDO_CONEXAO`.
- “Enviar mesmo assim” cria novo comando idempotente e não ignora autorização, janela, estado ou atribuição.
- Mídia mobile é online na V1: seletor nativo, allowlist/teto local, prévia e confirmação; não grave bytes, nome ou pendência de mídia no SQLCipher.
- Upload mobile usa o SDK OpenAPI gerado e o composer central; nunca chame S3, Meta ou URL externa diretamente do app.
- Ações ERP no app exibem origem dos dados. Financeiro só usa `TEMPO_REAL`; indisponibilidade não cai para snapshot.
- Toda ação ERP com efeito exige seleção, prévia, confirmação, chave idempotente e revalidação no backend. Resultado incerto nunca vira sucesso visual.
- Conexão, segunda via/Pix, Flow ou nota sem caso de uso ponta a ponta permanecem desabilitados; não acrescente stub que simule efeito.
- Perda de permissão entra em `ESCOPO_ATUALIZANDO`, invalida a autorização offline local antes da rede e substitui a réplica por snapshot de versão/sequência suficientes; cubra evento vindo de WebSocket e de lote REST.
- Só retome visualização e comandos depois de limpar avisos órfãos, receber `PRONTO` no novo WebSocket e reconciliar pendências. Falha mantém a área bloqueada; nunca restaure o cache anterior.
- Revogação de sessão/dispositivo limpa credenciais, réplica autenticada e caixa efêmera antes de voltar ao login. Não trate isso como simples reconexão.
- Invalidação pausa comandos dependentes, fecha realtime, aplica snapshot autorizado e só então reconecta/retoma; falha bloqueia a área autenticada e nunca restaura cache antigo.
- Diagnóstico mobile existe somente em Perfil, usa campos técnicos fechados e códigos canônicos limitados; não inclui identidade, fila, conteúdo, UUID, token, segredo ou envio automático. Compartilhamento exige prévia e confirmação.
- Listas operacionais devem permanecer virtualizadas e limitadas. Preserve a identidade de itens invariáveis, limite coleções efêmeras e nunca persista bytes de mídia no SQLCipher.
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
- rascunho do composer vive somente no SQLCipher por conversa, nunca em estado global, log, telemetria ou SecureStore;
- resposta rápida apenas preenche o texto; modelo aprovado e seus parâmetros vêm da autoridade do backend;
- não limpe rascunho antes da aceitação do servidor nem transforme falha em sucesso visual;
- ausência de rede cria somente pendência de texto `AGUARDANDO_CONEXAO` depois de validar autorização offline; nunca cria estado `ENVIADA`, mídia pendente ou efeito externo;
- folha de ações não executa ERP, Meta, Flow ou storage diretamente e não habilita capacidade ainda sem caso de uso;
- bloqueio visual da janela Meta não substitui a recusa autoritativa de texto livre no backend.

### Operações

- reinício após commit e antes do efeito;
- Redis apagado;
- worker retomando job;
- migration compatível com versão anterior;
- controle de recurso é decidido no backend/PostgreSQL; nunca liberar somente pela UI ou cache Redis;
- versão mobile abaixo da mínima deve falhar no servidor com `ATUALIZACAO_OBRIGATORIA`, inclusive em login, pareamento e refresh;
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

Vínculo de cliente não é contexto de atendimento. Preserve múltiplos `VinculoCliente`/`VinculoContrato`, exija uma seleção explícita e versionada por atendimento e nunca escolha pelo primeiro resultado, telefone, username ou preferência. Troca exige autorização central e auditoria; criação/revalidação de vínculo permanece fechada até o caso de uso aprovado.

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

## 18. Regras do catálogo de fluxos

- Trate `Fluxo` como identidade e `VersaoFluxo` como definição imutável depois de publicada.
- Nunca edite ou exclua uma versão publicada/arquivada, nem “corrija” histórico por migration ou SQL operacional.
- Salvar rascunho exige revisão esperada; nova versão recebe número sob lock do fluxo.
- Nova execução fixa o `versao_fluxo_id` apontado no início e nunca relê o ponteiro para migrar em curso.
- Não acrescente controller, publicação, executor, worker ou nó antes do PR correspondente.
- Definição não aceita código, função, SQL, shell, URL arbitrária ou segredo; publicação futura exige validação semântica completa.
- Somente o validador autorizado promove `RASCUNHO` para `EM_TESTE`; editor, controller e fixture nunca declaram esse estado diretamente.
- Capacidade habilitada e referência ativa vêm do backend/PostgreSQL por `ProvedorContextoValidacaoFluxo`, nunca da definição ou requisição. O provedor conservador nega recursos externos ainda não registrados.
- Publicação aceita somente `EM_TESTE`; reversão aceita somente `ARQUIVADA`. Não contorne esses estados para acelerar testes ou UI.
- `ExecucaoFluxo` fixa atendimento, fluxo e versão no início; nenhuma publicação ou retomada relê o ponteiro para migrar execução existente.
- Estados terminais de execução são imutáveis e nunca retomam. Toda transição usa estado e revisão esperados; Redis não guarda autoridade.
- `retomar_em` só existe em `AGUARDANDO_SISTEMA`, `AGUARDANDO_RESPOSTA` ou `AGUARDANDO_ATENDENTE`, aponta para instante futuro e é a autoridade reconstruível do agendamento.
- Worker consulta vencidos no PostgreSQL em lote com bloqueio concorrente; não cria timer longo por atendimento e não depende de job Redis para recuperar estado.
- Queda antes do commit conserva o agendamento; queda depois do commit conserva `EXECUTANDO`. Não reponha estado por SQL.
- Não escreva contexto arbitrário nem execute nó antes do PR correspondente.
- Troque estado atual, alvo, ponteiro, revisão, histórico e auditoria na mesma transação sob lock do fluxo.
- `PUBLICAR_FLUXO` não concede `REVERTER_FLUXO`; editar não concede nenhuma das duas.
- Não registre controller de publicação antes do validador completo da PR 071.
- `PassoExecucaoFluxo` é diagnóstico sanitizado: nunca grave texto, opções, contexto protegido ou dados de cliente em entrada/saída do passo, auditoria ou log.
- Nó de mensagem chama `ServicoMensagensSaida`; é proibido importar porta, adapter, SDK ou vocabulário Meta no executor.
- Antes de criar mensagem automática, confirme execução/revisão e atendimento `AGUARDANDO/BOT/PROCESSANDO_BOT` sem responsável na mesma transação.
- Mensagem automática não inventa usuário remetente. Mensagem, evento, caixa de saída, passo e avanço de nó confirmam juntos.
- Lista/botões sem capacidade estruturada comprovada segue `FALLBACK` textual; não declare `SUCESSO` nem habilite formato externo por fixture.
- Toda saída nominal (`SUCESSO`, `FALLBACK`, `FALHA_TEMPORARIA`, `FALHA_DEFINITIVA`) precisa ter exatamente uma conexão publicada.
- Worker seleciona `EXECUTANDO` com bloqueio concorrente no PostgreSQL. Não use Redis, timer por atendimento ou reparo manual de revisão.
- `AGUARDAR` usa somente contratos fechados `RESPOSTA` ou `ATE_INSTANTE`; não adicione duração implícita, expressão, referência, variável ou relógio do cliente.
- Resposta antecipa somente `AGUARDANDO_RESPOSTA` com marca persistida, nó e revisão esperados. Timeout e resposta concorrem por um único commit; nunca force retomada por SQL.
- `HORARIO_ATENDIMENTO` chama `ServicoCalendarios` e exige uma referência `CALENDARIO` ativa. Não copie período/fuso para a definição e não importe adapter externo no executor.
- `CONSULTAR_FATURAS` e `ENVIAR_FATURA` não aceitam parâmetros, referências ou variáveis; nunca escolha a primeira fatura pagável quando houver mais de uma.
- Chamada financeira externa ocorre fora da transação. Ao retornar, revalide execução, revisão, nó, conta, contato, cliente, contrato e versão do contexto antes de aplicar qualquer efeito.
- Pix, linha digitável, documento, ID externo e bytes de PDF não entram em passo, log ou auditoria. Sem ponte privada de mídia comprovada, segunda via segue parcial; não fabrique Base64, anexo ou URL.
- Provedor ERP simulado pertence somente aos testes. Aplicação sem adapter real registrado falha fechada com `ERP_INDISPONIVEL`; fixture nunca habilita staging ou produção.
- `SOLICITAR_FORMULARIO_WHATSAPP` aceita somente um UUID interno ativo da conta, `textoFallback` e nenhuma variável. Sem ponte Meta real caracterizada, execute apenas o fallback pelo serviço de mensagens e nunca produza `ENVIADO`.
- Token, referência externa, esquema e resposta de formulário pertencem ao adapter/armazenamento protegido; nunca entram na definição, contexto da execução, passo, log ou auditoria.
- Submissão normalizada deriva autoridade da mensagem de entrada, usa locks e unicidades por mensagem/referência e emite um único evento mínimo. Repetição divergente falha fechada; não atualize nem apague submissão imutável.
- `CRIAR_ATENDIMENTO` e `CRIAR_ORDEM_SERVICO` não aceitam ID externo, fila, cliente, contrato, protocolo ou chave na definição; derive tudo do estado confirmado.
- OS automática exige `confirmacaoExplicita: true`, capacidade publicada e revalidação no domínio de atendimento BOT sem fila/responsável, execução/versão, vínculo verificado, contrato e protocolo. Fila segue obrigatória para humano; não fabrique fila, sessão ou usuário para autorizar fluxo.
- Escrita ERP do fluxo ocorre fora da transação e usa chave estável por execução+nó. Resultado incerto só reconcilia; nunca repita criação cega.
- Sem provider ERP real, percorra `INDISPONIVEL` sem operação externa. Simulador/fixture não pode ser registrado como provider de runtime.
- No Motor de Fluxos, verificar e executar desbloqueio são nós distintos. Verificação nunca escreve; execução aceita somente `confirmacaoExplicita: true`, refaz a elegibilidade em tempo real e usa chave estável execução+nó.
- Cópia interna de atendimento exige protocolo oficial, `EXPORTAR_HISTORICO`, sessão web atual, origem, CSRF e confirmação. Token aleatório fica somente por hash, fora de URL/log/auditoria, dura 15 minutos, pertence à mesma sessão e é consumido uma vez. Projete apenas mensagens cliente↔empresa; exclua mídia, formulário, reação, nota, evento e identificadores internos. Link público continua proibido até o portão jurídico/DPO.
- Relatório operacional nunca amplia RBAC: autorize cada fila antes de agregar e aplique o conjunto permitido em todas as relações consultadas. Retorne somente contagens e metadados da fila autorizada; não carregue conteúdo, pessoa, protocolo ou identificador externo. Fórmulas e períodos são versionados e não podem ser alterados silenciosamente no web.
- Derive contrato do contexto e exija atendimento BOT sem fila/responsável, execução/versão corrente e vínculo automatizável verificado. Ação humana mantém fila+RBAC; não fabrique usuário, sessão ou fila para fluxo.
- Não exponha contrato, motivos, chave, instantes ou resposta ERP em passo/log/auditoria. Resultado incerto só reconcilia; sem provider, nenhum efeito ou operação pode nascer.
- `TRANSFERIR_PARA_FILA` exige fila interna ativa e conduz diretamente a `AGUARDAR_ATENDENTE` da mesma fila; valide a topologia também no runtime antes da mutação.
- Transferência automática usa o serviço de atribuição, autoridade BOT e ator `FLUXO`; nunca invente usuário/sessão nem escreva fila, histórico, evento ou auditoria diretamente no executor.
- Espera humana persiste `AGUARDANDO_ATENDENTE`, marcador e `retomar_em`; resgate suspende a execução e timeout avança o grafo. Redis e timers em memória não são autoridade.
- Encerramento por fluxo exige motivo fechado e fila de fallback ativa, aplica a máquina de atendimento e conclui a execução. Reabertura nunca retoma a execução antiga; motivo não entra em passo/log/auditoria.
- Mensagem automática deve persistir execução de origem e `versao_atribuicao` observada. Não a despache como saída anônima sem origem.
- Criação automática, despacho e qualquer mudança de atribuição compartilham o lock textual `autoridade-saida:<atendimento_id>`; não troque a chave nem use byte nulo.
- Despacho automático revalida autoridade sob o lock, mantém `ENVIANDO` e resultado na mesma transação limitada e passa `AbortSignal` ao canal. Provider que ignore o cancelamento não pode ser registrado.
- Resgate cancela somente automáticas `NA_FILA` no mesmo commit; não alcance mensagem humana ou disparo transacional. Aceite do canal anterior ao commit permanece enviado, e nenhum aceite posterior é permitido.
- O editor visual usa somente o SDK OpenAPI gerado e o catálogo nativo tipado. Não adicione JSON bruto, URL arbitrária, adapter, segredo, capacidade ou referência externa declarada pelo cliente.
- Posição de nó é metadado visual sem autoridade de negócio. Tipo, saídas, transições, referência ativa e capacidade continuam validados no backend.
- `Salvar rascunho`, `Validar versão` e `Publicar versão` são comandos separados. Salvar só aceita `RASCUNHO` com revisão esperada; validar é a única promoção para `EM_TESTE`; publicar exige confirmação e não migra execução em curso.
- Versão imutável é somente leitura no editor; para continuar, crie uma nova versão. Nunca habilite edição local de publicada/arquivada nem contorne o vínculo fluxo-versão.
- Canvas e microinterações não podem bloquear comando e devem respeitar `prefers-reduced-motion`. Web mantém composição desktop própria e não replica literalmente o mobile.
- Simulação usa somente `SimuladorFluxos` puro e contexto sintético. Nunca registre provider, adapter, executor, serviço de mensagens/ERP, Prisma, Redis ou chamada de rede nesse caminho.
- Não reutilize o runtime do Motor para “facilitar” o simulador. Ele não cria `ExecucaoFluxo`, mensagem, passo persistente, evento, auditoria de conteúdo ou operação recuperável.
- A resposta de simulação nunca reflete texto autoral, parâmetro, segredo, variável sensível, referência ou identificador externo da definição. Use descrições canônicas e dados fictícios mascarados.
- Todo percurso simulado termina em até 200 passos e limita visitas por nó. Saída ausente, cenário incompatível e limite atingido precisam ficar visíveis.
- O editor pode simular alterações locais ainda não salvas, mas isso não salva, valida, publica nem muda o ponteiro de produção. O painel deve declarar dados fictícios e zero efeitos reais.
