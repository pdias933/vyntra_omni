import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';

import { ModuloOperacaoAtendimentos } from '../dist/operacao-atendimentos/modulo-operacao-atendimentos.js';
import { ServicoOperacaoAtendimentos } from '../dist/operacao-atendimentos/servico-operacao-atendimentos.js';
import { ServicoHistoricoAtribuicao } from '../dist/historico-atribuicao/servico-historico-atribuicao.js';
import { ServicoPrisma } from '../dist/persistencia/servico-prisma.js';
import { ServicoAutorizacao } from '../dist/autorizacao/servico-autorizacao.js';
import { ServicoTimelineWeb } from '../dist/console-web/servico-timeline-web.js';

if (process.env.AMBIENTE_APLICACAO !== 'staging' || process.env.DADOS_PERMITIDOS !== 'sinteticos_ou_sanitizados' || process.env.VYNTRA_ACEITE_RESGATE !== 'SOMENTE_DADOS_SINTETICOS') {
  throw new Error('ACEITE_POSTGRESQL_NAO_AUTORIZADO');
}
const app = await NestFactory.createApplicationContext(ModuloOperacaoAtendimentos, { logger: false });
let etapa = 'CRIAR_CENARIO';
try {
  const prisma = app.get(ServicoPrisma);
  const cliente = await prisma.obterCliente();
  const servico = app.get(ServicoOperacaoAtendimentos);
  const historico = app.get(ServicoHistoricoAtribuicao);
  const timeline = new ServicoTimelineWeb(prisma, app.get(ServicoAutorizacao));
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
  etapa = 'DISPUTA_RESGATE';
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
  const remetente = sessoes[vencedor];
  etapa = 'DESTINATARIO_INDISPONIVEL';
  const destinatario = sessoes[1 - vencedor];
  const executar = (acao) => prisma.executarTransacao(acao);
  const conflito = (erro) => erro.getResponse?.().codigo === 'CONFLITO_TRANSFERENCIA_ATENDIMENTO';
  await assert.rejects(executar((tx) => servico.transferir(remetente, ids.atendimento, randomUUID(), 2, ids.fila, destinatario.usuarioId, tx)), conflito);
  const chaveDisponibilidade = randomUUID();
  etapa = 'DISPONIBILIDADE';
  await executar((tx) => servico.definirDisponibilidade(destinatario, chaveDisponibilidade, 'DISPONIVEL', 0, tx));
  await executar((tx) => servico.definirDisponibilidade(destinatario, chaveDisponibilidade, 'DISPONIVEL', 0, tx));
  assert.deepEqual(await servico.consultarDisponibilidade(destinatario), { estado: 'DISPONIVEL', versao: 1 });
  assert.equal(await cliente.eventoDominio.count({ where: { entidadeId: destinatario.usuarioId, tipo: 'DISPONIBILIDADE_USUARIO_ALTERADA' } }), 1);
  assert.equal(await cliente.registroAuditoria.count({ where: { entidadeId: destinatario.usuarioId, tipoEvento: 'DISPONIBILIDADE_USUARIO_ALTERADA' } }), 1);
  etapa = 'DESTINOS';
  const destinos = await servico.destinos(remetente, ids.atendimento);
  assert.ok(destinos.some((destino) => destino.usuarioId === destinatario.usuarioId && destino.filaId === ids.fila));
  await assert.rejects(executar((tx) => servico.transferir(remetente, ids.atendimento, randomUUID(), 1, ids.fila, destinatario.usuarioId, tx)), conflito);
  const chaveTransferencia = randomUUID();
  etapa = 'NOTA_INTERNA';
  const chaveNota = randomUUID();
  const textoNota = 'Anotação sintética privada PR127 — não enviar ao cliente.';
  await Promise.all([1, 2].map(() => executar((tx) => servico.adicionarNota(remetente, ids.atendimento, chaveNota, textoNota, tx))));
  assert.equal(await cliente.notaInterna.count({ where: { atendimentoId: ids.atendimento } }), 1);
  assert.equal(await cliente.eventoDominio.count({ where: { atendimentoId: ids.atendimento, tipo: 'NOTA_INTERNA_ADICIONADA' } }), 1);
  assert.equal(await cliente.registroAuditoria.count({ where: { atendimentoId: ids.atendimento, tipoEvento: 'NOTA_INTERNA_ADICIONADA' } }), 1);
  assert.equal(await cliente.mensagem.count({ where: { atendimentoId: ids.atendimento } }), 0);
  await assert.rejects(executar((tx) => servico.adicionarNota(remetente, ids.atendimento, chaveNota, textoNota + ' diferente', tx)), (erro) => erro.getResponse?.().codigo === 'CHAVE_IDEMPOTENCIA_REUTILIZADA');
  assert.ok((await timeline.obter(remetente, ids.atendimento)).itens.some((item) => item.tipo === 'NOTA_INTERNA' && item.texto === textoNota));
  etapa = 'TRANSFERENCIA_DIRETA';
  await Promise.all([1, 2].map(() => executar((tx) => servico.transferir(remetente, ids.atendimento, chaveTransferencia, 2, ids.fila, destinatario.usuarioId, tx))));
  assert.equal((await cliente.atendimento.findUniqueOrThrow({ where: { id: ids.atendimento } })).usuarioResponsavelId, destinatario.usuarioId);
  assert.equal(await cliente.eventoDominio.count({ where: { atendimentoId: ids.atendimento, tipo: 'ATENDIMENTO_TRANSFERIDO_PARA_USUARIO' } }), 1);
  assert.equal(await cliente.registroAuditoria.count({ where: { atendimentoId: ids.atendimento, tipoEvento: 'ATENDIMENTO_TRANSFERIDO_PARA_USUARIO' } }), 1);
  assert.ok((await timeline.obter(destinatario, ids.atendimento)).itens.some((item) => item.tipo === 'NOTA_INTERNA' && item.texto === textoNota));
  await assert.rejects(executar((tx) => servico.transferir(remetente, ids.atendimento, chaveTransferencia, 3, ids.fila, destinatario.usuarioId, tx)), (erro) => erro.getResponse?.().codigo === 'CHAVE_IDEMPOTENCIA_REUTILIZADA');
  const filaDestino = randomUUID();
  etapa = 'TRANSFERENCIA_FILA';
  await executar(async (tx) => {
    await tx.fila.create({ data: { id: filaDestino, nome: 'Destino sintético PR126', nomeNormalizado: 'destino-' + filaDestino } });
    await tx.acessoUsuarioFila.create({ data: { usuarioId: destinatario.usuarioId, filaId: filaDestino } });
  });
  await assert.rejects(executar((tx) => servico.transferir(remetente, ids.atendimento, randomUUID(), 3, filaDestino, undefined, tx)));
  etapa = 'EXECUTAR_TRANSFERENCIA_FILA';
  const chaveFila = randomUUID();
  await executar((tx) => servico.transferir(destinatario, ids.atendimento, chaveFila, 3, filaDestino, undefined, tx));
  await executar((tx) => servico.transferir(destinatario, ids.atendimento, chaveFila, 3, filaDestino, undefined, tx));
  const transferido = await cliente.atendimento.findUniqueOrThrow({ where: { id: ids.atendimento } });
  etapa = 'PRIVACIDADE_NOTA_APOS_TRANSFERENCIA';
  const perfilSemNotas = randomUUID();
  const usuarioSemNotas = randomUUID();
  await executar(async (tx) => {
    await tx.perfilAcesso.create({ data: { id: perfilSemNotas, nome: 'Sem notas sintético PR127', nomeNormalizado: 'sem-notas-' + perfilSemNotas, papelBase: 'ATENDENTE' } });
    await tx.permissaoPerfil.create({ data: { perfilId: perfilSemNotas, codigo: 'VISUALIZAR_NOTA_INTERNA', efeito: 'NEGAR' } });
    await tx.usuario.create({ data: { id: usuarioSemNotas, perfilId: perfilSemNotas, nomeExibicao: 'Operador sem notas PR127' } });
    await tx.acessoUsuarioFila.create({ data: { usuarioId: usuarioSemNotas, filaId: filaDestino } });
    await tx.acessoUsuarioFila.create({ data: { usuarioId: usuarioSemNotas, filaId: ids.fila } });
  });
  const sessaoSemNotas = { ...remetente, usuarioId: usuarioSemNotas, sessaoId: randomUUID() };
  const paginaSemNotas = await timeline.obter(sessaoSemNotas, ids.atendimento);
  assert.equal(paginaSemNotas.itens.some((item) => item.tipo === 'NOTA_INTERNA'), false);
  assert.equal(JSON.stringify(paginaSemNotas).includes(textoNota), false);
  // Acesso só à nova fila também não libera a nota escrita na fila de origem.
  await cliente.acessoUsuarioFila.update({ where: { usuarioId_filaId: { usuarioId: destinatario.usuarioId, filaId: ids.fila } }, data: { estado: 'REVOGADO', revogadoEm: new Date() } });
  assert.equal((await timeline.obter(destinatario, ids.atendimento)).itens.some((item) => item.tipo === 'NOTA_INTERNA'), false);
  console.log(JSON.stringify({ aceite: 'PR127_POSTGRESQL', aprovado: true, notaUnica: true, privacidade: true, semMensagemCanal: true, atendimentoId: ids.atendimento }));
  assert.equal(transferido.estado, 'AGUARDANDO');
  assert.equal(transferido.usuarioResponsavelId, null);
  assert.equal(transferido.versaoAtribuicao, 4);
  assert.equal(await cliente.eventoDominio.count({ where: { atendimentoId: ids.atendimento, tipo: 'ATENDIMENTO_TRANSFERIDO_PARA_FILA' } }), 1);
  assert.equal(await cliente.registroAuditoria.count({ where: { atendimentoId: ids.atendimento, tipoEvento: 'ATENDIMENTO_TRANSFERIDO_PARA_FILA' } }), 1);
  etapa = 'REVOGAR_ACESSO';
  await cliente.acessoUsuarioFila.update({ where: { usuarioId_filaId: { usuarioId: destinatario.usuarioId, filaId: filaDestino } }, data: { estado: 'REVOGADO', revogadoEm: new Date() } });
  await assert.rejects(executar((tx) => servico.transferir(destinatario, ids.atendimento, chaveFila, 3, filaDestino, undefined, tx)));
  console.log(JSON.stringify({ aceite: 'PR126_POSTGRESQL', aprovado: true, disponibilidade: true, transferenciaDireta: true, transferenciaFila: true, repeticaoUnica: true, negacaoFila: true, revogacao: true, atendimentoId: ids.atendimento }));
  // Sem credencial de login, sem conta ativa e sem adapter externo. Preservar evidência imutável.
  console.log(JSON.stringify({ aceite: 'PR125_POSTGRESQL', aprovado: true, vencedores: 1, efeitos: 1, eventos: 1, auditorias: 1, atendimentoId: ids.atendimento }));
} catch (erro) {
  console.error(JSON.stringify({ aceite: 'PR125_POSTGRESQL', aprovado: false, etapa, codigo: erro.code ?? erro.name, modelo: erro.meta?.modelName, causa: erro.meta?.driverAdapterError?.cause?.kind, restricao: erro.meta?.driverAdapterError?.cause?.constraint, mensagem: erro instanceof assert.AssertionError ? erro.message : 'ACEITE_FALHOU' }));
  process.exitCode = 1;
} finally {
  await app.close();
}
