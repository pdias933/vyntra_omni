# Referências conceituais obrigatórias

Estas três imagens foram fornecidas pelo responsável do produto e representam a **linguagem, a hierarquia e o comportamento aprovados**. Não são especificações pixel a pixel e não autorizam copiar marca, ilustração, componente ou proporção literalmente.

- [Conversa](01-conversa.png): hierarquia de cabeçalho, janela Meta, timeline, composer, eventos internos, formulários e menu contextual.
- [Lista de atendimentos](02-lista-atendimentos.png): densidade operacional, leitura rápida, prioridade, SLA e organização da lista.
- [Detalhes do contato](03-detalhes-contato.png): separação entre identidade do WhatsApp, cliente ERP, contexto ativo, vínculos e histórico.

## Precedência obrigatória

Quando um elemento desenhado nessas imagens conflitar com a especificação textual atual, **a especificação textual prevalece**. Em especial:

- não implementar os cards de resumo nem `Puxe para atualizar`/`Última atualização` mostrados em `02-lista-atendimentos.png`;
- substituir `Fila(s)` por `Pendentes` e manter somente os filtros `Meus`, `Pendentes`, `Não lidos`, `SLA`, `Expirando` e `Em automação`;
- não implementar a faixa permanente `Cliente`, `Contrato`, `Histórico`, `Mídias` e `Notas` abaixo da janela Meta mostrada em `01-conversa.png`;
- não manter uma segunda faixa permanente de ações abaixo do composer; ações do sistema abrem um bottom sheet contextual;
- não introduzir Instagram, Messenger ou outro canal na V1; a V1 é WhatsApp;
- estado normal não mostra `Online`, sincronização, atualização ou infraestrutura. Somente exceções exibem `Sem conexão`, `Conectando...` ou `Sincronizando...` em faixa temporária;
- ações mutáveis de ERP continuam no menu de ações e exigem seleção, prévia e confirmação; a ficha de contato pode navegar por informações, mas não executa mutação perigosa com um toque.

## O que ainda não está congelado

Paleta final, tipografia, escala, grid, raios, sombras, dimensões, posição exata, tema escuro e duração das animações continuam sujeitos a protótipo e validação. Alterá-los não pode enfraquecer a hierarquia, a limpeza, a semântica de estado ou os comportamentos definidos em `PRODUCT.md` e `MOBILE.md`.
