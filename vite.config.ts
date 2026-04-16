import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';
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

  const apiProxy = {
    '/api/v1': {
      target: `http://127.0.0.1:${backendPort}`,
      changeOrigin: true,
    },
  } as const;

  const webManifest = JSON.parse(
    readFileSync(path.join(rootDir, 'public/manifest.json'), 'utf-8'),
  ) as Record<string, unknown>;

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
      VitePWA({
        registerType: 'prompt',
        /** `virtual:pwa-register` in `src/index.tsx` — do not inject a second registration script. */
        injectRegister: false,
        manifest: webManifest,
        // Same basename as `public/manifest.json` so dev (PWA off) still serves a valid manifest.
        manifestFilename: 'manifest.json',
        includeAssets: ['favicon.ico', 'logo192.png', 'logo512.png'],
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,webmanifest}'],
          globIgnores: ['**/*.map'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /\.zip$/i],
          runtimeCaching: [
            {
              urlPattern: /^https?:\/\/[^/]+\/openscad\.wasm$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'openscad-wasm',
                expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: /^https?:\/\/[^/]+\/openscad-worker.*\.js$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'openscad-worker',
                expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: /^https?:\/\/[^/]+\/libraries\/.*\.zip$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'library-zips',
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
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
      proxy: apiProxy,
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
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      // Same-origin `/api/v1` during `vite preview` (e.g. NODE_ENV=production e2e).
      proxy: apiProxy,
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
