import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
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
  keepNames: true,

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

  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },

  esbuildOptions(options) {
    options.logOverride = {
      'duplicate-class-member': 'silent',
    };
  },
});
