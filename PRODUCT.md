# Produto — Omnichannel V1

## 1. Objetivo

Entregar uma plataforma operacional de atendimento WhatsApp para uma empresa provedora de internet, utilizável pela web e por aplicativos iOS/Android, capaz de:

- receber, organizar e responder conversas pela Meta Cloud API oficial;
- manter uma timeline contínua por contato;
- separar cada atendimento em protocolo, fila, responsável e métricas;
- substituir gradualmente o bot atual por um Motor de Fluxos visual e configurável;
- consultar e executar operações aprovadas no MK Solutions por adaptador;
- continuar atendendo e identificando clientes durante indisponibilidade parcial do ERP;
- preservar histórico, auditoria e rastreabilidade;
- operar com segurança em múltiplos dispositivos e com conectividade móvel instável.

A V1 é um produto de atendimento real, não uma demonstração. Confiabilidade, segurança, sincronização, experiência mobile e capacidade de diagnóstico fazem parte do produto.

## 2. Público e perfis

- **Atendente**: acompanha filas autorizadas, resgata e conduz atendimentos, usa mensagens rápidas, solicita formulários e executa apenas ações permitidas.
- **Supervisor**: acompanha as filas do seu escopo, trata SLAs, transfere e assume atendimentos, sem receber automaticamente poderes administrativos globais.
- **Administrador**: administra usuários, filas, permissões, contas WhatsApp, integrações, fluxos, releases, flags e saúde da instalação; vê todas as filas.
- **Contato**: pessoa ou prospecto que conversa com a empresa. Não é necessariamente o titular do contrato tratado.

## 3. Experiência central

### 3.1 Timeline e atendimentos

Cada `Contato` possui uma única `Conversa` contínua dentro da instalação. Se a pessoa falar hoje pelo WhatsApp Suporte e amanhã pelo WhatsApp Comercial, os itens autorizados permanecem organizados na mesma timeline lógica. Cada mensagem e atendimento preserva o número/conta empresarial de origem; a interface usa separadores discretos de data, atendimento/protocolo ou origem quando necessários, sem fragmentar a conversa. A visualização de histórico entre filas continua sujeita ao RBAC e à matriz de acesso aprovada.

Cada assunto operacional continua sendo um `Atendimento` separado, com:

- UUID interno;
- protocolo oficial do ERP;
- conta WhatsApp de origem;
- fila e responsável;
- contexto ativo de cliente e contrato;
- estados, tempos, transferências, notas e auditoria.

Transferir de Financeiro para Suporte não cria outra conversa, não troca automaticamente a conta WhatsApp e não perde protocolo ou contexto.

Quem conduz o atendimento atual vê as mensagens cliente↔empresa do mesmo protocolo. Histórico de outros atendimentos exige interseção com uma fila participante ou permissão transversal. Nota interna exige permissão própria, conserva a fila de criação e só atravessa filas com permissão transversal específica, nunca herdada automaticamente pelo Administrador.

### 3.2 Conversa parecida com um mensageiro moderno

O histórico é apresentado de forma contínua, com paginação transparente, e combina visualmente:

- mensagens e mídias;
- separadores de atendimentos/protocolos;
- respostas citadas e reações suportadas;
- eventos operacionais relevantes;
- notas internas claramente privadas;
- submissões estruturadas de WhatsApp Flows.

Notas e eventos internos aparecem cronologicamente, mas são impossíveis de confundir com mensagem externa e exibem `Somente equipe`. Tipos internos futuros, como relatórios técnicos, devem reutilizar esse contrato visual sem integrar o escopo funcional da V1. Submissões de WhatsApp Flows usam card estruturado com `Ver formulário` no app e na web, sempre com mascaramento conforme permissão.

A lista se atualiza sozinha. Nova mensagem atualiza prévia, não lidas e posição da conversa. Os únicos filtros superiores são `Meus`, `Pendentes`, `Não lidos`, `SLA`, `Expirando` e `Em automação`, sem cards de resumo duplicados. Em uso normal não há botão, timestamp ou texto de atualização/sincronização; só estados excepcionais exibem faixa transitória `Sem conexão`, `Conectando...` ou `Sincronizando...`, removida automaticamente ao normalizar.

### 3.3 Linguagem de produto e referências

A experiência é **mobile-first, moderna, premium e limpa**. No celular, deve parecer um aplicativo nativo de mensageria, nunca um CRM web comprimido. WhatsApp, Telegram, Linear e aplicativos modernos de produtividade são referências de qualidade, sem autorizar cópia pixel a pixel ou de marca.

