# Mobile — Omnichannel V1

## 1. Papel do aplicativo

O aplicativo é um posto de trabalho principal, não uma versão reduzida da web. Deve permitir conduzir atendimento real no iOS e Android com conectividade instável, múltiplos dispositivos e comportamento próximo a um mensageiro moderno.

WhatsApp, Telegram, Linear e aplicativos modernos de produtividade são referências de qualidade de interação, sem autorizar cópia pixel a pixel, de marca ou de componentes proprietários.

Tecnologia: React Native + Expo Prebuild/Development Build. Expo Go não é o limite de produção.

### 1.1 Referências visuais e precedência

As referências conceituais obrigatórias são:

- [conversa](design/references/01-conversa.png);
- [lista de atendimentos](design/references/02-lista-atendimentos.png);
- [detalhes do contato](design/references/03-detalhes-contato.png).

Elas definem linguagem, hierarquia e comportamento, mas não devem ser copiadas pixel a pixel. Requisitos escritos neste documento e em `PRODUCT.md` prevalecem sobre elementos históricos das imagens. Portanto, não implementar os cards/resumos e indicadores permanentes de atualização da referência de lista, nem a fileira de atalhos sob a janela Meta ou a segunda barra permanente de ações da referência de conversa.

## 2. Princípios de experiência

- conversa é a tela central;
- lista se atualiza e reordena automaticamente;
- infraestrutura normal fica invisível;
- animação nunca atrasa o trabalho;
- aparência de mensageiro nativo premium, nunca de CRM web comprimido;
- cores servem principalmente para estado e ação, não para decoração;
- identidade visual comum, respeitando gestos, back, sheets, haptics e safe areas de cada plataforma;
- transições interruptíveis e fluidas, preparadas para telas de alta taxa de atualização;
- “Reduzir Movimento” troca movimentos fortes por transições discretas;
- skeleton e estado vazio são preferíveis a telas travadas;
- ações destrutivas/sensíveis exigem seleção, prévia ou confirmação adequada.

Usar React Native Reanimated e React Native Gesture Handler para transições e gestos executados fora do caminho crítico da thread JavaScript. Bottom sheets, haptics, skeletons e microinterações são parte da experiência da V1, mas nenhum deles pode bloquear comando, navegação ou aplicação de estado.

## 3. Navegação

Abas principais:

```text
Atendimentos
Contatos
Notificações
Perfil
```

### 3.1 Atendimentos

Filtros únicos, sem cards duplicando a mesma informação:

```text
Meus
Pendentes
Não lidos
SLA
Expirando
Em automação
```

São os únicos filtros superiores. Podem rolar horizontalmente em tela estreita e não podem ser repetidos em cards, contadores-resumo ou outra faixa equivalente. Nova mensagem:

- atualiza prévia e horário;
- incrementa não lidas;
- move suavemente a conversa para a posição correta;
- não exige pull-to-refresh.

Atualização, realtime e recuperação acontecem silenciosamente. Não mostrar `Atualizar`, `Última atualização`, estado de WebSocket ou indicador de sincronização quando tudo funciona. Uma faixa superior temporária só aparece em exceção:

```text
Sem conexão
Conectando...
Sincronizando...
```

Ela desaparece automaticamente ao normalizar. Pull-to-refresh não faz parte do fluxo normal. Se for mantido somente como contingência, o feedback existe apenas enquanto o gesto está ativo, desaparece ao terminar e nunca mostra rótulo/timestamp nem substitui realtime ou reconciliação.

### 3.2 Conversa

A tela permanece extremamente limpa: cabeçalho, contexto essencial, janela Meta quando relevante, timeline e composer. Não existe uma faixa permanente de atalhos `Cliente`, `Contrato`, `Histórico`, `Mídias` ou `Notas` abaixo da janela Meta.

Cabeçalho:

- nome/avatar do contato;
- username/telefone quando disponíveis;
- cliente e contrato ativos;
- fila e responsável;
- conta WhatsApp de origem;
- estado/countdown da janela Meta.

O cabeçalho usa revelação progressiva: contato e um contexto operacional curto têm prioridade. Username/telefone, contrato, fila, responsável e conta de origem não precisam aparecer todos simultaneamente; dados secundários pertencem a Detalhes do Contato. O countdown ganha destaque somente quando influencia a decisão do operador.

Timeline:

