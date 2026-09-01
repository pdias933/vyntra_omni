import { Injectable } from '@nestjs/common';

import { ErroFluxoInvalido } from './erros-fluxo.js';
import {
  CENARIOS_SIMULACAO_FLUXO,
  type CenarioSimulacaoFluxo,
  type ItemPreviaSimulacaoFluxo,
  type PassoSimulacaoFluxo,
  type ResultadoSimulacaoFluxo,
} from './modelo-simulacao-fluxo.js';
import type {
  DefinicaoFluxoV1,
  NoDefinicaoFluxo,
  TipoNoFluxo,
} from './modelo-validacao-fluxo.js';

const LIMITE_PASSOS = 200;
const CONTEXTO_FICTICIO = Object.freeze({
  contato: 'Cliente fictício',
  contrato: 'CONTRATO-DEMO-001',
  documento: '***.***.***-**',
  telefone: '+55 00 00000-0000',
} as const);

const SAIDA_FELIZ: Readonly<Record<TipoNoFluxo, string | undefined>> = {
  AGUARDAR: 'CONCLUIDO',
  AGUARDAR_ATENDENTE: 'ATENDIDO',
  CONDICAO: 'VERDADEIRO',
  CONSULTAR_FATURAS: 'ENCONTRADA',
  CONSULTAR_SESSAO_ACESSO: 'ENCONTRADA',
  CRIAR_ATENDIMENTO: 'CRIADO',
  CRIAR_ORDEM_SERVICO: 'CRIADA',
  DEFINIR_VARIAVEL: 'SUCESSO',
  ENCERRAR_ATENDIMENTO: 'ENCERRADO',
  ENVIAR_BOTOES_OU_LISTA: 'SUCESSO',
  ENVIAR_FATURA: 'SUCESSO',
  ENVIAR_MENSAGEM: 'SUCESSO',
  EXECUTAR_DESBLOQUEIO_CONFIANCA: 'CONCLUIDO',
  FIM: undefined,
  HORARIO_ATENDIMENTO: 'DENTRO_HORARIO',
  IDENTIFICAR_CONTATO: 'IDENTIFICADO',
  INICIO: 'SUCESSO',
  SELECIONAR_CLIENTE: 'SELECIONADO',
  SELECIONAR_CONTRATO: 'SELECIONADO',
  SOLICITAR_DADOS_CONTATO: 'ENVIADO',
  SOLICITAR_FORMULARIO_WHATSAPP: 'ENVIADO',
  TRANSFERIR_PARA_FILA: 'TRANSFERIDO',
  VERIFICAR_DESBLOQUEIO_CONFIANCA: 'ELEGIVEL',
};

