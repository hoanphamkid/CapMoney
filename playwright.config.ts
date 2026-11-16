import { defineConfig } from '@playwright/test';

// Keep browser tests separate from other applications using Vite's default port.
const port = Number(process.env.PLAYWRIGHT_PORT || 5175);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL, screenshot: 'only-on-failure' },
  webServer: {
    command: `npm run dev --workspace frontend -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
