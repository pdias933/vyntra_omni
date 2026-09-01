import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoEventoDominio } from '../eventos/servico-evento-dominio.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroAlvoJanelaCanalInvalido,
  ErroEntradaJanelaCanalInvalida,
  ErroTextoLivreForaJanela,
} from './erros-janela-canal.js';
import type {
  AlertaJanelaCanalEmitido,
  JanelaCanalPersistida,
  MarcoAlertaJanelaCanal,
  ResultadoAutorizacaoSaidaCanal,
  ResultadoEstadoJanelaCanal,
  TipoSaidaCanal,
} from './modelo-janela-canal.js';
import {
  REPOSITORIO_JANELA_CANAL,
  type RepositorioJanelaCanal,
} from './repositorio-janela-canal.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DURACAO_JANELA_MS = 24 * 60 * 60 * 1000;
const MARCOS: readonly [MarcoAlertaJanelaCanal, number][] = [
  ['UMA_HORA', 60 * 60 * 1000],
  ['TRINTA_MINUTOS', 30 * 60 * 1000],
  ['DEZ_MINUTOS', 10 * 60 * 1000],
];

@Injectable()
export class ServicoJanelaCanal {
  public constructor(
    @Inject(REPOSITORIO_JANELA_CANAL)
    private readonly repositorio: RepositorioJanelaCanal,
    @Inject(ServicoEventoDominio) private readonly eventos: ServicoEventoDominio,
  ) {}

  public async registrarEntradaContato(
    contatoId: string,
    contaWhatsAppId: string,
    ocorridaEm: Date,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<JanelaCanalPersistida> {
    this.validarEntrada(contatoId, contaWhatsAppId, ocorridaEm);
    await this.repositorio.bloquear(contatoId, contaWhatsAppId, transacao);
    if (!(await this.repositorio.alvosValidos(contatoId, contaWhatsAppId, transacao))) {
      throw new ErroAlvoJanelaCanalInvalido();
    }
    const atual = await this.repositorio.obter(
      contatoId,
      contaWhatsAppId,
      transacao,
    );
    if (atual !== undefined && ocorridaEm <= atual.ultimaEntradaContatoEm) return atual;
    const agora = relogio();
    this.validarInstante(agora);
    const proxima: JanelaCanalPersistida = {
      atualizadaEm: agora,
      contaWhatsAppId,
      contatoId,
      criadaEm: atual?.criadaEm ?? agora,
      expiraEm: new Date(ocorridaEm.getTime() + DURACAO_JANELA_MS),
      id: atual?.id ?? randomUUID(),
      ultimaEntradaContatoEm: ocorridaEm,
      versao: (atual?.versao ?? 0) + 1,
    };
    if (atual === undefined) {
      await this.repositorio.criar(proxima, transacao);
    } else if (
      !(await this.repositorio.atualizarSeEntradaMaisNova(
        proxima,
        atual.ultimaEntradaContatoEm,
        atual.versao,
        transacao,
      ))
    ) {
      const vencedora = await this.repositorio.obter(
        contatoId,
        contaWhatsAppId,
        transacao,
      );
      if (vencedora !== undefined) return vencedora;
      throw new ErroEntradaJanelaCanalInvalida();
    }
    await this.eventos.acrescentar(
      {
        classificacaoDados: 'OPERACIONAL',
        dados: { contaWhatsAppId, versao: proxima.versao },
        entidadeId: proxima.id,
        entidadeTipo: 'JANELA_CANAL',
        tipo: 'JANELA_CANAL_ATUALIZADA_POR_ENTRADA',
      },
      transacao,
    );
    return proxima;
  }

  public async obterEstado(
    contatoId: string,
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoEstadoJanelaCanal> {
    this.validarIdentificadores(contatoId, contaWhatsAppId);
    const agora = relogio();
    this.validarInstante(agora);
    const janela = await this.repositorio.obter(
      contatoId,
      contaWhatsAppId,
      transacao,
    );
    if (janela === undefined) return { estado: 'AUSENTE' };
    return {
      estado: agora < janela.expiraEm ? 'ABERTA' : 'EXPIRADA',
      expiraEm: janela.expiraEm,
      versao: janela.versao,
    };
  }

  public async avaliarAlertas(
    contatoId: string,
    contaWhatsAppId: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<readonly AlertaJanelaCanalEmitido[]> {
    this.validarIdentificadores(contatoId, contaWhatsAppId);
    await this.repositorio.bloquear(contatoId, contaWhatsAppId, transacao);
    const janela = await this.repositorio.obter(
      contatoId,
      contaWhatsAppId,
      transacao,
    );
    if (janela === undefined) return [];
    const agora = relogio();
    this.validarInstante(agora);
    if (agora >= janela.expiraEm) return [];
    const emitidos: AlertaJanelaCanalEmitido[] = [];
    for (const [marco, antecedenciaMs] of MARCOS) {
      const previstoEm = new Date(janela.expiraEm.getTime() - antecedenciaMs);
      if (agora < previstoEm) continue;
      const alerta: AlertaJanelaCanalEmitido = {
        emitidoEm: agora,
        id: randomUUID(),
        janelaCanalId: janela.id,
        marco,
        previstoEm,
        versaoJanela: janela.versao,
      };
      if (!(await this.repositorio.registrarAlerta(alerta, transacao))) continue;
      emitidos.push(alerta);
      await this.eventos.acrescentar(
        {
          classificacaoDados: 'OPERACIONAL',
          dados: { contaWhatsAppId, marco, versaoJanela: janela.versao },
          entidadeId: alerta.id,
          entidadeTipo: 'ALERTA_JANELA_CANAL',
          tipo: `JANELA_CANAL_ALERTA_${marco}_EMITIDO`,
        },
        transacao,
      );
    }
    return emitidos;
  }

  public async autorizarSaida(
    contatoId: string,
    contaWhatsAppId: string,
    tipo: TipoSaidaCanal,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoAutorizacaoSaidaCanal> {
    if (!['TEXTO_LIVRE', 'MODELO_APROVADO'].includes(tipo)) {
      throw new ErroEntradaJanelaCanalInvalida();
    }
    const estado = await this.obterEstado(
      contatoId,
      contaWhatsAppId,
      transacao,
      relogio,
    );
    if (tipo === 'TEXTO_LIVRE' && estado.estado !== 'ABERTA') {
      throw new ErroTextoLivreForaJanela();
    }
    return { ...estado, permitida: true, tipo };
  }

  private validarEntrada(
    contatoId: string,
    contaWhatsAppId: string,
    ocorridaEm: Date,
  ): void {
    this.validarIdentificadores(contatoId, contaWhatsAppId);
    this.validarInstante(ocorridaEm);
  }

  private validarIdentificadores(contatoId: string, contaWhatsAppId: string): void {
    if (!UUID.test(contatoId) || !UUID.test(contaWhatsAppId)) {
      throw new ErroEntradaJanelaCanalInvalida();
    }
  }

  private validarInstante(instante: Date): void {
    if (!Number.isFinite(instante.getTime())) {
      throw new ErroEntradaJanelaCanalInvalida();
    }
  }
}