@Injectable()
export class SimuladorFluxos {
  public simular(
    definicao: DefinicaoFluxoV1,
    cenarioRecebido: unknown,
  ): ResultadoSimulacaoFluxo {
    const cenario = this.validarCenario(cenarioRecebido);
    const nos = new Map(definicao.nos.map((item) => [item.id, item]));
    const passos: PassoSimulacaoFluxo[] = [];
    const previa: ItemPreviaSimulacaoFluxo[] = [];
    const visitas = new Map<string, number>();
    let noAtualId = definicao.inicioNoId;

    for (let ordem = 1; ordem <= LIMITE_PASSOS; ordem += 1) {
      const noAtual = nos.get(noAtualId);
      if (noAtual === undefined) {
        return this.interromper(
          cenario,
          passos,
          previa,
          'NO_INEXISTENTE',
        );
      }
      const quantidadeVisitas = (visitas.get(noAtual.id) ?? 0) + 1;
      visitas.set(noAtual.id, quantidadeVisitas);
      const limite = noAtual.limiteIteracoes ?? 3;
      if (quantidadeVisitas > limite) {
        passos.push({
          descricao: 'O limite seguro da simulação foi atingido.',
          estado: 'INTERROMPIDO',
          noId: noAtual.id,
          ordem,
          tipoNo: noAtual.tipo,
        });
        return this.resultado(
          cenario,
          'LIMITE_ATINGIDO',
          'LIMITE_SIMULACAO_ATINGIDO',
          passos,
          previa,
        );
      }
      if (noAtual.tipo === 'FIM') {
        passos.push({
          descricao: 'Fluxo concluído no ambiente fictício.',
          estado: 'CONCLUIDO',
          noId: noAtual.id,
          ordem,
          tipoNo: noAtual.tipo,
        });
        previa.push({
          conteudo: 'Simulação concluída — nenhum efeito real foi executado.',
          ordemPasso: ordem,
          origem: 'SISTEMA',
        });
        return this.resultado(
          cenario,
          'CONCLUIDA',
          'FLUXO_CONCLUIDO',
          passos,
          previa,
        );
      }
      const saida = this.selecionarSaida(noAtual.tipo, cenario);
      passos.push({
        descricao: this.descrever(noAtual.tipo, saida),
        estado: 'CONCLUIDO',
        noId: noAtual.id,
        ordem,
        saida,
        tipoNo: noAtual.tipo,
      });
      const itemPrevia = this.criarPrevia(noAtual, saida, ordem);
      if (itemPrevia !== undefined) previa.push(itemPrevia);
      const conexoes = definicao.conexoes.filter(
        ({ origemNoId, saida: saidaConexao }) =>
          origemNoId === noAtual.id && saidaConexao === saida,
      );
      if (conexoes.length !== 1) {
        passos.push({
          descricao: 'Não existe uma conexão única para a saída simulada.',
          estado: 'INTERROMPIDO',
          noId: noAtual.id,
          ordem: ordem + 1,
          saida,
          tipoNo: noAtual.tipo,
        });
        return this.interromper(
          cenario,
          passos,
          previa,
          'SAIDA_SEM_CONEXAO_UNICA',
        );
      }
      noAtualId = conexoes[0]?.destinoNoId ?? '';
    }

    return this.resultado(
      cenario,
      'LIMITE_ATINGIDO',
      'LIMITE_GLOBAL_SIMULACAO_ATINGIDO',
      passos,
      previa,
    );
  }

  private selecionarSaida(
    tipo: TipoNoFluxo,
    cenario: CenarioSimulacaoFluxo,
  ): string {
    if (cenario === 'CAMINHO_ALTERNATIVO') {
      const alternativas: Partial<Record<TipoNoFluxo, string>> = {
        CONDICAO: 'FALSO',
        CONSULTAR_FATURAS: 'NAO_ENCONTRADA',
        CONSULTAR_SESSAO_ACESSO: 'NAO_ENCONTRADA',
        SELECIONAR_CLIENTE: 'NAO_SELECIONADO',
        SELECIONAR_CONTRATO: 'NAO_SELECIONADO',
        VERIFICAR_DESBLOQUEIO_CONFIANCA: 'NAO_ELEGIVEL',
      };
      return alternativas[tipo] ?? this.saidaFeliz(tipo);
    }
    if (cenario === 'CONTATO_NAO_IDENTIFICADO') {
      const identidade: Partial<Record<TipoNoFluxo, string>> = {
        IDENTIFICAR_CONTATO: 'NAO_IDENTIFICADO',
        SELECIONAR_CLIENTE: 'NAO_SELECIONADO',
        SELECIONAR_CONTRATO: 'NAO_SELECIONADO',
      };
      return identidade[tipo] ?? this.saidaFeliz(tipo);
    }
    if (cenario === 'ERP_INDISPONIVEL') {
      const erp: Partial<Record<TipoNoFluxo, string>> = {
        CONSULTAR_FATURAS: 'ERP_INDISPONIVEL',
        CONSULTAR_SESSAO_ACESSO: 'INDISPONIVEL',
        CRIAR_ATENDIMENTO: 'INDISPONIVEL',
        CRIAR_ORDEM_SERVICO: 'INDISPONIVEL',
        ENVIAR_FATURA: 'ERP_INDISPONIVEL',
        EXECUTAR_DESBLOQUEIO_CONFIANCA: 'FALHA',
        VERIFICAR_DESBLOQUEIO_CONFIANCA: 'INDISPONIVEL',
      };
      return erp[tipo] ?? this.saidaFeliz(tipo);
    }
    if (cenario === 'TIMEOUT') {
      const esperas: Partial<Record<TipoNoFluxo, string>> = {
        AGUARDAR: 'TIMEOUT',
        AGUARDAR_ATENDENTE: 'TIMEOUT',
      };
      return esperas[tipo] ?? this.saidaFeliz(tipo);
    }
    if (cenario === 'FORA_DO_HORARIO' && tipo === 'HORARIO_ATENDIMENTO') {
      return 'FORA_HORARIO';
    }
    if (cenario === 'CANAL_LIMITADO') {
      const canal: Partial<Record<TipoNoFluxo, string>> = {
        ENVIAR_BOTOES_OU_LISTA: 'FALLBACK',
        SOLICITAR_DADOS_CONTATO: 'FALLBACK',
        SOLICITAR_FORMULARIO_WHATSAPP: 'FALLBACK',
      };
      return canal[tipo] ?? this.saidaFeliz(tipo);
    }
    return this.saidaFeliz(tipo);
  }

