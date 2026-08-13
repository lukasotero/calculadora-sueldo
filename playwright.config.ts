import { defineConfig, devices } from "@playwright/test";

const basePath = process.env.PAGES_BASE_PATH ?? "";
const port = process.env.PLAYWRIGHT_PORT ?? "3000";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: `http://127.0.0.1:${port}${basePath}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run build && npm run start -- -l ${port}`,
    url: `http://127.0.0.1:${port}${basePath}/`,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "notebook",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: "ultrawide",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 3440, height: 1440 },
      },
    },
  ],
});
