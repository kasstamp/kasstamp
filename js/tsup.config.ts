import { defineConfig } from 'tsup';

export default defineConfig({
  // Build for both Node.js and browsers
  format: ['esm', 'cjs'],

  // Generate TypeScript declaration files - disabled due to complex multi-package dependencies
  dts: false,

  // Clean output directory before build
  clean: true,

  // Disable splitting to bundle everything in one file
  splitting: false,

  // Bundle dependencies to avoid import issues
  bundle: true,

  // Source maps for debugging
  sourcemap: true,

  // Target modern environments but maintain compatibility
  target: 'es2022',

  // Bundle most dependencies for browser compatibility

  // Minify for production builds
  minify: process.env.NODE_ENV === 'production',

  // Enable tree-shaking
  treeshake: true,

  // Entry point configuration (will be overridden by each package)
  entry: ['src/index.ts'],

  // Output directory
  outDir: 'dist',

  // Preserve dynamic imports
  shims: true,

  // Platform-specific configurations
  platform: 'neutral', // Works for both Node.js and browsers

  // Keep these external as they should be provided by the environment
  external: [
    // Node.js built-ins
    'node:*',
    'crypto',
    'fs',
    'path',
    'os',
    'util',
    'uuid',
    // Keep @kasstamp/utils external to ensure single logger instance across all packages
    '@kasstamp/utils',
  ],

  // Define globals for browser builds
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },

  // Ensure compatibility
  keepNames: true,
});
