import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type {
  ComandoEnvioMensagem,
  ResultadoEnvioMensagem,
} from '../mensageria/modelo-mensageria.js';
import type { CanalMensageria } from '../mensageria/porta-mensageria.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import { ErroMensagemInvalida } from './erros-mensagem.js';
import { MaquinaSaidaMensagem } from './maquina-saida-mensagem.js';
import type { MensagemSaidaPersistida } from './modelo-mensagem.js';
import {
  REPOSITORIO_MENSAGENS,
  type RepositorioMensagens,
} from './repositorio-mensagens.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LIMITE_REQUISICAO_MS = 8_000;

export type ResultadoDespachoMensagemAutomatica =
  | { readonly resultado: 'ADIADA' | 'CANCELADA' | 'IGNORADA' }
  | {
      readonly mensagem: MensagemSaidaPersistida;
      readonly resultado: 'PROCESSADA';
    };

@Injectable()
export class ServicoDespachoMensagemAutomatica {
  private readonly maquina = new MaquinaSaidaMensagem();

  public constructor(
    @Inject(REPOSITORIO_MENSAGENS)
    private readonly repositorio: RepositorioMensagens,
    @Inject(ServicoPrisma)
    private readonly prisma: ServicoPrisma,
  ) {}

  public async despachar(
    mensagemId: string,
    comando: ComandoEnvioMensagem,
    canal: CanalMensageria,
    proximaTentativaEm: Date,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoDespachoMensagemAutomatica> {
    if (
      !UUID.test(mensagemId) ||
      !Number.isFinite(proximaTentativaEm.getTime())
    ) {
      throw new ErroMensagemInvalida();
    }
    return this.prisma.executarTransacao(async (transacao) => {
      const agora = relogio();
      if (
        !Number.isFinite(agora.getTime()) ||
        proximaTentativaEm <= agora
      ) {
        throw new ErroMensagemInvalida();
      }
      const referencia = await this.repositorio.obterAutomaticaParaDespacho(
        mensagemId,
        transacao,
      );
      if (referencia === undefined) return { resultado: 'IGNORADA' };
      await this.repositorio.bloquearAutoridadeSaida(
        referencia.mensagem.atendimentoId,
        transacao,
      );
      const atual = await this.repositorio.obterAutomaticaParaDespacho(
        mensagemId,
        transacao,
      );
      if (atual === undefined || atual.mensagem.estadoSaida !== 'NA_FILA') {
        return { resultado: 'IGNORADA' };
      }
      if (
        atual.mensagem.proximaTentativaEm === undefined ||
        atual.mensagem.proximaTentativaEm > agora
      ) {
        return { resultado: 'ADIADA' };
      }
      if (!atual.autoridadeValida) {
        const cancelada = this.maquina.cancelar(atual.mensagem, agora);
        await this.exigirAtualizacao(
          cancelada,
          'NA_FILA',
          atual.mensagem.versao,
          transacao,
        );
        return { resultado: 'CANCELADA' };
      }
      this.validarComando(atual.mensagem, comando);
      const enviando = this.maquina.iniciarEnvio(atual.mensagem);
      await this.exigirAtualizacao(
        enviando,
        'NA_FILA',
        atual.mensagem.versao,
        transacao,
      );
      const resultadoCanal = await this.enviarComLimite(canal, comando);
      const concluidaEm = relogio();
      if (!Number.isFinite(concluidaEm.getTime())) {
        throw new ErroMensagemInvalida();
      }
      const concluida = this.aplicarResultado(
        enviando,
        resultadoCanal,
        proximaTentativaEm,
        concluidaEm,
      );
      await this.exigirAtualizacao(
        concluida,
        'ENVIANDO',
        enviando.versao,
        transacao,
      );
      return { mensagem: concluida, resultado: 'PROCESSADA' };
    });
  }

  private aplicarResultado(
    enviando: MensagemSaidaPersistida,
    resultado: ResultadoEnvioMensagem,
    proximaTentativaEm: Date,
    agora: Date,
  ): MensagemSaidaPersistida {
    if (resultado.resultado === 'ACEITA') {
      return this.maquina.aceitarEnvio(
        enviando,
        resultado.identificadorExternoMensagem,
        resultado.aceitaEm,
      );
    }
    if (
      resultado.resultado === 'FALHA' &&
      resultado.categoria === 'TEMPORARIA' &&
      resultado.permiteNovaTentativa
    ) {
      return this.maquina.registrarFalhaTemporaria(
        enviando,
        resultado.codigo,
        proximaTentativaEm,
        agora,
      );
    }
    return this.maquina.registrarFalhaDefinitiva(
      enviando,
      resultado.codigo,
      agora,
    );
  }

  private async enviarComLimite(
    canal: CanalMensageria,
    comando: ComandoEnvioMensagem,
  ): Promise<ResultadoEnvioMensagem> {
    const controlador = new AbortController();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const expiracao = new Promise<ResultadoEnvioMensagem>((resolve) => {
      temporizador = setTimeout(() => {
        controlador.abort();
        resolve({
          categoria: 'TEMPORARIA',
          codigo: 'CANAL_INDISPONIVEL',
          permiteNovaTentativa: true,
          resultado: 'FALHA',
        });
      }, LIMITE_REQUISICAO_MS);
      temporizador.unref();
    });
    try {
      return await Promise.race([
        canal.enviar(comando, { sinal: controlador.signal }),
        expiracao,
      ]);
    } finally {
      if (temporizador !== undefined) clearTimeout(temporizador);
    }
  }

  private validarComando(
    mensagem: MensagemSaidaPersistida,
    comando: ComandoEnvioMensagem,
  ): void {
    const texto =
      comando.conteudo.tipo === 'TEXTO' ? comando.conteudo.texto : undefined;
    if (
      comando.comandoId !== mensagem.id ||
      comando.chaveIdempotencia !== `mensagem:${mensagem.id}` ||
      comando.contaMensageriaId !== mensagem.contaWhatsAppId ||
      texto === undefined ||
      createHash('sha256').update(texto, 'utf8').digest('hex') !==
        mensagem.conteudoHash
    ) {
      throw new ErroMensagemInvalida();
    }
  }

  private async exigirAtualizacao(
    mensagem: MensagemSaidaPersistida,
    estadoEsperado: MensagemSaidaPersistida['estadoSaida'],
    versaoEsperada: number,
    transacao: Parameters<RepositorioMensagens['atualizarAutomaticaCondicional']>[3],
  ): Promise<void> {
    if (
      !(await this.repositorio.atualizarAutomaticaCondicional(
        mensagem,
        estadoEsperado,
        versaoEsperada,
        transacao,
      ))
    ) {
      throw new ErroMensagemInvalida();
    }
  }
}
