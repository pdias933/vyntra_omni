import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import {
  REPOSITORIO_CONTA_WHATSAPP,
  type RepositorioContaWhatsApp,
} from '../contas-whatsapp/repositorio-conta-whatsapp.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroContaWhatsAppIndisponivel,
  ErroObservacaoIdentidadeInvalida,
} from './erros-contato.js';
import type {
  EntradaObservacaoIdentidadeWhatsApp,
  ResultadoResolucaoIdentidadeWhatsApp,
} from './modelo-contato.js';
import {
  REPOSITORIO_CONTATOS,
  type RepositorioContatos,
} from './repositorio-contatos.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const E164 = /^\+[1-9][0-9]{7,14}$/u;

function opcional(valor: unknown, limite: number): valor is string | undefined {
  return valor === undefined || (typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= limite);
}

@Injectable()
export class ServicoIdentidadeWhatsApp {
  public constructor(
    @Inject(REPOSITORIO_CONTATOS)
    private readonly contatos: RepositorioContatos,
    @Inject(REPOSITORIO_CONTA_WHATSAPP)
    private readonly contas: RepositorioContaWhatsApp,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async resolver(
    entrada: EntradaObservacaoIdentidadeWhatsApp,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoResolucaoIdentidadeWhatsApp> {
    this.validar(entrada);
    const conta = await this.contas.obterPorId(entrada.contaWhatsAppId, transacao);
    if (conta === undefined || conta.estado !== 'ATIVA') {
      throw new ErroContaWhatsAppIndisponivel();
    }
    const identificador = entrada.identificadorExternoEstavel.trim();
    await this.contatos.bloquearIdentidade(
      conta.portfolioEmpresarialExternoId,
      identificador,
      transacao,
    );
    const existente = await this.contatos.obterPorIdentificadorEstavel(
      conta.portfolioEmpresarialExternoId,
      identificador,
      transacao,
    );
    if (existente !== undefined) return { ...existente, criada: false };

    const agora = relogio();
    if (Number.isNaN(agora.getTime())) throw new ErroObservacaoIdentidadeInvalida();
    const contatoId = randomUUID();
    const nomePerfil = entrada.nomePerfil?.trim();
    const nomeUsuario = entrada.nomeUsuario?.trim();
    const contato = {
      atualizadoEm: agora,
      criadoEm: agora,
      estado: 'NORMAL' as const,
      id: contatoId,
      ...(nomePerfil === undefined
        ? nomeUsuario === undefined
          ? {}
          : { nomeExibicao: nomeUsuario }
        : { nomeExibicao: nomePerfil }),
    };
    const identidade = {
      atualizadaEm: agora,
      contaWhatsAppUltimaObservacaoId: conta.id,
      contatoId,
      criadaEm: agora,
      id: randomUUID(),
      identificadorExternoEstavel: identificador,
      portfolioEmpresarialExternoId: conta.portfolioEmpresarialExternoId,
      ...(nomePerfil === undefined ? {} : { nomePerfil }),
      ...(nomeUsuario === undefined ? {} : { nomeUsuario }),
      ...(entrada.telefoneE164 === undefined
        ? {}
        : { telefoneE164: entrada.telefoneE164 }),
    };
    await this.contatos.criar(contato, identidade, transacao);
    await this.auditoria.registrar(
      {
        acao: 'RESOLVER_IDENTIDADE_WHATSAPP',
        contatoId,
        dadosNovos: {
          possuiNomePerfil: nomePerfil !== undefined,
          possuiNomeUsuario: nomeUsuario !== undefined,
          possuiTelefone: entrada.telefoneE164 !== undefined,
        },
        entidadeId: identidade.id,
        entidadeTipo: 'IDENTIDADE_WHATSAPP',
        origem: 'INTEGRACAO',
        tipoEvento: 'IDENTIDADE_WHATSAPP_CRIADA',
      },
      transacao,
    );
    return { contato, criada: true, identidade };
  }

  private validar(entrada: EntradaObservacaoIdentidadeWhatsApp): void {
    if (
      !UUID.test(entrada.contaWhatsAppId) ||
      typeof entrada.identificadorExternoEstavel !== 'string' ||
      entrada.identificadorExternoEstavel.trim().length === 0 ||
      entrada.identificadorExternoEstavel.trim().length > 256 ||
      !opcional(entrada.nomeUsuario, 100) ||
      !opcional(entrada.nomePerfil, 200) ||
      (entrada.telefoneE164 !== undefined &&
        (typeof entrada.telefoneE164 !== 'string' || !E164.test(entrada.telefoneE164)))
    ) {
      throw new ErroObservacaoIdentidadeInvalida();
    }
  }
}
