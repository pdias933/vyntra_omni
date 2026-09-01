import { Inject, Injectable } from '@nestjs/common';

import type {
  ResultadoCriacaoAtendimentoErp,
  ResultadoReconciliacaoAtendimentoErp,
} from '../erp/modelo-erp.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import {
  ErroAtendimentoProtocoloAusente,
  ErroConflitoProtocoloErp,
  ErroProtocoloErpInvalido,
} from './erros-protocolo-erp.js';
import type { ProtocoloErpPersistido } from './modelo-protocolo-erp.js';
import {
  REPOSITORIO_PROTOCOLOS_ERP,
  type RepositorioProtocolosErp,
} from './repositorio-protocolos-erp.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type ResultadoProtocoloErp =
  | ResultadoCriacaoAtendimentoErp
  | ResultadoReconciliacaoAtendimentoErp;

@Injectable()
export class ServicoProtocolosErp {
  public constructor(
    @Inject(REPOSITORIO_PROTOCOLOS_ERP)
    private readonly repositorio: RepositorioProtocolosErp,
  ) {}

  public async inicializarPendente(
    atendimentoId: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ProtocoloErpPersistido> {
    const agora = relogio();
    this.validarIdentificadorEData(atendimentoId, agora);
    const existente = await this.repositorio.obter(atendimentoId, transacao);
    if (existente !== undefined) return existente;
    if (!(await this.repositorio.atendimentoExiste(atendimentoId, transacao))) {
      throw new ErroAtendimentoProtocoloAusente();
    }
    const pendente: ProtocoloErpPersistido = {
      atendimentoId,
      atualizadoEm: agora,
      criadoEm: agora,
      estado: 'PENDENTE',
      versao: 1,
    };
    if (!(await this.repositorio.criarPendente(pendente, transacao))) {
      const concorrente = await this.repositorio.obter(atendimentoId, transacao);
      if (concorrente !== undefined) return concorrente;
      throw new ErroConflitoProtocoloErp();
    }
    return pendente;
  }

  public async aplicarResultado(
    atendimentoId: string,
    resultado: ResultadoProtocoloErp,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ProtocoloErpPersistido> {
    const agora = relogio();
    this.validarIdentificadorEData(atendimentoId, agora);
    const atual = await this.repositorio.obter(atendimentoId, transacao);
    if (atual === undefined) throw new ErroAtendimentoProtocoloAusente();
    if (resultado.resultado !== 'CONFIRMADO') return atual;

    const protocoloOficial = resultado.protocoloOficial.trim();
    if (
      protocoloOficial.length < 1 ||
      protocoloOficial.length > 256 ||
      protocoloOficial === atendimentoId ||
      protocoloOficial === 'PENDENTE' ||
      Number.isNaN(resultado.confirmadoEm.getTime()) ||
      resultado.confirmadoEm < atual.criadoEm ||
      resultado.confirmadoEm > agora
    ) {
      throw new ErroProtocoloErpInvalido();
    }
    if (atual.estado === 'OFICIAL') {
      if (atual.protocoloOficial === protocoloOficial) return atual;
      throw new ErroConflitoProtocoloErp();
    }
    const oficial: ProtocoloErpPersistido = {
      ...atual,
      atualizadoEm: agora,
      confirmadoEm: resultado.confirmadoEm,
      estado: 'OFICIAL',
      protocoloOficial,
      versao: atual.versao + 1,
    };
    if (
      !(await this.repositorio.confirmar(oficial, atual.versao, transacao))
    ) {
      throw new ErroConflitoProtocoloErp();
    }
    return oficial;
  }

  private validarIdentificadorEData(atendimentoId: string, data: Date): void {
    if (!UUID.test(atendimentoId) || Number.isNaN(data.getTime())) {
      throw new ErroProtocoloErpInvalido();
    }
  }
}

