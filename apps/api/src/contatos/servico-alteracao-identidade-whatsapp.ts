import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import {
  REPOSITORIO_CONTA_WHATSAPP,
  type RepositorioContaWhatsApp,
} from '../contas-whatsapp/repositorio-conta-whatsapp.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroAlteracaoIdentidadeInvalida,
  ErroContaWhatsAppIndisponivel,
} from './erros-contato.js';
import type {
  EntradaAlteracaoIdentidadeWhatsApp,
  IdentidadeWhatsAppPersistida,
  ResultadoProcessamentoAlteracaoIdentidadeWhatsApp,
} from './modelo-contato.js';
import {
  REPOSITORIO_CONTATOS,
  type RepositorioContatos,
} from './repositorio-contatos.js';
import { ServicoIdentidadeWhatsApp } from './servico-identidade-whatsapp.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const E164 = /^\+[1-9][0-9]{7,14}$/u;

function textoOpcional(valor: unknown, limite: number): valor is string | undefined {
  return valor === undefined || (typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= limite);
}

@Injectable()
export class ServicoAlteracaoIdentidadeWhatsApp {
  public constructor(
    @Inject(REPOSITORIO_CONTATOS)
    private readonly contatos: RepositorioContatos,
    @Inject(REPOSITORIO_CONTA_WHATSAPP)
    private readonly contas: RepositorioContaWhatsApp,
    @Inject(ServicoIdentidadeWhatsApp)
    private readonly resolucao: ServicoIdentidadeWhatsApp,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async processar(
    entradaBruta: EntradaAlteracaoIdentidadeWhatsApp,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoProcessamentoAlteracaoIdentidadeWhatsApp> {
    this.validar(entradaBruta);
    const entrada = this.normalizar(entradaBruta);
    const conta = await this.contas.obterPorId(entrada.contaWhatsAppId, transacao);
    if (conta === undefined || conta.estado !== 'ATIVA') {
      throw new ErroContaWhatsAppIndisponivel();
    }
    const agora = relogio();
    if (Number.isNaN(agora.getTime())) throw new ErroAlteracaoIdentidadeInvalida();
    const chaves = [
      entrada.identificadorExternoAnterior,
      entrada.identificadorExternoAtual,
    ].sort();
    for (const chave of chaves) {
      await this.contatos.bloquearIdentidade(
        conta.portfolioEmpresarialExternoId,
        chave,
        transacao,
      );
    }
    const anterior = await this.contatos.obterPorIdentificadorEstavel(
      conta.portfolioEmpresarialExternoId,
      entrada.identificadorExternoAnterior,
      transacao,
    );
    const atual = await this.contatos.obterPorIdentificadorEstavel(
      conta.portfolioEmpresarialExternoId,
      entrada.identificadorExternoAtual,
      transacao,
    );

    if (
      anterior !== undefined &&
      anterior.identidade.identificadorExternoEstavel ===
        entrada.identificadorExternoAtual &&
      atual?.identidade.id === anterior.identidade.id
    ) {
      return { ...anterior, eventoCriado: false, resultado: 'PRESERVADA' };
    }

    if (
      anterior !== undefined &&
      anterior.identidade.identificadorExternoEstavel ===
        entrada.identificadorExternoAnterior &&
      (atual === undefined || atual.identidade.id === anterior.identidade.id)
    ) {
      const eventoId = randomUUID();
      await this.contatos.alterarIdentificadorConfirmado(
        anterior.identidade,
        entrada,
        conta.portfolioEmpresarialExternoId,
        eventoId,
        agora,
        transacao,
      );
      const identidade = this.aplicarObservacao(anterior.identidade, entrada, agora);
      await this.auditar(
        'IDENTIDADE_WHATSAPP_ALTERADA',
        'PRESERVADA',
        eventoId,
        anterior.contato.id,
        transacao,
      );
      return {
        contato: anterior.contato,
        eventoCriado: true,
        identidade,
        resultado: 'PRESERVADA',
      };
    }

    const destino =
      atual ??
      (await this.resolucao.resolver(
        {
          contaWhatsAppId: entrada.contaWhatsAppId,
          identificadorExternoEstavel: entrada.identificadorExternoAtual,
          ...(entrada.nomePerfilAtual === undefined
            ? {}
            : { nomePerfil: entrada.nomePerfilAtual }),
          ...(entrada.nomeUsuarioAtual === undefined
            ? {}
            : { nomeUsuario: entrada.nomeUsuarioAtual }),
          ...(entrada.telefoneE164Atual === undefined
            ? {}
            : { telefoneE164: entrada.telefoneE164Atual }),
        },
        transacao,
        () => agora,
      ));
    const eventoId = randomUUID();
    const eventoCriado = await this.contatos.registrarEventoAlteracao(
      destino.identidade.id,
      entrada,
      conta.portfolioEmpresarialExternoId,
      'SEPARADA_INCERTA',
      eventoId,
      agora,
      transacao,
    );
    if (eventoCriado) {
      await this.auditar(
        'ALTERACAO_IDENTIDADE_INCERTA',
        'SEPARADA_INCERTA',
        eventoId,
        destino.contato.id,
        transacao,
      );
    }
    return { ...destino, eventoCriado, resultado: 'SEPARADA_INCERTA' };
  }

  private aplicarObservacao(
    identidade: IdentidadeWhatsAppPersistida,
    entrada: EntradaAlteracaoIdentidadeWhatsApp,
    agora: Date,
  ): IdentidadeWhatsAppPersistida {
    return {
      ...identidade,
      atualizadaEm: agora,
      contaWhatsAppUltimaObservacaoId: entrada.contaWhatsAppId,
      identificadorExternoEstavel: entrada.identificadorExternoAtual,
      ...(entrada.nomePerfilAtual === undefined
        ? {}
        : { nomePerfil: entrada.nomePerfilAtual }),
      ...(entrada.nomeUsuarioAtual === undefined
        ? {}
        : { nomeUsuario: entrada.nomeUsuarioAtual }),
      ...(entrada.telefoneE164Atual === undefined
        ? {}
        : { telefoneE164: entrada.telefoneE164Atual }),
    };
  }

  private async auditar(
    tipoEvento: string,
    resultado: 'PRESERVADA' | 'SEPARADA_INCERTA',
    eventoId: string,
    contatoId: string,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    await this.auditoria.registrar(
      {
        acao: 'PROCESSAR_ALTERACAO_IDENTIDADE_WHATSAPP',
        contatoId,
        dadosNovos: { resultado },
        entidadeId: eventoId,
        entidadeTipo: 'EVENTO_ALTERACAO_IDENTIDADE_WHATSAPP',
        origem: 'INTEGRACAO',
        tipoEvento,
      },
      transacao,
    );
  }

  private normalizar(
    entrada: EntradaAlteracaoIdentidadeWhatsApp,
  ): EntradaAlteracaoIdentidadeWhatsApp {
    return {
      contaWhatsAppId: entrada.contaWhatsAppId,
      identificadorExternoAnterior:
        entrada.identificadorExternoAnterior.trim(),
      identificadorExternoAtual: entrada.identificadorExternoAtual.trim(),
      ...(entrada.nomePerfilAtual === undefined
        ? {}
        : { nomePerfilAtual: entrada.nomePerfilAtual.trim() }),
      ...(entrada.nomeUsuarioAtual === undefined
        ? {}
        : { nomeUsuarioAtual: entrada.nomeUsuarioAtual.trim() }),
      ...(entrada.telefoneE164Atual === undefined
        ? {}
        : { telefoneE164Atual: entrada.telefoneE164Atual }),
    };
  }

  private validar(entrada: EntradaAlteracaoIdentidadeWhatsApp): void {
    const anterior = entrada.identificadorExternoAnterior?.trim();
    const atual = entrada.identificadorExternoAtual?.trim();
    if (
      !UUID.test(entrada.contaWhatsAppId) ||
      anterior === undefined ||
      anterior.length === 0 ||
      anterior.length > 256 ||
      atual === undefined ||
      atual.length === 0 ||
      atual.length > 256 ||
      anterior === atual ||
      !textoOpcional(entrada.nomeUsuarioAtual, 100) ||
      !textoOpcional(entrada.nomePerfilAtual, 200) ||
      (entrada.telefoneE164Atual !== undefined &&
        !E164.test(entrada.telefoneE164Atual))
    ) {
      throw new ErroAlteracaoIdentidadeInvalida();
    }
  }
}
