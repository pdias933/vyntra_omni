import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('validador cobre início, grafo, variáveis, ciclos, capacidades e falhas', async () => {
  const validador = await ler(
    'apps/api/src/fluxos/validador-publicacao-fluxo.ts',
  );
  for (const regra of [
    'INICIO_INVALIDO',
    'REFERENCIA_NO_INEXISTENTE',
    'NO_INALCANCAVEL',
    'VARIAVEL_NAO_DEFINIDA_NO_CAMINHO',
    'CICLO_SEM_LIMITE',
    'CICLO_SEM_SAIDA',
    'CAPACIDADE_NAO_HABILITADA',
    'REFERENCIA_INATIVA',
    'SAIDA_',
  ]) {
    assert.match(validador, new RegExp(regra));
  }
  assert.match(validador, /CHAVES_PARAMETRO_PROIBIDAS/);
  assert.doesNotMatch(validador, /eval\(|new Function|child_process|https?:\/\//);
});

test('somente validação autorizada e persistida produz EM_TESTE', async () => {
  const [servico, repositorio, modulo, provedor] = await Promise.all([
    ler('apps/api/src/fluxos/servico-validacao-publicacao-fluxos.ts'),
    ler('apps/api/src/fluxos/repositorio-fluxos-prisma.ts'),
    ler('apps/api/src/fluxos/modulo-fluxos.ts'),
    ler(
      'apps/api/src/fluxos/provedor-contexto-validacao-fluxo-conservador.ts',
    ),
  ]);
  assert.match(servico, /PUBLICAR_FLUXO/);
  assert.match(servico, /versao\.estado !== 'RASCUNHO'/);
  assert.match(servico, /relatorio\.valido/);
  assert.match(servico, /marcarVersaoEmTeste/);
  assert.match(servico, /this\.auditoria\.registrar/);
  assert.match(repositorio, /estado: 'EM_TESTE'/);
  assert.match(repositorio, /estado: 'RASCUNHO'/);
  assert.match(modulo, /ServicoValidacaoPublicacaoFluxos/);
  assert.match(modulo, /PROVEDOR_CONTEXTO_VALIDACAO_FLUXO/);
  assert.match(provedor, /'ENVIAR_MENSAGEM'/);
  assert.match(provedor, /'ENVIAR_BOTOES_OU_LISTA'/);
  assert.match(provedor, /referenciasAtivas: \[\]/);
  assert.doesNotMatch(modulo, /Controller/);
});
