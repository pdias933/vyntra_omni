import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { ErroMidiaInvalida } from '../dist/midias/erros-midia.js';
import { ServicoMidias } from '../dist/midias/servico-midias.js';
import { ValidadorMidia } from '../dist/midias/validador-midia.js';

const arquivos = [
  ['IMAGEM', 'image/jpeg', [0xff, 0xd8, 0xff, 0, 0, 0, 0, 0]],
  ['IMAGEM', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['IMAGEM', 'image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ['AUDIO', 'audio/mpeg', [0x49, 0x44, 0x33, 0, 0, 0, 0, 0]],
  ['AUDIO', 'audio/ogg', [0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0]],
  ['VIDEO', 'video/mp4', [0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70]],
  ['PDF', 'application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]],
];

test('detecta imagem, áudio, vídeo e PDF pela assinatura real', () => {
  const validador = new ValidadorMidia();
  for (const [categoria, mime, bytes] of arquivos) {
    const resultado = validador.validar(Uint8Array.from(bytes), mime);
    assert.equal(resultado.categoria, categoria);
    assert.equal(resultado.mimeDetectado, mime);
    assert.match(resultado.conteudoHash, /^[0-9a-f]{64}$/u);
  }
});

test('recusa MIME declarado divergente, assinatura desconhecida e tamanho informado falso', () => {
  const validador = new ValidadorMidia();
  const pdf = Uint8Array.from(arquivos.at(-1)[2]);
  assert.throws(() => validador.validar(pdf, 'image/png'), ErroMidiaInvalida);
  assert.throws(() => validador.validar(new Uint8Array(8), 'application/pdf'), ErroMidiaInvalida);
  assert.throws(() => validador.validar(pdf, 'application/pdf', 99), ErroMidiaInvalida);
});

test('serviço usa chave opaca em bucket privado e persiste somente metadados verificados', async () => {
  const estado = { armazenadas: [], persistidas: [] };
  const armazenamento = {
    guardar: async (chaveObjeto, conteudo, mime) => {
      estado.armazenadas.push({ chaveObjeto, conteudo, mime });
      return { bucketPrivado: 'vyntra-staging-midias', chaveObjeto };
    },
    obter: async () => Uint8Array.from(arquivos.at(-1)[2]),
  };
  const repositorio = {
    acrescentar: async (midia) => estado.persistidas.push(midia),
    mensagemAceitaMidia: async (_id, categoria) => categoria === 'PDF',
  };
  const servico = new ServicoMidias(armazenamento, repositorio);
  const mensagemId = randomUUID();
  const pdf = Uint8Array.from(arquivos.at(-1)[2]);
  const midia = await servico.guardar(
    mensagemId,
    pdf,
    'application/pdf',
    {},
    () => new Date('2026-09-01T12:00:00Z'),
  );
  assert.match(midia.chaveObjeto, /^midias\/[0-9a-f]{2}\/[0-9a-f-]{36}$/u);
  assert.equal(midia.bucketPrivado, 'vyntra-staging-midias');
  assert.equal('url' in midia, false);
  assert.equal(estado.armazenadas.length, 1);
  assert.equal(estado.persistidas.length, 1);
  assert.deepEqual(await servico.obter({ chaveObjeto: midia.chaveObjeto, conteudoHash: midia.conteudoHash, mime: midia.mimeDetectado, tamanhoBytes: midia.tamanhoBytes }), pdf);
});

test('serviço falha fechado quando mensagem não aceita a categoria ou storage devolve URL', async () => {
  const pdf = Uint8Array.from(arquivos.at(-1)[2]);
  const negado = new ServicoMidias(
    { guardar: async () => assert.fail('não deve armazenar'), obter: async () => assert.fail('não deve ler') },
    { acrescentar: async () => {}, mensagemAceitaMidia: async () => false },
  );
  await assert.rejects(negado.guardar(randomUUID(), pdf, 'application/pdf', {}), ErroMidiaInvalida);
  const publico = new ServicoMidias(
    { guardar: async (chaveObjeto) => ({ bucketPrivado: 'https://publico', chaveObjeto }), obter: async () => pdf },
    { acrescentar: async () => {}, mensagemAceitaMidia: async () => true },
  );
  await assert.rejects(publico.guardar(randomUUID(), pdf, 'application/pdf', {}), ErroMidiaInvalida);
});

test('leitura privada falha fechada quando conteúdo armazenado foi alterado', async () => {
  const pdf = Uint8Array.from(arquivos.at(-1)[2]);
  const servico = new ServicoMidias(
    { guardar: async (chaveObjeto) => ({ bucketPrivado: 'privado', chaveObjeto }), obter: async () => Uint8Array.from([...pdf, 0]) },
    { acrescentar: async () => {}, mensagemAceitaMidia: async () => true },
  );
  await assert.rejects(servico.obter({ chaveObjeto: 'midias/aa/id', conteudoHash: '0'.repeat(64), mime: 'application/pdf', tamanhoBytes: pdf.byteLength }), ErroMidiaInvalida);
});
