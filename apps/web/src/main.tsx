import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Aplicacao } from './Aplicacao';

const raiz = document.getElementById('root');

if (raiz === null) {
  throw new Error('ELEMENTO_RAIZ_NAO_ENCONTRADO');
}

createRoot(raiz).render(
  <StrictMode>
    <Aplicacao />
  </StrictMode>,
);
