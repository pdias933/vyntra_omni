import type {
  FormularioCanalDefinido,
  SubmissaoFormularioPersistida,
} from './modelo-formulario.js';
import type { FormularioTimeline } from '../timeline/modelo-timeline.js';

export class ProjetorSubmissaoFormulario {
  public projetar(
    formulario: FormularioCanalDefinido,
    submissao: SubmissaoFormularioPersistida,
    podeVerDadoSensivel: boolean,
    sequenciaEvento: bigint,
  ): FormularioTimeline {
    if (
      formulario.id !== submissao.formularioId ||
      sequenciaEvento < 1n
    ) {
      throw new Error('SUBMISSAO_FORMULARIO_INVALIDA');
    }
    const camposMascarados: Record<string, string> = {};
    for (const campo of formulario.campos) {
      const valor = submissao.dadosProtegidos[campo.chave];
      if (!['string', 'number', 'boolean'].includes(typeof valor)) continue;
      const texto = String(valor);
      camposMascarados[campo.rotulo] =
        campo.classificacao === 'SENSIVEL' && !podeVerDadoSensivel
          ? this.mascara(texto)
          : texto;
    }
    return {
      acao: 'VER_FORMULARIO',
      camposMascarados,
      id: submissao.id,
      nomeFormulario: formulario.nome,
      ocorridoEm: submissao.recebidaEm,
      sequenciaEvento,
      submissaoFormularioId: submissao.id,
      tipo: 'FORMULARIO',
      visibilidade: 'SOMENTE_EQUIPE',
    };
  }

  private mascara(valor: string): string {
    return valor.length <= 2 ? '••' : `••••${valor.slice(-2)}`;
  }
}