  private saidaFeliz(tipo: TipoNoFluxo): string {
    const saida = SAIDA_FELIZ[tipo];
    if (saida === undefined) throw new ErroFluxoInvalido();
    return saida;
  }

  private criarPrevia(
    no: NoDefinicaoFluxo,
    saida: string,
    ordem: number,
  ): ItemPreviaSimulacaoFluxo | undefined {
    const mensagens: Partial<Record<TipoNoFluxo, string>> = {
      ENVIAR_BOTOES_OU_LISTA: 'Opções fictícias apresentadas ao cliente de teste.',
      ENVIAR_FATURA: 'Segunda via fictícia preparada, sem documento ou cobrança real.',
      ENVIAR_MENSAGEM: 'Mensagem de demonstração enviada apenas para a prévia.',
      SOLICITAR_DADOS_CONTATO: 'Solicitação fictícia de dados apresentada na prévia.',
      SOLICITAR_FORMULARIO_WHATSAPP: 'Formulário fictício apresentado sem chamar o canal real.',
    };
    if (mensagens[no.tipo] !== undefined) {
      return {
        conteudo: `${mensagens[no.tipo]} · ${saida}`,
        ordemPasso: ordem,
        origem: 'EMPRESA',
      };
    }
    if (no.tipo === 'AGUARDAR' && saida === 'CONCLUIDO') {
      return {
        conteudo: 'Resposta fictícia do cliente de teste.',
        ordemPasso: ordem,
        origem: 'CLIENTE_FICTICIO',
      };
    }
    if (
      [
        'CONSULTAR_FATURAS',
        'CRIAR_ATENDIMENTO',
        'CRIAR_ORDEM_SERVICO',
        'EXECUTAR_DESBLOQUEIO_CONFIANCA',
      ].includes(no.tipo)
    ) {
      return {
        conteudo: `Resultado fictício do sistema: ${saida}.`,
        ordemPasso: ordem,
        origem: 'SISTEMA',
      };
    }
    return undefined;
  }

  private descrever(tipo: TipoNoFluxo, saida: string): string {
    return `${tipo.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')} percorreu ${saida.toLocaleLowerCase('pt-BR')}.`;
  }

  private interromper(
    cenario: CenarioSimulacaoFluxo,
    passos: readonly PassoSimulacaoFluxo[],
    previa: readonly ItemPreviaSimulacaoFluxo[],
    codigo: string,
  ): ResultadoSimulacaoFluxo {
    return this.resultado(
      cenario,
      'INTERROMPIDA',
      codigo,
      passos,
      previa,
    );
  }

  private resultado(
    cenario: CenarioSimulacaoFluxo,
    estado: ResultadoSimulacaoFluxo['estado'],
    codigoFinal: string,
    passos: readonly PassoSimulacaoFluxo[],
    previa: readonly ItemPreviaSimulacaoFluxo[],
  ): ResultadoSimulacaoFluxo {
    return {
      cenario,
      codigoFinal,
      contextoFicticio: CONTEXTO_FICTICIO,
      efeitosReaisExecutados: false,
      estado,
      passos,
      previa,
    };
  }

  private validarCenario(valor: unknown): CenarioSimulacaoFluxo {
    if (
      typeof valor !== 'string' ||
      !CENARIOS_SIMULACAO_FLUXO.some((cenario) => cenario === valor)
    ) {
      throw new ErroFluxoInvalido();
    }
    return valor as CenarioSimulacaoFluxo;
  }
}
