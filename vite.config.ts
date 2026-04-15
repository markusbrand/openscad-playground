import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'src/wasm/openscad.js',
          dest: '.',
        },
        {
          src: 'src/wasm/openscad.wasm',
          dest: '.',
        },
      ],
    }),
  ],
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api/v1': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      external: ['/openscad.js'],
    },
  },
  optimizeDeps: {
    exclude: ['@anthropic-ai/sdk'],
  },
  assetsInclude: ['**/*.wasm'],
});
