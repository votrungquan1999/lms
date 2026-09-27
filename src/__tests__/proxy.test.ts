import { NextRequest } from "next/server";
import { GET as redirectGet } from "src/app/redirect/route";
import proxy, { config as proxyConfig } from "src/proxy";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ getSession })),
}));

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

/**
 * Feature: a stale session cookie never loops a visitor between `/` and
 * `/redirect` forever — the proxy alone only proves the bounce to
 * `/redirect`; chaining into the route handler is what proves the cookie
 * actually gets cleared, so the next visit to `/` doesn't bounce again.
 */
describe("Feature: a stale cookie is cleared, not bounced forever, between / and /redirect", () => {
  // better-auth writes the plain name over http and the `__Secure-` name
  // (with the Secure flag) over https, both at Path=/. getSessionCookie
  // also accepts a dash-joined prefix-name form as a fallback, so a stale
  // cookie under either naming scheme must bounce and clear the same way.
  it.each([
    ["better-auth.session_token", false],
    ["__Secure-better-auth.session_token", true],
    ["better-auth-session_token", false],
    ["__Secure-better-auth-session_token", true],
  ] as const)(
    "proxy sends a stale %s visit to /redirect, and /redirect clears that same cookie",
    async (cookieName, secure) => {
      // Given a request to "/" carrying a stale session cookie
      const staleCookie = `${cookieName}=stale`;
      const toHome = new NextRequest("http://localhost:3000/", {
        headers: { cookie: staleCookie },
      });

      // When it passes through the proxy
      const bounced = await proxy(toHome);

      // Then it is redirected to /redirect, never straight back to "/"
      expect(bounced.status).toBe(307);
      expect(new URL(bounced.headers.get("location") ?? "").pathname).toBe(
        "/redirect",
      );

      // And when that same cookie reaches /redirect with no resolvable session
      getSession.mockResolvedValueOnce(null);
      const cleared = await redirectGet(
        new Request("http://localhost:3000/redirect", {
          headers: { cookie: staleCookie },
        }),
      );

      // Then the visitor lands home and that exact cookie comes back expired
      // at Path=/ — a browser ignores a `__Secure-` clear that isn't itself
      // Secure, which would leave the cookie and loop the next visit to "/"
      expect(new URL(cleared.headers.get("location") ?? "").pathname).toBe("/");
      const clear = cleared.headers
        .getSetCookie()
        .find((c) => c.startsWith(`${cookieName}=;`));
      expect(clear).toBeDefined();
      expect(clear).toMatch(/; Path=\/(;|$)/);
      expect(clear).toMatch(/; Expires=Thu, 01 Jan 1970 00:00:00 GMT(;|$)/);
      expect(/; Secure(;|$)/.test(clear ?? "")).toBe(secure);
    },
  );
});
