# PR128 — builds locais e primeiro aceite físico

Data: 7 de setembro de 2026. Estado: EM ANDAMENTO. Effort: `xhigh`.

## Resultado e limites

| Etapa | Evidência |
|---|---|
| Android | `:app:assembleDebug` aprovado; 502 tarefas, recompilação incremental de 21 segundos. |
| iOS | `xcodebuild` Debug para aparelho: `BUILD SUCCEEDED`; assinatura Apple Development da equipe UP100 existente verificada. |
| Instalação iPhone | Instalação e lançamento por `devicectl` aprovados; usuário confirmou abertura do login. |
| Pareamento iPhone | Duas conclusões HTTP 200 após confirmação web; app falhou na preparação da réplica local. Correção implementada, repetição física pendente. |
| Instalação Android | Samsung detectado no USB; ainda não aparece no ADB. Depuração/autorização no aparelho pendente. |
| Lote operacional físico | Resgate → nota → transferência entre operadores, rede/revogação, SQLCipher/cofre e acessibilidade ainda pendentes. |
| Servidor | Nenhum novo deploy. Staging permanece `pr-128a-df35243`, com releases anteriores preservadas. Nenhuma promoção a produção ou ativação Meta/MK/piloto. |

São builds de desenvolvimento com código JavaScript servido pelo Metro. O Mac precisa permanecer ligado e acessível durante os testes; cabo de instalação não torna o aplicativo autônomo. Uma futura build de testes com código embarcado exigirá nova compilação, assinatura e instalação; ainda dependerá de internet para operações online. Não foi gerado IPA, TestFlight ou publicação de loja.

## Ambiente reproduzível

- Node 24.19.0, pnpm 11.24.0 e dependências fixadas no repositório.
- Android Studio: Java 25; Gradle 9.3.1 e SDK em `Library/Android/sdk` do usuário.
- Xcode 26.6 (17F113), SDK iPhoneOS 26.5; iPhone Air com iOS 27 beta.
- Ruby portátil Homebrew 4.0.6_2 e CocoaPods 1.16.2 em cache isolado do usuário. Nenhuma alteração no Ruby do sistema ou instalação de Homebrew.
- `pod install`: 111 dependências e 110 pods; SQLCipher preservado.
- O erro inicial de montagem DDI foi `DeviceLocked`. Depois do desbloqueio, DDI compatível/usável e instalação aprovadas; não foi necessária troca de Xcode.

