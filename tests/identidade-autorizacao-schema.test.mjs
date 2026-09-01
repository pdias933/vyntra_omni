import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migracao = await readFile(
  'apps/api/prisma/migrations/20260831000400_criar_usuarios_perfis_permissoes_filas/migration.sql',
  'utf8',
);
const schema = await readFile('apps/api/prisma/schema.prisma', 'utf8');

const permissoesEsperadas = [
  'VISUALIZAR_FILA',
  'RESGATAR_ATENDIMENTO',
  'TRANSFERIR_ATENDIMENTO',
  'RECEBER_TRANSFERENCIA',
  'ENCERRAR_ATENDIMENTO',
  'REABRIR_ATENDIMENTO',
  'ASSUMIR_ATENDIMENTO',
  'ENVIAR_MENSAGEM',
  'ADICIONAR_NOTA_INTERNA',
  'VISUALIZAR_NOTA_INTERNA',
  'CONSULTAR_CLIENTE',
  'VINCULAR_CLIENTE',
  'ALTERAR_CONTEXTO_CLIENTE',
  'CONSULTAR_CONTRATO',
  'CONSULTAR_FINANCEIRO',
  'ENVIAR_FATURA',
  'VERIFICAR_DESBLOQUEIO_CONFIANCA',
  'EXECUTAR_DESBLOQUEIO_CONFIANCA',
  'CONSULTAR_SESSAO_ACESSO',
  'DESCONECTAR_SESSAO_ACESSO',
  'CRIAR_ORDEM_SERVICO',
  'SOLICITAR_FORMULARIO_WHATSAPP',
  'VISUALIZAR_FLUXO',
  'EDITAR_FLUXO',
  'TESTAR_FLUXO',
  'PUBLICAR_FLUXO',
  'REVERTER_FLUXO',
  'VISUALIZAR_HISTORICO_TRANSVERSAL',
  'VISUALIZAR_NOTAS_TRANSVERSAIS',
  'VISUALIZAR_DADO_SENSIVEL',
  'EXPORTAR_HISTORICO',
  'ADMINISTRAR_USUARIOS',
  'ADMINISTRAR_FILAS',
  'ADMINISTRAR_INTEGRACOES',
  'ADMINISTRAR_RELEASES',
  'ALTERAR_DISPONIBILIDADE_PROPRIA',
    'ALTERAR_DISPONIBILIDADE_USUARIO',
    'ADMINISTRAR_CALENDARIOS',
];

function valoresEnum(nome) {
  const bloco = schema.match(new RegExp(`enum ${nome} \\{([\\s\\S]*?)@@map`));
  assert.notEqual(bloco, null, nome);
  return bloco[1]
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean);
}

test('define somente os três papéis base aprovados', () => {
  assert.deepEqual(valoresEnum('PapelBase'), [
    'ADMINISTRADOR',
    'SUPERVISOR',
    'ATENDENTE',
  ]);
  for (const fila of ['FINANCEIRO', 'SUPORTE', 'COMERCIAL']) {
    assert.ok(!valoresEnum('PapelBase').includes(fila));
  }
});

test('congela o catálogo granular de permissões aprovado', () => {
  assert.deepEqual(valoresEnum('CodigoPermissao'), permissoesEsperadas);
  assert.match(schema, /enum EfeitoPermissaoPerfil[\s\S]+CONCEDER[\s\S]+NEGAR/);
  assert.match(schema, /@@id\(\[perfilId, codigo\]\)/);
});

test('usuário nasce sem perfil e sem acesso implícito a fila', () => {
  assert.match(schema, /perfilId\s+String\?/);
  assert.ok(!/perfilId\s+String\?[^\n]*@default/u.test(schema));
  assert.match(schema, /model AcessoUsuarioFila/);
  assert.match(schema, /@@id\(\[usuarioId, filaId\]\)/);
  assert.ok(!/\bINSERT\s+INTO\s+"(?:usuario|perfil_acesso|permissao_perfil|fila|acesso_usuario_fila)"/iu.test(migracao));
});

test('separa perfil, permissão e escopo de fila por chaves restritivas', () => {
  for (const tabela of [
    'usuario',
    'perfil_acesso',
    'permissao_perfil',
    'fila',
    'acesso_usuario_fila',
  ]) {
    assert.ok(migracao.includes(`CREATE TABLE "${tabela}"`), tabela);
  }
  assert.equal(migracao.match(/ON DELETE RESTRICT/g)?.length, 4);
  assert.match(migracao, /perfil_acesso_nome_normalizado_key/);
  assert.match(migracao, /fila_nome_normalizado_key/);
  assert.match(migracao, /acesso_usuario_fila_estado_check/);
});

test('migration é aditiva e não cria credencial ou sessão antecipadamente', () => {
  assert.ok(!/DROP (TABLE|COLUMN|TYPE)/u.test(migracao));
  assert.ok(!/ALTER TABLE[^;]+DROP/u.test(migracao));
  assert.ok(!migracao.includes('senha_hash'));
  assert.ok(!migracao.includes('sessao_web'));
});
