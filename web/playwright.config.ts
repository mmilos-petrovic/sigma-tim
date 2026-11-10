import { defineConfig, devices } from '@playwright/test'

// Browser check of the sign-in flow against the local stack (`npm run dev` once, so the test accounts exist).
// Uses an installed browser instead of a download: E2E_CHANNEL=chrome|msedge, default msedge. Not run in CI yet.

// The public half of a VAPID key pair made for tests only (nothing is ever sent with it). The notification prompts exist only
// in a build that has a key, so their specs (push-*.spec.ts) run against a second dev server that has one.
const TEST_VAPID_PUBLIC_KEY =
  'BLhqf8u-tFSJcpEWo1azyylK6u_gGyCA-h409NVKOuHWzgqDmoqNWU1UDPDXnSwPbxen2tzYBxss0UTNdyxcP8U'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    channel: process.env.E2E_CHANNEL ?? 'msedge',
  },
  // The student and parent screens are made for a phone: their specs (student-*.spec.ts) run on two phone-sized
  // screens, everything else on a desktop. Phones are emulated with the installed Chromium-based browser (viewport,
  // touch, mobile user agent), not with a real iOS or Android engine.
  projects: [
    {
      name: 'desktop',
      testIgnore: /(student|push)-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: process.env.E2E_CHANNEL ?? 'msedge' },
    },
    {
      name: 'push',
      testMatch: /push-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.E2E_CHANNEL ?? 'msedge',
        baseURL: 'http://127.0.0.1:5174',
      },
    },
    {
      name: 'phone-small',
      testMatch: /student-.*\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        channel: process.env.E2E_CHANNEL ?? 'msedge',
      },
    },
    {
      name: 'phone-android',
      testMatch: /student-.*\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        defaultBrowserType: 'chromium',
        channel: process.env.E2E_CHANNEL ?? 'msedge',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      env: { VITE_VAPID_PUBLIC_KEY: TEST_VAPID_PUBLIC_KEY },
      reuseExistingServer: true,
    },
  ],
})
