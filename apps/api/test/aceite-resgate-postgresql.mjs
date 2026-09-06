import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';

import { ModuloOperacaoAtendimentos } from '../dist/operacao-atendimentos/modulo-operacao-atendimentos.js';
import { ServicoOperacaoAtendimentos } from '../dist/operacao-atendimentos/servico-operacao-atendimentos.js';
import { ServicoHistoricoAtribuicao } from '../dist/historico-atribuicao/servico-historico-atribuicao.js';
import { ServicoPrisma } from '../dist/persistencia/servico-prisma.js';

if (process.env.AMBIENTE_APLICACAO !== 'staging' || process.env.DADOS_PERMITIDOS !== 'sinteticos_ou_sanitizados' || process.env.VYNTRA_ACEITE_RESGATE !== 'SOMENTE_DADOS_SINTETICOS') {
  throw new Error('ACEITE_POSTGRESQL_NAO_AUTORIZADO');
}
const app = await NestFactory.createApplicationContext(ModuloOperacaoAtendimentos, { logger: false });
try {
  const prisma = app.get(ServicoPrisma);
  const cliente = await prisma.obterCliente();
  const servico = app.get(ServicoOperacaoAtendimentos);
  const historico = app.get(ServicoHistoricoAtribuicao);
  const ids = Object.fromEntries(['perfil', 'fila', 'contato', 'conversa', 'conta', 'atendimento', 'usuarioA', 'usuarioB'].map((chave) => [chave, randomUUID()]));
  const nome = `ACEITE_PR125_${ids.atendimento}`;
  const agora = new Date();
  await prisma.executarTransacao(async (tx) => {
    await tx.perfilAcesso.create({ data: { id: ids.perfil, nome, nomeNormalizado: nome.toLowerCase().replaceAll('_', '-'), papelBase: 'ATENDENTE' } });
    await tx.fila.create({ data: { id: ids.fila, nome, nomeNormalizado: nome.toLowerCase().replaceAll('_', '-') } });
    for (const usuarioId of [ids.usuarioA, ids.usuarioB]) {
      await tx.usuario.create({ data: { id: usuarioId, nomeExibicao: 'Operador sintético PR125', perfilId: ids.perfil } });
      await tx.acessoUsuarioFila.create({ data: { usuarioId, filaId: ids.fila } });
    }
    await tx.contaWhatsApp.create({ data: { id: ids.conta, nomeExibicao: 'Origem sintética inativa PR125', portfolioEmpresarialExternoId: nome, identificadorCanalExterno: nome } });
    await tx.contato.create({ data: { id: ids.contato, nomeExibicao: nome } });
    await tx.conversa.create({ data: { id: ids.conversa, contatoId: ids.contato, ultimaAtividadeEm: agora } });
    await tx.participacaoContaConversa.create({ data: { conversaId: ids.conversa, contaWhatsAppId: ids.conta, primeiraInteracaoEm: agora, ultimaInteracaoEm: agora } });
    await tx.atendimento.create({ data: { id: ids.atendimento, conversaId: ids.conversa, contaWhatsAppOrigemId: ids.conta, filaAtualId: ids.fila, modo: 'FILA_HUMANA', motivoEspera: 'AGUARDANDO_HUMANO', iniciadoEm: agora, atualizadoEm: agora } });
    await historico.inicializar(ids.atendimento, { filaId: ids.fila, tipo: 'ENTRADA_FILA' }, tx);
  });
  const sessoes = [ids.usuarioA, ids.usuarioB].map((usuarioId) => ({ estado: 'ATIVA', usuarioId, sessaoId: randomUUID(), expiraEm: new Date(Date.now() + 300_000) }));
  const chaves = [randomUUID(), randomUUID()];
  const resultados = await Promise.allSettled(sessoes.map((sessao, indice) => prisma.executarTransacao((tx) => servico.resgatar(sessao, ids.atendimento, chaves[indice], 1, tx))));
  assert.equal(resultados.filter((resultado) => resultado.status === 'fulfilled').length, 1);
  const vencedor = resultados.findIndex((resultado) => resultado.status === 'fulfilled');
  const perdedor = resultados.find((resultado) => resultado.status === 'rejected');
  assert.equal(perdedor.reason.getResponse().codigo, 'CONFLITO_RESGATE_ATENDIMENTO');
  await Promise.all([1, 2].map(() => prisma.executarTransacao((tx) => servico.resgatar(sessoes[vencedor], ids.atendimento, chaves[vencedor], 1, tx))));
  const atual = await cliente.atendimento.findUniqueOrThrow({ where: { id: ids.atendimento } });
  assert.equal(atual.usuarioResponsavelId, sessoes[vencedor].usuarioId);
  assert.equal(atual.versaoAtribuicao, 2);
  assert.equal(await cliente.eventoDominio.count({ where: { atendimentoId: ids.atendimento, tipo: 'ATENDIMENTO_RESGATADO' } }), 1);
  assert.equal(await cliente.registroAuditoria.count({ where: { atendimentoId: ids.atendimento, tipoEvento: 'ATENDIMENTO_RESGATADO' } }), 1);
  assert.equal(await cliente.operacaoRecuperavel.count({ where: { entidadeId: ids.atendimento, estado: 'CONCLUIDA' } }), 1);
  assert.equal(await cliente.historicoAtribuicao.count({ where: { atendimentoId: ids.atendimento, finalizadoEm: null } }), 1);
  await assert.rejects(prisma.executarTransacao((tx) => servico.resgatar(sessoes[vencedor], ids.atendimento, chaves[vencedor], 2, tx)), (erro) => erro.getResponse().codigo === 'CHAVE_IDEMPOTENCIA_REUTILIZADA');
  // Sem credencial de login, sem conta ativa e sem adapter externo. Preservar evidência imutável.
  console.log(JSON.stringify({ aceite: 'PR125_POSTGRESQL', aprovado: true, vencedores: 1, efeitos: 1, eventos: 1, auditorias: 1, atendimentoId: ids.atendimento }));
} catch (erro) {
  console.error(JSON.stringify({ aceite: 'PR125_POSTGRESQL', aprovado: false, codigo: erro.code ?? erro.name, mensagem: erro instanceof assert.AssertionError ? erro.message : 'ACEITE_FALHOU' }));
  process.exitCode = 1;
} finally {
  await app.close();
}
