import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFile(new URL(caminho, raiz), 'utf8');

test('administração de usuários autoriza antes da projeção e usa concorrência otimista', async () => {
  const servico = await ler('apps/api/src/administracao-usuarios/servico-administracao-usuarios.ts');
  assert.ok(servico.indexOf('await this.autorizar') < servico.indexOf('transacao.usuario.findMany'));
  assert.match(servico, /ADMINISTRAR_USUARIOS/u);
  assert.match(servico, /versaoPermissoes: entrada\.versaoEsperada/u);
  assert.match(servico, /ULTIMO_ADMINISTRADOR/u);
  assert.match(servico, /usuarioId === sessao\.usuarioId/u);
  assert.match(servico, /this\.invalidacao\.registrar/u);
  assert.match(servico, /this\.auditoria\.registrar/u);
});

test('web usa SDK gerado, pede confirmação para revogação e não filtra autoridade', async () => {
  const tela = await ler('apps/web/src/web/administracao/AdministracaoUsuariosWeb.tsx');
  assert.match(tela, /listarAdministracaoUsuarios/u);
  assert.match(tela, /alterarAcessoUsuarioAdministracao/u);
  assert.match(tela, /Confirmar revogação/u);
  assert.match(tela, /revogarSessoesWebAdministrativamente/u);
  assert.doesNotMatch(tela, /fetch\(/u);
});
