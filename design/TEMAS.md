# Temas claro, escuro e sistema — contrato V1

Decisão PR118, autorizada em 4 de setembro de 2026. As propostas em `propostas-modo-noturno/` orientam a linguagem; texto, acessibilidade e comportamento do produto prevalecem sobre pixels.

## Preferência e comportamento

- `Sistema` é o padrão. `Claro` e `Escuro` são substituições explícitas por navegador/aparelho.
- A escolha permanece após reiniciar e sair da sessão. Guarda apenas a preferência de aparência, nunca identidade, permissão, rascunho ou conteúdo.
- Mudanças do sistema afetam a interface somente em `Sistema`. Falha de armazenamento conserva a escolha em memória e informa a limitação na área de aparência.
- Trocar o tema atualiza cores sem remontar navegação, timeline, composer, editor ou sessão. Não altera cursor, foco, posição, rascunho ou conexão.
- A troca é imediata. Movimentos existentes respeitam Reduzir Movimento; nenhuma transição de cor bloqueia trabalho.

## Tokens e semântica

`packages/tema` é a fonte compartilhada, pura e sem dependências externas. Tokens nomeiam intenção: fundo, superfície, texto, ação, atenção, falha, informação, formulário, nota interna, mensagens e mídia. Componentes não escolhem hexadecimais.

No escuro: fundo `#0B0F0D`, superfície `#121815`, elevada `#18201C`, borda `#27312C`, texto `#F2F5F3`, secundário `#9EAAA4`, ação `#2DBA78`, saída `#173D2D` e entrada `#1A211E`. Texto sobre ação é escuro para manter contraste; branco não é automaticamente apropriado sobre verde.

Notas internas usam ocre discreto e `Somente equipe`; formulários usam violeta dessaturado e `Ver formulário`. Erro, SLA e janela permanecem estados distintos, com texto/ícone além da cor. Mídia não é invertida nem filtrada. QR conserva fundo branco e módulos escuros com margem para leitura.

## Apresentação por plataforma

Mobile: provedor acima da aplicação, estilos memorizados por paleta, navegação e barras nativas reativas, teclado coerente, aparência no login e Perfil. Configuração nativa aceita o sistema. Splash acompanha a configuração nativa; um override salvo no app só pode ser aplicado quando o JavaScript ler a preferência.

Web: atributo `data-tema` na raiz, variáveis CSS e `color-scheme`; inicialização síncrona externa antes da aplicação para respeitar CSP sem script inline. Preferência local com acompanhamento do sistema e das outras abas. Aparência disponível no login e na lateral. Canvas, minimapa, controles, modais e estados vazios usam a mesma paleta.

## Aceite e publicação

Dependências nativas da PR123: `expo-system-ui ~57.0.3` habilita aparência no Android e fundo da raiz; `expo-splash-screen ~57.0.8` configura abertura por tema. Ambas são módulos oficiais Expo, licença MIT, nas versões indicadas pelo SDK instalado, sem scripts de instalação autorizados adicionais. Não recebem conteúdo, credencial ou rede de negócio. Nova development build é necessária; atualização só de JavaScript não instala esses módulos. Referência: [Expo — Color themes](https://docs.expo.dev/develop/user-interface/color-themes/).

Contraste mínimo de texto normal 4,5:1; texto grande e indicadores essenciais 3:1. Foco visível, campos identificáveis, fonte dinâmica e estados compreensíveis sem cor. Cores decorativas de separação não substituem indicadores essenciais.

Testar preferência inválida, armazenamento indisponível, mudança de sistema, reinício, troca entre abas, foco/rascunho preservados e ambos os temas em superfícies principais e secundárias. Registrar separadamente testes automatizados, captura real do navegador, exportação mobile e homologação em aparelhos físicos; uma exportação Expo não comprova execução nativa.

Deploy inicial em staging. Produção continua sujeita aos portões existentes. Reversão por release anterior compatível; não há migration, novo endpoint ou controle de autorização associado à aparência.
