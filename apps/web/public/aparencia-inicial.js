// Executado antes do CSS da aplicação; arquivo externo para preservar a CSP.
(() => {
  let preferencia = 'sistema';
  try {
    const salva = globalThis.localStorage.getItem('vyntra.aparencia.v1');
    if (salva === 'claro' || salva === 'escuro') preferencia = salva;
  } catch {
    // Bloqueio de armazenamento não impede seguir o sistema.
  }
  const escuro = preferencia === 'escuro' ||
    (preferencia === 'sistema' && globalThis.matchMedia('(prefers-color-scheme: dark)').matches);
  globalThis.document.documentElement.dataset.preferenciaTema = preferencia;
  globalThis.document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
})();