- mensagens, mídias, replies e reações;
- uma única linha contínua por `Contato`, atravessando atendimentos e contas empresariais autorizadas;
- separadores discretos por data, protocolo/atendimento ou conta de origem quando necessários;
- cada mensagem, `Atendimento` e protocolo preserva a conta/número empresarial de origem sem fragmentar a conversa;
- eventos internos permitidos, marcados como `Somente equipe`;
- notas internas visualmente inequívocas, também marcadas como `Somente equipe`;
- tipos internos futuros, como relatórios técnicos, usam o mesmo contrato `Somente equipe` sem entrar no escopo funcional da V1;
- submissões de WhatsApp Flows em cards estruturados, com `Ver formulário` e mascaramento por permissão;
- paginação ao rolar para cima;
- busca e navegação até ocorrência/mensagem citada.

Composer:

- anexo;
- campo de texto;
- `/` abre respostas rápidas pesquisáveis;
- botão de ações do sistema/ERP ao lado do anexo quando o campo está vazio;
- quando há texto, o envio recebe prioridade;
- o botão de ações abre bottom sheet categorizado, nunca outra tela nem uma segunda barra permanente;
- swipe para responder;
- toque longo para copiar, reagir e demais opções permitidas;
- toque em citação leva à original.

Fora da janela Meta, o composer de texto livre fica bloqueado e oferece template aprovado. Nunca deixa o usuário acreditar que texto rejeitado foi enviado.

### 3.3 Detalhes do contato

Tocar nome/avatar abre uma tela contextual sem descartar posição ou rascunho:

- identidade WhatsApp;
- cliente ERP vinculado e estado de autenticação;
- CPF/CNPJ mascarado conforme permissão;
- contexto atual e troca de cliente/contrato;
- contratos, serviços, planos, endereços e situação financeira resumida;
- pesquisa na conversa;
- mídias, links e documentos;
- notas e atendimentos anteriores;
- tags e vínculos.

Contato sem identificação mostra `Vincular a cliente`. Quando houver múltiplos vínculos, a tela permite escolher e trocar o cliente/contrato ativo sem alterar a identidade do WhatsApp. Ações mutáveis de ERP continuam no menu de ações da conversa, não espalhadas na ficha.

## 4. Autenticação e dispositivo

### 4.1 Credencial

O primeiro acesso aceita usuário/senha. Depois, a sessão é persistente e a biometria desbloqueia o app no cotidiano.

Refresh tokens:

- rotativos;
- opacos;
- guardados no Keychain/Keystore;
- vinculados à instalação e ao dispositivo;
- revogáveis individualmente.

Na implementação da PR 015, o access token vale 15 minutos e permanece somente na memória do processo. O refresh token tem validade absoluta máxima de 30 dias e fica no SecureStore junto do UUID do dispositivo; identificador e segredo da instalação também ficam nesse cofre com política restrita ao aparelho. SQLite, AsyncStorage, logs e telemetria não recebem qualquer token. Cada acesso apresenta token, dispositivo e segredo de vínculo; cada renovação substitui access e refresh. Resposta `401` limpa a sessão local e conduz a uma nova autenticação sem expor estado técnico na interface normal.

Novo login é forçado em troca de senha, dispositivo revogado, suspeita, restauração indevida ou política administrativa.

### 4.2 Pareamento QR

Fluxo:

```text
web autenticada gera QR
  ↓
app escaneia token efêmero
  ↓
backend valida uso/expiração
  ↓
web confirma o aparelho
  ↓
backend cria sessão exclusiva do mobile
```

O QR não contém credencial permanente, vale 90 segundos e é de uso único. Existe no máximo um QR ativo por sessão web; gerar outro invalida o anterior. Replay, foto usada depois da validade e segunda utilização falham. O backend limita geração e resgate conforme `SECURITY.md`.

Após ler o QR, o app troca imediatamente o token por um comprovante diferente e mantém ambos apenas pelo tempo necessário ao fluxo; nenhum deles vai para SQLite, AsyncStorage, log ou telemetria. Consulta e conclusão reapresentam o comprovante e o mesmo vínculo da instalação. A tela mostra uma prévia clara do aparelho na web e aguarda confirmação sem revelar token técnico. Expiração, cancelamento, logout web, troca de aparelho durante o fluxo ou replay encerram a tentativa e oferecem gerar/ler um novo QR, nunca repetem silenciosamente o vínculo.

Somente depois de `CONFIRMADO` o app solicita a conclusão. Access e refresh retornam exclusivamente nessa resposta mobile e passam ao mesmo `GerenciadorSessaoMobile`/cofre nativo do login por credencial. `AGUARDANDO_CONFIRMACAO` é estado normal e pode usar progresso discreto; erro técnico não deve aparecer como estado permanente de sincronização.

### 4.3 Limite

