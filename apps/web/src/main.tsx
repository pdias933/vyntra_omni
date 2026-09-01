import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@xyflow/react/dist/style.css';

import { Aplicacao } from './Aplicacao';
import './estilos.css';

const raiz = document.getElementById('root');

if (raiz === null) {
  throw new Error('ELEMENTO_RAIZ_NAO_ENCONTRADO');
}

createRoot(raiz).render(
  <StrictMode>
    <Aplicacao />
  </StrictMode>,
);
