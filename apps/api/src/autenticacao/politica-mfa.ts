import { MATRIZ_PERMISSOES_BASE } from '../autorizacao/matriz-permissoes.js';
import type {
  AjustePermissaoAutorizacao,
  CodigoPermissaoAutorizacao,
  PapelBaseAutorizacao,
} from '../autorizacao/modelo-autorizacao.js';

const PERMISSOES_PRIVILEGIADAS = new Set<CodigoPermissaoAutorizacao>([
  'ADMINISTRAR_USUARIOS',
  'ADMINISTRAR_INTEGRACOES',
  'PUBLICAR_FLUXO',
  'EXPORTAR_HISTORICO',
]);

export function credencialExigeMfa(credencial: {
  readonly papelBase: PapelBaseAutorizacao | undefined;
  readonly perfilAtivo: boolean;
  readonly ajustes: readonly AjustePermissaoAutorizacao[];
}): boolean {
  const papelBase = credencial.papelBase;
  if (!credencial.perfilAtivo || papelBase === undefined) {
    return false;
  }
  if (papelBase === 'ADMINISTRADOR') {
    return true;
  }
  return [...PERMISSOES_PRIVILEGIADAS].some((permissao) => {
    const ajuste = credencial.ajustes.find(({ codigo }) => codigo === permissao);
    if (ajuste?.efeito === 'NEGAR') {
      return false;
    }
    return (
      ajuste?.efeito === 'CONCEDER' ||
      MATRIZ_PERMISSOES_BASE[papelBase].includes(permissao)
    );
  });
}
