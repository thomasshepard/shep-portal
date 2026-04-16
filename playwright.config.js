import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,        // serial — tests share live Airtable state
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30_000,

  use: {
    baseURL:    'http://localhost:5173/shep-portal',
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
    video:      'on-first-retry',
  },

  projects: [
    // 1. Auth setup — runs first, saves session to disk
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },

    // 2. All other specs run with saved session
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/session.json',
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.js/,
    },
  ],

  // Auto-start dev server if not already running
  webServer: {
    command:             'npm run dev',
    url:                 'http://localhost:5173/shep-portal/',
    reuseExistingServer: true,
    timeout:             30_000,
  },
})
