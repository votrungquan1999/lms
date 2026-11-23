import { defineConfig, devices } from "@playwright/test";
import { buildRunnerDemoServerEnv } from "./e2e/real-runner-env";

/**
 * Opt-in show-me run against the REAL background Claude runner: every run
 * creates a paid runner job. `pnpm test:e2e:real-runner`. Needs the gitignored
 * `.env.e2e-real-runner.local` with `BCR_URL=...` and `BCR_SERVICE_KEY=...`,
 * the runner machine on, and the e2e admin's email in `.env.local`'s
 * `ADMIN_EMAILS`. The run record lands in `tmp/real-ai-runs/<run-id>-runner.json`.
 */

// Overridable only so the config test never reads the owner's real file.
const ENV_FILE =
  process.env.REAL_RUNNER_ENV_FILE ?? ".env.e2e-real-runner.local";

// The server gets the file's values explicitly; see buildRunnerDemoServerEnv.
const SERVER_ENV = buildRunnerDemoServerEnv(ENV_FILE, process.env, __dirname);

// Own port + DB so it never touches the other suites' servers or data.
// Set on process.env so the shared auth/global setup files follow them too.
process.env.E2E_PORT ??= "3006";
process.env.E2E_DB_NAME ??= "lms_e2e_real_runner";
const BASE_URL = `http://localhost:${process.env.E2E_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,

  // Never retry: a retry is another paid job with no code change.
  retries: 0,
  reporter: "list",
  // A job can wait in the runner's queue before it starts.
  timeout: 1_500_000,

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },

  webServer: {
    command: "pnpm dev:e2e:real-runner",
    url: BASE_URL,
    // A reused server could be one without the runner variables, so the run
    // would grade through Gemini without ever calling the runner.
    reuseExistingServer: false,
    env: SERVER_ENV,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "real-runner",
      testMatch: /.*\.real-runner\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
  ],
});
