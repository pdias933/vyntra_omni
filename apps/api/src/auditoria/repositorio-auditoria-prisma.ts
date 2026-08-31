import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../gerado/prisma/client.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { RegistroAuditoria } from './modelo-auditoria.js';
import type { RepositorioAuditoria } from './repositorio-auditoria.js';

@Injectable()
export class RepositorioAuditoriaPrisma implements RepositorioAuditoria {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
  ) {}

  public async acrescentar(registro: RegistroAuditoria): Promise<void> {
    const cliente = await this.prisma.obterCliente();

    await cliente.registroAuditoria.create({
      data: {
        acao: registro.acao,
        atendimentoId: registro.atendimentoId ?? null,
        contatoId: registro.contatoId ?? null,
        correlacaoId: registro.correlacaoId,
        criadoEm: registro.criadoEm,
        dadosAnterioresSanitizados:
          registro.dadosAnterioresSanitizados ?? Prisma.DbNull,
        dadosNovosSanitizados:
          registro.dadosNovosSanitizados ?? Prisma.DbNull,
        dispositivoId: registro.dispositivoId ?? null,
        enderecoIp: registro.enderecoIp ?? null,
        entidadeId: registro.entidadeId ?? null,
        entidadeTipo: registro.entidadeTipo ?? null,
        filaId: registro.filaId ?? null,
        fluxoId: registro.fluxoId ?? null,
        id: registro.id,
        origem: registro.origem,
        sessaoId: registro.sessaoId ?? null,
        tipoEvento: registro.tipoEvento,
        usuarioId: registro.usuarioId ?? null,
        versaoFluxoId: registro.versaoFluxoId ?? null,
      },
      select: { id: true },
    });
  }
}
