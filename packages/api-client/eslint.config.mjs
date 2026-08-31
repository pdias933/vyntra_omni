import configuracaoNode from '@vyntra/eslint-config/node';

export default [
  { ignores: ['src/gerado/**'] },
  ...configuracaoNode,
];