As referências conceituais obrigatórias são [conversa](design/references/01-conversa.png), [lista de atendimentos](design/references/02-lista-atendimentos.png) e [detalhes do contato](design/references/03-detalhes-contato.png). Elas definem linguagem, hierarquia e comportamento; requisitos escritos prevalecem sobre elementos históricos das imagens, conforme [as ressalvas registradas](design/references/README.md).

Regras de linguagem:

- cores servem principalmente para estado e ação, não para decoração;
- SLA, janela Meta, conectividade, falha, sucesso e informação usam semântica consistente e acessível;
- animações, gestos, microinterações, bottom sheets, haptics e skeletons tornam mudanças compreensíveis sem atrasar o trabalho;
- toda interação continua funcional com “Reduzir Movimento”;
- quando realtime, sincronização e recuperação funcionam, a infraestrutura permanece invisível;
- web compartilha identidade e semântica, mas possui composição própria de desktop e não é uma ampliação literal do app.

### 3.4 Revelação progressiva

A conversa contém cabeçalho e contexto essenciais, indicador/countdown da janela Meta quando relevante, timeline e composer. Não duplica atalhos de Cliente, Contrato, Histórico, Mídias ou Notas abaixo da janela Meta.

Tocar no nome/avatar abre Detalhes do Contato sem perder posição da timeline ou rascunho. Essa tela concentra, conforme permissão, identidade WhatsApp, cliente ERP vinculado, CPF/CNPJ mascarado, contexto e troca de cliente/contrato ativo, contratos/serviços, planos, endereços, situação financeira resumida, vínculos, tags, mídias/documentos/links, notas e histórico. Contato não identificado oferece `Vincular a cliente`.

No composer, `/` abre respostas rápidas pesquisáveis. O botão dedicado de ações do sistema/ERP aparece ou fica ativo ao lado do anexo quando o campo está vazio e abre um bottom sheet categorizado, sem abandonar a conversa. Ação com efeito real exige seleção inequívoca, prévia e confirmação proporcional ao risco.

## 4. Escopo aprovado da V1

### 4.1 Meta Cloud API e mensageria

- Integração direta com a API oficial por adaptador.
- Múltiplas contas/números de WhatsApp na mesma instalação.
- Cada conta possui identidade interna estável, nasce inativa e só pode ser ativada após configuração e validação explícitas; remover uma integração não apaga sua origem histórica.
- Credenciais de conta pertencem ao adaptador/cofre e nunca ao cadastro de domínio, à interface ou à auditoria.
- Fluxo de entrada próprio ou compartilhado por conta.
- Recebimento e envio de texto, imagem, áudio, vídeo e PDF.
- Botões, listas, templates aprovados e prévia de links conforme capacidade da conta.
- Responder/citar mensagem e navegar até a original.
- Reações quando suportadas pela Meta Cloud API e habilitadas para a conta.
- Estados claros de envio, entrega, leitura e falha.
- Validação de webhook, deduplicação e idempotência.
- Sincronização dos templates aprovados da conta.
- Janela Meta de 24 horas por contato e conta empresarial, com alertas em 1 hora, 30 minutos e 10 minutos.
- Bloqueio de texto livre fora da janela; oferta de template aprovado; a janela reabre somente após resposta do contato.
- Segunda via estruturada com PDF, valor, vencimento, Pix, linha digitável/código de barras e link quando disponíveis, com fallback seguro se a apresentação nativa da Meta não estiver habilitada.
- API para disparos transacionais ordenados pelo ERP; o ERP decide o conteúdo/configuração e o omnichannel enfileira, envia, registra e devolve os estados.

### 4.2 Identidade, contato e cliente

- BSUID como identificador técnico primário da identidade WhatsApp dentro do escopo empresarial.
- Username opcional e mutável; telefone opcional e mutável; nenhum deles é chave primária de domínio.
- Atualizações de identidade da Meta preservam o mesmo `Contato` e a mesma timeline.
- Contato pode existir sem cliente ERP.
- Um contato pode ser vinculado a vários clientes/contratos; um vínculo temporário não altera automaticamente o cadastro principal.
- Primeira identificação por dados do ERP, CPF via WhatsApp Flow ou solicitação oficial de compartilhamento de contato, conforme disponibilidade.
- Vínculo persistente pode dispensar nova identificação para ações de baixo risco; ações sensíveis continuam sujeitas à política do domínio.
- Busca por nome, telefone, username, CPF/CNPJ, contrato, protocolo, fila, atendente, período e conteúdo.
- CPF mascarado por padrão como `11X.XXX.XXX.84`.

### 4.3 Atendimento, protocolo e transcrição

