import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@xyflow/react/dist/style.css';

import { ShellWeb } from './web/ShellWeb';
import './estilos.css';
import './layout-responsivo.css';

const raiz = document.getElementById('root');

if (raiz === null) {
  throw new Error('ELEMENTO_RAIZ_NAO_ENCONTRADO');
}

createRoot(raiz).render(
  <StrictMode>
    <ShellWeb />
  </StrictMode>,
);
