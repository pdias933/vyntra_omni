import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoEventoDominio } from '../eventos/servico-evento-dominio.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ResultadoRegistroSubmissaoFormulario,
  SubmissaoFormularioNormalizada,
  SubmissaoFormularioPersistida,
} from './modelo-formulario.js';
import {
  REPOSITORIO_FORMULARIOS,
  type RepositorioFormularios,
} from './repositorio-formularios.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[0-9a-f]{64}$/u;

@Injectable()
export class ServicoFormularios {
  public constructor(
    @Inject(REPOSITORIO_FORMULARIOS)
    private readonly repositorio: RepositorioFormularios,
    @Inject(ServicoEventoDominio)
    private readonly eventos: ServicoEventoDominio,
  ) {}

  public formularioAtivoNoAtendimento(
    formularioId: unknown,
    atendimentoId: unknown,
    transacao: TransacaoPrisma,
  ): Promise<boolean> {
    if (
      typeof formularioId !== 'string' ||
      !UUID.test(formularioId) ||
      typeof atendimentoId !== 'string' ||
      !UUID.test(atendimentoId)
    ) {
      return Promise.resolve(false);
    }
    return this.repositorio.formularioAtivoNoAtendimento(
      formularioId,
      atendimentoId,
      transacao,
    );
  }

  public async registrarSubmissao(
    mensagemIdRecebido: unknown,
    normalizadaRecebida: unknown,
    transacao: TransacaoPrisma,
  ): Promise<ResultadoRegistroSubmissaoFormulario> {
    const mensagemId = this.validarMensagemId(mensagemIdRecebido);
    const normalizada = this.validarNormalizada(normalizadaRecebida);
    const dadosCanonicos = serializarOrdenado(normalizada.dadosProtegidos);
    if (dadosCanonicos.length > 65_536) {
      throw new Error('SUBMISSAO_FORMULARIO_INVALIDA');
    }
    const dadosHash = createHash('sha256')
      .update(dadosCanonicos, 'utf8')
      .digest('hex');
    await this.repositorio.bloquearSubmissao(
      mensagemId,
      normalizada.formularioReferenciaCanal,
      normalizada.referenciaCanal,
      transacao,
    );
    const porMensagem = await this.repositorio.obterSubmissaoPorMensagem(
      mensagemId,
      transacao,
    );
    if (porMensagem !== undefined) {
      this.confirmarRepeticao(porMensagem, normalizada, dadosHash);
      return { resultado: 'DUPLICADA', submissao: porMensagem };
    }
    const contexto = await this.repositorio.obterContextoSubmissao(
      mensagemId,
      normalizada.formularioReferenciaCanal,
      transacao,
    );
    if (contexto === undefined) {
      throw new Error('CONTEXTO_SUBMISSAO_FORMULARIO_INVALIDO');
    }
    const porReferencia =
      await this.repositorio.obterSubmissaoPorReferencia(
        contexto.formularioId,
        normalizada.referenciaCanal,
        transacao,
      );
    if (porReferencia !== undefined) {
      this.confirmarRepeticao(porReferencia, normalizada, dadosHash);
      if (porReferencia.contatoId !== contexto.contatoId) {
        throw new Error('IDEMPOTENCIA_SUBMISSAO_FORMULARIO_DIVERGENTE');
      }
      return { resultado: 'DUPLICADA', submissao: porReferencia };
    }
    const submissao: SubmissaoFormularioPersistida = {
      contatoId: contexto.contatoId,
      dadosHash,
      dadosProtegidos: structuredClone(normalizada.dadosProtegidos),
      formularioId: contexto.formularioId,
      formularioReferenciaCanal: normalizada.formularioReferenciaCanal,
      id: randomUUID(),
      mensagemId,
      recebidaEm: contexto.recebidaEm,
      referenciaCanal: normalizada.referenciaCanal,
    };
    await this.repositorio.acrescentarSubmissao(submissao, transacao);
    const evento = await this.eventos.acrescentar(
      {
        atendimentoId: contexto.atendimentoId,
        classificacaoDados: 'DADO_SENSIVEL',
        conversaId: contexto.conversaId,
        dados: { formularioId: contexto.formularioId },
        entidadeId: submissao.id,
        entidadeTipo: 'SUBMISSAO_FORMULARIO',
        tipo: 'SUBMISSAO_FORMULARIO_RECEBIDA',
      },
      transacao,
    );
    return {
      resultado: 'PERSISTIDA',
      sequenciaEvento: evento.sequenciaEvento,
      submissao,
    };
  }

  private validarMensagemId(valor: unknown): string {
    if (typeof valor !== 'string' || !UUID.test(valor)) {
      throw new Error('SUBMISSAO_FORMULARIO_INVALIDA');
    }
    return valor;
  }

  private validarNormalizada(valor: unknown): SubmissaoFormularioNormalizada {
    if (
      valor === null ||
      typeof valor !== 'object' ||
      Array.isArray(valor)
    ) {
      throw new Error('SUBMISSAO_FORMULARIO_INVALIDA');
    }
    const entrada = valor as Partial<SubmissaoFormularioNormalizada>;
    if (
      typeof entrada.formularioReferenciaCanal !== 'string' ||
      entrada.formularioReferenciaCanal.trim().length < 1 ||
      entrada.formularioReferenciaCanal.length > 256 ||
      typeof entrada.referenciaCanal !== 'string' ||
      !HASH.test(entrada.referenciaCanal) ||
      !objetoJsonValido(entrada.dadosProtegidos)
    ) {
      throw new Error('SUBMISSAO_FORMULARIO_INVALIDA');
    }
    return {
      dadosProtegidos: entrada.dadosProtegidos,
      formularioReferenciaCanal: entrada.formularioReferenciaCanal,
      referenciaCanal: entrada.referenciaCanal,
    };
  }

  private confirmarRepeticao(
    existente: SubmissaoFormularioPersistida,
    normalizada: SubmissaoFormularioNormalizada,
    dadosHash: string,
  ): void {
    if (
      existente.formularioReferenciaCanal !==
        normalizada.formularioReferenciaCanal ||
      existente.referenciaCanal !== normalizada.referenciaCanal ||
      existente.dadosHash !== dadosHash
    ) {
      throw new Error('IDEMPOTENCIA_SUBMISSAO_FORMULARIO_DIVERGENTE');
    }
  }
}

function objetoJsonValido(
  valor: unknown,
  profundidade = 0,
): valor is SubmissaoFormularioNormalizada['dadosProtegidos'] {
  if (
    valor === null ||
    typeof valor !== 'object' ||
    Array.isArray(valor) ||
    profundidade > 10
  ) {
    return false;
  }
  return Object.values(valor).every((item) => valorJsonValido(item, profundidade + 1));
}

function valorJsonValido(valor: unknown, profundidade: number): boolean {
  if (
    valor === null ||
    typeof valor === 'string' ||
    typeof valor === 'boolean' ||
    (typeof valor === 'number' && Number.isFinite(valor))
  ) {
    return true;
  }
  if (profundidade > 10) return false;
  if (Array.isArray(valor)) {
    return valor.length <= 200 && valor.every((item) => valorJsonValido(item, profundidade + 1));
  }
  return objetoJsonValido(valor, profundidade);
}

function serializarOrdenado(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(serializarOrdenado).join(',')}]`;
  if (valor !== null && typeof valor === 'object') {
    return `{${Object.entries(valor)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chave, item]) => `${JSON.stringify(chave)}:${serializarOrdenado(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(valor);
}
