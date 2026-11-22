import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the dev server and the real Firebase project (App Check debug token from .env.local).
// Chrome's on-device model is replaced by a fake in the page, so the tests make no Gemini calls.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://localhost:5173', ...devices['Desktop Chrome'] },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
});
