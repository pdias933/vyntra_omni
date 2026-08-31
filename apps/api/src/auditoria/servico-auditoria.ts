import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import { Inject, Injectable } from '@nestjs/common';

import { contextoCorrelacao } from '../observabilidade/contexto-correlacao.js';
import {
  ORIGENS_AUDITORIA,
  type EntradaRegistroAuditoria,
  type RegistroAuditoria,
} from './modelo-auditoria.js';
import {
  REPOSITORIO_AUDITORIA,
  type RepositorioAuditoria,
} from './repositorio-auditoria.js';
import { SanitizadorAuditoria } from './sanitizador-auditoria.js';

const IDENTIFICADOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NOME_EVENTO = /^[A-Z][A-Z0-9_]{2,99}$/u;

@Injectable()
export class ServicoAuditoria {
  private readonly sanitizador = new SanitizadorAuditoria();

  public constructor(
    @Inject(REPOSITORIO_AUDITORIA)
    private readonly repositorio: RepositorioAuditoria,
  ) {}

  public async registrar(entrada: EntradaRegistroAuditoria): Promise<RegistroAuditoria> {
    this.validarEntrada(entrada);

    const registro: RegistroAuditoria = {
      acao: entrada.acao,
      atendimentoId: entrada.atendimentoId,
      contatoId: entrada.contatoId,
      correlacaoId:
        entrada.correlacaoId ?? contextoCorrelacao.obter() ?? randomUUID(),
      criadoEm: new Date(),
      dadosAnterioresSanitizados: this.sanitizador.sanitizar(
        entrada.dadosAnteriores,
      ),
      dadosNovosSanitizados: this.sanitizador.sanitizar(entrada.dadosNovos),
      dispositivoId: entrada.dispositivoId,
      enderecoIp: entrada.enderecoIp,
      entidadeId: entrada.entidadeId,
      entidadeTipo: entrada.entidadeTipo,
      filaId: entrada.filaId,
      fluxoId: entrada.fluxoId,
      id: randomUUID(),
      origem: entrada.origem,
      sessaoId: entrada.sessaoId,
      tipoEvento: entrada.tipoEvento,
      usuarioId: entrada.usuarioId,
      versaoFluxoId: entrada.versaoFluxoId,
    };

    await this.repositorio.acrescentar(registro);
    return registro;
  }

  private validarEntrada(entrada: EntradaRegistroAuditoria): void {
    if (!ORIGENS_AUDITORIA.includes(entrada.origem)) {
      throw new Error('ORIGEM_AUDITORIA_INVALIDA');
    }
    if (!NOME_EVENTO.test(entrada.tipoEvento) || !NOME_EVENTO.test(entrada.acao)) {
      throw new Error('EVENTO_AUDITORIA_INVALIDO');
    }

    this.validarOrigem(entrada);
    this.validarEntidade(entrada);
    this.validarUuids(entrada);

    if (entrada.enderecoIp !== undefined && isIP(entrada.enderecoIp) === 0) {
      throw new Error('ENDERECO_IP_AUDITORIA_INVALIDO');
    }
  }

  private validarOrigem(entrada: EntradaRegistroAuditoria): void {
    const temUsuario = entrada.usuarioId !== undefined;
    const temFluxo = entrada.fluxoId !== undefined;
    const temVersaoFluxo = entrada.versaoFluxoId !== undefined;
    const valida =
      (entrada.origem === 'USUARIO' && temUsuario && !temFluxo && !temVersaoFluxo) ||
      (entrada.origem === 'FLUXO' && !temUsuario && temFluxo && temVersaoFluxo) ||
      (['SISTEMA', 'INTEGRACAO'].includes(entrada.origem) &&
        !temUsuario &&
        !temFluxo &&
        !temVersaoFluxo);

    if (!valida) {
      throw new Error('ATOR_AUDITORIA_INCOMPATIVEL');
    }
  }

  private validarEntidade(entrada: EntradaRegistroAuditoria): void {
    if ((entrada.entidadeTipo === undefined) !== (entrada.entidadeId === undefined)) {
      throw new Error('ENTIDADE_AUDITORIA_INCOMPLETA');
    }
    if (entrada.entidadeTipo !== undefined && !NOME_EVENTO.test(entrada.entidadeTipo)) {
      throw new Error('ENTIDADE_AUDITORIA_INVALIDA');
    }
  }

  private validarUuids(entrada: EntradaRegistroAuditoria): void {
    for (const valor of [
      entrada.usuarioId,
      entrada.fluxoId,
      entrada.versaoFluxoId,
      entrada.atendimentoId,
      entrada.contatoId,
      entrada.filaId,
      entrada.entidadeId,
      entrada.dispositivoId,
      entrada.sessaoId,
      entrada.correlacaoId,
    ]) {
      if (valor !== undefined && !IDENTIFICADOR_UUID.test(valor)) {
        throw new Error('IDENTIFICADOR_AUDITORIA_INVALIDO');
      }
    }
  }
}
