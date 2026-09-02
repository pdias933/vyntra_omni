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
    const camposMascarados = this.projetarCamposMascarados(
      formulario.campos,
      submissao.dadosProtegidos,
      podeVerDadoSensivel,
    );
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

  public projetarCamposMascarados(
    campos: readonly FormularioCanalDefinido['campos'][number][],
    dadosRecebidos: unknown,
    podeVerDadoSensivel: boolean,
  ): Readonly<Record<string, string>> {
    if (
      dadosRecebidos === null ||
      typeof dadosRecebidos !== 'object' ||
      Array.isArray(dadosRecebidos)
    ) {
      return {};
    }
    const camposMascarados: Record<string, string> = {};
    for (const campo of campos) {
      const valor = Reflect.get(dadosRecebidos, campo.chave);
      if (!['string', 'number', 'boolean'].includes(typeof valor)) continue;
      const texto = String(valor);
      camposMascarados[campo.rotulo] =
        campo.classificacao === 'SENSIVEL' && !podeVerDadoSensivel
          ? this.mascara(texto)
          : texto;
    }
    return camposMascarados;
  }

  private mascara(valor: string): string {
    return valor.length <= 2 ? '••' : `••••${valor.slice(-2)}`;
  }
}
