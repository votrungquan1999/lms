import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Opt-in run against the REAL Gemini API — every run is billed. It doubles as
 * a demo: the imported test stays in its DB for the owner to look at.
 * `pnpm test:e2e:real-ai`. Needs two gitignored files:
 * - `.env.e2e-real.local` with `GOOGLE_GENERATIVE_AI_API_KEY=...`
 * - `e2e/fixtures/private/sinh-10-hk1.docx` (a real teacher's exam; this repo is public)
 * Optional: `.env.e2e-real-s3.local` (E2E_S3_BUCKET_NAME, E2E_AWS_REGION,
 * E2E_AWS_ACCESS_KEY_ID, E2E_AWS_SECRET_ACCESS_KEY — Pulumi's LMS local-dev
 * user) stores the exam's pictures in the real bucket so they show on the
 * imported test; without it the uploads are faked.
 */

const KEY_FILE = ".env.e2e-real.local";
const EXAM_DOCX = "e2e/fixtures/private/sinh-10-hk1.docx";
const REAL_S3_FILE = ".env.e2e-real-s3.local";

// Fail before booting a server — a missing prerequisite would otherwise
// surface minutes later as an unrelated-looking UI timeout.
if (!fs.existsSync(KEY_FILE)) {
  throw new Error(
    `${KEY_FILE} is missing — create it with GOOGLE_GENERATIVE_AI_API_KEY=<real key>.`,
  );
}
process.loadEnvFile(KEY_FILE);
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  throw new Error(`${KEY_FILE} has no GOOGLE_GENERATIVE_AI_API_KEY value.`);
}
if (!fs.existsSync(EXAM_DOCX)) {
  throw new Error(`${EXAM_DOCX} is missing — copy the exam .docx there.`);
}
// The dev script and the spec both read the E2E_S3_* names it sets.
if (fs.existsSync(REAL_S3_FILE)) {
  process.loadEnvFile(REAL_S3_FILE);
}

// Own port + DB so it never touches the mocked suite's server or data.
// Set on process.env so the shared auth/global setup files follow them too.
process.env.E2E_PORT ??= "3005";
process.env.E2E_DB_NAME ??= "lms_e2e_real_ai";
const BASE_URL = `http://localhost:${process.env.E2E_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,

  // Never retry: a retry is a second paid Gemini call with no code change.
  retries: 0,
  reporter: "list",
  // Covers the Gemini call itself (the client's own limit is 240s) plus the import.
  timeout: 420_000,

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },

  webServer: {
    command: "pnpm dev:e2e:real-ai",
    url: BASE_URL,
    // Reusing a server could mean reusing the MOCKED one — the run would
    // pass or fail without ever calling Gemini.
    reuseExistingServer: false,
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
      name: "real-ai",
      testMatch: /.*\.real-ai\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
  ],
});
