import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raizRepositorio = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);
const origem = 'https://omni.up100.com.br';
const diretorioAdministrador = join(
  raizRepositorio,
  '.segredos',
  'staging',
  'administrador',
);

let cookies = '';
let csrf = '';
let identificadorPareamento;
let segredoVinculo;
let sessaoMobile;

function decodificarBase32(valor) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let acumulador = 0;
  let bits = 0;
  const bytes = [];

  for (const caractere of valor.replace(/=+$/u, '')) {
    const indice = alfabeto.indexOf(caractere);
    if (indice < 0) throw new Error('SEGREDO_TOTP_STAGING_INVALIDO');
    acumulador = (acumulador << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acumulador >>> bits) & 0xff);
      acumulador &= (1 << bits) - 1;
    }
  }

  return Buffer.from(bytes);
}

function gerarTotp(segredo) {
  const contador = BigInt(Math.floor(Date.now() / 30_000));
  const mensagem = Buffer.alloc(8);
  mensagem.writeBigUInt64BE(contador);
  const hmac = createHmac('sha1', decodificarBase32(segredo))
    .update(mensagem)
    .digest();
  const deslocamento = hmac.at(-1) & 0x0f;
  const numero =
    (((hmac[deslocamento] & 0x7f) << 24) |
      ((hmac[deslocamento + 1] & 0xff) << 16) |
      ((hmac[deslocamento + 2] & 0xff) << 8) |
      (hmac[deslocamento + 3] & 0xff)) %
    1_000_000;
  return String(numero).padStart(6, '0');
}

