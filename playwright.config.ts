import { defineConfig, devices } from '@playwright/test';

/** Mirrors former jest-puppeteer: dev + test → port 4000, production → 3000. */
function e2eTarget(): { command: string; port: number; baseURL: string } {
  const mode = process.env.NODE_ENV;
  if (mode === 'production') {
    return {
      command: 'npm run start:production',
      port: 3000,
      baseURL: 'http://127.0.0.1:3000/',
    };
  }
  const cmd =
    mode === 'development' ? 'npm run start:development' : 'npm run start:test';
  return {
    command: cmd,
    port: 4000,
    baseURL: 'http://127.0.0.1:4000/',
  };
}

const { command, port, baseURL } = e2eTarget();

export default defineConfig({
  testDir: './tests',
  testMatch: '**/e2e.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--no-sandbox'],
        },
      },
    },
  ],
  webServer: {
    command,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
