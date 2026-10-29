// EXAMPLE ESLint flat config for a TS project. Copy to the repo root.
// Install: __INSTALL_CMD__ -D eslint @eslint/js typescript-eslint eslint-config-prettier prettier
// Scripts: "lint": "eslint .", "format": "prettier --write .", "format:check": "prettier --check ."
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'build', '.next', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Secrets and endpoints come from env vars, never literals (tools/guards checks URLs too).
      'no-restricted-syntax': ['error', { selector: "Literal[value=/^https?:\\/\\/(localhost|127\\.)/]", message: 'Read local URLs from env vars.' }],
    },
  },
  prettier,
);
