import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'node_modules', '.vite'] },
  {
    files: ['**/*.{js,jsx}'],
    settings: {
      react: { version: 'detect' },
    },
    languageOptions: {
      ecmaVersion: 2021,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/jsx-uses-vars': 'error',
      // Vite + modern React use the automatic JSX runtime (no need for `import React`).
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
    },
  },
  {
    files: ['server/**/*.{js,mjs}', 'scripts/**/*.{js,mjs}', 'vite.config.js', 'api/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
]

