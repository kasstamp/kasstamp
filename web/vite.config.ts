import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    // Enable HTTPS only in dev mode (command === 'serve')
    command === 'serve' && basicSsl(),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      external: [
        'vite-plugin-node-polyfills/shims/process',
        'vite-plugin-node-polyfills/shims/global',
        'vite-plugin-node-polyfills/shims/buffer',
      ],
    },
  },
  define: {
    global: 'globalThis',
    // Explicitly set NODE_ENV based on Vite mode
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
  },
  resolve: {
    alias: {
      // Path aliases for feature-based architecture
      '@/features': path.resolve(__dirname, './src/features'),
      '@/shared': path.resolve(__dirname, './src/shared'),
      '@/core': path.resolve(__dirname, './src/core'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      // Additional polyfills if needed
      stream: 'readable-stream',
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['buffer', 'events'],
    exclude: ['@kasstamp/kaspa-wasm-sdk'],
  },
  // Add static asset handling for WASM files - CRITICAL for WebAssembly
  assetsInclude: ['**/*.wasm'],
  // Additional server configuration for WASM handling
  server: {
    host: true, // Expose to local network
    port: 5174,
    fs: {
      allow: ['..'],
    },
  },
  // Worker support for WASM
  worker: {
    format: 'es',
  },
}));
