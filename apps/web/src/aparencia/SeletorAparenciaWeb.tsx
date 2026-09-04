import { OPCOES_TEMA, normalizarPreferenciaTema } from '@vyntra/tema';
import { useAparencia } from './use-aparencia';

export function SeletorAparenciaWeb() {
  const { preferencia, escolher, erroPersistencia } = useAparencia();
  return (
    <div className="aparencia-web">
      <label>
        <span>Aparência</span>
        <select aria-label="Aparência" value={preferencia} onChange={(evento) => escolher(normalizarPreferenciaTema(evento.target.value))}>
          {OPCOES_TEMA.map((opcao) => <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>)}
        </select>
      </label>
      {erroPersistencia && <small role="status">A aparência vale nesta aba, mas não foi possível salvá-la.</small>}
    </div>
  );
}
