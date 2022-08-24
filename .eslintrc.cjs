module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json'
  },
  extends: ['standard', 'plugin:import/typescript', 'standard-with-typescript'],
  rules: {
    'import/extensions': [2, 'always', { ignorePackages: true }], // This is required for proper ESM use
    'import/order': [
      2,
      {
        groups: [['builtin', 'external'], 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
        'newlines-between': 'never',
        alphabetize: { order: 'asc', caseInsensitive: true }
      }
    ],
    'no-return-await': 2, // Do not create useless promises
    'space-before-function-paren': 0, // This is inserted to make this compatible with prettier.
    '@typescript-eslint/no-non-null-assertion': 0,
    '@typescript-eslint/promise-function-async': 0,
    '@typescript-eslint/require-await': 2,
    '@typescript-eslint/restrict-template-expressions': 0,
    '@typescript-eslint/return-await': 0,
    '@typescript-eslint/space-before-function-paren': 0, // This is inserted to make this compatible with prettier.
    '@typescript-eslint/strict-boolean-expressions': 0,
    '@typescript-eslint/typedef': [
      2,
      {
        parameter: true,
        memberVariableDeclaration: true,
        propertyDeclaration: true
      }
    ]
  },
  plugins: ['import'],
  reportUnusedDisableDirectives: true,
  overrides: [
    {
      files: ['*.cjs'],
      parser: 'espree',
      parserOptions: {
        ecmaVersion: 2022
      },
      extends: ['standard']
    }
  ]
}
