# PR118–PR124 — validação de aparência

## Escopo e resultado de engenharia

Validação em 4 de setembro de 2026, sobre a cadeia baseada em PR117A. Claro, Escuro e Sistema compartilham tokens entre web e mobile. Não há migration, mudança de OpenAPI, permissão, adapter ou ativação de integração.

| Verificação | Resultado |
|---|---|
| Lint e tipos do monorepo | Aprovados. |
| Contratos gerados | Aprovados, sem mudança de contrato. |
| Testes da API | 478 aprovados; resultado reutilizado pelo cache para backend inalterado. |
| Testes de arquitetura e comportamento | 355 aprovados. |
| Contraste e tokens | Texto AA nas duas paletas, foco e ausência de cores literais nos componentes. |
| Navegador real | Chrome 152.0.7977.77, 1600 × 1000, Reduzir Movimento ativo, sem erro de aplicação. |
| Expo | Matriz de dependências aprovada; exportações iOS e Android geradas. |
| Auditoria | Dependências e segredos aprovados; exceção preexistente permanece documentada. |
| Aparelhos físicos | Pendente; não confundir exportação com execução nativa ou distribuição de binário. |
| Staging | Release `pr-124-f0abf38` publicada e validada em HTTPS, com API/web/proxy e dois workers homogêneos. |

## Cobertura real no navegador

Login, lista, conversa com mensagem/nota/evento/formulário, detalhes, editor claro/escuro e QR. Preferência inválida ou armazenamento negado são cobertos por testes de comportamento. O ensaio do navegador verifica persistência após recarga, mudança do sistema, sincronização entre abas, foco, rascunho e posição da timeline preservados, posição do nó do editor preservada e nenhuma requisição adicional provocada pela troca de tema. O QR mantém fundo branco e módulos escuros em ambos os temas; isso não substitui a leitura óptica em aparelho.

O ensaio intercepta respostas HTTP com dados inteiramente sintéticos, somente contra origem local. Não autentica um usuário real, não cria fluxo ou pareamento no backend e não comprova integração real. Capturas ficam em `outputs/temas-validacao/`, ignoradas pelo Git; o relatório JSON registra a versão do navegador e os cenários.

Reprodução: iniciar o web local e executar `node scripts/aceitar-temas-web.mjs`. O ambiente de QA deve fornecer Playwright, pelo pacote instalado ou `VYNTRA_PLAYWRIGHT_MODULO`, e opcionalmente o caminho de Chrome em `VYNTRA_CHROME_EXECUTAVEL`. `VYNTRA_WEB_TESTE` permite mudar a porta/origem local; origens remotas são recusadas. Playwright é ferramenta do ambiente de QA, não dependência de produção.

## Correções encontradas na revisão

- Delimitar seletores da tela vazia para não atingir cabeçalho e janela Meta da conversa aberta.
- Permitir que a coluna de conversa encolha dentro da grade: histórico longo rola na timeline, sem empurrar o composer para fora da janela. O teste exige posição de rolagem maior que zero.
- Aplicar contraste próprio à marca, prévias, estados e botão de vínculo desabilitado.
- Incluir pacote compartilhado, CSS e inicialização de aparência no contexto e na imagem Docker web.
- Incluir o `tsconfig` próprio do pacote no construtor Docker. A primeira tentativa detectou a ausência antes de migração/troca dos serviços; a release anterior permaneceu atendendo.
- Revalidar os arquivos públicos de aparência a cada acesso; arquivos versionados de `/assets/` conservam cache imutável. CSP permanece inalterada, sem liberar script inline.

## Dependências nativas

Os módulos oficiais e a necessidade de nova development build estão em [TEMAS.md](TEMAS.md). A matriz Expo pediu os patches `expo 57.0.20` e `expo-notifications 57.0.17`, com seus componentes transitivos correspondentes. As exceções de idade mínima foram limitadas às versões exatas de Expo/CLI/core/JSI/notifications na matriz existente; não há liberação global de idade, licença ou script de instalação. Auditoria e validação de fornecimento de dependências passaram.

## Aceite ainda necessário em iOS e Android

Os aparelhos iOS registrados neste computador retornaram indisponíveis para o ensaio; não foi executada homologação física em nenhuma plataforma.

- Gerar e instalar uma nova development build com os módulos nativos; manter configuração de API e chave pública offline verificadas.
- Validar abertura fria pelo sistema e override salvo, barras, teclado, seletor de anexos, câmera, leitor QR, biometria e tela de atualização obrigatória.
- Testar lista, conversa, notas/formulários, mídia, ações, detalhes, navegação de volta, rascunho e posição durante troca de tema.
- Validar fonte ampliada, leitor de tela, Reduzir Movimento, haptics, gestos e comportamento offline/reconciliação nas duas aparências.
- Registrar aparelho, versão de sistema e resultado; não marcar a PR124 concluída antes desse aceite.

## Rastreabilidade

As branches `codex/pr-118-contrato-temas` até `codex/pr-124-regressao-homologacao-temas` são dependentes e devem ser revisadas nessa ordem. Publicação de branch não significa merge. A integração GitHub recusou a abertura dos objetos de pull request com HTTP 403; nenhuma PR aberta foi presumida. O painel e o Effort de cada etapa ficam em [ROADMAP.md](../ROADMAP.md).

## Publicação verificada

Release de aplicação `pr-124-f0abf38`, commit `f0abf38dfe37b2afe2b960fa4b89eaae880d800a`, em [omni.up100.com.br](https://omni.up100.com.br). O deploy compatível terminou com código zero: um job de migration reconheceu 57 migrations, sem pendência; API, web e proxy ficaram saudáveis, e os dois workers usam o mesmo release. PostgreSQL, Redis e storage permaneceram saudáveis. O apontamento `current` foi atualizado após prontidão; a release anterior `pr-117a-1631aee` permanece disponível para reversão compatível.

O ensaio `scripts/aceitar-temas-staging.mjs` usa somente leitura, sem usuário autenticado ou API simulada. Confirmou prontidão HTTP 200, login nos dois temas, persistência após recarga, ausência de erro de aplicação, CSP com `script-src 'self'` e arquivos públicos idênticos à fonte:

| Arquivo | SHA-256 | Cache |
|---|---|---|
| `/temas.css` | `d6448036c4861beb317ea1835b0f67f10755b4ed69a2eb7283fc1451dc697c0f` | `no-cache, must-revalidate` |
| `/aparencia-inicial.js` | `059cac001db08b98a1752efb44ebbdce89f4338cd18cb30609d1d9729183127f` | `no-cache, must-revalidate` |

Reprodução: usar as mesmas variáveis de Playwright/Chrome do ensaio local e executar `node scripts/aceitar-temas-staging.mjs`. Capturas e JSON ficam em `outputs/temas-validacao/staging/`. Modo MK foi confirmado `DESATIVADO`; os dois controles MK permanecem `DESATIVADO`, percentual zero e sem liberação administrativa. O piloto continua desligado, sem usuários/contas/recursos ativos. Esta publicação não libera produção.