Ruby portátil obtido pelo fluxo oficial do [Homebrew](https://github.com/Homebrew/brew/blob/main/Library/Homebrew/cmd/vendor-install.sh), com SHA-256 conferido antes da extração: `1643bb83d705f0c5e34445af151bb064bdf984081eff18a9646466b8fdd104db`. Uso de Ruby separado segue a [orientação do CocoaPods](https://guides.cocoapods.org/using/getting-started.html).

Configurar caminhos Node/pnpm/Java/SDK/CocoaPods e `GEM_HOME`/`GEM_PATH` do runtime isolado antes dos comandos. `apps/mobile/ios/.xcode.env.local` aponta `NODE_BINARY` para o Node suportado. Pastas geradas, assinatura, perfil, `.env.local` e produtos de build são ignorados no Git.

Em `apps/mobile/android`:

```sh
JAVA_TOOL_OPTIONS=--enable-native-access=ALL-UNNAMED ./gradlew :app:assembleDebug --no-daemon
```

Em `apps/mobile/ios`, após `pod install`, usando o identificador da equipe existente aprovado para assinatura:

```sh
xcodebuild -quiet -workspace VyntraOmni.xcworkspace -scheme VyntraOmni \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath ../build-ios-device -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$VYNTRA_EQUIPE_APPLE" CODE_SIGN_STYLE=Automatic build
```

Em `apps/mobile`, configuração pública local ignorada com API de staging, versão `0.0.0` e allowlist pública obtida pelo comando `staging:configuracao-mobile`. Nenhuma chave privada do servidor é enviada ao app. Política pública consultada em ambas as plataformas permitia `0.0.0`, sem alteração de mínima para contornar bloqueio.

```sh
node scripts/executar-expo.mjs start --dev-client --lan --port 8081
```

O Metro foi reiniciado com limpeza de cache depois da correção SQLCipher. Reabrir/recarregar o app baixa o código corrigido; os binários Debug abaixo não contêm esse código embarcado.

## Artefatos locais

- Android: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, aproximadamente 262 MiB. SHA-256 `ef1c25c26f9f948d055fc0761d050e7ea990d6c62b52c4ac0669676a80b54781`.
- iOS: `apps/mobile/build-ios-device/Build/Products/Debug-iphoneos/VyntraOmni.app`, aproximadamente 124 MiB. Assinatura verificada com `codesign --verify --deep --strict`. SHA-256 somente do executável `VyntraOmni`: `3e5e34bc0d8c6f9b15d940a5e4aebeed5f0332e08523add8bf1c8e26c84548d6`; não é hash do diretório inteiro nem de um IPA.
- Bibliotecas nativas incluem SQLCipher; símbolo de chave presente na biblioteca iOS. Isso isoladamente não comprova integridade/cofre em execução no aparelho.

## Defeito encontrado no pareamento

O proxy registrou resgate 200, confirmação web 204 e conclusão mobile 200 nas duas tentativas. Nenhum token, comprovante, senha, header ou conteúdo foi incluído nesta evidência. O serviço mobile, depois da conclusão, abre/limpa a réplica antes de ativar a sessão. A abertura exigia equivocadamente `ok` em `cipher_integrity_check` e rejeitava o resultado vazio legítimo.

Segundo o [contrato oficial SQLCipher](https://www.zetetic.net/sqlcipher/sqlcipher-api/#cipher_integrity_check), cada linha representa um erro; ausência de linhas significa consistência criptográfica. O resultado `ok` é do `integrity_check` estrutural. A correção:

- aplica a chave custodiada antes das consultas;
- exige SQLCipher 4 e HMAC ativo para não aceitar SQLite comum que ignora pragmas;
- exige zero erros criptográficos e resultado estrutural único `ok` antes das migrations;
- fecha a conexão em qualquer falha, sem apagar arquivo/chave, remover cifra ou permitir acesso;
- não altera o protocolo QR, sessão, MFA, expiração, RBAC ou contratos HTTP.

## Verificações e próxima homologação

Dez testes executam a abertura real do repositório com respostas nativas controladas. O primeiro reproduziu a recusa indevida antes da correção; todos passaram depois. Cobrem banco válido, ausência de cifra/HMAC, erro de página, resultado `ok` criptográfico indevido, chave incorreta, integridade ausente/inválida/parcial e falha de migration. Testes SQL de rascunhos e limpeza continuam aprovados.

Ensaio adicional compila **a fonte SQLCipher 4.7.0 já incluída no Expo** para macOS com CommonCrypto, em diretório temporário e somente dados sintéticos:

```sh
node scripts/aceitar-sqlcipher-macos.mjs
node --test tests/abertura-replica-mobile.test.mjs tests/rascunho-nota-mobile.test.mjs
```

Banco novo, persistência/reabertura, arquivo cifrado, chave errada e adulteração de byte foram aprovados. O teste no Mac não substitui iOS/Android físicos. Portões `pnpm test` (484 API por cache + 371 raiz), tipos, lint, contratos e `pnpm build` com exportações das duas plataformas passaram após a correção.

Próximos passos: confirmar novo pareamento no iPhone com o código recarregado; habilitar/autorizar depuração do Samsung, instalar e testar; depois executar o lote operacional sintético em ambos. Não marcar PR125–128 ou aceite físico de aparência como concluídos apenas por abrir login. Vínculo de cliente e encerramento continuam fora deste lote.