async function requisitar(
  caminho,
  { corpo, headers = {}, metodo = 'GET' } = {},
) {
  const resposta = await fetch(`${origem}${caminho}`, {
    method: metodo,
    headers: {
      Origin: origem,
      ...(cookies.length === 0 ? {} : { Cookie: cookies }),
      ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const cookiesRecebidos = resposta.headers.getSetCookie();

  if (cookiesRecebidos.length > 0) {
    cookies = cookiesRecebidos
      .map((item) => item.split(';', 1)[0])
      .join('; ');
    const parteCsrf = cookies
      .split('; ')
      .find((item) => item.startsWith('__Host-vyntra_csrf='));
    csrf = parteCsrf?.slice(parteCsrf.indexOf('=') + 1) ?? '';
  }

  const texto = await resposta.text();
  let dados;
  if (texto.length > 0) {
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = undefined;
    }
  }

  return { dados, status: resposta.status };
}

function exigir(condicao, codigo) {
  if (!condicao) throw new Error(codigo);
}

async function limpar() {
  if (sessaoMobile !== undefined && segredoVinculo !== undefined) {
    await requisitar('/api/v1/autenticacao/mobile/sair', {
      metodo: 'POST',
      headers: {
        Authorization: `Bearer ${sessaoMobile.token_acesso}`,
        'x-dispositivo-id': sessaoMobile.dispositivo_id,
        'x-segredo-dispositivo': segredoVinculo,
      },
    }).catch(() => undefined);
  }

  if (identificadorPareamento !== undefined && csrf.length > 0) {
    await requisitar(
      `/api/v1/autenticacao/web/pareamentos-qr/${identificadorPareamento}/cancelar`,
      {
        metodo: 'POST',
        headers: { 'x-csrf-token': csrf },
      },
    ).catch(() => undefined);
  }

  if (cookies.length > 0 && csrf.length > 0) {
    await requisitar('/api/v1/autenticacao/web/sair', {
      metodo: 'POST',
      headers: { 'x-csrf-token': csrf },
    }).catch(() => undefined);
  }
}

async function executar() {
  const senha = (
    await readFile(join(diretorioAdministrador, 'senha-administrador'), 'utf8')
  ).trim();
  const segredoTotp = (
    await readFile(join(diretorioAdministrador, 'totp-administrador'), 'utf8')
  ).trim();

  try {
    const desafio = await requisitar('/api/v1/autenticacao/web/entrar', {
      metodo: 'POST',
      corpo: { identificador: 'administrador', senha },
    });
    exigir(
      desafio.status === 403 &&
        desafio.dados?.codigo === 'MFA_NECESSARIO',
      'DESAFIO_MFA_NAO_RECONHECIDO',
    );

    const entrada = await requisitar('/api/v1/autenticacao/web/entrar', {
      metodo: 'POST',
      corpo: {
        codigo_mfa: gerarTotp(segredoTotp),
        identificador: 'administrador',
        senha,
      },
    });
    exigir(
      entrada.status === 200 && cookies.length > 0 && csrf.length > 0,
      'LOGIN_MFA_FALHOU',
    );

    const gerado = await requisitar(
      '/api/v1/autenticacao/web/pareamentos-qr',
      {
        metodo: 'POST',
        headers: { 'x-csrf-token': csrf },
      },
    );
    exigir(
      gerado.status === 201 &&
        gerado.dados?.token_qr?.length === 43 &&
        typeof gerado.dados?.pareamento_id === 'string',
      'GERACAO_QR_FALHOU',
    );
    identificadorPareamento = gerado.dados.pareamento_id;

    const identificadorInstalacao = randomUUID();
    segredoVinculo = randomBytes(32).toString('base64url');
    const aparelho = {
      identificador_instalacao: identificadorInstalacao,
      modelo_sanitizado: 'Aceite staging PR097',
      plataforma: 'ANDROID',
      segredo_vinculo: segredoVinculo,
      versao_aplicativo: '0.1.0',
    };
    const resgate = await requisitar(
      '/api/v1/autenticacao/mobile/pareamentos-qr/resgatar',
      {
        metodo: 'POST',
        corpo: { ...aparelho, token_qr: gerado.dados.token_qr },
      },
    );
    exigir(
      resgate.status === 200 &&
        resgate.dados?.comprovante_resgate?.length === 43,
      'RESGATE_QR_FALHOU',
    );

    const previa = await requisitar(
      `/api/v1/autenticacao/web/pareamentos-qr/${identificadorPareamento}`,
    );
    exigir(
      previa.status === 200 &&
        previa.dados?.estado === 'AGUARDANDO_CONFIRMACAO' &&
        previa.dados?.modelo_sanitizado === 'Aceite staging PR097',
      'PREVIA_QR_FALHOU',
    );

    const confirmado = await requisitar(
      `/api/v1/autenticacao/web/pareamentos-qr/${identificadorPareamento}/confirmar`,
      {
        metodo: 'POST',
        headers: { 'x-csrf-token': csrf },
      },
    );
    exigir(confirmado.status === 204, 'CONFIRMACAO_QR_FALHOU');

    const comprovante = {
      ...aparelho,
      comprovante_resgate: resgate.dados.comprovante_resgate,
      pareamento_id: identificadorPareamento,
    };
    const estadoConfirmado = await requisitar(
      '/api/v1/autenticacao/mobile/pareamentos-qr/consultar',
      { metodo: 'POST', corpo: comprovante },
    );
    exigir(
      estadoConfirmado.status === 200 &&
        estadoConfirmado.dados?.estado === 'CONFIRMADO',
      'ESTADO_QR_FALHOU',
    );

    const concluido = await requisitar(
      '/api/v1/autenticacao/mobile/pareamentos-qr/concluir',
      { metodo: 'POST', corpo: comprovante },
    );
    sessaoMobile = concluido.dados;
    exigir(
      concluido.status === 200 &&
        sessaoMobile?.token_acesso?.length === 43 &&
        sessaoMobile?.token_refresh?.length === 43,
      'CONCLUSAO_QR_FALHOU',
    );

    const sessao = await requisitar(
      '/api/v1/autenticacao/mobile/sessao',
      {
        headers: {
          Authorization: `Bearer ${sessaoMobile.token_acesso}`,
          'x-dispositivo-id': sessaoMobile.dispositivo_id,
          'x-segredo-dispositivo': segredoVinculo,
        },
      },
    );
    exigir(sessao.status === 200, 'SESSAO_MOBILE_FALHOU');

    console.log('ACEITE_PR097_APROVADO MFA QR SESSAO_MOBILE');
  } finally {
    await limpar();
  }
}

await executar();
