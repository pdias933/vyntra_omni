import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ServicoCaixaSaida } from '../eventos/servico-caixa-saida.js';
import { ServicoEventoDominio } from '../eventos/servico-evento-dominio.js';
import { ServicoJanelaCanal } from '../janela-canal/servico-janela-canal.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroIdempotenciaMensagemDivergente,
  ErroMensagemInvalida,
} from './erros-mensagem.js';
import type { MensagemSaidaPersistida } from './modelo-mensagem.js';
import {
  REPOSITORIO_MENSAGENS,
  type RepositorioMensagens,
} from './repositorio-mensagens.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoMensagensSaida {
  public constructor(
    @Inject(REPOSITORIO_MENSAGENS)
    private readonly repositorio: RepositorioMensagens,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoJanelaCanal)
    private readonly janela: ServicoJanelaCanal,
    @Inject(ServicoEventoDominio)
    private readonly eventos: ServicoEventoDominio,
    @Inject(ServicoCaixaSaida)
    private readonly caixaSaida: ServicoCaixaSaida,
  ) {}

  public async criarTexto(
    sessao: ContextoSessaoAutorizacao,
    entrada: {
      readonly atendimentoId: string;
      readonly contaWhatsAppId: string;
      readonly conversaId: string;
      readonly criadaDispositivoEm?: Date;
      readonly filaId: string;
      readonly mensagemClienteId: string;
      readonly texto: string;
    },
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<MensagemSaidaPersistida> {
    const texto = this.validarEntrada(entrada);
    const agora = relogio();
    if (!Number.isFinite(agora.getTime())) throw new ErroMensagemInvalida();
    const conteudoHash = createHash('sha256').update(texto, 'utf8').digest('hex');
    await this.repositorio.bloquearIdempotencia(
      sessao.usuarioId,
      entrada.mensagemClienteId,
      transacao,
    );
    const existente = await this.repositorio.obterPorIdempotencia(
      sessao.usuarioId,
      entrada.mensagemClienteId,
      transacao,
    );
    if (existente !== undefined) {
      if (
        existente.conversaId !== entrada.conversaId ||
        existente.atendimentoId !== entrada.atendimentoId ||
        existente.contaWhatsAppId !== entrada.contaWhatsAppId ||
        existente.conteudoHash !== conteudoHash
      ) {
        throw new ErroIdempotenciaMensagemDivergente();
      }
      return existente;
    }
    let contexto:
      | Awaited<ReturnType<RepositorioMensagens['obterContextoSaida']>>
      | undefined;
    await this.autorizacao.autorizar(
      {
        filaId: entrada.filaId,
        permissao: 'ENVIAR_MENSAGEM',
        recurso: { id: entrada.atendimentoId, tipo: 'ATENDIMENTO' },
        sessao,
      },
      async () => {
        contexto = await this.repositorio.obterContextoSaida(
          entrada.conversaId,
          entrada.atendimentoId,
          entrada.contaWhatsAppId,
          entrada.filaId,
          sessao.usuarioId,
          transacao,
        );
        return {
          acessivel: contexto !== undefined,
          estadoPermiteAcao: contexto?.permiteEnvio === true,
        };
      },
      transacao,
    );
    if (contexto === undefined) throw new ErroMensagemInvalida();
    await this.janela.autorizarSaida(
      contexto.contatoId,
      contexto.contaWhatsAppId,
      'TEXTO_LIVRE',
      transacao,
      relogio,
    );
    const mensagem: MensagemSaidaPersistida = {
      atendimentoId: entrada.atendimentoId,
      canceladaEm: undefined,
      codigoFalha: undefined,
      contatoRemetenteId: undefined,
      contaWhatsAppId: entrada.contaWhatsAppId,
      conteudoHash,
      conteudoProtegido: { texto },
      conversaId: entrada.conversaId,
      criadaDispositivoEm: entrada.criadaDispositivoEm,
      direcao: 'SAIDA',
      entregueEm: undefined,
      enviadaEm: undefined,
      estadoSaida: 'NA_FILA',
      falhouEm: undefined,
      id: randomUUID(),
      identificadorExternoMensagem: undefined,
      lidaEm: undefined,
      mensagemClienteId: entrada.mensagemClienteId,
      proximaTentativaEm: agora,
      recebidaServidorEm: agora,
      tentativasEnvio: 0,
      tipo: 'TEXTO',
      usuarioRemetenteId: sessao.usuarioId,
      versao: 1,
    };
    await this.repositorio.acrescentar(mensagem, transacao);
    const evento = await this.eventos.acrescentar(
      {
        atendimentoId: mensagem.atendimentoId,
        classificacaoDados: 'OPERACIONAL',
        conversaId: mensagem.conversaId,
        dados: { estado: 'NA_FILA', tipo: 'TEXTO' },
        entidadeId: mensagem.id,
        entidadeTipo: 'MENSAGEM',
        tipo: 'MENSAGEM_SAIDA_CRIADA',
        usuarioAtorId: sessao.usuarioId,
      },
      transacao,
    );
    await this.caixaSaida.acrescentar(
      {
        dados: { mensagemId: mensagem.id },
        destino: 'MENSAGERIA',
        tipo: 'ENVIAR_MENSAGEM',
      },
      evento,
      transacao,
    );
    return mensagem;
  }

  private validarEntrada(entrada: {
    readonly atendimentoId: string;
    readonly contaWhatsAppId: string;
    readonly conversaId: string;
    readonly criadaDispositivoEm?: Date;
    readonly filaId: string;
    readonly mensagemClienteId: string;
    readonly texto: unknown;
  }): string {
    if (
      ![
        entrada.atendimentoId,
        entrada.contaWhatsAppId,
        entrada.conversaId,
        entrada.filaId,
        entrada.mensagemClienteId,
      ].every((id) => UUID.test(id)) ||
      typeof entrada.texto !== 'string' ||
      entrada.texto.includes('\u0000') ||
      (entrada.criadaDispositivoEm !== undefined &&
        !Number.isFinite(entrada.criadaDispositivoEm.getTime()))
    ) {
      throw new ErroMensagemInvalida();
    }
    const texto = entrada.texto.trim();
    if (texto.length < 1 || texto.length > 4_096) {
      throw new ErroMensagemInvalida();
    }
    return texto;
  }
}
