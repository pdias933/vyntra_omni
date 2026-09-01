import type { ComandoEnvioMensagem } from '../mensageria/modelo-mensageria.js';
import type { CanalMensageria } from '../mensageria/porta-mensageria.js';
import { MaquinaSaidaMensagem } from './maquina-saida-mensagem.js';
import type { MensagemSaidaPersistida } from './modelo-mensagem.js';

export class DespachanteMensagem {
  private readonly maquina = new MaquinaSaidaMensagem();

  public async despachar(
    mensagem: MensagemSaidaPersistida,
    comando: ComandoEnvioMensagem,
    canal: CanalMensageria,
    proximaTentativaEm: Date,
    relogio: () => Date = () => new Date(),
  ): Promise<MensagemSaidaPersistida> {
    const enviando = this.maquina.iniciarEnvio(mensagem);
    const resultado = await canal.enviar(comando);
    const agora = relogio();
    if (resultado.resultado === 'ACEITA') {
      return this.maquina.aceitarEnvio(
        enviando,
        resultado.identificadorExternoMensagem,
        resultado.aceitaEm,
      );
    }
    if (resultado.categoria === 'TEMPORARIA' && resultado.permiteNovaTentativa) {
      return this.maquina.registrarFalhaTemporaria(
        enviando,
        resultado.codigo,
        proximaTentativaEm,
        agora,
      );
    }
    return this.maquina.registrarFalhaDefinitiva(
      enviando,
      resultado.codigo,
      agora,
    );
  }
}
