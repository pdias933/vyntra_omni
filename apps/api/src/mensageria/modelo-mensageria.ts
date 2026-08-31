export type CategoriaMidiaMensagem = 'AUDIO' | 'IMAGEM' | 'PDF' | 'VIDEO';

export type ConteudoMensagemCanal =
  | {
      readonly tipo: 'TEXTO';
      readonly texto: string;
    }
  | {
      readonly tipo: 'MIDIA';
      readonly categoria: CategoriaMidiaMensagem;
      readonly midiaId: string;
      readonly legenda?: string;
      readonly nomeArquivo?: string;
    }
  | {
      readonly tipo: 'MODELO_APROVADO';
      readonly modeloId: string;
      readonly idioma: string;
      readonly parametros: Readonly<Record<string, string>>;
    }
  | {
      readonly tipo: 'INTERATIVA';
      readonly composicaoId: string;
    }
  | {
      readonly tipo: 'REACAO';
      readonly identificadorExternoMensagemAlvo: string;
      readonly simbolo: string;
    };

export interface ComandoEnvioMensagem {
  readonly comandoId: string;
  readonly chaveIdempotencia: string;
  readonly contaMensageriaId: string;
  readonly enderecoDestino: string;
  readonly conteudo: ConteudoMensagemCanal;
  readonly respostaAoIdentificadorExterno?: string;
}

export type CategoriaFalhaMensageria =
  | 'CONFIGURACAO'
  | 'DEFINITIVA'
  | 'TEMPORARIA';

export type CodigoFalhaMensageria =
  | 'CANAL_INDISPONIVEL'
  | 'CANAL_NAO_CONFIGURADO'
  | 'CONTEUDO_REJEITADO'
  | 'DESTINO_INVALIDO';

export type ResultadoEnvioMensagem =
  | {
      readonly resultado: 'ACEITA';
      readonly identificadorExternoMensagem: string;
      readonly aceitaEm: Date;
    }
  | {
      readonly resultado: 'FALHA';
      readonly categoria: CategoriaFalhaMensageria;
      readonly codigo: CodigoFalhaMensageria;
      readonly permiteNovaTentativa: boolean;
    };

export interface IdentidadeCanalNormalizada {
  readonly identificadorTecnico: string;
  readonly nomePerfil?: string;
  readonly nomeUsuario?: string;
  readonly telefoneE164?: string;
}

export type EventoRecebidoMensageria =
  | {
      readonly tipo: 'MENSAGEM_RECEBIDA';
      readonly identificadorEvento: string;
      readonly contaMensageriaId: string;
      readonly identificadorExternoMensagem: string;
      readonly identidade: IdentidadeCanalNormalizada;
      readonly conteudo: ConteudoMensagemCanal;
      readonly recebidoEm: Date;
    }
  | {
      readonly tipo: 'ESTADO_MENSAGEM_ATUALIZADO';
      readonly identificadorEvento: string;
      readonly contaMensageriaId: string;
      readonly identificadorExternoMensagem: string;
      readonly estado: 'ENVIADA' | 'ENTREGUE' | 'FALHOU' | 'LIDA';
      readonly ocorridoEm: Date;
      readonly codigoFalha?: CodigoFalhaMensageria;
    };

export type ResultadoProcessamentoEventoMensageria =
  | 'APLICADO'
  | 'IGNORADO_POR_ESTADO';

export interface ResultadoRecepcaoMensageria {
  readonly resultado: 'APLICADO' | 'DUPLICADO' | 'IGNORADO_POR_ESTADO';
}
