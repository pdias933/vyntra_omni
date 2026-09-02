import 'reflect-metadata';

import { criarAplicacao } from './configurar-aplicacao.js';
import { encerrarAplicacaoGraciosamente } from './ciclo-vida-aplicacao.js';
import { loggerEstruturado } from './observabilidade/logger-estruturado.js';
import { ServicoProntidao } from './saude/servico-prontidao.js';
import { GatewayEventosMobile } from './sincronizacao/gateway-eventos-mobile.js';

async function iniciarAplicacao(): Promise<void> {
  const aplicacao = await criarAplicacao();
  const enderecoHttp = process.env.ENDERECO_HTTP ?? '127.0.0.1';
  const portaHttp = Number(process.env.PORTA_HTTP ?? '3000');

  if (!Number.isInteger(portaHttp) || portaHttp < 1 || portaHttp > 65_535) {
    throw new Error('PORTA_HTTP_INVALIDA');
  }

  aplicacao
    .get(GatewayEventosMobile)
    .anexar(aplicacao.getHttpServer());
  await aplicacao.listen(portaHttp, enderecoHttp);

  let encerramento: Promise<void> | undefined;
  const encerrar = (): void => {
    encerramento ??= encerrarAplicacaoGraciosamente(
      aplicacao,
      aplicacao.get(ServicoProntidao),
    ).catch(() => {
      process.exitCode = 1;
      loggerEstruturado.registrar('error', 'DRENAGEM_APLICACAO_FALHOU', {
        codigo_erro: 'TEMPO_DRENAGEM_EXCEDIDO',
        componente: 'API',
      });
    });
  };
  process.once('SIGINT', encerrar);
  process.once('SIGTERM', encerrar);
}

await iniciarAplicacao();
