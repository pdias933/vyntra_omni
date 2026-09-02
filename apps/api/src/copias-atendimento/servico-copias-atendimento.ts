import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ServicoAuditoria } from '../auditoria/servico-auditoria.js';
import type { ContextoSessaoAutorizacao } from '../autorizacao/modelo-autorizacao.js';
import { ErroPermissaoNegada } from '../autorizacao/erros-autorizacao.js';
import { ServicoAutorizacao } from '../autorizacao/servico-autorizacao.js';
import { ExcecaoHttpCanonica } from '../http/excecao-http-canonica.js';
import { ServicoPrisma } from '../persistencia/servico-prisma.js';
import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import type { ArquivoCopiaAtendimento, CopiaAtendimentoEmitida } from './modelo-copia-atendimento.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const DURACAO_TOKEN_MS = 15 * 60 * 1_000;
const LIMITE_MENSAGENS = 10_000;
const LIMITE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class ServicoCopiasAtendimento {
  public constructor(
    @Inject(ServicoPrisma) private readonly prisma: ServicoPrisma,
    @Inject(ServicoAutorizacao) private readonly autorizacao: ServicoAutorizacao,
    @Inject(ServicoAuditoria) private readonly auditoria: ServicoAuditoria,
  ) {}

  public async criar(
    sessao: ContextoSessaoAutorizacao,
    atendimentoId: string,
    transacao: TransacaoPrisma,
  ): Promise<CopiaAtendimentoEmitida> {
    this.validarUuid(atendimentoId);
    const agora = new Date();
    const atendimento = await this.autorizar(sessao, atendimentoId, transacao);
    const protocolo = atendimento.protocoloErp?.protocoloOficial;
    if (atendimento.protocoloErp?.estado !== 'OFICIAL' || protocolo === null || protocolo === undefined) {
      throw new ExcecaoHttpCanonica(409, 'PROTOCOLO_ERP_PENDENTE', 'A cópia só pode ser criada depois da confirmação do protocolo oficial.');
    }

    const token = randomBytes(32).toString('base64url');
    const expiraEm = new Date(agora.getTime() + DURACAO_TOKEN_MS);
    const id = randomUUID();
    await transacao.copiaAtendimento.create({
      data: {
        atendimentoId,
        expiraEm,
        geradaAteEm: agora,
        id,
        sessaoWebId: sessao.sessaoId,
        solicitadoPorUsuarioId: sessao.usuarioId,
        tokenHash: this.hashToken(token),
      },
    });
    await this.auditoria.registrar({
      acao: 'CRIAR_COPIA_ATENDIMENTO',
      atendimentoId,
      dadosNovos: { formato: 'TEXTO', midia_incluida: false, validade_minutos: 15 },
      entidadeId: id,
      entidadeTipo: 'COPIA_ATENDIMENTO',
      filaId: atendimento.filaAtualId,
      origem: 'USUARIO',
      sessaoId: sessao.sessaoId,
      tipoEvento: 'COPIA_ATENDIMENTO_CRIADA',
      usuarioId: sessao.usuarioId,
    }, transacao);

    return { expiraEm, nomeArquivo: this.nomeArquivo(protocolo), token };
  }

  public async baixar(
    sessao: ContextoSessaoAutorizacao,
    token: string,
    transacao: TransacaoPrisma,
  ): Promise<ArquivoCopiaAtendimento> {
    if (!TOKEN.test(token)) this.naoEncontrada();
    const agora = new Date();
    const copia = await transacao.copiaAtendimento.findUnique({
      select: {
        atendimento: {
          select: {
            filaAtualId: true,
            protocoloErp: { select: { estado: true, protocoloOficial: true } },
          },
        },
        atendimentoId: true,
        estado: true,
        expiraEm: true,
        geradaAteEm: true,
        id: true,
        sessaoWebId: true,
        solicitadoPorUsuarioId: true,
      },
      where: { tokenHash: this.hashToken(token) },
    });
    if (
      copia === null || copia.estado !== 'ATIVA' || copia.expiraEm <= agora ||
      copia.sessaoWebId !== sessao.sessaoId || copia.solicitadoPorUsuarioId !== sessao.usuarioId
    ) this.naoEncontrada();

    await this.autorizar(sessao, copia.atendimentoId, transacao);
    const protocolo = copia.atendimento.protocoloErp?.protocoloOficial;
    if (copia.atendimento.protocoloErp?.estado !== 'OFICIAL' || protocolo === null || protocolo === undefined) {
      this.naoEncontrada();
    }
    const mensagens = await transacao.mensagem.findMany({
      orderBy: [{ recebidaServidorEm: 'asc' }, { id: 'asc' }],
      select: {
        contaWhatsApp: { select: { nomeExibicao: true } },
        conteudoProtegido: true,
        direcao: true,
        recebidaServidorEm: true,
        tipo: true,
      },
      take: LIMITE_MENSAGENS + 1,
      where: {
        atendimentoId: copia.atendimentoId,
        recebidaServidorEm: { lte: copia.geradaAteEm },
        submissaoFormulario: { is: null },
        tipo: { not: 'REACAO' },
      },
    });
    if (mensagens.length > LIMITE_MENSAGENS) {
      throw new ExcecaoHttpCanonica(413, 'COPIA_ATENDIMENTO_EXCEDE_LIMITE', 'A cópia excede o limite seguro de uma única exportação.');
    }

    const conteudo = this.renderizar(protocolo, copia.geradaAteEm, mensagens);
    if (Buffer.byteLength(conteudo, 'utf8') > LIMITE_BYTES) {
      throw new ExcecaoHttpCanonica(413, 'COPIA_ATENDIMENTO_EXCEDE_LIMITE', 'A cópia excede o limite seguro de uma única exportação.');
    }
    const consumida = await transacao.copiaAtendimento.updateMany({
      data: { consumidaEm: agora, estado: 'CONSUMIDA' },
      where: { estado: 'ATIVA', expiraEm: { gt: agora }, id: copia.id },
    });
    if (consumida.count !== 1) this.naoEncontrada();
    await this.auditoria.registrar({
      acao: 'BAIXAR_COPIA_ATENDIMENTO',
      atendimentoId: copia.atendimentoId,
      dadosNovos: { formato: 'TEXTO', mensagens: mensagens.length, midia_incluida: false },
      entidadeId: copia.id,
      entidadeTipo: 'COPIA_ATENDIMENTO',
      ...(copia.atendimento.filaAtualId === null ? {} : { filaId: copia.atendimento.filaAtualId }),
      origem: 'USUARIO',
      sessaoId: sessao.sessaoId,
      tipoEvento: 'COPIA_ATENDIMENTO_BAIXADA',
      usuarioId: sessao.usuarioId,
    }, transacao);
    return { conteudo, nomeArquivo: this.nomeArquivo(protocolo) };
  }

  private async autorizar(sessao: ContextoSessaoAutorizacao, atendimentoId: string, transacao: TransacaoPrisma) {
    const atendimento = await transacao.atendimento.findUnique({
      select: { filaAtualId: true, protocoloErp: { select: { estado: true, protocoloOficial: true } } },
      where: { id: atendimentoId },
    });
    if (atendimento?.filaAtualId === null || atendimento === null) throw new ErroPermissaoNegada();
    const filaId = atendimento.filaAtualId;
    for (const permissao of ['VISUALIZAR_FILA', 'EXPORTAR_HISTORICO'] as const) {
      await this.autorizacao.autorizar(
        { filaId, permissao, recurso: { id: atendimentoId, tipo: 'ATENDIMENTO' }, sessao },
        async () => ({ acessivel: true, estadoPermiteAcao: true }),
        transacao,
      );
    }
    return { filaAtualId: filaId, protocoloErp: atendimento.protocoloErp };
  }

  private renderizar(
    protocolo: string,
    geradaAteEm: Date,
    mensagens: readonly {
      readonly contaWhatsApp: { readonly nomeExibicao: string };
      readonly conteudoProtegido: unknown;
      readonly direcao: 'ENTRADA' | 'SAIDA';
      readonly recebidaServidorEm: Date;
      readonly tipo: string;
    }[],
  ): string {
    const linhas = [`Cópia do atendimento ${this.textoSeguro(protocolo, 256)}`, `Gerada até ${geradaAteEm.toISOString()}`, 'Conteúdo: mensagens entre cliente e empresa; mídias, formulários, notas e eventos internos não incluídos.', ''];
    for (const mensagem of mensagens) {
      const dados = this.objeto(mensagem.conteudoProtegido);
      const texto = typeof dados.texto === 'string'
        ? this.textoSeguro(dados.texto, 8_000)
        : `[${this.rotuloTipo(mensagem.tipo)} não incluído]`;
      const autor = mensagem.direcao === 'ENTRADA' ? 'Cliente' : this.textoSeguro(mensagem.contaWhatsApp.nomeExibicao, 100);
      linhas.push(`${mensagem.recebidaServidorEm.toISOString()} | ${autor}: ${texto}`);
    }
    return `${linhas.join('\n')}\n`;
  }

  private objeto(valor: unknown): Readonly<Record<string, unknown>> {
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? valor as Readonly<Record<string, unknown>> : {};
  }

  private textoSeguro(valor: string, limite: number): string {
    const normalizado = valor.replace(/\r\n?/gu, '\n');
    let seguro = '';
    for (const caractere of normalizado) {
      const codigo = caractere.codePointAt(0) ?? 0;
      if ((codigo >= 32 && codigo !== 127) || caractere === '\n' || caractere === '\t') seguro += caractere;
      if (seguro.length >= limite) break;
    }
    return seguro.slice(0, limite);
  }

  private rotuloTipo(tipo: string): string {
    return ({ AUDIO: 'Áudio', IMAGEM: 'Imagem', INTERATIVA: 'Mensagem interativa', MODELO_APROVADO: 'Modelo aprovado', PDF: 'PDF', VIDEO: 'Vídeo' } as Record<string, string>)[tipo] ?? 'Conteúdo';
  }

  private nomeArquivo(protocolo: string): string {
    const parte = protocolo.normalize('NFKD').replace(/[^A-Za-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80) || 'protocolo';
    return `atendimento-${parte}.txt`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private validarUuid(valor: string): void {
    if (!UUID.test(valor)) throw new ExcecaoHttpCanonica(400, 'IDENTIFICADOR_INVALIDO', 'O identificador informado é inválido.');
  }

  private naoEncontrada(): never {
    throw new ExcecaoHttpCanonica(404, 'COPIA_ATENDIMENTO_NAO_ENCONTRADA', 'A cópia não está disponível.');
  }
}
