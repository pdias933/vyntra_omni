import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroIdempotenciaMensagemDivergente, ErroTransicaoMensagemInvalida } from '../dist/mensagens/erros-mensagem.js';
import { ErroTextoLivreForaJanela } from '../dist/janela-canal/erros-janela-canal.js';
import { MaquinaSaidaMensagem } from '../dist/mensagens/maquina-saida-mensagem.js';
import { ServicoMensagensSaida } from '../dist/mensagens/servico-mensagens-saida.js';

const agora = new Date('2026-09-01T12:00:00Z');
const ids = {
  atendimento: randomUUID(),
  conta: randomUUID(),
  contato: randomUUID(),
  conversa: randomUUID(),
  fila: randomUUID(),
  mensagemCliente: randomUUID(),
  sessao: randomUUID(),
  usuario: randomUUID(),
};

function mensagemNaFila() {
  return {
    atendimentoId: ids.atendimento,
    canceladaEm: undefined,
    codigoFalha: undefined,
    contatoRemetenteId: undefined,
    contaWhatsAppId: ids.conta,
    conteudoHash: 'a'.repeat(64),
    conteudoProtegido: { texto: 'Olá' },
    conversaId: ids.conversa,
    criadaDispositivoEm: undefined,
    direcao: 'SAIDA',
    entregueEm: undefined,
    enviadaEm: undefined,
    estadoSaida: 'NA_FILA',
    falhouEm: undefined,
    id: randomUUID(),
    identificadorExternoMensagem: undefined,
    lidaEm: undefined,
    mensagemClienteId: ids.mensagemCliente,
    proximaTentativaEm: agora,
    recebidaServidorEm: agora,
    tentativasEnvio: 0,
    tipo: 'TEXTO',
    usuarioRemetenteId: ids.usuario,
    versao: 1,
  };
}

test('máquina percorre NA_FILA, ENVIANDO, ENVIADA, ENTREGUE e LIDA sem regressão', () => {
  const maquina = new MaquinaSaidaMensagem();
  const enviando = maquina.iniciarEnvio(mensagemNaFila());
  const enviada = maquina.aceitarEnvio(enviando, 'wamid.123', new Date('2026-09-01T12:00:01Z'));
  const entregue = maquina.registrarEntrega(enviada, new Date('2026-09-01T12:00:02Z'));
  const lida = maquina.registrarLeitura(entregue, new Date('2026-09-01T12:00:03Z'));
  assert.equal(lida.estadoSaida, 'LIDA');
  assert.equal(lida.tentativasEnvio, 1);
  assert.equal(lida.versao, 5);
  assert.throws(() => maquina.iniciarEnvio(lida), ErroTransicaoMensagemInvalida);
});

test('falha temporária retorna à fila e falha definitiva ou cancelamento são terminais', () => {
  const maquina = new MaquinaSaidaMensagem();
  const repetivel = maquina.registrarFalhaTemporaria(
    maquina.iniciarEnvio(mensagemNaFila()),
    'META_TEMPORARIAMENTE_INDISPONIVEL',
    new Date('2026-09-01T12:01:00Z'),
    new Date('2026-09-01T12:00:01Z'),
  );
  assert.equal(repetivel.estadoSaida, 'NA_FILA');
  assert.equal(repetivel.tentativasEnvio, 1);
  const falhou = maquina.registrarFalhaDefinitiva(
    maquina.iniciarEnvio(repetivel),
    'DESTINATARIO_INVALIDO',
    new Date('2026-09-01T12:01:01Z'),
  );
  assert.equal(falhou.estadoSaida, 'FALHOU');
  assert.throws(() => maquina.cancelar(falhou, new Date()), ErroTransicaoMensagemInvalida);
  assert.equal(maquina.cancelar(mensagemNaFila(), new Date('2026-09-01T12:00:01Z')).estadoSaida, 'CANCELADA');
});

function criarServico(sobrescritas = {}) {
  const estado = { caixa: [], eventos: [], mensagens: [] };
  const repositorio = {
    acrescentar: async (mensagem) => estado.mensagens.push(mensagem),
    bloquearIdempotencia: async () => {},
    obterContextoSaida: async () => ({
      contaWhatsAppId: ids.conta,
      contatoId: ids.contato,
      filaId: ids.fila,
      permiteEnvio: true,
    }),
    obterContextoSaidaAutomatica: async () =>
      sobrescritas.contextoAutomatico === false
        ? undefined
        : {
            contaWhatsAppId: ids.conta,
            contatoId: ids.contato,
            conversaId: ids.conversa,
          },
    obterPorIdempotencia: async (_usuarioId, mensagemClienteId) =>
      estado.mensagens.find((mensagem) => mensagem.mensagemClienteId === mensagemClienteId),
  };
  const autorizacao = {
    autorizar: async (entrada, verificar) => {
      assert.equal(entrada.permissao, 'ENVIAR_MENSAGEM');
      assert.deepEqual(await verificar(), { acessivel: true, estadoPermiteAcao: true });
    },
  };
  const janela = {
    autorizarSaida: async (_contato, _conta, tipo) => {
      if (sobrescritas.foraJanela === true) {
        throw new ErroTextoLivreForaJanela();
      }
      assert.equal(tipo, 'TEXTO_LIVRE');
      return { estado: 'ABERTA', permitida: true, tipo };
    },
  };
  const eventos = {
    acrescentar: async (evento) => {
      estado.eventos.push(evento);
      return { ...evento, criadoEm: agora, id: randomUUID(), sequenciaEvento: 1n };
    },
  };
  const caixa = { acrescentar: async (item) => estado.caixa.push(item) };
  return {
    estado,
    servico: new ServicoMensagensSaida(repositorio, autorizacao, janela, eventos, caixa),
  };
}

