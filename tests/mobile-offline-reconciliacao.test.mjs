import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('schema local v4 captura a observação e preserva pendências no snapshot', async () => {
  const repositorio = await ler('apps/mobile/src/offline/repositorio-replica-local.ts');
  assert.match(repositorio, /PRAGMA user_version = 4/u);
  for (const campo of [
    'sequencia_observada',
    'versao_atribuicao',
    'versao_estado',
    'versao_contexto',
    'usuario_responsavel_observado',
    'janela_observada',
  ]) assert.match(repositorio, new RegExp(campo, 'u'));
  assert.match(repositorio, /DELETE FROM rascunho WHERE conversa_id = \?/u);
  assert.doesNotMatch(
    repositorio.match(/public async aplicarSnapshot[\s\S]*?public async aplicarLote/u)?.[0] ?? '',
    /DELETE FROM pendencia_saida_texto/u,
  );
});

test('reconciliação ocorre somente depois do estado convergente', async () => {
  const aplicacao = await ler('apps/mobile/src/Aplicacao.tsx');
  const motor = await ler('apps/mobile/src/sincronizacao/motor-sincronizacao-mobile.ts');
  assert.match(aplicacao, /estadoSincronizacao === 'CONECTADO'[\s\S]*reconciliarAguardando/u);
  assert.match(motor, /abrirTempoReal[\s\S]*publicarEstado\('CONECTADO'\)/u);
});

test('backend serializa autoridade e compara timeline, contexto, estado e atribuição', async () => {
  const servico = await ler('apps/api/src/mensagens/servico-mensagens-saida.ts');
  assert.match(servico, /bloquearAutoridadeSaida/u);
  assert.match(servico, /houveEventoNaConversaApos/u);
  for (const motivo of [
    'ATRIBUICAO_ALTERADA',
    'CONTEXTO_ALTERADO',
    'ESTADO_ALTERADO',
    'JANELA_ALTERADA',
    'JANELA_EXPIRADA',
    'TIMELINE_ALTERADA',
  ]) assert.match(servico, new RegExp(motivo, 'u'));
});

test('rota mobile reautentica o aparelho e usa contrato fechado', async () => {
  const controlador = await ler('apps/api/src/console-mobile/controlador-console-mobile.ts');
  const dto = await ler('apps/api/src/console-mobile/dto-console-mobile.ts');
  assert.match(controlador, /operationId: 'reconciliarTextoMobile'/u);
  assert.match(controlador, /executarComSessaoAtual/u);
  assert.match(dto, /sequencia_observada/u);
  assert.match(dto, /versao_contexto_observada/u);
  assert.doesNotMatch(controlador, /fetch\(/u);
});

test('cliente usa SDK gerado e mantém erro transitório aguardando conexão', async () => {
  const adaptador = await ler('apps/mobile/src/atendimentos/adaptador-atendimentos-http.ts');
  const pendencias = await ler('apps/mobile/src/offline/servico-pendencias-saida-mobile.ts');
  assert.match(adaptador, /reconciliarTextoMobile/u);
  assert.doesNotMatch(adaptador, /fetch\(/u);
  assert.match(pendencias, /estado !== 'AGUARDANDO_CONEXAO'/u);
  assert.match(pendencias, /resultado\.estado === 'ENVIADA_PARA_FILA'/u);
  assert.match(pendencias, /ACESSO_ALTERADO/u);
});

test('revisão oferece editar, descartar e novo envio autorizado', async () => {
  const composer = await ler('apps/mobile/src/componentes/ComposerMobile.tsx');
  const pendencias = await ler('apps/mobile/src/offline/servico-pendencias-saida-mobile.ts');
  assert.match(composer, /Revisão necessária/u);
  assert.match(composer, />Editar</u);
  assert.match(composer, />Descartar</u);
  assert.match(composer, /Enviar mesmo assim/u);
  assert.match(pendencias, /mensagemClienteId: Crypto\.randomUUID\(\)/u);
  assert.match(pendencias, /atendimentos\.enviarTexto/u);
});
