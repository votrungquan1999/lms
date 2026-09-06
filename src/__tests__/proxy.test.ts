import { NextRequest } from "next/server";
import proxy, { config as proxyConfig } from "src/proxy";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Feature: nobody can create an account by posting straight at the sign-in
 * system — only the school's own screens can (BUG-1 boundary closure)
 */
describe("Feature: the sign-up endpoint refuses direct requests unless explicitly allowed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks a direct sign-up POST by default, opens only via the flag, and touches no other auth route", async () => {
    // Given ALLOW_PUBLIC_SIGNUP is unset (closed by default)
    vi.stubEnv("ALLOW_PUBLIC_SIGNUP", "");

    // When a request posts straight at the sign-up endpoint
    const blocked = await proxy(
      new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
      }),
    );

    // Then it is refused before ever reaching Better Auth
    expect(blocked.status).toBe(404);

    // Given the e2e escape hatch is explicitly opened
    vi.stubEnv("ALLOW_PUBLIC_SIGNUP", "true");

    // When the same request is made again
    const allowed = await proxy(
      new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
      }),
    );

    // Then it passes through to Better Auth
    expect(allowed.status).toBe(200);

    // And the matcher names only these exact routes — a wildcard here would
    // also gate sign-in/callback/sign-out/get-session
    expect(proxyConfig.matcher).toEqual([
      "/",
      "/admin/:path*",
      "/student/:path*",
      "/api/auth/sign-up/email",
    ]);
  });

  it("stays closed on any non-exact-'true' value, not just empty string", async () => {
    // Given the flag is set to a truthy-looking but non-exact value
    vi.stubEnv("ALLOW_PUBLIC_SIGNUP", "yes");

    // When a request posts straight at the sign-up endpoint
    const stillBlocked = await proxy(
      new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
      }),
    );

    // Then it is still refused — fail-closed on garbage, not truthy-parsed
    expect(stillBlocked.status).toBe(404);
  });

  it("leaves sign-in and OAuth callback untouched while signup is closed", async () => {
    // Given ALLOW_PUBLIC_SIGNUP is unset (closed by default)
    vi.stubEnv("ALLOW_PUBLIC_SIGNUP", "");

    // When a request hits sign-in or the OAuth callback, not the sign-up path
    const signIn = await proxy(
      new NextRequest("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
      }),
    );
    const callback = await proxy(
      new NextRequest("http://localhost:3000/api/auth/callback/google", {
        method: "GET",
      }),
    );

    // Then neither is refused — the deny branch checks the exact path, not a
    // prefix, independently of whatever Next's own matcher does at build time
    expect(signIn.status).not.toBe(404);
    expect(callback.status).not.toBe(404);
  });
});