Cada usuário possui no máximo dois dispositivos móveis. Ao confirmar o terceiro, o backend revoga o mais antigo, registra auditoria e envia evento de encerramento à sessão afetada.

Na V1 o terceiro login não pede uma segunda confirmação: credencial/MFA válidos constituem a confirmação, o backend substitui atomicamente o aparelho com acesso mais antigo e a resposta informa a substituição. A tela de Perfil lista os dois aparelhos ativos com plataforma, modelo sanitizado, versão e último acesso; nunca exibe identificador de instalação, hash ou segredo. Revogar exige confirmação visual e encerra todas as sessões daquele aparelho. Se for o atual, ou se uma resposta autenticada retornar `401`, o gerenciador limpa refresh/UUID do cofre e volta ao login. `DISPOSITIVO_NAO_CONFIAVEL` após credencial válida descarta também a identidade local revogada/restaurada e gera uma instalação nova antes de permitir nova tentativa explícita de login. Essa transição pode informar “Acesso revogado”, mas não mostra WebSocket, sync ou detalhes de infraestrutura.

## 5. Atualização obrigatória e controle de recursos

Na abertura/autenticação, o app envia plataforma e versão. O backend retorna:

```text
versao_minima
versao_recomendada
atualizacao_obrigatoria
mensagem
url_loja
controles_recurso
```

Se a versão estiver abaixo da mínima:

- bloquear a interface inteira;
- exibir `ATUALIZACAO_OBRIGATORIA` sem “lembrar depois”;
- abrir App Store/Google Play;
- permitir somente diagnóstico mínimo/logout quando seguro.

O bloqueio não é apenas visual: login, resgate/conclusão de QR, autenticação de access e rotação de refresh recebem `426 ATUALIZACAO_OBRIGATORIA`. A avaliação pública pré-login fornece política/mensagem sem criar autoridade; controles do usuário só chegam sob sessão válida.

Forçar atualização apenas por incompatibilidade relevante de API/recurso ou segurança crítica. Versão comum pode gerar aviso opcional.

Controle de recurso é autoridade do backend. O app não habilita funcionalidade porque encontrou componente local. A liberação gradual pode variar por usuário, papel, fila, conta ou percentual.

O painel web não publica binário nas lojas; controla apenas recursos já presentes e política de versão.

## 6. Armazenamento local

SQLite é réplica/cache, nunca fonte oficial. Guarda somente o necessário ao usuário autorizado:

```text
conversas recentes
atendimentos próprios/pendentes autorizados
itens de timeline paginados
estado de leitura e marcadores
rascunhos
pendencias_saida_texto
permissoes e filas atuais
controles_recurso
ultima_sequencia_aplicada
metadados de sincronizacao
autorizacao_offline_valida_ate
```

Tokens ficam em armazenamento seguro, não no SQLite comum.

Dados locais sensíveis devem usar criptografia/proteção compatível com a plataforma, política de backup local e limpeza em logout/revogação. O servidor emite uma autorização offline assinada, vinculada à instalação, usuário, dispositivo, sessão, versão de permissões e escopos, com validade máxima de 4 horas. Um aparelho sem rede pode ler somente o cache mínimo já autorizado, manter rascunhos e criar pendência de texto até `autorizacao_offline_valida_ate`; depois disso, bloqueia a área autenticada até revalidar sessão e permissões.

Offline nunca permite ação ERP, exportação, criação de vínculo, visualização integral de dado sensível, obtenção de nova URL de mídia ou envio efetivo. Ao retornar, o app sincroniza e reautoriza antes de qualquer pendência. Token expirado, falha de integridade local ou relógio recuado além da tolerância bloqueiam a área autenticada. Revogação conhecida invalida imediatamente cache e pendências; um aparelho totalmente offline bloqueia no máximo ao fim das 4 horas e conclui a limpeza ao reconectar.

## 7. Sincronização

### 7.1 Inicialização/reconexão

```text
ler ultima_sequencia_aplicada
  ↓
GET /sincronizacao?apos=...
  ↓
validar/aplicar lote em transação SQLite
  ↓
persistir cursor final
  ↓
abrir WebSocket com apos=cursor final
  ↓
gateway faz backfill e depois realtime
```

Isso fecha a lacuna entre sync e WebSocket. Se o app fechar no meio da aplicação local, o cursor não avança; o lote é repetido de forma idempotente.

### 7.2 Eventos

Aplicação por `sequencia_evento`, nunca apenas por relógio. Evento repetido não duplica linha. Lacuna detectada interrompe o modo ao vivo e dispara nova sincronização.

