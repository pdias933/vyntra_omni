import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

const configuracaoDocumento = new DocumentBuilder()
  .setTitle('API Vyntra Omnichannel')
  .setDescription('Contrato público e versionado do Omnichannel V1.')
  .setVersion('1.0.0')
  .setOpenAPIVersion('3.1.0')
  .addCookieAuth('__Host-vyntra_sessao', {
    in: 'cookie',
    type: 'apiKey',
  }, 'sessaoWeb')
  .addBearerAuth(
    { bearerFormat: 'opaque', scheme: 'bearer', type: 'http' },
    'sessaoMobile',
  )
  .build();

export function criarDocumentoOpenApi(
  aplicacao: INestApplication,
): OpenAPIObject {
  return SwaggerModule.createDocument(aplicacao, configuracaoDocumento, {
    autoTagControllers: false,
    operationIdFactory: (_controlador, metodo) => metodo,
  });
}

export function configurarOpenApi(aplicacao: INestApplication): void {
  SwaggerModule.setup(
    'api/v1/documentacao',
    aplicacao,
    () => criarDocumentoOpenApi(aplicacao),
    {
      jsonDocumentUrl: 'api/v1/openapi.json',
      raw: ['json'],
      ui: false,
    },
  );
}
