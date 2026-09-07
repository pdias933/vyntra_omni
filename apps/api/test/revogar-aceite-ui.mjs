import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFile, unlink } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { ModuloOperacaoAtendimentos } from '../dist/operacao-atendimentos/modulo-operacao-atendimentos.js';
import { ServicoPrisma } from '../dist/persistencia/servico-prisma.js';
assert.equal(process.env.AMBIENTE_APLICACAO, 'staging');
assert.equal(process.env.VYNTRA_ACEITE_OPERACAO, 'SOMENTE_DADOS_SINTETICOS');
const cenario = JSON.parse(await readFile('/evidencia/aceite-ui.json', 'utf8'));
assert.equal(cenario.usuarios.length, 2);
const app = await NestFactory.createApplicationContext(ModuloOperacaoAtendimentos, { logger: false });
try {
  await app.get(ServicoPrisma).executarTransacao(async (tx) => {
    const agora = new Date();
    for (const u of cenario.usuarios) {
      const usuario = await tx.usuario.findFirst({ where: { id: u.id, perfilId: cenario.ids.perfil, nomeExibicao: 'Operador HTTP sintético PR128' }, select: { id: true } });
      assert.ok(usuario, 'Somente identidades do cenário sintético podem ser desativadas');
      await tx.sessaoWeb.updateMany({ where: { usuarioId: u.id, estado: 'ATIVA' }, data: { estado: 'REVOGADA', revogadaEm: agora, motivoRevogacao: 'FIM_ACEITE_SINTETICO' } });
      await tx.sessaoMobile.updateMany({ where: { usuarioId: u.id, estado: 'ATIVA' }, data: { estado: 'REVOGADA', revogadaEm: agora, motivoRevogacao: 'FIM_ACEITE_SINTETICO' } });
      await tx.usuario.update({ where: { id: u.id }, data: { estado: 'INATIVO', inativadoEm: agora } });
    }
  });
  await unlink('/evidencia/aceite-ui.json');
  console.log(JSON.stringify({ aceite: 'PR128_SESSOES_REVOGADAS', usuarios: 2, credenciaisTemporariasRemovidas: true, historicoPreservado: true }));
} finally { await app.close(); }
