import type { EstadoSaidaMensagemDominio } from '../mensagens/modelo-mensagem.js';
import type { ObjetoJsonProtegido } from '../seguranca/modelo-dados-protegidos.js';

export interface AplicacaoIntegracao {
  readonly id: string;
  readonly nome: string;
  readonly segredoHash: string;
  readonly estado: 'ATIVA' | 'INATIVA';
}

export interface ConsentimentoContatoCanal {
  readonly id: string;
  readonly contatoId: string;
  readonly contaWhatsAppId: string;
  readonly finalidade: 'MENSAGEM_TRANSACIONAL';
  readonly estado: 'CONCEDIDO' | 'REVOGADO';
}

export interface MensagemTransacionalPlanejada {
  readonly id: string;
  readonly conversaId: string;
  readonly atendimentoId: string;
  readonly contaWhatsAppId: string;
  readonly direcao: 'SAIDA';
  readonly tipo: 'MODELO_APROVADO';
  readonly estadoSaida: EstadoSaidaMensagemDominio;
  readonly conteudoProtegido: ObjetoJsonProtegido;
  readonly conteudoHash: string;
  readonly usuarioRemetenteId: undefined;
  readonly contatoRemetenteId: undefined;
  readonly recebidaServidorEm: Date;
}

export interface DisparoTransacionalPlanejado {
  readonly id: string;
  readonly aplicacaoIntegracaoId: string;
  readonly consentimentoId: string;
  readonly mensagemId: string;
  readonly chaveIdempotenciaHash: string;
  readonly assinaturaComandoHash: string;
  readonly criadoEm: Date;
  readonly mensagem: MensagemTransacionalPlanejada;
}

export interface RetornoDisparoTransacional {
  readonly disparoId: string;
  readonly mensagemId: string;
  readonly estado: EstadoSaidaMensagemDominio;
}
