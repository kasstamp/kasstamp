module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'chore', // Other changes that don't modify src or test files
        'feat', // A new feature
        'fix', // A bug fix
        'test', // Adding missing tests or correcting existing tests
        'docs', // Documentation only changes
        'ci', // Changes to our CI configuration files and scripts
        'refactor', // A code change that neither fixes a bug nor adds a feature
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'web', // Web dashboard changes
        'js', // JavaScript/TypeScript SDK changes
        'global', // Global for all packages
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'scope-case': [2, 'always', 'lower-case'],
    'scope-empty': [2, 'never'],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
    'body-leading-blank': [1, 'always'],
    'footer-leading-blank': [1, 'always'],
  },
};
