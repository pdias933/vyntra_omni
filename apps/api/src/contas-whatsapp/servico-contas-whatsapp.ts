import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroContaWhatsAppDuplicada,
  ErroContaWhatsAppInvalida,
} from './erros-conta-whatsapp.js';
import type {
  ContaWhatsAppPersistida,
  EntradaCadastroContaWhatsApp,
} from './modelo-conta-whatsapp.js';
import {
  REPOSITORIO_CONTA_WHATSAPP,
  type RepositorioContaWhatsApp,
} from './repositorio-conta-whatsapp.js';

const E164 = /^\+[1-9][0-9]{7,14}$/u;
const RECURSO_ADMINISTRACAO_CONTAS =
  '11111111-1111-4111-8111-111111111122';

function textoValido(valor: unknown, limite: number): valor is string {
  return (
    typeof valor === 'string' &&
    valor.trim().length > 0 &&
    valor.trim().length <= limite
  );
}

@Injectable()
export class ServicoContasWhatsApp {
  public constructor(
    @Inject(REPOSITORIO_CONTA_WHATSAPP)
    private readonly repositorio: RepositorioContaWhatsApp,
    @Inject(ServicoAutorizacao)
    private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAuditoria)
    private readonly auditoria: ServicoAuditoria,
  ) {}

  public async cadastrar(
    sessao: ContextoSessaoAutorizacao,
    entrada: EntradaCadastroContaWhatsApp,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ContaWhatsAppPersistida> {
    this.validarEntrada(entrada);
    await this.autorizacao.autorizar(
      {
        permissao: 'ADMINISTRAR_INTEGRACOES',
        recurso: {
          id: RECURSO_ADMINISTRACAO_CONTAS,
          tipo: 'ADMINISTRACAO_CONTAS_WHATSAPP',
        },
        sessao,
      },
      async () => ({ acessivel: true, estadoPermiteAcao: true }),
      transacao,
    );

    const agora = relogio();
    if (Number.isNaN(agora.getTime())) throw new ErroContaWhatsAppInvalida();
    const conta: ContaWhatsAppPersistida = {
      atualizadaEm: agora,
      criadaEm: agora,
      estado: 'INATIVA',
      id: randomUUID(),
      identificadorCanalExterno: entrada.identificadorCanalExterno.trim(),
      nomeExibicao: entrada.nomeExibicao.trim(),
      portfolioEmpresarialExternoId:
        entrada.portfolioEmpresarialExternoId.trim(),
      versao: 1,
      ...(entrada.telefoneExibicaoE164 === undefined
        ? {}
        : { telefoneExibicaoE164: entrada.telefoneExibicaoE164 }),
    };
    if (!(await this.repositorio.criar(conta, transacao))) {
      throw new ErroContaWhatsAppDuplicada();
    }
    await this.auditoria.registrar(
      {
        acao: 'CADASTRAR_CONTA_WHATSAPP',
        dadosNovos: {
          estado: conta.estado,
          possuiTelefoneExibicao: conta.telefoneExibicaoE164 !== undefined,
          versao: conta.versao,
        },
        entidadeId: conta.id,
        entidadeTipo: 'CONTA_WHATSAPP',
        origem: 'USUARIO',
        sessaoId: sessao.sessaoId,
        tipoEvento: 'CONTA_WHATSAPP_CADASTRADA',
        usuarioId: sessao.usuarioId,
      },
      transacao,
    );
    return conta;
  }

  private validarEntrada(entrada: EntradaCadastroContaWhatsApp): void {
    if (
      !textoValido(entrada.nomeExibicao, 100) ||
      !textoValido(entrada.portfolioEmpresarialExternoId, 256) ||
      !textoValido(entrada.identificadorCanalExterno, 256) ||
      (entrada.telefoneExibicaoE164 !== undefined &&
        (typeof entrada.telefoneExibicaoE164 !== 'string' ||
          !E164.test(entrada.telefoneExibicaoE164)))
    ) {
      throw new ErroContaWhatsAppInvalida();
    }
  }
}
