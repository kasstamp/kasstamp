import { defineConfig } from 'tsup';

export default defineConfig({
  // Inherit from root config but add WASM-specific configurations
  entry: ['src/index.ts', 'src/platform.ts'],
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  splitting: false,
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  minify: process.env.NODE_ENV === 'production',
  treeshake: true,
  outDir: 'dist',
  shims: true,
  platform: 'neutral',

  // Keep these external as they should be provided by the environment
  external: [
    'node:*',
    'crypto',
    'fs',
    'path',
    'os',
    'util',
    // Keep the actual WASM package external - it's a native binding
    /^kaspa$/,
    /^kaspa\//,
  ],

  // Define globals for browser builds
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },

  // Ensure compatibility
  keepNames: true,

  // WASM-specific: Suppress esbuild warnings for generated kaspa.js files
  esbuildOptions: (options) => {
    // Suppress duplicate class member warnings from generated WASM files
    options.logOverride = {
      'duplicate-class-member': 'silent',
    };
  },
});
