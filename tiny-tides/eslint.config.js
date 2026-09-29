// Lint gate: catches undefined names, unused code and common mistakes. Run with `npm run lint`.
const browser = ['window', 'document', 'navigator', 'localStorage', 'location', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'console', 'Image', 'Path2D', 'File', 'FileReader', 'URL', 'Blob', 'AudioContext', 'webkitAudioContext', 'Event', 'CustomEvent', 'HTMLElement', 'getComputedStyle', 'requestIdleCallback', 'fetch'];
const build = ['__DEMO__', '__DEBUG__', '__SITE__', '__LICENSES__'];
const toObj = (names, v = 'readonly') => Object.fromEntries(names.map((n) => [n, v]));
export default [
  { ignores: ['www/**', 'dist/**', 'ios/**', 'node_modules/**', 'store/**', 'site/**', 'assets/**'] },
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...toObj(browser), ...toObj(build) } },
    rules: {
      'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }], 'no-redeclare': 'error', 'no-dupe-keys': 'error',
      'no-unreachable': 'error', 'no-const-assign': 'error', 'no-self-assign': 'error', 'no-dupe-else-if': 'error', 'no-loss-of-precision': 'error', 'no-unsafe-finally': 'error',
      'no-cond-assign': ['error', 'except-parens'], 'no-fallthrough': 'error', 'no-prototype-builtins': 'off', 'use-isnan': 'error', 'valid-typeof': 'error', 'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-shadow-restricted-names': 'error', 'no-useless-catch': 'warn', 'no-constant-condition': ['warn', { checkLoops: false }],
    },
  },
  {
    files: ['tools/**/*.{js,mjs}', 'test/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...toObj(browser), process: 'readonly', Buffer: 'readonly', ...toObj(build) } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }], 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-const-assign': 'error' },
  },
];
