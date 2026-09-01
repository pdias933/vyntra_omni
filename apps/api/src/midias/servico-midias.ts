import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TransacaoPrisma } from '../persistencia/transacao-prisma.js';
import { ErroMidiaInvalida } from './erros-midia.js';
import type { MidiaMensagemPersistida, MidiaValidada } from './modelo-midia.js';
import { PORTA_ARMAZENAMENTO_PRIVADO, type PortaArmazenamentoPrivado } from './porta-armazenamento-privado.js';
import { REPOSITORIO_MIDIAS, type RepositorioMidias } from './repositorio-midias.js';
import { ValidadorMidia } from './validador-midia.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class ServicoMidias {
  private readonly validador = new ValidadorMidia();

  public constructor(
    @Inject(PORTA_ARMAZENAMENTO_PRIVADO) private readonly armazenamento: PortaArmazenamentoPrivado,
    @Inject(REPOSITORIO_MIDIAS) private readonly repositorio: RepositorioMidias,
  ) {}

  public validar(conteudo: Uint8Array, mimeDeclarado: string): MidiaValidada {
    return this.validador.validar(conteudo, mimeDeclarado);
  }

  public async guardar(
    mensagemId: string,
    conteudo: Uint8Array,
    mimeDeclarado: string,
    transacao: TransacaoPrisma,
    relogio: () => Date = () => new Date(),
  ): Promise<MidiaMensagemPersistida> {
    if (!UUID.test(mensagemId)) throw new ErroMidiaInvalida();
    const validada = this.validador.validar(conteudo, mimeDeclarado);
    if (!(await this.repositorio.mensagemAceitaMidia(mensagemId, validada.categoria, transacao))) {
      throw new ErroMidiaInvalida('TIPO_MIDIA_MENSAGEM_INCOMPATIVEL');
    }
    const chaveObjeto = `midias/${validada.conteudoHash.slice(0, 2)}/${randomUUID()}`;
    const referencia = await this.armazenamento.guardar(chaveObjeto, conteudo, validada.mimeDetectado);
    if (referencia.chaveObjeto !== chaveObjeto || referencia.bucketPrivado.startsWith('http')) {
      throw new ErroMidiaInvalida('ARMAZENAMENTO_NAO_PRIVADO');
    }
    const armazenadaEm = relogio();
    if (!Number.isFinite(armazenadaEm.getTime())) throw new ErroMidiaInvalida();
    const midia = {
      ...referencia,
      ...validada,
      armazenadaEm,
      mensagemId,
      mimeDeclarado: validada.mimeDetectado,
    };
    await this.repositorio.acrescentar(midia, transacao);
    return midia;
  }

  public async obter(
    referencia: Pick<MidiaMensagemPersistida, 'chaveObjeto' | 'conteudoHash' | 'tamanhoBytes'>,
  ): Promise<Uint8Array> {
    const conteudo = await this.armazenamento.obter(referencia.chaveObjeto);
    const hash = createHash('sha256').update(conteudo).digest('hex');
    if (conteudo.byteLength !== referencia.tamanhoBytes || hash !== referencia.conteudoHash) {
      throw new ErroMidiaInvalida('MIDIA_ARMAZENADA_DIVERGENTE');
    }
    return conteudo;
  }
}
