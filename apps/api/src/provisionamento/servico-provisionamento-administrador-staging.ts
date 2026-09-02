import { randomUUID, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../gerado/prisma/client.js';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import { ServicoSenha } from '../autenticacao/servico-senha.js';
import { ServicoProtecaoMfa } from '../autenticacao/servico-protecao-mfa.js';
import { CODIGOS_PERMISSAO } from '../autorizacao/modelo-autorizacao.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';

const IDENTIFICADOR = /^[\p{L}\p{N}._@+-]{3,120}$/u;
const NOME = /^.{1,160}$/u;
const QUANTIDADE_CODIGOS_RECUPERACAO = 10;
const NOME_NORMALIZADO_PERFIL = 'administrador-staging-irrestrito';

export interface EntradaProvisionamentoAdministradorStaging {
  readonly identificador: string;
  readonly nomeExibicao: string;
  readonly senha: string;
  readonly segredoTotp: string;
  readonly codigosRecuperacao: readonly string[];
}

@Injectable()
export class ServicoProvisionamentoAdministradorStaging {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoSenha) private readonly senhas: ServicoSenha,
    @Inject(ServicoProtecaoMfa)
    private readonly protecaoMfa: ServicoProtecaoMfa,
    @Inject(ServicoAuditoria) private readonly auditoria: ServicoAuditoria,
  ) {}

  public async provisionar(
    entrada: EntradaProvisionamentoAdministradorStaging,
  ): Promise<'CRIADO' | 'JA_EXISTENTE'> {
    this.validarAmbiente();
    const identificador = entrada.identificador
      .normalize('NFKC')
      .trim()
      .toLocaleLowerCase('pt-BR');
    const nomeExibicao = entrada.nomeExibicao.normalize('NFKC').trim();
    if (!IDENTIFICADOR.test(identificador) || !NOME.test(nomeExibicao)) {
      throw new Error('IDENTIDADE_ADMINISTRADOR_STAGING_INVALIDA');
    }
    this.senhas.validarNovaSenha(entrada.senha);
    if (entrada.codigosRecuperacao.length !== QUANTIDADE_CODIGOS_RECUPERACAO) {
      throw new Error('CODIGOS_RECUPERACAO_STAGING_INCOMPLETOS');
    }
    const hashesRecuperacao = await Promise.all(
      entrada.codigosRecuperacao.map((codigo) =>
        this.protecaoMfa.calcularHashCodigoRecuperacao(codigo),
      ),
    );
    if (new Set(hashesRecuperacao).size !== hashesRecuperacao.length) {
      throw new Error('CODIGOS_RECUPERACAO_STAGING_DUPLICADOS');
    }
    const segredoProtegido = await this.protecaoMfa.protegerSegredoTotp(
      entrada.segredoTotp,
    );
    const senhaHash = await this.senhas.criarHash(entrada.senha);

    return this.prisma.executarTransacao(async (transacao) => {
      await transacao.$queryRaw(
        Prisma.sql`SELECT CAST(pg_advisory_xact_lock(hashtextextended('PROVISIONAR_ADMINISTRADOR_STAGING', 0)) AS text) AS bloqueio`,
      );
      const existente = await transacao.credencialSenha.findUnique({
        select: {
          senhaHash: true,
          usuario: {
            select: {
              estado: true,
              fatorMfaTotp: {
                select: {
                  codigosRecuperacao: {
                    select: { codigoHash: true },
                    where: { usadoEm: null },
                  },
                  estado: true,
                  segredoProtegido: true,
                },
              },
              nomeExibicao: true,
              perfil: {
                select: {
                  estado: true,
                  nomeNormalizado: true,
                  papelBase: true,
                  permissoes: { select: { codigo: true, efeito: true } },
                },
              },
            },
          },
        },
        where: { identificadorNormalizado: identificador },
      });
      if (existente !== null) {
        const fator = existente.usuario.fatorMfaTotp;
        const segredoAtual =
          fator === null
            ? ''
            : await this.protecaoMfa.revelarSegredoTotp(
                fator.segredoProtegido,
              );
        const permissoes = new Set(
          existente.usuario.perfil?.permissoes
            .filter(({ efeito }) => efeito === 'CONCEDER')
            .map(({ codigo }) => codigo) ?? [],
        );
        const codigosAtuais = new Set(
          fator?.codigosRecuperacao.map(({ codigoHash }) => codigoHash) ?? [],
        );
        const compativel =
          existente.usuario.estado === 'ATIVO' &&
          existente.usuario.nomeExibicao === nomeExibicao &&
          existente.usuario.perfil?.estado === 'ATIVO' &&
          existente.usuario.perfil.papelBase === 'ADMINISTRADOR' &&
          existente.usuario.perfil.nomeNormalizado ===
            NOME_NORMALIZADO_PERFIL &&
          fator?.estado === 'ATIVO' &&
          timingSafeEqual(
            Buffer.from(segredoAtual, 'utf8'),
            Buffer.from(entrada.segredoTotp, 'utf8'),
          ) &&
          (await this.senhas.verificar(entrada.senha, existente.senhaHash)) &&
          CODIGOS_PERMISSAO.every((codigo) => permissoes.has(codigo)) &&
          hashesRecuperacao.every((hash) => codigosAtuais.has(hash));
        if (!compativel) {
          throw new Error('ADMINISTRADOR_STAGING_EXISTENTE_DIVERGENTE');
        }
        return 'JA_EXISTENTE';
      }

      const perfilExistente = await transacao.perfilAcesso.findUnique({
        select: { id: true },
        where: { nomeNormalizado: NOME_NORMALIZADO_PERFIL },
      });
      if (perfilExistente !== null) {
        throw new Error('PERFIL_ADMINISTRADOR_STAGING_EXISTENTE_DIVERGENTE');
      }

      const perfilId = randomUUID();
      const usuarioId = randomUUID();
      const agora = new Date();
      await transacao.perfilAcesso.create({
        data: {
          id: perfilId,
          nome: 'Administrador staging irrestrito',
          nomeNormalizado: NOME_NORMALIZADO_PERFIL,
          papelBase: 'ADMINISTRADOR',
          permissoes: {
            createMany: {
              data: CODIGOS_PERMISSAO.map((codigo) => ({
                codigo,
                efeito: 'CONCEDER' as const,
              })),
            },
          },
        },
      });
      await transacao.usuario.create({
        data: {
          id: usuarioId,
          nomeExibicao,
          perfilId,
          credencialSenha: {
            create: { identificadorNormalizado: identificador, senhaHash },
          },
          fatorMfaTotp: {
            create: {
              ativadoEm: agora,
              codigosRecuperacao: {
                createMany: {
                  data: hashesRecuperacao.map((codigoHash) => ({
                    codigoHash,
                    id: randomUUID(),
                  })),
                },
              },
              segredoProtegido,
            },
          },
        },
      });
      await this.auditoria.registrar(
        {
          acao: 'PROVISIONAR_ADMINISTRADOR_STAGING',
          dadosNovos: {
            codigos_recuperacao: hashesRecuperacao.length,
            permissoes: CODIGOS_PERMISSAO.length,
            segundo_fator: 'TOTP',
          },
          entidadeId: usuarioId,
          entidadeTipo: 'USUARIO',
          origem: 'SISTEMA',
          tipoEvento: 'ADMINISTRADOR_STAGING_PROVISIONADO',
        },
        transacao,
      );
      return 'CRIADO';
    });
  }

  private validarAmbiente(): void {
    if (
      process.env.AMBIENTE_APLICACAO !== 'staging' ||
      process.env.DADOS_PERMITIDOS !== 'sinteticos_ou_sanitizados'
    ) {
      throw new Error('PROVISIONAMENTO_ADMINISTRADOR_FORA_DE_STAGING');
    }
  }
}
