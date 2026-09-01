# PR 059 — caracterização do MK Solutions

## Resultado

A documentação pública oficial comprova famílias de webservice e pré-requisitos, mas não basta para congelar respostas, paginação, códigos de erro ou ativar uma integração real. Não foi fornecido um ambiente MK, credencial, versão/release instalada nem licenciamento da instalação. O adapter permanece em falha fechada.

## Fontes oficiais consultadas

- [APIs gerais — MK Solutions](https://mkloud.atlassian.net/wiki/spaces/MK30/pages/48699908/APIs+gerais)
- [APIs especiais — MK Solutions](https://mkloud.atlassian.net/wiki/spaces/MK30/pages/48699991/APIs+especiais)

Consulta realizada em 1º de setembro de 2026. A primeira fonte documenta perfil de webservice, seleção de serviços, restrição por IP, token com expiração/limite e famílias gerais. A segunda declara que APIs especiais/aprimoradas dependem de aquisição ou contato comercial e lista capacidades adicionais.

## O que está comprovado publicamente

- autenticação gera token de retorno usado pelos demais webservices;
- perfil pode restringir serviços, usuários e IPs; HTTPS é orientação explícita;
- serviços gerais incluem documento, faturas pendentes, contratos, conexões, classificações/processos de atendimento, segunda via e linha digitável;
- APIs especiais publicam famílias para faturas, atendimento, auto-desbloqueio, Pix, comentários, OS e alteração/encerramento por protocolo;
- parte das APIs especiais depende de liberação/licenciamento comercial e alguns parâmetros dependem da release instalada.

## O que continua não observado

Os exemplos de resposta públicos aparecem majoritariamente como imagens. Portanto:

- nenhum DTO de resposta foi congelado;
- paginação não está documentada para as consultas selecionadas;
- catálogo e formato dos erros não foram observados;
- semântica de timeout antes/depois do efeito não foi comprovada;
- formato real de datas, dinheiro, documento, Pix, segunda via e identificadores não foi inferido;
- limites, concorrência, expiração efetiva e release da instalação não foram medidos.

A fixture sanitizada registra somente esse estado de evidência. Ela não contém resposta externa, endpoint de instalação, usuário, senha ou token e nunca habilita o adapter.

## Portão para ativação

Uma evidência `AMBIENTE_REAL` deve cobrir cada capacidade requerida com resposta sanitizada, DTO observado, paginação observada ou comprovadamente não aplicável e erros reais controlados. Também deve registrar release, licenças, HTTPS, allowlist de IP, perfil de menor privilégio, expiração/limite do token, timeout seguro e resultado incerto das escritas.

Até esse portão ser cumprido, `AdaptadorMkSolutions` não é registrado na aplicação. As PRs seguintes implementam contratos internos e um adapter contratual controlado; tráfego real permanece desligado.
