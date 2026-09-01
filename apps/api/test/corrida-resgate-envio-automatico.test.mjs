import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ServicoDespachoMensagemAutomatica } from '../dist/mensagens/servico-despacho-mensagem-automatica.js';

const inicio = new Date('2026-09-01T12:00:00.000Z');
const conclusao = new Date('2026-09-01T12:00:01.000Z');
const ids = {
  atendimento: randomUUID(),
  conta: randomUUID(),
  conversa: randomUUID(),
  execucao: randomUUID(),
  mensagem: randomUUID(),
};
const texto = 'Mensagem automática autorizada';

function mensagemAutomatica() {
  return {
    atendimentoId: ids.atendimento,
    canceladaEm: undefined,
    codigoFalha: undefined,
    contatoRemetenteId: undefined,
    contaWhatsAppId: ids.conta,
    conteudoHash: createHash('sha256').update(texto).digest('hex'),
    conteudoProtegido: { texto },
    conversaId: ids.conversa,
    criadaDispositivoEm: undefined,
    direcao: 'SAIDA',
    entregueEm: undefined,
    enviadaEm: undefined,
    estadoSaida: 'NA_FILA',
    execucaoFluxoOrigemId: ids.execucao,
    falhouEm: undefined,
    id: ids.mensagem,
    identificadorExternoMensagem: undefined,
    lidaEm: undefined,
    mensagemClienteId: undefined,
    proximaTentativaEm: inicio,
    recebidaServidorEm: inicio,
    tentativasEnvio: 0,
    tipo: 'TEXTO',
    usuarioRemetenteId: undefined,
    versao: 1,
    versaoAtribuicaoOrigem: 4,
  };
}

function comando() {
  return {
    chaveIdempotencia: `mensagem:${ids.mensagem}`,
    comandoId: ids.mensagem,
    contaMensageriaId: ids.conta,
    conteudo: { texto, tipo: 'TEXTO' },
    enderecoDestino: 'BSUID.SINTETICO.PR083',
  };
}

function criarCenario(autoridadeValida = true) {
  let atual = mensagemAutomatica();
  const estados = [];
  let bloqueios = 0;
  const repositorio = {
    atualizarAutomaticaCondicional: async (proxima, estado, versao) => {
      if (atual.estadoSaida !== estado || atual.versao !== versao) return false;
      atual = { ...proxima };
      estados.push(atual.estadoSaida);
      return true;
    },
    bloquearAutoridadeSaida: async () => {
      bloqueios += 1;
    },
    obterAutomaticaParaDespacho: async () => ({
      autoridadeValida,
      mensagem: { ...atual },
    }),
  };
  const prisma = {
    executarTransacao: async (operacao) => operacao({}),
  };
  return {
    estados,
    obterAtual: () => atual,
    obterBloqueios: () => bloqueios,
    servico: new ServicoDespachoMensagemAutomatica(repositorio, prisma),
  };
}

test('aceite do canal é persistido sob o mesmo lock da autoridade', async () => {
  const cenario = criarCenario();
  let recebeuSinal = false;
  const canal = {
    enviar: async (_comando, controle) => {
      recebeuSinal = controle?.sinal instanceof AbortSignal;
      return {
        aceitaEm: conclusao,
        identificadorExternoMensagem: 'wamid.PR083',
        resultado: 'ACEITA',
      };
    },
  };
  const relogio = [inicio, conclusao][Symbol.iterator]();
  const resultado = await cenario.servico.despachar(
    ids.mensagem,
    comando(),
    canal,
    new Date('2026-09-01T12:01:00.000Z'),
    () => relogio.next().value,
  );
  assert.equal(resultado.resultado, 'PROCESSADA');
  assert.equal(resultado.mensagem.estadoSaida, 'ENVIADA');
  assert.deepEqual(cenario.estados, ['ENVIANDO', 'ENVIADA']);
  assert.equal(cenario.obterBloqueios(), 1);
  assert.equal(recebeuSinal, true);
});

test('perda de autoridade cancela NA_FILA sem chamar o canal', async () => {
  const cenario = criarCenario(false);
  let chamadas = 0;
  const resultado = await cenario.servico.despachar(
    ids.mensagem,
    comando(),
    { enviar: async () => { chamadas += 1; } },
    new Date('2026-09-01T12:01:00.000Z'),
    () => inicio,
  );
  assert.deepEqual(resultado, { resultado: 'CANCELADA' });
  assert.equal(cenario.obterAtual().estadoSaida, 'CANCELADA');
  assert.equal(chamadas, 0);
});

test('falha temporária retorna à fila antes de liberar a autoridade', async () => {
  const cenario = criarCenario();
  const relogio = [inicio, conclusao][Symbol.iterator]();
  const resultado = await cenario.servico.despachar(
    ids.mensagem,
    comando(),
    {
      enviar: async () => ({
        categoria: 'TEMPORARIA',
        codigo: 'CANAL_INDISPONIVEL',
        permiteNovaTentativa: true,
        resultado: 'FALHA',
      }),
    },
    new Date('2026-09-01T12:01:00.000Z'),
    () => relogio.next().value,
  );
  assert.equal(resultado.mensagem.estadoSaida, 'NA_FILA');
  assert.deepEqual(cenario.estados, ['ENVIANDO', 'NA_FILA']);
});
