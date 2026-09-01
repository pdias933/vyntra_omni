import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsUUID, Min } from 'class-validator';

import type { PainelAdministracaoUsuarios } from '../modelo-administracao-usuarios.js';

class PermissaoPerfilAdministracaoDto {
  @ApiProperty() public readonly codigo: string;
  @ApiProperty({ enum: ['CONCEDER', 'NEGAR'] }) public readonly efeito: 'CONCEDER' | 'NEGAR';
  public constructor(item: PainelAdministracaoUsuarios['perfis'][number]['permissoes'][number]) { this.codigo = item.codigo; this.efeito = item.efeito; }
}

class PerfilAdministracaoUsuarioDto {
  @ApiProperty({ format: 'uuid' }) public readonly id: string;
  @ApiProperty() public readonly nome: string;
  @ApiProperty() public readonly papel_base: string;
  @ApiProperty({ type: [PermissaoPerfilAdministracaoDto] }) public readonly permissoes: readonly PermissaoPerfilAdministracaoDto[];
  public constructor(item: PainelAdministracaoUsuarios['perfis'][number]) { this.id = item.id; this.nome = item.nome; this.papel_base = item.papelBase; this.permissoes = item.permissoes.map((permissao) => new PermissaoPerfilAdministracaoDto(permissao)); }
}

class FilaAdministracaoUsuarioDto {
  @ApiProperty({ format: 'uuid' }) public readonly id: string;
  @ApiProperty() public readonly nome: string;
  public constructor(item: PainelAdministracaoUsuarios['filas'][number]) { this.id = item.id; this.nome = item.nome; }
}

class PerfilResumoAdministracaoUsuarioDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty() public readonly nome!: string;
  @ApiProperty() public readonly papel_base!: string;
}

class ResumoAdministracaoUsuarioDto {
  @ApiProperty({ format: 'uuid' }) public readonly id: string;
  @ApiProperty() public readonly nome_exibicao: string;
  @ApiProperty() public readonly estado: string;
  @ApiProperty({ required: false, type: PerfilResumoAdministracaoUsuarioDto }) public readonly perfil?: { readonly id: string; readonly nome: string; readonly papel_base: string };
  @ApiProperty({ type: [FilaAdministracaoUsuarioDto] }) public readonly filas: readonly FilaAdministracaoUsuarioDto[];
  @ApiProperty() public readonly sessoes_web_ativas: number;
  @ApiProperty() public readonly dispositivos_mobile_ativos: number;
  @ApiProperty() public readonly versao_permissoes: number;
  public constructor(item: PainelAdministracaoUsuarios['usuarios'][number]) { this.id = item.id; this.nome_exibicao = item.nomeExibicao; this.estado = item.estado; if (item.perfil !== undefined) this.perfil = { id: item.perfil.id, nome: item.perfil.nome, papel_base: item.perfil.papelBase }; this.filas = item.filas.map((fila) => new FilaAdministracaoUsuarioDto(fila)); this.sessoes_web_ativas = item.sessoesWebAtivas; this.dispositivos_mobile_ativos = item.dispositivosMobileAtivos; this.versao_permissoes = item.versaoPermissoes; }
}

class ItemAuditoriaAdministracaoUsuarioDto {
  @ApiProperty({ format: 'uuid' }) public readonly id: string;
  @ApiProperty() public readonly acao: string;
  @ApiProperty({ format: 'date-time' }) public readonly criado_em: string;
  @ApiProperty({ format: 'uuid', required: false }) public readonly entidade_id?: string;
  @ApiProperty({ format: 'uuid', required: false }) public readonly usuario_ator_id?: string;
  public constructor(item: PainelAdministracaoUsuarios['auditoriaRecente'][number]) { this.id = item.id; this.acao = item.acao; this.criado_em = item.criadoEm.toISOString(); if (item.entidadeId !== undefined) this.entidade_id = item.entidadeId; if (item.usuarioAtorId !== undefined) this.usuario_ator_id = item.usuarioAtorId; }
}

export class PainelAdministracaoUsuariosDto {
  @ApiProperty({ type: [ResumoAdministracaoUsuarioDto] }) public readonly usuarios: readonly ResumoAdministracaoUsuarioDto[];
  @ApiProperty({ type: [PerfilAdministracaoUsuarioDto] }) public readonly perfis: readonly PerfilAdministracaoUsuarioDto[];
  @ApiProperty({ type: [FilaAdministracaoUsuarioDto] }) public readonly filas: readonly FilaAdministracaoUsuarioDto[];
  @ApiProperty({ type: [ItemAuditoriaAdministracaoUsuarioDto] }) public readonly auditoria_recente: readonly ItemAuditoriaAdministracaoUsuarioDto[];
  public constructor(item: PainelAdministracaoUsuarios) { this.usuarios = item.usuarios.map((usuario) => new ResumoAdministracaoUsuarioDto(usuario)); this.perfis = item.perfis.map((perfil) => new PerfilAdministracaoUsuarioDto(perfil)); this.filas = item.filas.map((fila) => new FilaAdministracaoUsuarioDto(fila)); this.auditoria_recente = item.auditoriaRecente.map((registro) => new ItemAuditoriaAdministracaoUsuarioDto(registro)); }
}

export class EntradaAlteracaoAcessoUsuarioDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() public readonly perfil_id!: string;
  @ApiProperty({ type: [String], maxItems: 100 }) @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID(undefined, { each: true }) public readonly fila_ids!: readonly string[];
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) public readonly versao_esperada!: number;
}

export class ResultadoAlteracaoAcessoUsuarioDto {
  @ApiProperty() public readonly versao_permissoes: number;
  public constructor(versao: number) { this.versao_permissoes = versao; }
}
