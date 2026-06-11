import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3199',
    viewport: { width: 1280, height: 800 }
  },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3199/healthz',
    reuseExistingServer: false,
    timeout: 120000,
    env: { PORT: '3199' }
  }
});
