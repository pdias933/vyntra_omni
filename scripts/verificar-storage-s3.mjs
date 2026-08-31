import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const endpoint = new URL('http://storage:3900');
const bucket = 'vyntra-staging-midias';
const chaveObjeto = '.verificacao/staging-isolado.txt';
const conteudoEsperado = 'vyntra-staging-isolado-v1\n';
const regiao = 'vyntra-staging';
const caminhoIdentificador = '/run/secrets/chave_storage_id';
const caminhoSegredo = '/run/secrets/chave_storage_secreta';

function resumoSha256(valor) {
  return createHash('sha256').update(valor).digest('hex');
}

function hmac(chave, valor, codificacao) {
  return createHmac('sha256', chave).update(valor).digest(codificacao);
}

function formatarData(data) {
  return data.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function codificarCaminho(valor) {
  return valor
    .split('/')
    .map((parte) => encodeURIComponent(parte))
    .join('/');
}

function criarAssinatura({ corpo, data, identificador, metodo, segredo }) {
  const dataAmz = formatarData(data);
  const dia = dataAmz.slice(0, 8);
  const caminho = `/${codificarCaminho(bucket)}/${codificarCaminho(chaveObjeto)}`;
  const resumoCorpo = resumoSha256(corpo);
  const cabecalhosCanonicos =
    `host:${endpoint.host}\n` +
    `x-amz-content-sha256:${resumoCorpo}\n` +
    `x-amz-date:${dataAmz}\n`;
  const cabecalhosAssinados = 'host;x-amz-content-sha256;x-amz-date';
  const requisicaoCanonica = [
    metodo,
    caminho,
    '',
    cabecalhosCanonicos,
    cabecalhosAssinados,
    resumoCorpo,
  ].join('\n');
  const escopo = `${dia}/${regiao}/s3/aws4_request`;
  const textoAssinar = [
    'AWS4-HMAC-SHA256',
    dataAmz,
    escopo,
    resumoSha256(requisicaoCanonica),
  ].join('\n');
  const chaveDia = hmac(`AWS4${segredo}`, dia);
  const chaveRegiao = hmac(chaveDia, regiao);
  const chaveServico = hmac(chaveRegiao, 's3');
  const chaveAssinatura = hmac(chaveServico, 'aws4_request');
  const assinatura = hmac(chaveAssinatura, textoAssinar, 'hex');

  return {
    caminho,
    cabecalhos: {
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${identificador}/${escopo}, ` +
        `SignedHeaders=${cabecalhosAssinados}, Signature=${assinatura}`,
      'x-amz-content-sha256': resumoCorpo,
      'x-amz-date': dataAmz,
    },
  };
}

async function enviar({ corpo = '', identificador, metodo, segredo }) {
  const { caminho, cabecalhos } = criarAssinatura({
    corpo,
    data: new Date(),
    identificador,
    metodo,
    segredo,
  });
  const resposta = await fetch(new URL(caminho, endpoint), {
    body: metodo === 'PUT' ? corpo : undefined,
    headers: cabecalhos,
    method: metodo,
  });

  if (!resposta.ok) {
    throw new Error(`STORAGE_S3_FALHOU:${metodo}:${resposta.status}`);
  }

  return resposta;
}

async function executar(modo) {
  if (!['gravar', 'ler', 'gravar-e-ler'].includes(modo)) {
    throw new Error('MODO_VERIFICACAO_STORAGE_INVALIDO');
  }

  const [identificador, segredo] = await Promise.all([
    readFile(caminhoIdentificador, 'utf8').then((valor) => valor.trim()),
    readFile(caminhoSegredo, 'utf8').then((valor) => valor.trim()),
  ]);

  if (!/^GK[a-f0-9]{24}$/.test(identificador) || !/^[a-f0-9]{64}$/.test(segredo)) {
    throw new Error('CREDENCIAL_STORAGE_S3_INVALIDA');
  }

  if (modo === 'gravar' || modo === 'gravar-e-ler') {
    await enviar({
      corpo: conteudoEsperado,
      identificador,
      metodo: 'PUT',
      segredo,
    });
  }

  if (modo === 'ler' || modo === 'gravar-e-ler') {
    const resposta = await enviar({ identificador, metodo: 'GET', segredo });
    const conteudo = await resposta.text();

    if (conteudo !== conteudoEsperado) {
      throw new Error('CONTEUDO_STORAGE_S3_DIVERGENTE');
    }
  }

  console.log(`Storage S3 verificado no modo ${modo}; credenciais não exibidas.`);
}

try {
  await executar(process.argv[2] ?? 'gravar-e-ler');
} catch (erro) {
  const mensagem = erro instanceof Error ? erro.message : 'ERRO_DESCONHECIDO';
  console.error(`Verificação S3 bloqueada: ${mensagem}`);
  process.exitCode = 1;
}

export { criarAssinatura };
