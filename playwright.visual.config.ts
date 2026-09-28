import { readFileSync } from "node:fs";
import { defineConfig, devices, type Project } from "@playwright/test";

// Turns snap() on. No other config sets it, so the snap() lines in ordinary
// e2e specs stay silent and `npm run test:e2e` keeps the real clock.
process.env.VISUAL_QA = "1";

// Own port and database: a visual run must never reuse the e2e server (3001)
// or a dev server the user has open, and must never share e2e's database —
// this config deliberately has no globalSetup, so the data it finds is seeded.
const PORT = process.env.E2E_PORT ?? "3011";
const DB_NAME = process.env.E2E_DB_NAME ?? "lms_visual";
// e2e/auth.setup.ts reads these off the environment, so set them in THIS
// process too, not only in the webServer's.
process.env.E2E_PORT = PORT;
process.env.E2E_DB_NAME = DB_NAME;

const BASE_URL = `http://localhost:${PORT}`;

const desktop: Project = {
  name: "desktop",
  use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
};
const mobile: Project = {
  name: "mobile",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  },
};
const tablet: Project = {
  name: "tablet",
  use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
};
const wide: Project = {
  name: "wide",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1920, height: 1080 },
  },
};
const dark = (p: Project): Project => ({
  ...p,
  name: `${p.name}-dark`,
  use: { ...p.use, colorScheme: "dark" },
});

const PRESETS: Record<string, Project[]> = {
  desktop: [desktop],
  "desktop-mobile": [desktop, mobile],
  "desktop-mobile-dark": [desktop, mobile, dark(desktop), dark(mobile)],
  full: [mobile, tablet, desktop, wide],
};

const { viewportPreset } = JSON.parse(readFileSync("visual-qa.json", "utf8"));
const preset = PRESETS[viewportPreset];
if (!preset) {
  throw new Error(`visual-qa.json: unknown viewportPreset "${viewportPreset}"`);
}

// Tours run signed in as the admin; a student tour overrides this per file
// with test.use({ storageState: "playwright/.auth/student.json" }).
const captureProjects = preset.map((project) => ({
  ...project,
  testMatch: ["**/*.tour.ts"],
  dependencies: ["setup"],
  use: { ...project.use, storageState: "playwright/.auth/admin.json" },
}));

export default defineConfig({
  testDir: "./e2e",

  /* Tours share one database and one server — run them one at a time. */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",

  use: {
    baseURL: BASE_URL,
    trace: "off",
    /* Without these, text antialiasing differs run to run and every shot
       looks changed. */
    launchOptions: {
      args: ["--disable-lcd-text", "--font-render-hinting=none"],
    },
  },

  webServer: {
    command: "pnpm dev:e2e",
    url: BASE_URL,
    env: { E2E_PORT: PORT, E2E_DB_NAME: DB_NAME },
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },

  projects: [
    {
      name: "setup",
      testMatch: ["**/visual/visual.auth.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    ...captureProjects,
  ],
});