### 7.3 Ressincronização completa

Ao receber `RESSINCRONIZACAO_COMPLETA_NECESSARIA`:

1. suspender comandos dependentes do estado antigo;
2. preservar rascunhos e pendências locais separadamente;
3. obter snapshot consistente autorizado e sua `sequencia_base`;
4. substituir réplica de negócio e persistir `sequencia_base` na mesma transação SQLite;
5. reconciliar pendências contra o novo estado;
6. abrir WebSocket pelo cursor base novo.

A PR 054 fixa o contrato do passo 3: o snapshot retorna filas e permissões vigentes, atendimentos abertos/reabríveis, controles e políticas, além de uma janela de trabalho de até 200 conversas e 200 mensagens/notas por conversa. O histórico restante continua disponível no servidor. O plano local obrigatório executa `SUBSTITUIR_REPLICA_AUTORIZADA` e `PERSISTIR_SEQUENCIA_BASE` na mesma transação SQLite; rascunhos e comandos pendentes não pertencem à réplica substituída e são preservados para reconciliação.

## 8. Tempo real e ciclo de vida

### Primeiro plano

WebSocket autenticado entrega eventos. Heartbeat detecta conexão morta, mas não altera `DISPONIVEL`/`INDISPONIVEL`.

### Segundo plano/fechado

O app não depende de manter WebSocket. APNs/FCM avisa sobre:

- nova mensagem em atendimento próprio;
- novo pendente em fila autorizada;
- cliente aguardando resposta;
- janela próxima de expirar;
- transferência direta.

Rajadas do mesmo contato são agrupadas. Push contém mínimo possível e nunca CPF/fatura/dado financeiro. Tocar no push abre app, sincroniza e então navega.

## 9. Offline

### 9.1 O que funciona

- visualizar conteúdo já carregado e autorizado;
- buscar localmente no conjunto carregado;
- manter posição e rascunho;
- criar pendência de texto;
- exibir estado `SEM_CONEXAO`/`CONECTANDO`/`SINCRONIZANDO`.

Esses são estados internos. A interface os converte exclusivamente para a faixa humana `Sem conexão`, `Conectando...` ou `Sincronizando...`; nunca exibe os códigos em caixa alta ao usuário.

Upload offline avançado de imagem, áudio, vídeo e PDF, com retomada parcial, fica para V1.1. Não prometer envio de mídia offline na V1.

### 9.2 Rascunho versus pendência

`RASCUNHO` é texto não enviado e local ao aparelho.

Ao tocar Enviar sem rede, criar `AGUARDANDO_CONEXAO` com:

```text
mensagem_cliente_id
conversa_id
atendimento_id
texto
criada_dispositivo_em
sequencia_observada
versao_atribuicao_observada
usuario_responsavel_observado
janela_observada
```

Não mostrar como `ENVIADA`.

### 9.3 Reconciliação

Ao voltar:

1. sincronizar antes de enviar;
2. confirmar que sessão, permissão, fila e responsabilidade continuam válidas;
3. comparar sequência/timeline e `versao_atribuicao`;
4. recalcular janela Meta;
5. enviar automaticamente somente se não houve mudança relevante;
6. caso contrário, mudar para `REVISAO_NECESSARIA`.

Mudanças relevantes incluem:

- nova mensagem do contato;
- mensagem de saída pela web/outro aparelho;
- resgate, transferência ou assunção;
- alteração de contexto;
- janela Meta expirada;
- perda de permissão/fila;
- atendimento encerrado/reaberto;
- versão de atribuição diferente.

`REVISAO_NECESSARIA` oferece:

```text
Editar
Descartar
Enviar mesmo assim
```

“Enviar mesmo assim” cria novo comando; o backend ainda pode recusar por autorização, estado ou janela. Não existe bypass local.

## 10. Permissão removida

Ao receber `PERMISSOES_ALTERADAS` ou `403 ESCOPO_ATUALIZADO`:

- interromper visualização/comando do recurso;
- atualizar permissões;
- apagar registros, índices locais e arquivos em cache pertencentes ao escopo perdido;
- limpar notificações correspondentes;
- refazer snapshot se necessário;
- não manter timeline antiga acessível por tela offline.

Ao tomar conhecimento da revogação, o app apaga a réplica autenticada e retorna ao login. Se estiver totalmente offline, a autorização offline expira e bloqueia o cache; a próxima conexão confirma a revogação e conclui a limpeza.

## 11. Leitura e não lida

Abrir a conversa chama comando de leitura e registra leitura real. O marcador “não lida” é pessoal e não retrocede leitura real nem confirmação já enviada ao canal.

