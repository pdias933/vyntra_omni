import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type {
  ObjetoJsonProtegido,
  ValorJsonProtegido,
} from '../seguranca/modelo-dados-protegidos.js';
import {
  ErroConflitoSnapshotCliente,
  ErroSnapshotClienteInvalido,
  ErroVinculoSnapshotIndisponivel,
} from './erros-snapshot-cliente.js';
import type {
  EntradaAtualizacaoSnapshotCliente,
  EntradaObsolescenciaSnapshotCliente,
  LeituraSnapshotCliente,
  ResultadoAtualizacaoSnapshotCliente,
  ResultadoObsolescenciaSnapshotCliente,
  SnapshotClientePersistido,
} from './modelo-snapshot-cliente.js';
import {
  REPOSITORIO_SNAPSHOTS_CLIENTE,
  type RepositorioSnapshotsCliente,
} from './repositorio-snapshots-cliente.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CAMPO_MASCARADO = /[*•Xx]/u;
const SITUACOES_CONTRATO = new Set([
  'ATIVO',
  'ENCERRADO',
  'SUSPENSO',
  'DESCONHECIDO',
]);
const CHAVES_DADOS = new Set([
  'nomeExibicao',
  'documentoMascarado',
  'telefoneMascarado',
  'plano',
  'velocidade',
  'enderecosResumidos',
  'contratosConhecidos',
]);
const CHAVES_CONTRATO = new Set([
  'vinculoContratoId',
  'situacao',
  'servico',
  'enderecoResumido',
]);

@Injectable()
export class ServicoSnapshotsCliente {
  public constructor(
    @Inject(REPOSITORIO_SNAPSHOTS_CLIENTE)
    private readonly repositorio: RepositorioSnapshotsCliente,
  ) {}

