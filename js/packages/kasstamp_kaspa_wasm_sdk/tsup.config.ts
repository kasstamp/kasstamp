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
  // CRITICAL: Disable minification to preserve class names (Resolver, RpcClient, etc.)
  // esbuild's keepNames doesn't prevent class name mangling, which breaks instanceof checks
  // Since this package uses source files directly (package.json points to src/),
  // any minification here would break WASM instanceof checks when consumed
  minify: false,
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
    // Explicitly ensure keepNames is set for WASM classes (Resolver, RpcClient, etc.)
    // This prevents instanceof checks from failing when classes are minified
    options.keepNames = true;
  },
});