- Toda nova interação sem atendimento aplicável cria um atendimento.
- O protocolo oficial é criado no ERP e informado ao cliente.
- Se o ERP estiver indisponível, o atendimento funciona com protocolo pendente e é reconciliado automaticamente quando o ERP retorna.
- Estados: `AGUARDANDO`, `EM_ATENDIMENTO`, `ENCERRADO_REABRIVEL` e `ENCERRADO`.
- Modos ortogonais: `BOT`, `FILA_HUMANA` e `HUMANO`.
- Encerramento explícito por humano autorizado ou por nó publicado do fluxo.
- Reabertura do mesmo atendimento por até 30 minutos, desde que a janela Meta continue aberta.
- Encerramento por fluxo exige fila humana de fallback; nova mensagem dentro da tolerância reabre nessa fila, sem responsável, e não retoma a execução terminal anterior.
- Reabertura manual autorizada assume o atendimento em modo humano para o operador que executou o comando.
- Nova interação após o encerramento definitivo cria outro atendimento, mantendo a timeline.
- Cópia segura do atendimento, vinculada ao protocolo, com token não previsível e somente conteúdo cliente↔empresa.
- A transcrição original permanece como fonte da verdade.

### 4.4 Filas, resgate e transferência

- Filas, calendários e SLAs configuráveis.
- Usuário pode pertencer a uma ou mais filas.
- Acesso à fila e permissão da ação são controles independentes.
- Todos os autorizados veem os pendentes da fila.
- O atendimento só recebe responsável quando é resgatado ou transferido diretamente.
- Resgate atômico, com apenas um vencedor em concorrência.
- Humano pode ver e resgatar atendimentos ainda em automação.
- Transferência para outra fila limpa o responsável e devolve o atendimento aos pendentes da fila destino.
- Transferência direta exige destinatário disponível, autorizado e apto a receber; não exige aceite.
- Supervisor pode assumir atendimento dentro do seu escopo; administrador pode assumir qualquer atendimento.
- Toda mudança incrementa `versao_atribuicao` e gera histórico/auditoria.

### 4.5 Disponibilidade, calendário e SLA

- Disponibilidade do atendente é manual e persistida no servidor.
- Fechar o app, perder o WebSocket ou ficar sem internet não altera disponibilidade.
- Atendente indisponível não recebe transferência direta.
- Supervisor/admin pode alterar a disponibilidade quando autorizado.
- Calendário por conta e/ou fila, com dias, múltiplos períodos, feriados, exceções, modo 24x7 e abertura/fechamento manual.
- Fora do horário, o autoatendimento pode continuar; o Motor de Fluxos pergunta se o cliente deseja aguardar a abertura ou encerrar.
- O SLA humano começa quando há obrigação de atendimento, não quando a mensagem chegou fora do expediente.
- Escalonamento configurável: atendente, supervisor e administrador, sem transferência automática.

### 4.6 Web

- Console de atendimento e administração em React/TypeScript.
- REST para comandos e SSE para eventos servidor→navegador.
- Reconexão e recuperação por `Last-Event-ID`/`sequencia_evento`.
- Mesma identidade, semântica de estados e componentes conceituais do app, adaptados a densidade, teclado, múltiplos painéis e espaço de desktop.
- Composição própria de desktop; a web não é uma ampliação literal do mobile.
- Realtime, reconexão e recuperação invisíveis no estado saudável, com degradação excepcional coerente com o app.
- Cookie de sessão `HttpOnly`, `Secure` e `SameSite`.
- Administração de usuários, filas, permissões, contas, integrações, fluxos, flags, releases e saúde.
- Editor visual do Motor de Fluxos.

### 4.7 Aplicativo iOS/Android

