import { defineConfig, devices } from '@playwright/test';

// Not 5173, so a dev server you already have open on the default port keeps
// pointing at data/sorcery.db while the suite runs against its own database.
const PORT = 5199;

export default defineConfig({
  testDir: './tests',
  // One shared dev server and one shared database, and the authenticated specs
  // write rows, so these must not run concurrently.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The seed must run before vite opens the database, and Playwright starts
    // webServer before globalSetup — so it is chained here rather than there.
    command: `node tests/seed-e2e-db.js && npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/cards`,
    // Never reuse a server that might be pointed at the real database.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DB_PATH: './data/e2e.db',
      // priceScheduler.js bails when this is empty, which keeps the suite from
      // firing live tcgapi.dev requests and eating the daily quota.
      TCGAPI_KEY: ''
    }
  }
});
