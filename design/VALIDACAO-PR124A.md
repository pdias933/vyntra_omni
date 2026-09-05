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

Deploy de staging pendente de publicação desta revisão. A release anterior `pr-124-f0abf38` deve ser preservada. Validar saúde, assets, CSP e aparência no endereço real após publicar; manter MK e piloto real desligados. Produção permanece bloqueada pelos portões existentes.