- Aplicativo real em React Native + Expo Prebuild, com um código-base para as duas plataformas.
- Login por usuário/senha ou QR efêmero gerado na web.
- No pareamento QR, o app resgata o código uma vez, a mesma sessão web confirma uma prévia do aparelho e somente o mobile recebe a sessão; expiração, cancelamento, logout e replay exigem um novo QR.
- Sessão persistente, biometria para desbloqueio e tokens no Keychain/Keystore.
- Limite de dois dispositivos móveis por usuário; o terceiro revoga o mais antigo.
- Lista de atendimentos, contatos, notificações e perfil.
- Filtros `Meus`, `Pendentes`, `Não lidos`, `SLA`, `Expirando` e `Em automação` exibidos uma única vez, sem cards de resumo.
- Reordenação automática e suave da lista por nova mensagem, sem atualização manual.
- Respostas rápidas por `/`, com busca, categorias e seleção visual.
- Botão de ações ERP ao lado do anexo quando a área de composição está vazia, com prévia ou confirmação proporcional ao risco.
- Conversa limpa, sem fileira duplicada de atalhos abaixo da janela Meta.
- Detalhes do Contato com retorno preservando posição da timeline e rascunho.
- Ações do sistema em bottom sheet categorizado.
- Notas/eventos internos marcados como `Somente equipe` e cards de WhatsApp Flow com `Ver formulário`.
- Notificações para nova mensagem própria, novo pendente, cliente aguardando, janela próxima de expirar e transferência direta, com agrupamento de rajadas do mesmo contato.
- UX moderna, transições fluidas, gestos naturais e respeito a “Reduzir Movimento”.
- REST + WebSocket em primeiro plano; APNs/FCM em background; sincronização antes de reabrir realtime.
- SQLite como réplica/cache local.
- Conversas carregadas, rascunhos e pendências de saída de texto disponíveis offline.
- Autorização offline assinada por no máximo 4 horas; depois disso o cache autenticado bloqueia até revalidar.
- Offline permite leitura mínima já autorizada e rascunho/pendência de texto, mas nunca ação ERP, exportação, vínculo, nova URL de mídia ou envio efetivo.
- Reconciliação multi-dispositivo e estado `REVISAO_NECESSARIA` quando a conversa ou atribuição mudou.
- Atualização obrigatória comandada pelo backend quando houver incompatibilidade ou risco de segurança.

### 4.8 Motor de Fluxos e WhatsApp Flows

- Motor próprio, determinístico e configurável.
- Editor visual simples com rascunho, teste, publicação, versionamento e reversão.
- Versão publicada imutável; execuções permanecem presas à versão com que começaram.
- Execução persistente e recuperável após reinício.
- Nós de mensageria, condição, variável, espera, horário, identificação, seleção de cliente/contrato, financeiro, desbloqueio, atendimento, ordem de serviço e roteamento humano.
- Nenhum JavaScript, SQL, shell ou URL arbitrária no fluxo.
- WhatsApp Flows pré-configurados para identificação e novo cadastro comercial.
- Atendente pode solicitar um formulário no app e na web.
- Submissão aparece estruturada na timeline e respeita mascaramento/permissões.
- Não inclui editor completo de formulários da Meta.

### 4.9 MK Solutions, snapshot e sessão de acesso

- `AdaptadorErp` genérico, implementado inicialmente por `AdaptadorMkSolutions`.
- Consulta de cliente, contratos, conexões cadastradas, planos/velocidades quando retornados, endereços, financeiro e faturas.
- Segunda via, Pix e linha digitável/código de barras conforme API real.
- Verificação e execução de desbloqueio de confiança são passos separados. A verificação consulta o ERP em tempo real e combina a resposta com a política interna de um desbloqueio confirmado a cada 30 dias; nunca executa a ação. A execução exige prévia e confirmação explícita, revalida permissão, contexto, decisão ERP e janela local imediatamente antes da escrita e nunca usa snapshot.
- Criar ou atualizar uma ordem de serviço exige atendimento aberto, fila autorizada, cliente, contrato e protocolo oficial exatamente iguais ao contexto corrente. Antes do efeito, o operador vê a prévia e confirma explicitamente; cada criação ou atualização usa uma operação idempotente própria, e resposta ambígua só avança por reconciliação.
- Criação e atualização de atendimento/protocolo, comentários/link da transcrição e ordens de serviço, conforme APIs liberadas.
- Escritas com autorização, auditoria e idempotência.
- `SnapshotCliente` persistente no PostgreSQL para identificação e contexto durante indisponibilidade.
- Snapshot nunca autoriza ação mutável ou decisão financeira atual.
- `AccessSessionAdapter` separado do ERP; o contrato faz parte da V1. A integração real só entra se uma fonte confiável for validada sem bloquear o lançamento.

### 4.10 Segurança, auditoria e operação

