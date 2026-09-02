import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('réplica mobile usa SQLCipher com chave exclusiva no cofre nativo', async () => {
  const [manifesto, repositorio, cofre] = await Promise.all([
    ler('apps/mobile/app.json'),
    ler('apps/mobile/src/offline/repositorio-replica-local.ts'),
    ler('apps/mobile/src/offline/cofre-replica-local.ts'),
  ]);

  assert.match(manifesto, /"expo-sqlite"/);
  assert.match(manifesto, /"useSQLCipher": true/);
  assert.match(repositorio, /PRAGMA key/);
  assert.match(repositorio, /PRAGMA cipher_integrity_check/);
  assert.match(repositorio, /withExclusiveTransactionAsync/);
  assert.match(cofre, /SecureStore/);
  assert.match(cofre, /getRandomBytesAsync\(32\)/);
  assert.ok(!repositorio.includes('AsyncStorage'));
});

test('schema local separa réplica autorizada, rascunhos e pendências de texto', async () => {
  const repositorio = await ler(
    'apps/mobile/src/offline/repositorio-replica-local.ts',
  );

  for (const tabela of [
    'estado_replica',
    'fila',
    'conversa',
    'atendimento',
    'mensagem',
    'nota_interna',
    'controle_recurso',
    'rascunho',
    'pendencia_saida_texto',
  ]) {
    assert.match(repositorio, new RegExp(`CREATE TABLE ${tabela}`));
  }
  assert.match(repositorio, /AGUARDANDO_CONEXAO/);
  assert.match(repositorio, /REVISAO_NECESSARIA/);
  assert.match(repositorio, /runAsync\(/);
});

test('backend assina somente a autorização mobile por até quatro horas', async () => {
  const [servico, controlador, dto] = await Promise.all([
    ler('apps/api/src/sincronizacao/servico-autorizacao-offline.ts'),
    ler('apps/api/src/sincronizacao/controlador-sincronizacao.ts'),
    ler('apps/api/src/sincronizacao/dto/sincronizacao.dto.ts'),
  ]);

  assert.match(servico, /4 \* 60 \* 60 \* 1_000/);
  assert.match(servico, /sign\(null/);
  assert.match(servico, /identificadorInstalacaoHash/);
  assert.match(servico, /versaoPermissoes/);
  assert.ok(!servico.includes('VISUALIZAR_DADO_SENSIVEL'));
  assert.match(controlador, /autorizacaoOffline\.emitir\(sessao, snapshot\)/);
  assert.match(dto, /autorizacao_offline_valida_ate/);
});

test('app verifica assinatura e vínculo antes de liberar cache offline', async () => {
  const [verificador, configuracao, cofre] = await Promise.all([
    ler('apps/mobile/src/offline/verificador-autorizacao-offline.ts'),
    ler('apps/mobile/src/configuracao-aplicativo.ts'),
    ler('apps/mobile/src/autenticacao/cofre-sessao-mobile.ts'),
  ]);

  assert.match(verificador, /verify\(/);
  assert.match(verificador, /zip215: false/);
  assert.match(verificador, /conteudo\.sessao_id !== credencial\.sessaoId/);
  assert.match(verificador, /conteudo\.dispositivo_id !== credencial\.dispositivoId/);
  assert.match(verificador, /conteudo\.instalacao_hash !== instalacaoHash/);
  assert.match(verificador, /conteudo\.sequencia_base !== autorizacao\.sequenciaEvento/);
  assert.match(verificador, /conteudo\.versao_permissoes !== autorizacao\.versaoPermissoes/);
  assert.match(verificador, /TOLERANCIA_RELOGIO_MS/);
  assert.match(configuracao, /EXPO_PUBLIC_CHAVES_AUTORIZACAO_OFFLINE/);
  assert.match(cofre, /CHAVE_SESSAO_ID/);
  assert.match(cofre, /CHAVE_USUARIO_ID/);
});

test('fallback offline só ocorre por indisponibilidade e bloqueia no vencimento', async () => {
  const aplicacao = await ler('apps/mobile/src/Aplicacao.tsx');

  assert.match(aplicacao, /falhaPermiteAcessoOffline/);
  assert.match(aplicacao, /erro\.statusHttp >= 500/);
  assert.match(aplicacao, /autenticacao\.restaurarOffline\(\)/);
  assert.match(aplicacao, /O acesso offline expirou/);
  assert.ok(!aplicacao.includes("erro.statusHttp === 401 || falhaPermiteAcessoOffline"));
});

test('logout limpa credencial e toda a réplica autenticada', async () => {
  const [servico, repositorio] = await Promise.all([
    ler('apps/mobile/src/autenticacao/servico-autenticacao-aplicativo.ts'),
    ler('apps/mobile/src/offline/repositorio-replica-local.ts'),
  ]);

  assert.match(servico, /this\.replica\.limparReplicaAutenticada\(\)/);
  assert.match(repositorio, /DELETE FROM mensagem/);
  assert.match(repositorio, /DELETE FROM estado_replica/);
});
