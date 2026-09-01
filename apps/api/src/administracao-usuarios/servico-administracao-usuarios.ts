import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ServicoInvalidacaoPermissoes } from '../autorizacao/servico-invalidacao-permissoes.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { EntradaAlteracaoAcessoUsuario, PainelAdministracaoUsuarios } from './modelo-administracao-usuarios.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RECURSO_ADMINISTRACAO = '11111111-1111-4111-8111-111111111130';

@Injectable()
export class ServicoAdministracaoUsuarios {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoInvalidacaoPermissoes) private readonly invalidacao: ServicoInvalidacaoPermissoes,
    @Inject(ServicoAuditoria) private readonly auditoria: ServicoAuditoria,
  ) {}

  public async listar(sessao: ContextoSessaoAutorizacao): Promise<PainelAdministracaoUsuarios> {
    return this.prisma.executarLeituraConsistente(async (transacao) => {
      await this.autorizar(sessao, RECURSO_ADMINISTRACAO, transacao, true);
      const agora = new Date();
      const [usuarios, perfis, filas, auditoria] = await Promise.all([
        transacao.usuario.findMany({
          orderBy: [{ estado: 'asc' }, { nomeExibicao: 'asc' }, { id: 'asc' }],
          select: {
            acessosFila: { select: { fila: { select: { id: true, nome: true } } }, where: { estado: 'ATIVO', fila: { estado: 'ATIVA' } } },
            _count: { select: { dispositivosMobile: { where: { estado: 'ATIVO' } }, sessoesWeb: { where: { estado: 'ATIVA', expiraEm: { gt: agora } } } } },
            estado: true, id: true, nomeExibicao: true,
            perfil: { select: { id: true, nome: true, papelBase: true } }, versaoPermissoes: true,
          },
          take: 500,
        }),
        transacao.perfilAcesso.findMany({ orderBy: [{ papelBase: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true, papelBase: true, permissoes: { orderBy: { codigo: 'asc' }, select: { codigo: true, efeito: true } } }, where: { estado: 'ATIVO' } }),
        transacao.fila.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true }, where: { estado: 'ATIVA' } }),
        transacao.registroAuditoria.findMany({ orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }], select: { acao: true, criadoEm: true, entidadeId: true, id: true, usuarioId: true }, take: 50, where: { OR: [{ entidadeTipo: 'USUARIO' }, { acao: { contains: 'SESSAO' } }, { acao: { contains: 'DISPOSITIVO' } }] } }),
      ]);
      return {
        auditoriaRecente: auditoria.map((item) => ({ acao: item.acao, criadoEm: item.criadoEm, id: item.id, ...(item.entidadeId === null ? {} : { entidadeId: item.entidadeId }), ...(item.usuarioId === null ? {} : { usuarioAtorId: item.usuarioId }) })),
        filas,
        perfis: perfis.map((perfil) => ({ id: perfil.id, nome: perfil.nome, papelBase: perfil.papelBase, permissoes: perfil.permissoes })),
        usuarios: usuarios.map((usuario) => ({
          dispositivosMobileAtivos: usuario._count.dispositivosMobile,
          estado: usuario.estado,
          filas: usuario.acessosFila.map(({ fila }) => fila),
          id: usuario.id,
          nomeExibicao: usuario.nomeExibicao,
          ...(usuario.perfil === null ? {} : { perfil: { id: usuario.perfil.id, nome: usuario.perfil.nome, papelBase: usuario.perfil.papelBase } }),
          sessoesWebAtivas: usuario._count.sessoesWeb,
          versaoPermissoes: usuario.versaoPermissoes,
        })),
      };
    });
  }

  public async alterarAcesso(sessao: ContextoSessaoAutorizacao, usuarioId: string, entrada: EntradaAlteracaoAcessoUsuario, transacao: TransacaoPrisma): Promise<number> {
    if (!UUID.test(usuarioId) || !UUID.test(entrada.perfilId) || entrada.filaIds.length > 100 || entrada.filaIds.some((id) => !UUID.test(id)) || new Set(entrada.filaIds).size !== entrada.filaIds.length || !Number.isInteger(entrada.versaoEsperada) || entrada.versaoEsperada < 1) throw new Error('ENTRADA_ACESSO_USUARIO_INVALIDA');
    await this.autorizar(sessao, usuarioId, transacao, false);
    const [usuario, perfil, filas] = await Promise.all([
      transacao.usuario.findUnique({ select: { estado: true, perfil: { select: { papelBase: true } }, perfilId: true, versaoPermissoes: true }, where: { id: usuarioId } }),
      transacao.perfilAcesso.findUnique({ select: { estado: true, papelBase: true }, where: { id: entrada.perfilId } }),
      transacao.fila.findMany({ select: { id: true }, where: { estado: 'ATIVA', id: { in: [...entrada.filaIds] } } }),
    ]);
    if (usuario?.estado !== 'ATIVO' || usuario.versaoPermissoes !== entrada.versaoEsperada || perfil?.estado !== 'ATIVO' || filas.length !== entrada.filaIds.length) throw new Error('ACESSO_USUARIO_DESATUALIZADO');
    if (usuarioId === sessao.usuarioId && perfil.papelBase !== 'ADMINISTRADOR') throw new ErroPermissaoNegada();
    if (usuario.perfil?.papelBase === 'ADMINISTRADOR' && perfil.papelBase !== 'ADMINISTRADOR') {
      const outrosAdministradores = await transacao.usuario.count({ where: { estado: 'ATIVO', id: { not: usuarioId }, perfil: { estado: 'ATIVO', papelBase: 'ADMINISTRADOR' } } });
      if (outrosAdministradores === 0) throw new Error('ULTIMO_ADMINISTRADOR');
    }
    const alterado = await transacao.usuario.updateMany({ data: { perfilId: entrada.perfilId }, where: { estado: 'ATIVO', id: usuarioId, versaoPermissoes: entrada.versaoEsperada } });
    if (alterado.count !== 1) throw new Error('ACESSO_USUARIO_DESATUALIZADO');
    const agora = new Date();
    await transacao.acessoUsuarioFila.updateMany({ data: { estado: 'REVOGADO', revogadoEm: agora }, where: { estado: 'ATIVO', filaId: { notIn: [...entrada.filaIds] }, usuarioId } });
    for (const filaId of entrada.filaIds) await transacao.acessoUsuarioFila.upsert({ create: { estado: 'ATIVO', filaId, usuarioId }, update: { estado: 'ATIVO', revogadoEm: null }, where: { usuarioId_filaId: { filaId, usuarioId } } });
    const versao = await this.invalidacao.registrar({ motivo: 'PERFIL_ALTERADO', usuarioAlvoId: usuarioId, usuarioAtorId: sessao.usuarioId }, transacao);
    await this.auditoria.registrar({ acao: 'ALTERAR_ACESSO_USUARIO', dadosAnteriores: { perfilId: usuario.perfilId }, dadosNovos: { quantidadeFilas: entrada.filaIds.length, perfilId: entrada.perfilId, versaoPermissoes: versao }, entidadeId: usuarioId, entidadeTipo: 'USUARIO', origem: 'USUARIO', sessaoId: sessao.sessaoId, tipoEvento: 'ACESSO_USUARIO_ALTERADO', usuarioId: sessao.usuarioId }, transacao);
    return versao;
  }

  private async autorizar(sessao: ContextoSessaoAutorizacao, recursoId: string, transacao: TransacaoPrisma, global: boolean): Promise<void> {
    await this.autorizacao.autorizar({ permissao: 'ADMINISTRAR_USUARIOS', recurso: { id: recursoId, tipo: global ? 'ADMINISTRACAO_USUARIOS' : 'USUARIO' }, sessao }, async () => ({ acessivel: global || await transacao.usuario.count({ where: { id: recursoId } }) === 1, estadoPermiteAcao: true }), transacao);
  }
}
