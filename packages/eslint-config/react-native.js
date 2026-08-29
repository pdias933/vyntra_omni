import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

import configuracaoBase from './base.js';

export default [
  ...configuracaoBase,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        __DEV__: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
