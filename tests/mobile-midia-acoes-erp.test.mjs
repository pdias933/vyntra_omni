import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('seletor nativo fecha formatos e tetos antes da confirmação', async () => {
  const seletor = await ler(
    'apps/mobile/src/midias/adaptador-selecao-midia-nativa.ts',
  );
  for (const contrato of [
    /image\/jpeg', 8 \* 1024 \* 1024/u,
    /audio\/mpeg', 16 \* 1024 \* 1024/u,
    /video\/mp4', 32 \* 1024 \* 1024/u,
    /application\/pdf', 20 \* 1024 \* 1024/u,
  ]) assert.match(seletor, contrato);
  assert.match(seletor, /pickFileAsync/u);
  assert.match(seletor, /multipleFiles: false/u);
  assert.match(seletor, /materializar/u);
  assert.match(seletor, /atual\.tamanhoBytes !== selecao\.tamanhoBytes/u);
});

test('composer mostra prévia local e exige confirmação para mídia online', async () => {
  const composer = await ler('apps/mobile/src/componentes/ComposerMobile.tsx');
  assert.match(composer, /Revisar anexo/u);
  assert.match(composer, /só será enviado depois da sua confirmação/u);
  assert.match(composer, /Origem: este aparelho/u);
  assert.match(composer, /Confirmar envio/u);
  assert.match(composer, /acessoOffline \|\| !janelaAberta/u);
  assert.match(composer, /servico\.enviarMidia/u);
  assert.doesNotMatch(composer, /pendencia_saida_midia/u);
});

test('rota mobile reautentica sessão e aparelho antes de enviar mídia', async () => {
  const controlador = await ler(
    'apps/api/src/console-mobile/controlador-console-mobile.ts',
  );
  assert.match(controlador, /operationId: 'enviarMidiaMobile'/u);
  assert.match(controlador, /FileInterceptor\('arquivo'/u);
  assert.match(controlador, /executarComSessaoAtual/u);
  assert.match(controlador, /this\.composer\.enviarMidia/u);
  assert.match(controlador, /fileSize: 32 \* 1024 \* 1024/u);
});

test('backend valida assinatura e aplica os mesmos tetos por categoria', async () => {
  const validador = await ler('apps/api/src/midias/validador-midia.ts');
  for (const contrato of [
    /categoria: 'IMAGEM', limiteBytes: 8 \* 1024 \* 1024/u,
    /categoria: 'AUDIO', limiteBytes: 16 \* 1024 \* 1024/u,
    /categoria: 'VIDEO', limiteBytes: 32 \* 1024 \* 1024/u,
    /categoria: 'PDF', limiteBytes: 20 \* 1024 \* 1024/u,
  ]) assert.match(validador, contrato);
  assert.match(validador, /ASSINATURA_MIDIA_NAO_PERMITIDA/u);
  assert.match(validador, /MIDIA_EXCEDE_LIMITE/u);
});

test('ações ERP expõem origem, prévia, confirmação e resultado incerto', async () => {
  const folha = await ler(
    'apps/mobile/src/componentes/FolhaAcoesSistemaMobile.tsx',
  );
  assert.match(folha, /Dados do ERP em tempo real/u);
  assert.match(folha, /período consultado/u);
  assert.doesNotMatch(folha, /fatura\.referencia/u);
  assert.match(folha, /ERP indisponível — nenhum snapshot usado/u);
  assert.match(folha, /Revise antes de confirmar/u);
  assert.match(folha, /Confirmar e executar/u);
  assert.match(folha, /Crypto\.randomUUID\(\)/u);
  assert.match(folha, /Nenhum sucesso foi presumido/u);
  assert.match(folha, /A operação não será repetida às cegas/u);
});

test('capacidades não conectadas permanecem indisponíveis e o SDK é gerado', async () => {
  const folha = await ler(
    'apps/mobile/src/componentes/FolhaAcoesSistemaMobile.tsx',
  );
  const adaptador = await ler(
    'apps/mobile/src/atendimentos/adaptador-atendimentos-http.ts',
  );
  assert.match(folha, /if \(codigo === 'ORDEM_SERVICO'\)/u);
  assert.doesNotMatch(folha, /if \(codigo === 'CONEXAO'\) return true/u);
  assert.doesNotMatch(folha, /if \(codigo === 'FORMULARIO'\) return true/u);
  assert.doesNotMatch(folha, /if \(codigo === 'NOTA'\) return true/u);
  assert.match(adaptador, /enviarMidiaMobile/u);
  assert.match(adaptador, /prepararAcaoErpContatoMobile/u);
  assert.match(adaptador, /executarAcaoErpContatoMobile/u);
  assert.doesNotMatch(adaptador, /fetch\(/u);
});
