import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

function parsePort(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 65535 ? Math.floor(n) : fallback;
}

export default defineConfig(({ mode }) => {
  const rootDir = process.cwd();
  const rootEnv = loadEnv(mode, rootDir, '');
  const backendEnv = loadEnv(mode, path.join(rootDir, 'backend'), '');
  const env = { ...rootEnv, ...backendEnv };

  const frontendDevPort = parsePort(env.FRONTEND_DEV_PORT, 5173);
  const backendPort = parsePort(env.BACKEND_PORT, 8000);

  return {
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
      port: frontendDevPort,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      proxy: {
        '/api/v1': {
          target: `http://127.0.0.1:${backendPort}`,
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
  };
});
