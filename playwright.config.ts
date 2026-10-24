import { defineConfig, devices } from "@playwright/test";

// Overridable so the suite's own server can run beside a dev server on the
// default port; the suite never reuses a server it did not start.
const PORT = process.env.E2E_PORT ?? "3001";
const BASE_URL = `http://localhost:${PORT}`;

// Lets the usage file's records from this run be told apart from earlier runs.
process.env.AI_USAGE_RUN_ID ??= new Date().toISOString();

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",

  /* Tests share the same MongoDB — run files sequentially to avoid conflicts */
  fullyParallel: false,
  workers: 1,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* No retries — flaky tests should be fixed, not retried */
  retries: 0,

  /* Reporter: list for local, HTML report for CI */
  reporter: process.env.CI ? "html" : "list",

  use: {
    baseURL: BASE_URL,
    /* Collect trace on failure for debugging */
    trace: "on-first-retry",
  },

  /* Start the Next.js e2e server before tests */
  webServer: {
    command: "pnpm dev:e2e",
    url: BASE_URL,
    reuseExistingServer: false,
    env: { AI_USAGE_RUN_ID: process.env.AI_USAGE_RUN_ID },
    stdout: "pipe",
    stderr: "pipe",
  },

  projects: [
    /* Auth setup — creates admin auth state only */
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },

    /* E2E flow — sequential tests that drive full user journey */
    {
      name: "e2e-flow",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
  ],
});
