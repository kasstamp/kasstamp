import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import jestPlugin from 'eslint-plugin-jest';

export default [
  // Base JavaScript rules
  js.configs.recommended,

  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.d.ts', // All .d.ts files (type definitions)
      '**/tsconfig.tsbuildinfo',
      // Ignore kaspa wasm sdk files
      'packages/kasstamp_kaspa_wasm_sdk/src/kaspa.*',
    ],
  },

  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Node.js globals
        Buffer: 'readonly',
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        btoa: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
        // Web/WASM globals
        WebAssembly: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        Worker: 'readonly',
        AbortController: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        queueMicrotask: 'readonly',
        // Browser globals
        window: 'readonly',
        self: 'readonly',
        chrome: 'readonly',
        Window: 'readonly',
        // Jest globals will be added in test configuration
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // TypeScript recommended rules (basic)
      ...tsPlugin.configs.recommended.rules,

      // Custom TypeScript rules - STRICT TYPE SAFETY
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // STRICT: Forbid 'any' types - use explicit types instead!
      '@typescript-eslint/no-explicit-any': 'error', // ❌ NO 'any' allowed!

      // Note: We don't ban 'unknown' entirely (it's useful for type guards),
      // but we discourage leaving things as 'unknown' without narrowing.
      // Use type assertions with 'as' to convert unknown to specific types.
      '@typescript-eslint/no-unsafe-assignment': 'off', // Too strict for now
      '@typescript-eslint/no-unsafe-member-access': 'off', // Too strict for now
      '@typescript-eslint/no-unsafe-call': 'off', // Too strict for now
      '@typescript-eslint/no-unsafe-return': 'off', // Too strict for now
      '@typescript-eslint/no-unsafe-argument': 'off', // Too strict for now

      // Prevent problematic type assertions
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'allow-as-parameter',
        },
      ],

      // General code quality
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-undef': 'off', // TypeScript handles this better
    },
  },

  // Test files configuration
  {
    files: ['**/*.test.ts', '**/*.test.js', '**/__tests__/**'],
    plugins: {
      jest: jestPlugin,
    },
    languageOptions: {
      globals: {
        ...jestPlugin.environments.globals.globals,
      },
    },
    rules: {
      ...jestPlugin.configs.recommended.rules,

      // Test-specific rules
      'jest/expect-expect': 'error',
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'error',
      'jest/prefer-to-have-length': 'warn',
      '@typescript-eslint/no-explicit-any': 'off', // Allow any in tests for mocking
      'no-console': 'off', // Allow console in tests
    },
  },

  // JavaScript files (CLI, config files, etc.)
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: {
        // Node.js globals for config files
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Web/WASM globals for compatibility
        WebAssembly: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        Worker: 'readonly',
        AbortController: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        queueMicrotask: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
        btoa: 'readonly',
        // Browser globals
        window: 'readonly',
        self: 'readonly',
        chrome: 'readonly',
        Window: 'readonly',
      },
    },
    rules: {
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'no-console': 'off', // Allow console in JS files (often config/build scripts)
    },
  },

  // Jest setup files
  {
    files: ['jest.setup.js', '**/jest.setup.js', 'jest.config.*'],
    languageOptions: {
      globals: {
        // Node.js globals for Jest setup
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-console': 'off', // Allow console in setup files
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
