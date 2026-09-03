# PR 059 — caracterização do MK Solutions

## Resultado atualizado

A PR 059 estabeleceu a evidência pública e manteve a integração em falha fechada. Em 2 de setembro de 2026, uma caracterização real, controlada e exclusivamente de leitura comprovou parte das consultas necessárias. Essa evidência permite à PR 117 implementar uma fatia de `ConsultasErp`, mas não conclui a caracterização integral do MK Solutions, não habilita escritas e não libera produção.

O provider completo de `AdaptadorErp` permanece ausente. A aplicação pode registrar somente a porta de leitura `CONSULTAS_ERP`, sob modo explícito e controles de recurso independentes. Capacidade não observada continua `CAPACIDADE_NAO_HABILITADA` ou `ERP_INDISPONIVEL`, sem inferência e sem simulador no runtime.

## Fontes oficiais consultadas

- [APIs gerais — MK Solutions](https://mkloud.atlassian.net/wiki/spaces/MK30/pages/48699908/APIs+gerais)
- [APIs especiais — MK Solutions](https://mkloud.atlassian.net/wiki/spaces/MK30/pages/48699991/APIs+especiais)

Consulta pública realizada em 1º de setembro de 2026. A primeira fonte documenta perfil de webservice, seleção de serviços, restrição por IP, credencial temporária com expiração/limite e famílias gerais. A segunda declara que APIs especiais/aprimoradas dependem de aquisição ou contato comercial e lista capacidades adicionais.

## Evidência real sanitizada

A caracterização foi executada a partir do ambiente de testes, sem escrita externa. Nenhum endereço, identificador, documento, nome de usuário, senha, contrassenha, credencial temporária, valor financeiro ou payload bruto foi preservado nesta documentação, em fixture ou no repositório.

| Capacidade | Evidência observada | Decisão da PR 117 |
|---|---|---|
| Transporte e autenticação geral | HTTPS respondeu e a autenticação geral devolveu validade, limite de uso, serviços autorizados e credencial temporária. Tokens específicos funcionaram para os serviços `6`, `8`, `9` e `22`; o perfil de caracterização anunciou 114 serviços. | Pedir um token descartável para o único código mínimo de cada chamada e recusar lista adicional/divergente. O perfil amplo é proibido em runtime. |
| Cliente | Consulta exata por documento funcionou no serviço `6`; documento ausente produziu erro externo controlado. O serviço mínimo da consulta direta por referência externa não foi confirmado. | Habilitar apenas documento. Referência externa, nome e telefone continuam não habilitados. |
| Contratos | A consulta por cliente devolveu contratos com adesão, empresa, plano e vencimento. | Exigir cliente explícito e validar que o contrato devolvido pertence a ele. |
| Conexões cadastradas | A consulta devolveu cadastro, bloqueio/redução, contrato, endereço e tecnologia, além de atributos técnicos que não devem atravessar a fronteira. | Projetar somente o modelo interno minimizado. Conexão cadastrada não é sessão de acesso e nunca prova estado `ATIVA`. |
| Faturas pendentes | A consulta por cliente devolveu vencimento, descrição, associação contratual e valor em tipos observáveis. | Usar somente dentro do contexto explícito de cliente e contrato e validar a associação antes de projetar. |
| Faturas detalhadas | O serviço especial `22`, com cliente, contrato e um mês, devolveu faturas pagas com estado externo `Pago`, data/valor de liquidação e uma ou duas relações de contrato. `liquidado=N` sem resultados devolveu erro `003`. A consulta baseada apenas no contrato foi recusada pelo provedor. | Consultar abertas e pagas separadamente; tratar `003` como lista vazia; exigir que o contrato consultado apareça exatamente uma vez e aceitar outras relações distintas. Linha digitável só pode complementar fatura aberta. |
| Classificações e processos | Catálogos exclusivamente de leitura responderam com estrutura observável. | Não expor na PR 117: ainda não existe caso de uso interno aprovado para esses catálogos. |
| Escritas | Nenhuma chamada de criação, alteração, desbloqueio, comentário, encerramento ou ordem de serviço foi executada. | `ADAPTADOR_ERP` permanece sem provider real; nenhuma escrita pode ser descoberta ou habilitada por configuração. |

Os nomes e formatos externos observados ficam restritos ao adapter. O domínio recebe apenas modelos em português, validados por allowlist, com origem `TEMPO_REAL` e estados canônicos.

## Contratos confirmados e limites

- Consultas de contrato e fatura exigem contexto explícito de cliente e contrato; relação implícita, cache ou escolha do primeiro resultado são proibidos.
- A listagem financeira observada usa uma janela de um mês. O resultado normalizado declara `JANELA_LIMITADA`; não representa extrato integral e não autoriza concluir que não existem outras faturas.
- O adapter fixa os códigos mínimos `6`, `8`, `9` e `22`, pede um token por chamada, exige autorização exata e o descarta após um uso. Não há código configurável, cache ou reaproveitamento de token.
- Em listas financeiras, erro `003` representa ausência. Faturas abertas e pagas são unidas sem duplicidade; o contrato solicitado deve aparecer uma vez, ainda que a fatura possua outras relações contratuais.
- A consulta de conexões representa cadastro técnico no ERP. Ela não substitui `AdaptadorSessaoAcesso`, não informa presença online confiável e não autoriza desconexão.
- Paginação, incremental, exclusões, limites sustentados, comportamento sob concorrência e expiração efetiva não foram suficientemente caracterizados.
- Datas e valores externos são tratados como entrada não confiável e convertidos apenas quando satisfazem o contrato interno.
- Resposta desconhecida, campo obrigatório ausente, relação divergente, redirecionamento ou corpo acima do teto falham fechados.
- A caracterização desta etapa não valida semântica de timeout antes/depois de qualquer escrita.

## Portões de ativação

O modo do provider nasce como `MK_MODO=DESATIVADO`. `CARACTERIZACAO` é reservado a execução controlada e não oferece a integração aos casos de uso. `SOMENTE_LEITURA` registra apenas `CONSULTAS_ERP`; nunca registra `ADAPTADOR_ERP`.

Mesmo em `SOMENTE_LEITURA`, o PostgreSQL mantém dois controles independentes, ambos desativados e com rollout de zero por cento por padrão:

- `MK_CONSULTAS_CADASTRAIS_REAIS`;
- `MK_CONSULTAS_FINANCEIRAS_REAIS`.

Na PR 117, somente a consulta financeira autenticada do console consome a porta real e exige `MK_CONSULTAS_FINANCEIRAS_REAIS`, sessão, RBAC, fila/recurso e contexto atual antes da rede. `MK_CONSULTAS_CADASTRAIS_REAIS` fica reservado, desligado e sem consumidor de runtime até existir um caso de uso correlacionado por identificadores internos. Habilitar um controle não habilita o outro, e nenhum deles habilita escrita, sessão de acesso, snapshot ou Motor de Fluxos.

Staging continua marcado para dados sintéticos ou sanitizados. O deploy da PR 117 deve manter `MK_MODO=DESATIVADO`, os dois controles desligados e `PILOTO_MK_REAL=false`; a evidência real permanece limitada ao ensaio transitório autorizado. Produção e piloto real continuam bloqueados, e a caracterização integral segue pendente.

## Credenciais e resposta ao incidente

As credenciais usadas no ensaio foram compartilhadas por um canal que não deve ser tratado como cofre e, portanto, devem ser consideradas comprometidas. Elas não foram versionadas, mas precisam ser revogadas ou rotacionadas antes de qualquer nova caracterização ou habilitação. A substituição deve criar material exclusivo por ambiente, de menor privilégio, entregue por arquivo secreto/cofre e nunca por variável registrada, parâmetro de processo, evidência, fixture ou log.

## O que ainda falta caracterizar

- busca por nome e telefone;
- paginação, cursor, incremental, tombstones e reconciliação completa;
- documento/segunda via, Pix e dados de pagamento além da linha digitável observada;
- endpoint externo direto por fatura; a consulta interna exata continua derivada da lista caracterizada e do contexto completo;
- protocolo, comentários e encerramento de atendimento;
- elegibilidade e execução de desbloqueio;
- criação, alteração, consulta e reconciliação de ordem de serviço;
- idempotência e resultado incerto de cada escrita;
- release/licenças da instalação, limites sustentados e perfil definitivo de menor privilégio.

Até essas evidências existirem, a PR 117 é somente uma integração real de consultas controladas. Ela não satisfaz o portão `MK_REAL_CARACTERIZADO` de produção.
