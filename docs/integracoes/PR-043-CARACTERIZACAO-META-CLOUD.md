# PR 043 — caracterização da Meta Cloud API

Data da revisão documental: 1º de setembro de 2026.

## Evidência oficial

A coleção oficial da Meta no Postman, atualizada em 14 de maio de 2026, confirma Cloud API, ativos necessários, permissões `whatsapp_business_management` e `whatsapp_business_messaging`, paginação e uso explícito da versão da Graph API. Fonte: <https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api>.

O material oficial sobre usernames confirma BSUID como identificador de backend para pessoas que adotarem username, telefone sujeito à regra de visibilidade de 30 dias e necessidade de parser compatível com ausência de telefone. Fonte: <https://developers.meta.com/resources/videos/whatsapp-usernames/>.

## Versão e ativação

Não existe alias `latest` no contrato da Vyntra. Toda chamada deve usar uma versão explícita `vN.0`, registrada junto da evidência da conta. A versão `v25.0` presente na fixture é somente dado sintético de contrato e não declara a versão a usar em produção.

Não foi fornecida uma conta Meta, WABA, número empresarial ou token para esta PR. Portanto, throughput e capacidades por conta permanecem `NAO_OBSERVADA`; a integração real falha fechada. Ativação exige sondagem autenticada, fixture sanitizada originada dessa conta, versão aprovada e registro do instante.

## Identidade

- `user_id`/BSUID é tratado como identificador externo estável no portfólio;
- `username` é apresentação opcional e mutável;
- `wa_id`/telefone é alias opcional, nunca chave obrigatória;
- nome de perfil é apresentação opcional;
- o domínio recebe somente os nomes internos já aprovados.

## Capacidades por conta

Flows, reações, contexto de resposta e prévia de URL são trivalentes: `NAO_OBSERVADA`, `HABILITADA` ou `DESABILITADA`. Ausência de evidência não equivale a desabilitada nem habilitada.

## Limites

Throughput deve ser lido/confirmado para a conta e número utilizados e armazenado como observação, não como constante global. Fila, backoff e limites de destinatário permanecem obrigatórios mesmo quando a conta informa capacidade maior.

## Fixtures

As fixtures removem IDs reais, tokens, assinaturas, telefones e conteúdo. Elas comprovam formato e comportamento do parser, mas não autorizam tráfego externo nem substituem o ensaio da conta real.
