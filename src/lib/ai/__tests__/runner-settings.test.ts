import { RunnerSettingsKind, runnerSettings } from "src/lib/ai/runner-settings";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("Feature: runner settings are read from the environment per call", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled when no service key is set", () => {
    vi.stubEnv("BCR_SERVICE_KEY", "");
    vi.stubEnv("BCR_URL", "https://runner.test");

    expect(runnerSettings()).toEqual({ kind: RunnerSettingsKind.Disabled });
  });

  it("is enabled with the address and key when both are valid", () => {
    vi.stubEnv("BCR_SERVICE_KEY", "bcr_svc_key");
    vi.stubEnv("BCR_URL", "https://runner.test/");

    expect(runnerSettings()).toEqual({
      kind: RunnerSettingsKind.Enabled,
      settings: { url: "https://runner.test", key: "bcr_svc_key" },
    });
  });

  it("names only the variable, never its value, when the address is not an https URL", () => {
    vi.stubEnv("BCR_SERVICE_KEY", "bcr_svc_key");
    vi.stubEnv("BCR_URL", "http://insecure.test");

    const resolution = runnerSettings();

    expect(resolution).toEqual({
      kind: RunnerSettingsKind.Invalid,
      variable: "BCR_URL",
    });
    expect(JSON.stringify(resolution)).not.toContain("insecure.test");
  });
});
