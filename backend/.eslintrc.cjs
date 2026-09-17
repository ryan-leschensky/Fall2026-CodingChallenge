module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    jest: true,
  },
  extends: ['standard', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
  },
  rules: {},
};
