import { normalizarPreferenciaTema, resolverModoTema, type ModoTema, type PreferenciaTema } from '@vyntra/tema';

export interface EstadoAparencia {
  readonly preferencia: PreferenciaTema;
  readonly modo: ModoTema;
  readonly erroPersistencia: boolean;
}
const CHAVE_APARENCIA = 'vyntra.aparencia.v1';

export function criarControladorAparencia(janela: Window) {
  const sistema = janela.matchMedia('(prefers-color-scheme: dark)');
  const ouvintes = new Set<() => void>();
  let preferencia = normalizarPreferenciaTema(janela.document.documentElement.dataset.preferenciaTema);
  let estado: EstadoAparencia = Object.freeze({
    preferencia, modo: resolverModoTema(preferencia, sistema.matches), erroPersistencia: false,
  });

  function aplicar(erroPersistencia = estado.erroPersistencia) {
    const modo = resolverModoTema(preferencia, sistema.matches);
    janela.document.documentElement.dataset.tema = modo;
    janela.document.documentElement.dataset.preferenciaTema = preferencia;
    if (estado.modo === modo && estado.preferencia === preferencia && estado.erroPersistencia === erroPersistencia) return;
    estado = Object.freeze({ preferencia, modo, erroPersistencia });
    for (const ouvir of ouvintes) ouvir();
  }
  const aoMudarSistema = () => aplicar();
  const aoMudarArmazenamento = (evento: StorageEvent) => {
    if (evento.key !== CHAVE_APARENCIA && evento.key !== null) return;
    preferencia = normalizarPreferenciaTema(evento.newValue);
    aplicar(false);
  };
  return {
    obter: () => estado,
    escolher(valor: PreferenciaTema) {
      preferencia = normalizarPreferenciaTema(valor);
      let falhou = false;
      try { janela.localStorage.setItem(CHAVE_APARENCIA, preferencia); } catch { falhou = true; }
      aplicar(falhou);
    },
    observar(ouvir: () => void) {
      if (ouvintes.size === 0) {
        sistema.addEventListener('change', aoMudarSistema);
        janela.addEventListener('storage', aoMudarArmazenamento);
      }
      ouvintes.add(ouvir);
      // Recupera mudança do sistema entre a inicialização e a assinatura.
      aplicar();
      return () => {
        ouvintes.delete(ouvir);
        if (ouvintes.size === 0) {
          sistema.removeEventListener('change', aoMudarSistema);
          janela.removeEventListener('storage', aoMudarArmazenamento);
        }
      };
    },
  };
}
