module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['web', 'ios', 'backend', 'shared', 'ui', 'sdk', 'config', 'infra', 'docs', 'ci', 'repo'],
    ],
  },
};
