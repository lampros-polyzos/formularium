import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      // The browser's own alert, confirm and prompt look out of place: use useDialog() from hooks/useDialog
      'no-alert': 'error',
      // New in eslint-plugin-react-hooks 7: flags effects that set state or load data directly.
      // Kept visible as warnings while those effects are reworked (see docs/roadmap.md); not failures.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // A context file exports its provider and the hook that reads it together, on purpose
    files: ['src/contexts/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