- RBAC com papéis base, permissões granulares, escopo por fila e `default deny`.
- Auditoria imutável para ações relevantes de usuário, fluxo, sistema e integração.
- Idempotência nas operações sensíveis.
- Mídias somente nos tipos aprovados, com validação real e storage privado.
- Tetos internos iniciais: imagem 8 MB, áudio 16 MB, vídeo 32 MB e PDF 20 MB; prevalece o menor limite validado com o provedor.
- QR de pareamento com 90 segundos, uso único e um token ativo por sessão web.
- Pareamento confirmado somente pela sessão web criadora com autenticação recente; token/comprovante persistidos apenas como hash e sessão entregue somente ao aparelho que resgatou.
- Senha de 12–128 caracteres, bloqueio de credenciais comprometidas e MFA obrigatório para usuários privilegiados.
- Ações ERP classificadas em risco baixo, médio ou alto; risco alto exige ERP em tempo real, contexto explícito, revalidação, prévia, confirmação, idempotência e auditoria.
- Link público de transcrição e eliminação automática permanecem desligados até política jurídica/LGPD aprovada.
- Feature flags e rollout controlados pelo backend.
- Desligamento emergencial prevalece sobre liberação por administrador, usuário, fila ou percentual; mudanças exigem permissão administrativa e auditoria.
- O app consulta mínima/recomendada por iOS/Android antes do login, mas o backend também bloqueia autenticação, pareamento e renovação abaixo da mínima.
- Painel de saúde, logs estruturados, métricas, alertas e correlação.
- Docker Compose, PostgreSQL, Redis e storage S3 externo.
- DEV, STAGING e PRODUÇÃO isolados.
- Backups externos, criptografados e testados.
- Deploy manual em produção, compatível com atendimento em curso.

## 5. Fora da V1

Não implementar nesta fase:

- IA generativa, interpretação de intenção, análise de humor, visão, transcrição, resumo, copiloto ou IA silenciosa.
- ACS/gerenciamento de ONU/ONT, Wi-Fi, sinal óptico, dispositivos conectados e telemetria.
- Motor próprio de massivas e correlação de falhas de rede.
- Instagram, Messenger, Telegram, SMS/RCS ou outros canais.
- Multitenancy no mesmo banco/instalação.
- Colaboração simultânea de vários atendentes na mesma conversa.
- Criador interno de campanhas/marketing automation; disparos da V1 vêm do ERP/API.
- Editor completo de WhatsApp Flows.
- Nó HTTP genérico, webhooks arbitrários ou execução de código no Motor de Fluxos.
- Upload offline robusto de vídeos/PDFs grandes, retomada parcial e cache extenso de mídia.
- CSAT/NPS, resumo por IA e relatórios analíticos avançados.
- Elasticsearch/OpenSearch, Kubernetes e microserviços.
- Integrações reais fictícias para `AccessSessionAdapter`, ACS ou IA.

Itens futuros podem ser documentados como pontos de extensão, mas não devem gerar código morto, stubs em produção ou dependências na V1.

## 6. Critérios de sucesso da V1

A V1 está apta ao piloto quando, no mínimo:

- uma mensagem recebida permanece recuperável após reinício do backend;
- repetir o mesmo webhook não duplica a mensagem;
- repetir um comando idempotente não duplica desbloqueio, OS, protocolo ou envio;
- dois atendentes tentando resgatar deixam um único responsável;
- a perda de Redis não apaga estado de negócio;
- um dispositivo offline converge pelo `sequencia_evento` ao retornar;
- uma mensagem offline não é enviada automaticamente após mudança relevante;
- remover acesso a uma fila invalida dados e eventos não autorizados nos clientes;
- o ERP indisponível não impede identificar pelo snapshot, abrir chat ou transferir para humano;
- nenhuma escrita ERP usa snapshot desatualizado;
- toda leitura de contingência identifica `SNAPSHOT` e sua idade; ausência de política sincronizada não é escondida por um selo fictício de atualidade;
- texto livre fora da janela Meta é bloqueado antes do envio;
- notas internas nunca aparecem na Meta nem na transcrição pública;
- operação normal não expõe realtime, sincronização ou `Última atualização`;
- filtros operacionais não são repetidos em cards;
- abrir e fechar Detalhes preserva posição da timeline e rascunho;
- ação com efeito real não pula seleção, prévia ou confirmação exigida;
- autorização offline expirada bloqueia o cache e nenhuma pendência executa ação externa sem reautorização;
- link público de transcrição e disparo ERP real continuam bloqueados sem suas validações jurídica/contratual;
- web e mobile compartilham linguagem sem que uma interface seja mera ampliação da outra;
- staging não usa banco, credenciais ou dados brutos de produção;
- um backup é restaurado com sucesso em ambiente limpo;
- deploy não encerra atendimento nem perde evento.

## 7. Indicadores iniciais

O painel operacional deve priorizar:

- atendimentos aguardando, em andamento e encerrados;
- tempo até resgate e tempo de resposta;
- SLA por fila e nível de escalonamento;
- mensagens recebidas, enviadas, entregues, lidas e falhas;
- janelas Meta próximas de expirar/expiradas;
- transferências entre filas e usuários;
- execuções e falhas do Motor de Fluxos;
- consultas e ações ERP, incluindo falhas e latência;
- saúde de Meta, MK, banco, Redis, workers, storage e push.

Relatórios sofisticados não devem atrasar o núcleo operacional.
