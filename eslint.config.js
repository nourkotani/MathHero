import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Game Core purity (docs/ARCHITECTURE.md): clock and PRNG are injected.
    files: ['src/core/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Core is pure: time arrives via events.' },
        { object: 'performance', property: 'now', message: 'Core is pure: time arrives via events.' },
        { object: 'Math', property: 'random', message: 'Core is pure: use the injected PRNG.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Core never touches the browser.' },
        { name: 'document', message: 'Core never touches the browser.' },
        { name: 'localStorage', message: 'Only the persistence adapter touches localStorage.' },
      ],
    },
  },
);
