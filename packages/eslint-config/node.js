import globals from 'globals';

import configuracaoBase from './base.js';

export default [
  ...configuracaoBase,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
];
