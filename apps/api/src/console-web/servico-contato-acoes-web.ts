import { Inject, Injectable, Optional } from '@nestjs/common';

import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import type { CodigoPermissaoAutorizacao, ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ServicoContextosCliente } from '../contextos-cliente/servico-contextos-cliente.js';
import { ServicoElegibilidadeDesbloqueioConfianca } from '../desbloqueios-confianca/servico-elegibilidade-desbloqueio-confianca.js';
import { ServicoExecucaoDesbloqueioConfianca } from '../desbloqueios-confianca/servico-execucao-desbloqueio-confianca.js';
import { ADAPTADOR_ERP, type AdaptadorErp } from '../erp/adaptador-erp.js';
import { ServicoFinanceiroErp } from '../erp/servico-financeiro-erp.js';
import { ServicoOrdensServicoErp } from '../ordens-servico/servico-ordens-servico.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ServicoSnapshotsCliente } from '../snapshots-cliente/servico-snapshots-cliente.js';
import type { AcaoErpWeb, DetalhesContatoWeb, PreviaAcaoErpWeb, ResultadoFinanceiroContatoWeb } from './modelo-console-web.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoContatoAcoesWeb {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoContextosCliente) private readonly contextos: ServicoContextosCliente,
    @Inject(ServicoSnapshotsCliente) private readonly snapshots: ServicoSnapshotsCliente,
    @Inject(ServicoElegibilidadeDesbloqueioConfianca) private readonly elegibilidade: ServicoElegibilidadeDesbloqueioConfianca,
    @Inject(ServicoExecucaoDesbloqueioConfianca) private readonly desbloqueios: ServicoExecucaoDesbloqueioConfianca,
    @Inject(ServicoOrdensServicoErp) private readonly ordens: ServicoOrdensServicoErp,
    @Optional() @Inject(ADAPTADOR_ERP) private readonly adaptador?: AdaptadorErp,
  ) {}

  public async obterDetalhes(sessao: ContextoSessaoAutorizacao, atendimentoId: string): Promise<DetalhesContatoWeb> {
    return this.prisma.executarLeituraConsistente(async (transacao) => {
      const escopo = await this.autorizarAtendimento(sessao, atendimentoId, 'VISUALIZAR_FILA', transacao);
      const permissoes = {
        alterarContexto: await this.temPermissao(sessao, atendimentoId, escopo.filaId, 'ALTERAR_CONTEXTO_CLIENTE', transacao),
        consultarCliente: await this.temPermissao(sessao, atendimentoId, escopo.filaId, 'CONSULTAR_CLIENTE', transacao),
        consultarContrato: await this.temPermissao(sessao, atendimentoId, escopo.filaId, 'CONSULTAR_CONTRATO', transacao),
        consultarFinanceiro: await this.temPermissao(sessao, atendimentoId, escopo.filaId, 'CONSULTAR_FINANCEIRO', transacao),
        criarOrdemServico: await this.temPermissao(sessao, atendimentoId, escopo.filaId, 'CRIAR_ORDEM_SERVICO', transacao),
        executarDesbloqueio: await this.temPermissao(sessao, atendimentoId, escopo.filaId, 'EXECUTAR_DESBLOQUEIO_CONFIANCA', transacao),
      };
      const podeVerSensivel = await this.temPermissao(sessao, atendimentoId, undefined, 'VISUALIZAR_DADO_SENSIVEL', transacao);
      const contato = await transacao.contato.findUnique({
        select: {
          estado: true,
          id: true,
          identidadesWhatsApp: { orderBy: { atualizadaEm: 'desc' }, select: { identificadorExternoEstavel: true, nomePerfil: true, nomeUsuario: true, telefoneE164: true } },
          nomeExibicao: true,
          vinculosCliente: {
            orderBy: [{ preferencial: 'desc' }, { criadoEm: 'asc' }],
            select: {
              contratos: { select: { id: true }, where: { revogadoEm: null } },
              id: true,
              preferencial: true,
              tipo: true,
            },
            where: { revogadoEm: null },
          },
        },
        where: { id: escopo.contatoId },
      });
      if (contato === null) throw new ErroPermissaoNegada();
      const contexto = await transacao.contextoAtendimento.findUnique({ select: { origem: true, versao: true, vinculoClienteId: true, vinculoContratoId: true }, where: { atendimentoId } });
      const vinculos: DetalhesContatoWeb['vinculos'][number][] = [];
      if (permissoes.consultarCliente) {
        for (const vinculo of contato.vinculosCliente) {
          const snapshot = await this.snapshots.consultar(vinculo.id, transacao);
          const dados = this.objeto(snapshot?.dadosProtegidos);
          const contratosConhecidos = Array.isArray(dados.contratosConhecidos) ? dados.contratosConhecidos : [];
          const contratosSnapshot = contratosConhecidos.flatMap((item) => {
            const valor = this.objeto(item);
            return typeof valor.vinculoContratoId === 'string' && typeof valor.situacao === 'string' ? [{
              id: valor.vinculoContratoId,
              situacao: valor.situacao,
              ...(typeof valor.servico === 'string' ? { servico: valor.servico } : {}),
              ...(typeof valor.enderecoResumido === 'string' ? { enderecoResumido: valor.enderecoResumido } : {}),
            }] : [];
          });
          vinculos.push({
            contratos: permissoes.consultarContrato ? vinculo.contratos.map((contrato) =>
              contratosSnapshot.find((item) => item.id === contrato.id) ?? { id: contrato.id, situacao: 'Não informada' }) : [],
            ...(typeof dados.documentoMascarado === 'string' ? { documentoMascarado: dados.documentoMascarado } : {}),
            estadoSnapshot: snapshot?.estado ?? 'NAO_DISPONIVEL',
            id: vinculo.id,
            ...(snapshot === undefined ? {} : { idadeSnapshotSegundos: snapshot.idadeSegundos }),
            nomeExibicao: typeof dados.nomeExibicao === 'string' ? dados.nomeExibicao : 'Cliente vinculado',
            origem: 'SNAPSHOT' as const,
            preferencial: vinculo.preferencial,
            tipo: vinculo.tipo,
          });
        }
      }
      const [atendimentos, midias, notas, ordensServico, protocolo] = await Promise.all([
        transacao.atendimento.count({ where: { conversaId: escopo.conversaId } }),
        transacao.midiaMensagem.count({ where: { mensagem: { conversaId: escopo.conversaId } } }),
        transacao.notaInterna.count({ where: { conversaId: escopo.conversaId, filaId: escopo.filaId } }),
        transacao.ordemServicoErp.count({ where: { atendimentoId } }),
        transacao.protocoloErp.findUnique({ select: { protocoloOficial: true }, where: { atendimentoId } }),
      ]);
      return {
        atendimentoId, conversaId: escopo.conversaId, contatoId: contato.id, estadoContato: contato.estado, filaId: escopo.filaId,
        identidades: contato.identidadesWhatsApp.map((identidade) => ({
          ...(podeVerSensivel ? { bsuid: identidade.identificadorExternoEstavel } : {}),
          ...(identidade.nomePerfil === null ? {} : { nomePerfil: identidade.nomePerfil }),
          ...(identidade.nomeUsuario === null ? {} : { nomeUsuario: identidade.nomeUsuario }),
          ...(identidade.telefoneE164 === null ? {} : { telefoneMascarado: this.mascararTelefone(identidade.telefoneE164) }),
        })),
        nomeExibicao: contato.nomeExibicao ?? contato.identidadesWhatsApp[0]?.nomePerfil ?? 'Contato sem nome',
        ...(contexto === null ? {} : { contexto: { origem: contexto.origem, versao: contexto.versao, vinculoClienteId: contexto.vinculoClienteId, ...(contexto.vinculoContratoId === null ? {} : { vinculoContratoId: contexto.vinculoContratoId }) } }),
        ...(protocolo?.protocoloOficial === null || protocolo === null ? {} : { protocolo: protocolo.protocoloOficial }),
        contagens: { atendimentos, midias, notas, ordensServico }, permissoes, vinculos,
      };
    });
  }

  public async alterarContexto(sessao: ContextoSessaoAutorizacao, atendimentoId: string, entrada: { readonly versaoEsperada: number; readonly vinculoClienteId: string; readonly vinculoContratoId?: string }, transacao: TransacaoPrisma) {
    const escopo = await this.autorizarAtendimento(sessao, atendimentoId, 'VISUALIZAR_FILA', transacao);
    return this.contextos.alterar(sessao, { atendimentoId, filaId: escopo.filaId, versaoEsperada: entrada.versaoEsperada, vinculoClienteId: entrada.vinculoClienteId, ...(entrada.vinculoContratoId === undefined ? {} : { vinculoContratoId: entrada.vinculoContratoId }) }, transacao);
  }

  public async consultarFinanceiro(sessao: ContextoSessaoAutorizacao, atendimentoId: string): Promise<ResultadoFinanceiroContatoWeb> {
    const contexto = await this.prisma.executarLeituraConsistente(async (transacao) => {
      const escopo = await this.autorizarAtendimento(sessao, atendimentoId, 'CONSULTAR_FINANCEIRO', transacao);
      const atual = await transacao.contextoAtendimento.findUnique({ select: { contratoExternoAtivoId: true }, where: { atendimentoId } });
      if (atual === null || atual.contratoExternoAtivoId === null) throw new ErroPermissaoNegada();
      return { contratoExternoId: atual.contratoExternoAtivoId, filaId: escopo.filaId };
    });
    if (this.adaptador === undefined) return { codigo: 'ERP_NAO_CONFIGURADO', faturas: [], origem: 'INDISPONIVEL' };
    const resultado = await new ServicoFinanceiroErp(this.adaptador).listarFaturas(contexto.contratoExternoId);
    if (resultado.resultado === 'INDISPONIVEL') return { codigo: resultado.codigo, faturas: [], origem: 'INDISPONIVEL' };
    return { faturas: resultado.itens.map((item) => ({ referencia: item.faturaExternaId, situacao: item.situacao, valorCentavos: item.valorCentavos, vencimento: item.vencimento })), origem: 'TEMPO_REAL' };
  }

  public async prepararAcao(sessao: ContextoSessaoAutorizacao, atendimentoId: string, acao: AcaoErpWeb): Promise<PreviaAcaoErpWeb> {
    const contexto = await this.obterContextoAcao(sessao, atendimentoId, acao);
    if (this.adaptador === undefined) return { acao, confirmacaoObrigatoria: true, disponivel: false, motivo: 'ERP_NAO_CONFIGURADO', resumo: contexto.resumo };
    if (acao === 'EXECUTAR_DESBLOQUEIO') {
      const elegibilidade = await this.elegibilidade.verificar(sessao, { atendimentoId, contratoExternoId: contexto.contratoExternoId, filaId: contexto.filaId }, this.adaptador);
      if (elegibilidade.resultado !== 'SUCESSO' || !elegibilidade.elegivel) return { acao, confirmacaoObrigatoria: true, disponivel: false, motivo: elegibilidade.resultado === 'SUCESSO' ? elegibilidade.motivos.join(',') : elegibilidade.resultado, resumo: contexto.resumo };
    }
    return { acao, confirmacaoObrigatoria: true, disponivel: true, resumo: contexto.resumo };
  }

  public async executarAcao(sessao: ContextoSessaoAutorizacao, atendimentoId: string, entrada: { readonly acao: AcaoErpWeb; readonly assunto?: string; readonly chaveIdempotencia: string; readonly descricao?: string; readonly confirmacaoExplicita: true }) {
    if (this.adaptador === undefined) return { situacao: 'INTEGRACAO_INDISPONIVEL' };
    const contexto = await this.obterContextoAcao(sessao, atendimentoId, entrada.acao);
    const proximaAcaoEm = new Date(Date.now() + 60_000);
    if (entrada.acao === 'EXECUTAR_DESBLOQUEIO') return this.desbloqueios.executar(sessao, { atendimentoId, chaveIdempotencia: entrada.chaveIdempotencia, confirmacaoExplicita: true, contratoExternoId: contexto.contratoExternoId, filaId: contexto.filaId, proximaAcaoEm }, this.adaptador);
    if (entrada.assunto === undefined || entrada.descricao === undefined) throw new Error('CONTEUDO_ORDEM_SERVICO_INVALIDO');
    return this.ordens.criar(sessao, { atendimentoId, assunto: entrada.assunto, chaveIdempotencia: entrada.chaveIdempotencia, clienteExternoId: contexto.clienteExternoId, confirmacaoExplicita: true, contratoExternoId: contexto.contratoExternoId, descricao: entrada.descricao, filaId: contexto.filaId, protocoloOficial: contexto.protocolo, proximaAcaoEm }, this.adaptador);
  }

  private async obterContextoAcao(sessao: ContextoSessaoAutorizacao, atendimentoId: string, acao: AcaoErpWeb) {
    return this.prisma.executarLeituraConsistente(async (transacao) => {
      const permissao = acao === 'CRIAR_ORDEM_SERVICO' ? 'CRIAR_ORDEM_SERVICO' : 'EXECUTAR_DESBLOQUEIO_CONFIANCA';
      const escopo = await this.autorizarAtendimento(sessao, atendimentoId, permissao, transacao);
      const contexto = await transacao.contextoAtendimento.findUnique({ select: { clienteExternoAtivoId: true, contratoExternoAtivoId: true }, where: { atendimentoId } });
      const protocolo = await transacao.protocoloErp.findUnique({ select: { protocoloOficial: true }, where: { atendimentoId } });
      if (contexto === null || contexto.contratoExternoAtivoId === null || (acao === 'CRIAR_ORDEM_SERVICO' && protocolo?.protocoloOficial == null)) throw new ErroPermissaoNegada();
      return { clienteExternoId: contexto.clienteExternoAtivoId, contratoExternoId: contexto.contratoExternoAtivoId, filaId: escopo.filaId, protocolo: protocolo?.protocoloOficial ?? '', resumo: [{ rotulo: 'Atendimento', valor: 'Atendimento atual' }, { rotulo: 'Contrato ativo', valor: 'Contexto atual confirmado' }, { rotulo: 'Origem dos dados', valor: 'ERP em tempo real' }, ...(acao === 'CRIAR_ORDEM_SERVICO' ? [{ rotulo: 'Protocolo', valor: 'Protocolo oficial confirmado' }] : [])] };
    });
  }

  private async autorizarAtendimento(sessao: ContextoSessaoAutorizacao, atendimentoId: string, permissao: CodigoPermissaoAutorizacao, transacao: TransacaoPrisma) {
    if (!UUID.test(atendimentoId)) throw new ErroPermissaoNegada();
    const atendimento = await transacao.atendimento.findUnique({ select: { conversa: { select: { contatoId: true } }, conversaId: true, filaAtualId: true }, where: { id: atendimentoId } });
    if (atendimento?.filaAtualId === null || atendimento === null) throw new ErroPermissaoNegada();
    await this.autorizacao.autorizar({ filaId: atendimento.filaAtualId, permissao, recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao }, async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao);
    return { contatoId: atendimento.conversa.contatoId, conversaId: atendimento.conversaId, filaId: atendimento.filaAtualId };
  }

  private async temPermissao(sessao: ContextoSessaoAutorizacao, atendimentoId: string, filaId: string | undefined, permissao: CodigoPermissaoAutorizacao, transacao: TransacaoPrisma): Promise<boolean> {
    try { await this.autorizacao.autorizar({ ...(filaId === undefined ? {} : { filaId }), permissao, recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao }, async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao); return true; }
    catch (erro) { if (erro instanceof ErroPermissaoNegada) return false; throw erro; }
  }

  private objeto(valor: unknown): Readonly<Record<string, unknown>> { return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? valor as Readonly<Record<string, unknown>> : {}; }
  private mascararTelefone(valor: string): string { return valor.length <= 4 ? '••••' : `${valor.slice(0, 3)} ••••••-${valor.slice(-4)}`; }
}
