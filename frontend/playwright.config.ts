import { defineConfig } from '@playwright/test';

// Serial on purpose: every spec shares one test database (reset once in globalSetup).
// Run with the backend's DB password in the env if it differs from backend/.env.test:
//   DB_PASSWORD=<yours> npm run test:e2e
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome', // system Google Chrome, so no Playwright browser download is needed
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm --prefix ../backend run start:e2e',
      url: 'http://localhost:5001/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
      // Expected 401s (session probe before login) and Redis-down messages are logged to stderr.
      // To debug the API, start it yourself with `npm run start:e2e` in backend/ and it is reused.
      stderr: 'ignore',
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
