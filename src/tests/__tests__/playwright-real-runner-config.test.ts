import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let envFile: string;

/** Loads a fresh copy of the config under the current environment. */
async function loadConfig() {
  vi.resetModules();
  return (await import("../../../playwright.real-runner.config")).default;
}

/** The suite's single web server entry. */
function webServer(config: Awaited<ReturnType<typeof loadConfig>>) {
  const server = config.webServer;
  if (!server || Array.isArray(server)) throw new Error("expected one server");
  return server;
}

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "real-runner-config-"));
  envFile = path.join(dir, "runner.env");
  fs.writeFileSync(
    envFile,
    "BCR_URL=https://runner.example\nBCR_SERVICE_KEY=bcr_svc_file_key\n",
  );
  vi.stubEnv("REAL_RUNNER_ENV_FILE", envFile);
  vi.stubEnv("E2E_PORT", "");
  delete process.env.E2E_PORT;
  vi.stubEnv("E2E_DB_NAME", "");
  delete process.env.E2E_DB_NAME;
  vi.stubEnv("AI_USAGE_RUN_ID", "run-from-caller");
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(path.dirname(envFile), { recursive: true, force: true });
});

describe("real-runner show-me config", () => {
  it("always starts its own server, so a reused one cannot skip the runner variables", async () => {
    expect(webServer(await loadConfig()).reuseExistingServer).toBe(false);
  });

  it("runs only the real-runner spec on its own port and database", async () => {
    // When the config loads with no port or database chosen
    const config = await loadConfig();

    // Then only .real-runner.ts specs run, and port and DB are the show-me's own
    const project = config.projects?.find((p) => p.name === "real-runner");
    expect(project?.testMatch).toEqual(/.*\.real-runner\.ts/);
    expect(webServer(await loadConfig()).url).toBe("http://localhost:3006");
    expect(process.env.E2E_DB_NAME).toBe("lms_e2e_real_runner");
  });

  it("hands the server the env file's runner values and the run id the spec uses", async () => {
    // When the config loads
    const env = webServer(await loadConfig()).env;

    // Then the server holds the file's values and the caller's run id
    expect(env).toMatchObject({
      BCR_URL: "https://runner.example",
      BCR_SERVICE_KEY: "bcr_svc_file_key",
      AI_USAGE_RUN_ID: "run-from-caller",
    });
  });

  it("fails before booting a server when the env file lacks the service key", async () => {
    // Given an env file without BCR_SERVICE_KEY
    fs.writeFileSync(envFile, "BCR_URL=https://runner.example\n");

    // When the config loads, then it names the missing value without echoing any key
    await expect(loadConfig()).rejects.toThrow("has no BCR_SERVICE_KEY value");
  });
});