  public async atualizar(
    entrada: EntradaAtualizacaoSnapshotCliente,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoAtualizacaoSnapshotCliente> {
    if (!UUID.test(entrada.vinculoClienteId)) {
      throw new ErroSnapshotClienteInvalido();
    }
    const agora = relogio();
    if (
      !(entrada.capturadoEm instanceof Date) ||
      Number.isNaN(entrada.capturadoEm.getTime()) ||
      Number.isNaN(agora.getTime()) ||
      entrada.capturadoEm > agora
    ) {
      throw new ErroSnapshotClienteInvalido();
    }
    const dadosProtegidos = this.normalizarDados(entrada.dados);
    const conteudoHash = createHash('sha256')
      .update(JSON.stringify(dadosProtegidos))
      .digest('hex');

    await this.repositorio.bloquearVinculo(
      entrada.vinculoClienteId,
      transacao,
    );
    if (
      !(await this.repositorio.vinculoEstaAtivo(
        entrada.vinculoClienteId,
        transacao,
      ))
    ) {
      throw new ErroVinculoSnapshotIndisponivel();
    }
    const existente = await this.repositorio.obterPorVinculo(
      entrada.vinculoClienteId,
      transacao,
    );
    if (existente === undefined) {
      const snapshot = this.novoSnapshot(
        entrada,
        dadosProtegidos,
        conteudoHash,
        agora,
      );
      await this.repositorio.criar(snapshot, transacao);
      return { situacao: 'ATUALIZADO', snapshot };
    }
    if (agora < existente.atualizadoEm) {
      throw new ErroSnapshotClienteInvalido();
    }
    if (
      existente.obsoletoEm !== undefined &&
      entrada.capturadoEm <= existente.obsoletoEm
    ) {
      return { situacao: 'IGNORADO_MAIS_ANTIGO', snapshot: existente };
    }
    if (entrada.capturadoEm < existente.capturadoEm) {
      return { situacao: 'IGNORADO_MAIS_ANTIGO', snapshot: existente };
    }
    if (entrada.capturadoEm.getTime() === existente.capturadoEm.getTime()) {
      if (conteudoHash !== existente.conteudoHash) {
        throw new ErroConflitoSnapshotCliente();
      }
      if (existente.estado === 'ATUAL') {
        return { situacao: 'REPETIDO', snapshot: existente };
      }
    }

    const snapshot: SnapshotClientePersistido = {
      atualizadoEm: agora,
      capturadoEm: entrada.capturadoEm,
      conteudoHash,
      dadosProtegidos,
      estado: 'ATUAL',
      id: existente.id,
      origem: existente.origem,
      persistidoEm: existente.persistidoEm,
      versao: existente.versao + 1,
      vinculoClienteId: existente.vinculoClienteId,
    };
    await this.persistirAtualizacao(snapshot, existente.versao, transacao);
    return { situacao: 'ATUALIZADO', snapshot };
  }

  public async marcarObsolescencia(
    entrada: EntradaObsolescenciaSnapshotCliente,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<ResultadoObsolescenciaSnapshotCliente> {
    const agora = relogio();
    if (
      !UUID.test(entrada.vinculoClienteId) ||
      !(entrada.evidenciadaEm instanceof Date) ||
      Number.isNaN(entrada.evidenciadaEm.getTime()) ||
      Number.isNaN(agora.getTime()) ||
      entrada.evidenciadaEm > agora ||
      !['AUSENTE_RECONCILIACAO_COMPLETA', 'TOMBSTONE_ERP'].includes(
        entrada.motivo,
      )
    ) {
      throw new ErroSnapshotClienteInvalido();
    }
    await this.repositorio.bloquearVinculo(
      entrada.vinculoClienteId,
      transacao,
    );
    const existente = await this.repositorio.obterPorVinculo(
      entrada.vinculoClienteId,
      transacao,
    );
    if (existente === undefined) return { situacao: 'IGNORADO_SEM_SNAPSHOT' };
    if (agora < existente.atualizadoEm) {
      throw new ErroSnapshotClienteInvalido();
    }
    if (
      entrada.evidenciadaEm < existente.capturadoEm ||
      (existente.obsoletoEm !== undefined &&
        entrada.evidenciadaEm < existente.obsoletoEm)
    ) {
      return { situacao: 'IGNORADO_MAIS_ANTIGO', snapshot: existente };
    }
    const estado =
      entrada.motivo === 'TOMBSTONE_ERP' ? 'EXCLUIDO' : 'OBSOLETO';
    if (
      existente.estado === estado &&
      existente.motivoObsolescencia === entrada.motivo &&
      existente.obsoletoEm?.getTime() === entrada.evidenciadaEm.getTime()
    ) {
      return { situacao: 'REPETIDO', snapshot: existente };
    }
    if (
      existente.estado === 'EXCLUIDO' &&
      entrada.motivo === 'AUSENTE_RECONCILIACAO_COMPLETA'
    ) {
      return { situacao: 'REPETIDO', snapshot: existente };
    }
    const snapshot: SnapshotClientePersistido = {
      ...existente,
      atualizadoEm: agora,
      estado,
      motivoObsolescencia: entrada.motivo,
      obsoletoEm: entrada.evidenciadaEm,
      versao: existente.versao + 1,
    };
    await this.persistirAtualizacao(snapshot, existente.versao, transacao);
    return { situacao: 'ATUALIZADO', snapshot };
  }

  public async consultar(
    vinculoClienteId: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<LeituraSnapshotCliente | undefined> {
    if (!UUID.test(vinculoClienteId)) {
      throw new ErroSnapshotClienteInvalido();
    }
    if (!(await this.repositorio.vinculoEstaAtivo(vinculoClienteId, transacao))) {
      return undefined;
    }
    const snapshot = await this.repositorio.obterPorVinculo(
      vinculoClienteId,
      transacao,
    );
    if (snapshot === undefined) return undefined;
    const agora = relogio();
    if (
      Number.isNaN(agora.getTime()) ||
      agora < snapshot.capturadoEm
    ) {
      throw new ErroSnapshotClienteInvalido();
    }
    return {
      capturadoEm: snapshot.capturadoEm,
      dadosProtegidos: snapshot.dadosProtegidos,
      estado: snapshot.estado,
      idadeSegundos: Math.floor(
        (agora.getTime() - snapshot.capturadoEm.getTime()) / 1_000,
      ),
      origem: 'SNAPSHOT',
      origemAtualizacao: snapshot.origem,
      ...(snapshot.motivoObsolescencia === undefined
        ? {}
        : { motivoObsolescencia: snapshot.motivoObsolescencia }),
      ...(snapshot.obsoletoEm === undefined
        ? {}
        : { obsoletoEm: snapshot.obsoletoEm }),
      versao: snapshot.versao,
      vinculoClienteId,
    };
  }

  private novoSnapshot(
    entrada: EntradaAtualizacaoSnapshotCliente,
    dadosProtegidos: ObjetoJsonProtegido,
    conteudoHash: string,
    agora: Date,
  ): SnapshotClientePersistido {
    return {
      atualizadoEm: agora,
      capturadoEm: entrada.capturadoEm,
      conteudoHash,
      dadosProtegidos,
      estado: 'ATUAL',
      id: randomUUID(),
      origem: 'INTEGRACAO_ERP',
      persistidoEm: agora,
      versao: 1,
      vinculoClienteId: entrada.vinculoClienteId,
    };
  }

  private async persistirAtualizacao(
    snapshot: SnapshotClientePersistido,
    versaoEsperada: number,
    transacao: TransacaoPrisma,
  ): Promise<void> {
    if (
      !(await this.repositorio.atualizar(
        snapshot,
        versaoEsperada,
        transacao,
      ))
    ) {
      throw new ErroConflitoSnapshotCliente();
    }
  }

  private normalizarDados(dados: unknown): ObjetoJsonProtegido {
    if (!this.ehRegistro(dados)) throw new ErroSnapshotClienteInvalido();
    if (Object.keys(dados).some((chave) => !CHAVES_DADOS.has(chave))) {
      throw new ErroSnapshotClienteInvalido();
    }
    const resultado: ObjetoJsonProtegido = {};
    this.adicionarTexto(resultado, 'nomeExibicao', dados.nomeExibicao, 200);
    this.adicionarMascarado(
      resultado,
      'documentoMascarado',
      dados.documentoMascarado,
      40,
    );
    this.adicionarMascarado(
      resultado,
      'telefoneMascarado',
      dados.telefoneMascarado,
      40,
    );
    this.adicionarTexto(resultado, 'plano', dados.plano, 160);
    this.adicionarTexto(resultado, 'velocidade', dados.velocidade, 100);
    if (dados.enderecosResumidos !== undefined) {
      if (
        !Array.isArray(dados.enderecosResumidos) ||
        dados.enderecosResumidos.length > 10
      ) {
        throw new ErroSnapshotClienteInvalido();
      }
      const enderecos = dados.enderecosResumidos.map((valor) =>
        this.textoObrigatorio(valor, 256),
      );
      resultado.enderecosResumidos = [...new Set(enderecos)].sort();
    }
    if (dados.contratosConhecidos !== undefined) {
      resultado.contratosConhecidos = this.normalizarContratos(
        dados.contratosConhecidos,
      );
    }
    if (Object.keys(resultado).length === 0) {
      throw new ErroSnapshotClienteInvalido();
    }
    return resultado;
  }

  private normalizarContratos(valor: unknown): ValorJsonProtegido[] {
    if (!Array.isArray(valor) || valor.length > 20) {
      throw new ErroSnapshotClienteInvalido();
    }
    const ids = new Set<string>();
    const contratos = valor.map((item): ObjetoJsonProtegido => {
      if (
        !this.ehRegistro(item) ||
        Object.keys(item).some((chave) => !CHAVES_CONTRATO.has(chave)) ||
        typeof item.vinculoContratoId !== 'string' ||
        !UUID.test(item.vinculoContratoId) ||
        typeof item.situacao !== 'string' ||
        !SITUACOES_CONTRATO.has(item.situacao) ||
        ids.has(item.vinculoContratoId)
      ) {
        throw new ErroSnapshotClienteInvalido();
      }
      ids.add(item.vinculoContratoId);
      const contrato: ObjetoJsonProtegido = {
        situacao: item.situacao,
        vinculoContratoId: item.vinculoContratoId,
      };
      this.adicionarTexto(contrato, 'servico', item.servico, 160);
      this.adicionarTexto(
        contrato,
        'enderecoResumido',
        item.enderecoResumido,
        256,
      );
      return contrato;
    });
    return contratos.sort((a, b) =>
      String(a.vinculoContratoId).localeCompare(String(b.vinculoContratoId)),
    );
  }

  private adicionarTexto(
    destino: ObjetoJsonProtegido,
    chave: string,
    valor: unknown,
    limite: number,
  ): void {
    if (valor !== undefined) destino[chave] = this.textoObrigatorio(valor, limite);
  }

  private adicionarMascarado(
    destino: ObjetoJsonProtegido,
    chave: string,
    valor: unknown,
    limite: number,
  ): void {
    if (valor === undefined) return;
    const texto = this.textoObrigatorio(valor, limite);
    const mascaras = texto.match(/[*•Xx]/gu)?.length ?? 0;
    const digitosVisiveis = texto.match(/[0-9]/gu)?.length ?? 0;
    if (
      !CAMPO_MASCARADO.test(texto) ||
      mascaras < 3 ||
      digitosVisiveis > 6
    ) {
      throw new ErroSnapshotClienteInvalido();
    }
    destino[chave] = texto;
  }

  private textoObrigatorio(valor: unknown, limite: number): string {
    if (
      typeof valor !== 'string' ||
      valor.trim().length === 0 ||
      valor.trim().length > limite
    ) {
      throw new ErroSnapshotClienteInvalido();
    }
    return valor.trim();
  }

  private ehRegistro(valor: unknown): valor is Record<string, unknown> {
    return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
  }
}