test('automação cria texto sem usuário remetente e conserva conteúdo fora do evento', async () => {
  const { estado, servico } = criarServico();
  const resultado = await servico.criarAutomatica(
    {
      atendimentoId: ids.atendimento,
      execucaoFluxoId: randomUUID(),
      revisaoExecucao: 3,
      texto: 'Mensagem do fluxo',
      tipo: 'TEXTO',
    },
    {},
    () => agora,
  );
  assert.equal(resultado.resultado, 'SUCESSO');
  assert.equal(resultado.mensagem.usuarioRemetenteId, undefined);
  assert.equal(resultado.mensagem.estadoSaida, 'NA_FILA');
  assert.equal(estado.mensagens.length, 1);
  assert.equal(estado.caixa.length, 1);
  assert.equal(JSON.stringify(estado.eventos).includes('Mensagem do fluxo'), false);
});

test('lista usa fallback textual explícito enquanto saída estruturada não está comprovada', async () => {
  const { estado, servico } = criarServico();
  const resultado = await servico.criarAutomatica(
    {
      atendimentoId: ids.atendimento,
      execucaoFluxoId: randomUUID(),
      opcoes: [
        { id: 'financeiro', titulo: 'Financeiro' },
        { descricao: 'Problemas de conexão', id: 'suporte', titulo: 'Suporte' },
      ],
      revisaoExecucao: 4,
      texto: 'Escolha uma opção',
      tipo: 'LISTA',
    },
    {},
    () => agora,
  );
  assert.equal(resultado.resultado, 'FALLBACK');
  assert.equal(
    estado.mensagens[0].conteudoProtegido.texto,
    'Escolha uma opção\n\n1. Financeiro\n2. Suporte — Problemas de conexão',
  );
});

test('automação falha fechada sem autoridade BOT ou janela do canal', async () => {
  const cenario = criarServico({ contextoAutomatico: false });
  const entrada = {
    atendimentoId: ids.atendimento,
    execucaoFluxoId: randomUUID(),
    revisaoExecucao: 1,
    texto: 'Não deve sair',
    tipo: 'TEXTO',
  };
  assert.deepEqual(await cenario.servico.criarAutomatica(entrada, {}), {
    codigo: 'AUTORIDADE_AUTOMACAO_PERDIDA',
    resultado: 'FALHA_DEFINITIVA',
  });
  const foraJanela = criarServico({ foraJanela: true });
  assert.deepEqual(await foraJanela.servico.criarAutomatica(entrada, {}), {
    codigo: 'JANELA_CANAL_FECHADA',
    resultado: 'FALHA_DEFINITIVA',
  });
  assert.equal(cenario.estado.mensagens.length, 0);
  assert.equal(foraJanela.estado.mensagens.length, 0);
});

test('criação autorizada é idempotente e grava mensagem, evento e caixa de saída sem expor texto', async () => {
  const { estado, servico } = criarServico();
  const sessao = { estado: 'ATIVA', expiraEm: new Date('2099-01-01'), sessaoId: ids.sessao, usuarioId: ids.usuario };
  const entrada = {
    atendimentoId: ids.atendimento,
    contaWhatsAppId: ids.conta,
    conversaId: ids.conversa,
    filaId: ids.fila,
    mensagemClienteId: ids.mensagemCliente,
    texto: '  Olá, João  ',
  };
  const primeira = await servico.criarTexto(sessao, entrada, {}, () => agora);
  const repetida = await servico.criarTexto(sessao, entrada, {}, () => agora);
  assert.equal(primeira.id, repetida.id);
  assert.equal(primeira.estadoSaida, 'NA_FILA');
  assert.equal(estado.mensagens.length, 1);
  assert.equal(estado.eventos.length, 1);
  assert.equal(estado.caixa.length, 1);
  assert.equal(JSON.stringify(estado.eventos).includes('João'), false);
  assert.deepEqual(estado.caixa[0].dados, { mensagemId: primeira.id });
});

test('reuso divergente da chave do cliente é rejeitado', async () => {
  const { servico } = criarServico();
  const sessao = { estado: 'ATIVA', expiraEm: new Date('2099-01-01'), sessaoId: ids.sessao, usuarioId: ids.usuario };
  const entrada = {
    atendimentoId: ids.atendimento,
    contaWhatsAppId: ids.conta,
    conversaId: ids.conversa,
    filaId: ids.fila,
    mensagemClienteId: ids.mensagemCliente,
    texto: 'original',
  };
  await servico.criarTexto(sessao, entrada, {}, () => agora);
  await assert.rejects(
    servico.criarTexto(sessao, { ...entrada, texto: 'divergente' }, {}, () => agora),
    ErroIdempotenciaMensagemDivergente,
  );
});
