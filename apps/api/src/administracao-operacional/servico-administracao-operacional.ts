import { Inject, Injectable, Optional } from '@nestjs/common';

import type { ContextoSessaoAutorizacao, CodigoPermissaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ADAPTADOR_ERP, type AdaptadorErp } from '../erp/adaptador-erp.js';
import { CANAL_MENSAGERIA, type CanalMensageria } from '../mensageria/porta-mensageria.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import { ADAPTADOR_SESSAO_ACESSO, type AdaptadorSessaoAcesso } from '../sessao-acesso/adaptador-sessao-acesso.js';
import type { PainelAdministracaoOperacional } from './modelo-administracao-operacional.js';

const RECURSO_ADMINISTRACAO = '11111111-1111-4111-8111-111111111131';

@Injectable()
export class ServicoAdministracaoOperacional {
  public constructor(@Inject(ServicoPrisma) private readonly prisma: ServicoPrisma, @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao, @Optional() @Inject(ADAPTADOR_ERP) private readonly erp?: AdaptadorErp, @Optional() @Inject(CANAL_MENSAGERIA) private readonly canal?: CanalMensageria, @Optional() @Inject(ADAPTADOR_SESSAO_ACESSO) private readonly sessaoAcesso?: AdaptadorSessaoAcesso) {}

  public async listar(sessao: ContextoSessaoAutorizacao): Promise<PainelAdministracaoOperacional> {
    return this.prisma.executarLeituraConsistente(async (transacao) => {
      const capacidades = {
        administrarCalendarios: await this.pode(sessao, 'ADMINISTRAR_CALENDARIOS', transacao),
        administrarFilas: await this.pode(sessao, 'ADMINISTRAR_FILAS', transacao),
        administrarIntegracoes: await this.pode(sessao, 'ADMINISTRAR_INTEGRACOES', transacao),
      };
      if (!Object.values(capacidades).includes(true)) throw new ErroPermissaoNegada();
      const agora = new Date();
      const [contas, filas, calendarios] = await Promise.all([
        capacidades.administrarIntegracoes ? transacao.contaWhatsApp.findMany({ orderBy: [{ estado: 'asc' }, { nomeExibicao: 'asc' }], select: { estado: true, id: true, nomeExibicao: true, telefoneExibicaoE164: true, versao: true } }) : [],
        capacidades.administrarFilas ? transacao.fila.findMany({ orderBy: [{ estado: 'asc' }, { nome: 'asc' }], select: { _count: { select: { acessosUsuarios: { where: { estado: 'ATIVO' } }, atendimentosAtuais: { where: { estado: { in: ['AGUARDANDO', 'EM_ATENDIMENTO', 'ENCERRADO_REABRIVEL'] } } } } }, calendarioAtendimento: { select: { nome: true } }, estado: true, id: true, nome: true, politicaSla: { select: { alertaAdministradorAposMinutos: true, alertaAtendenteAposMinutos: true, alertaSupervisorAposMinutos: true, versao: true } } } }) : [],
        capacidades.administrarCalendarios ? transacao.calendarioAtendimento.findMany({ orderBy: { nome: 'asc' }, select: { fusoHorario: true, id: true, modo: true, nome: true, overrides: { orderBy: { vigenteDe: 'desc' }, select: { estado: true, vigenteAte: true }, take: 1, where: { vigenteAte: { gt: agora }, vigenteDe: { lte: agora } } } } }) : [],
      ]);
      return {
        capacidades,
        calendarios: calendarios.map((item) => ({ fusoHorario: item.fusoHorario, id: item.id, modo: item.modo, nome: item.nome, ...(item.overrides[0] === undefined ? {} : { overrideAtual: item.overrides[0] }) })),
        contas: contas.map((item) => ({ estado: item.estado, id: item.id, nome: item.nomeExibicao, ...(item.telefoneExibicaoE164 === null ? {} : { telefoneMascarado: this.mascararTelefone(item.telefoneExibicaoE164) }), versao: item.versao })),
        filas: filas.map((item) => ({ atendimentosAbertos: item._count.atendimentosAtuais, estado: item.estado, id: item.id, nome: item.nome, usuariosAtivos: item._count.acessosUsuarios, ...(item.calendarioAtendimento === null ? {} : { calendario: item.calendarioAtendimento.nome }), ...(item.politicaSla === null ? {} : { sla: { administradorMinutos: item.politicaSla.alertaAdministradorAposMinutos, atendenteMinutos: item.politicaSla.alertaAtendenteAposMinutos, supervisorMinutos: item.politicaSla.alertaSupervisorAposMinutos, versao: item.politicaSla.versao } }) })),
        integracoes: capacidades.administrarIntegracoes ? [
          { codigo: 'POSTGRESQL', detalhe: 'Autoridade operacional conectada', estado: 'ATIVA' },
          { codigo: 'CANAL_WHATSAPP', detalhe: this.canal === undefined ? 'Adaptador de produção não configurado' : 'Adaptador de produção registrado', estado: this.canal === undefined ? 'NAO_CONFIGURADA' : 'ATIVA' },
          { codigo: 'SISTEMA_GESTAO', detalhe: this.erp === undefined ? 'Adaptador não configurado' : 'Adaptador registrado', estado: this.erp === undefined ? 'NAO_CONFIGURADA' : 'ATIVA' },
          { codigo: 'SESSAO_ACESSO', detalhe: this.sessaoAcesso === undefined ? 'Recurso condicional desligado' : 'Adaptador registrado', estado: this.sessaoAcesso === undefined ? 'NAO_CONFIGURADA' : 'ATIVA' },
        ] : [],
      };
    });
  }

  private async pode(sessao: ContextoSessaoAutorizacao, permissao: CodigoPermissaoAutorizacao, transacao: Parameters<Parameters<ServicoPrisma['executarLeituraConsistente']>[0]>[0]): Promise<boolean> { try { await this.autorizacao.autorizar({ permissao, recurso: { id: RECURSO_ADMINISTRACAO, tipo: 'ADMINISTRACAO_OPERACIONAL' }, sessao }, async () => ({ acessivel: true, estadoPermiteAcao: true }), transacao); return true; } catch (erro) { if (erro instanceof ErroPermissaoNegada) return false; throw erro; } }
  private mascararTelefone(valor: string): string { return valor.length <= 4 ? '••••' : `${valor.slice(0, 3)} ••••••-${valor.slice(-4)}`; }
}
