# PR124A — ajuste visual e responsividade

Revisão solicitada após captura do Safari: superfícies grafite em vez de verde-escuro, proporções de mensageria e leitura confortável. Effort recomendado e confirmado: `xhigh`.

## Implementação

- Paleta semântica compartilhada neutra; verde restrito a ação, seleção, estados e saída discreta. Splash mobile alinhado aos tokens.
- Lateral compacta com ícones vetoriais, rótulos acessíveis, foco e dicas; lista desktop de 320–420 px, sem cards de resumo ou controles de atualização.
- Cabeçalho limpo, nome/avatar abrindo detalhes, prazo da janela e menu com Escape; tipografia maior e composer com altura adaptativa limitada.
- Detalhes lado a lado em largura ≥1440 px e painel nas menores. Até 860 px, lista/conversa alternam sem desmontar a seleção. Rascunho e posição preservados; conversa recolhida não confirma mensagens novas como lidas.
- Viewport dinâmica, rolagens locais, reações sem ultrapassar a tela e movimento reduzido preservado. Sem novo endpoint, dependência de aplicação ou migration.

## Verificações de engenharia

Lint, tipos, contratos, 478 testes da API (cache do backend inalterado), 355 testes de arquitetura/comportamento e builds web/API/iOS/Android aprovados. Matriz Expo, auditoria de dependências e Gitleaks 8.30.0 aprovados. O aviso de chunk web acima de 500 kB permanece visível; não foi suprimido nem tratado como erro.

`scripts/aceitar-temas-web.mjs` executado em Chromium 152.0.7977.77 e WebKit 26.5, com fixtures exclusivamente locais e nenhum efeito externo. Ambos concluíram sem erro de página:

- Temas claro/escuro nas larguras 320, 390, 540, 768, 860, 861, 1024, 1280, 1440, 1600 e 2000 px; altura 740, 900 ou 1945 px conforme cenário (22 combinações por motor).
- Geometria medida: sem transbordamento horizontal em shell/timeline/cabeçalho/composer, campo utilizável, composer dentro da viewport e detalhes sem sobreposição em desktop amplo.
- Voltar à lista e reabrir a mesma conversa conserva rascunho e posição não nula, sem consultar novamente a timeline. Mensagem sincronizada com conversa recolhida só confirma leitura quando ela volta a ser visível.
- Texto ampliado a 200% medido na raiz, botão sem texto cortado; Escape fecha menu e devolve foco.
- Login, preferência do sistema, persistência, troca entre abas, foco, rolagem, editor e QR continuam cobertos pelo aceite anterior.

Capturas sintéticas e resultados regeneráveis em `outputs/temas-validacao/chromium/` e `outputs/temas-validacao/webkit/` (ignorados no Git). O teste reinicia o resultado como não aprovado para impedir uso de evidência antiga após falha.

## Limites e publicação

WebKit automatizado não equivale ao Safari físico do usuário. A captura recebida orientou o ajuste, mas a sessão autenticada do Safari não foi controlada. Exportação Expo também não comprova execução nativa: PR124 continua aguardando development build e homologação física iOS/Android.

Deploy de staging aprovado em 4 de setembro de 2026 em `https://omni.up100.com.br`. Release `pr-124a-a668c3e`, commit da aplicação `a668c3ef446d2f9f568bc591e468e50ad154fd49`, branch `codex/pr-124a-ajuste-visual-responsivo` publicada no GitHub. O registro posterior de aceite e a checagem adicional do CSS compilado não modificam o código da aplicação publicado. Não há merge nem objeto de pull request presumido.

API, web, proxy e duas réplicas do worker usam a nova release; prontidão privada/pública aprovada. O único job de migration reconheceu 57 migrations e não encontrou pendências. `/opt/vyntra/current` aponta para a nova pasta, com a anterior `pr-124-f0abf38` preservada para reversão pelo runbook PR112.

`scripts/aceitar-temas-staging.mjs` validou sem autenticação/efeito externo: HTTPS, prontidão 200, CSP preservada, login claro/escuro, persistência e hashes idênticos aos arquivos locais. O navegador integrado também confirmou a tela publicada, fundo `#111318` e ausência de transbordamento horizontal em 1512 px; a preferência original `Sistema` foi restaurada.

| Artefato | SHA-256 |
|---|---|
| Pacote imutável enviado à VM | `bb0c76857dc7b13934baf9643988bd9ef268de98990d8b5e8fbb05ac23f587ff` |
| `/temas.css` | `7713a7ea8aa6218e2888a59a4634ccbf95d274de27723b8502fa4d8a9a460017` |
| `/aparencia-inicial.js` | `059cac001db08b98a1752efb44ebbdce89f4338cd18cb30609d1d9729183127f` |
| `/assets/index-5Wkp6ZrT.css` | `d19a1797ede542d14aee45e42ed04af0c20aab376d2570c906b960b718f987b8` |

Arquivos de aparência exigem revalidação; CSS com hash permanece imutável. Ambos os controles MK estão `DESATIVADO`, rollout zero e sem liberação administrativa; modo MK e piloto real desligados. Produção continua bloqueada pelos portões existentes.
