import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('ações ERP têm registro imutável e reserva exclusiva de encerramento', async () => {
  const [schema, migration] = await Promise.all([
    ler('apps/api/prisma/schema.prisma'),
    ler(
      'apps/api/prisma/migrations/20260901005500_acoes_atendimento_erp/migration.sql',
    ),
  ]);

  assert.match(schema, /model RegistroAcaoAtendimentoErp/);
  assert.match(schema, /operacaoRecuperavelId\s+String\s+@unique/);
  assert.match(schema, /model ReservaEncerramentoAtendimentoErp/);
  assert.match(migration, /registro_acao_atendimento_erp_imutavel/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /reserva_encerramento_atendimento_erp_operacao_key/);
  assert.match(migration, /ON DELETE RESTRICT/);
});

test('comentário e encerramento exigem protocolo, RBAC e reconciliação', async () => {
  const [servico, porta, repositorio] = await Promise.all([
    ler(
      'apps/api/src/acoes-atendimento-erp/servico-acoes-atendimento-erp.ts',
    ),
    ler('apps/api/src/erp/adaptador-erp.ts'),
    ler(
      'apps/api/src/acoes-atendimento-erp/repositorio-acoes-atendimento-erp-prisma.ts',
    ),
  ]);

  assert.match(servico, /confirmacaoExplicita !== true/);
  assert.match(servico, /ENCERRAR_ATENDIMENTO/);
  assert.match(servico, /protocoloOficial/);
  assert.match(servico, /reconciliarComentarioAtendimento/);
  assert.match(servico, /reconciliarEncerramentoAtendimento/);
  assert.match(servico, /this\.idempotencia\.concluir/);
  assert.match(servico, /this\.eventos\.acrescentar/);
  assert.match(servico, /this\.auditoria\.registrar/);
  assert.doesNotMatch(servico, /SNAPSHOT/);
  assert.match(porta, /adicionarComentarioAtendimento/);
  assert.match(porta, /encerrarAtendimento/);
  assert.match(repositorio, /pg_advisory_xact_lock/);
  assert.match(repositorio, /reservaEncerramentoAtendimentoErp/);
});

test('link público permanece fechado e módulo não registra integração real', async () => {
  const [politica, modulo, aplicacao, caracterizacao] = await Promise.all([
    ler(
      'apps/api/src/acoes-atendimento-erp/politica-link-transcricao.ts',
    ),
    ler(
      'apps/api/src/acoes-atendimento-erp/modulo-acoes-atendimento-erp.ts',
    ),
    ler('apps/api/src/modulo-aplicacao.ts'),
    ler(
      'apps/api/test/fixtures/mk-solutions/caracterizacao-publica-sanitizada.json',
    ),
  ]);

  assert.match(politica, /APROVACAO_JURIDICA_PENDENTE/);
  assert.match(politica, /situacao: 'DESATIVADO'/);
  assert.doesNotMatch(politica, /randomBytes|https?:|token|url/iu);
  assert.match(aplicacao, /ModuloAcoesAtendimentoErp/);
  assert.doesNotMatch(
    modulo,
    /Controller|ADAPTADOR_ERP|AdaptadorErpSimulado|AdaptadorMkSolutions/,
  );
  assert.match(
    caracterizacao,
    /"capacidadeInterna": "ADICIONAR_COMENTARIO_ATENDIMENTO"[\s\S]*?"resposta": "NAO_OBSERVADA"/,
  );
  assert.match(
    caracterizacao,
    /"capacidadeInterna": "ALTERAR_ENCERRAR_ATENDIMENTO"[\s\S]*?"resposta": "NAO_OBSERVADA"/,
  );
});