Falha de rede ao marcar leitura é reconciliada idempotentemente. Push não marca leitura.

## 12. Mensagens e mídia

- `NA_FILA` e `ENVIANDO` têm indicadores claros;
- `ENVIADA`, `ENTREGUE` e `LIDA` refletem somente estado confirmado;
- falha mostra motivo e ações permitidas;
- cancelar/editar somente antes da aceitação Meta;
- editar falha cria nova tentativa;
- reply guarda relação real, não cópia de texto;
- swipe cria reply/citação e toque na citação navega até a original;
- toque longo oferece copiar, reagir e outras opções autorizadas;
- player de áudio, imagem/vídeo em tela cheia e visualizador PDF;
- galeria de mídias, links e documentos paginada;
- URL assinada pode expirar; app solicita outra após autorização.
- tetos de seleção/upload: imagem 8 MB, áudio 16 MB, vídeo 32 MB e PDF 20 MB, podendo ser menores conforme a capacidade validada do provedor;
- arquivo acima do limite é recusado antes do envio com mensagem clara e nunca dispara upload/download irrestrito.

## 13. Ações do sistema

O botão dedicado ao lado do anexo, ativo/visível com o campo vazio, abre um bottom sheet organizado por categorias e pesquisável. O primeiro toque apenas seleciona a capacidade. Operação com efeito real exige contexto, prévia, confirmação e resposta inequívoca. Exemplos:

- consultar/vincular cliente;
- selecionar contrato;
- consultar faturas;
- gerar/enviar segunda via;
- gerar/enviar Pix;
- verificar/executar desbloqueio;
- consultar conexão/sessão de acesso, quando disponível;
- criar ordem de serviço;
- solicitar WhatsApp Flow.

O app nunca chama MK/Meta diretamente. Botão invisível não é segurança; a API revalida tudo.

## 14. Diagnóstico

`Perfil → Diagnóstico` pode mostrar, sem conteúdo de conversa:

```text
versao_app
versao_sistema_operacional
modelo_dispositivo
servidor conectado
estado_websocket
estado_push
estado_sincronizacao
ultima_sequencia_aplicada
codigos de falha recentes sanitizados
```

Relatório enviado ao suporte deve ser sanitizado, consentido pelo usuário e limitado.

## 15. Acessibilidade e performance

- leitores de tela e labels nos controles;
- contraste e tamanho dinâmico de fonte;
- “Reduzir Movimento” respeitado;
- com “Reduzir Movimento”, preservar o mesmo resultado e substituir deslocamentos fortes por fade curto;
- área de toque adequada;
- ações não dependem somente de cor;
- semântica de cor consistente para SLA, janela Meta, offline/falha, sucesso e informação;
- listas virtualizadas e timeline paginada;
- atualização de uma conversa não recalcula toda a lista;
- mídia usa thumbnail/cache limitado;
- nenhum carregamento de anos de histórico na abertura.

## 16. Critérios de aceite

- iOS e Android executam o mesmo caso de uso com comportamento nativo apropriado.
- Terceiro aparelho revoga o mais antigo; online, ele perde sincronização/WebSocket e limpa a réplica; offline, o acesso termina no máximo ao expirar a autorização offline.
- QR expirado ou repetido não cria sessão.
- App abaixo da versão mínima não passa da tela obrigatória.
- Nova mensagem move a conversa sem refresh manual.
- Estado saudável não mostra atualização, timestamp de sync ou infraestrutura.
- Os seis filtros aparecem uma única vez e não possuem cards duplicados.
- A conversa não possui faixa de atalhos duplicados sob a janela Meta.
- Voltar de Detalhes preserva posição e rascunho.
- Contato não identificado oferece `Vincular a cliente`; troca de contexto não troca a identidade do contato.
- Ações do sistema abrem bottom sheet e toda ação com efeito real exige seleção, prévia, confirmar e cancelar.
- Nota/evento interno é marcado `Somente equipe` e não se confunde com mensagem externa.
- Com “Reduzir Movimento”, toda tarefa permanece funcional sem depender de animação.
- Queda de rede mantém conversa carregada e rascunho.
- Resposta enviada pela web enquanto mobile está offline gera `REVISAO_NECESSARIA`.
- Transferência enquanto offline impede envio automático antigo.
- Evento entre sync e conexão WebSocket é recuperado pelo backfill.
- Push não contém dado sensível nem marca leitura.
- Perda de acesso à fila remove o conteúdo local correspondente.
- Fechar app não muda disponibilidade operacional.
