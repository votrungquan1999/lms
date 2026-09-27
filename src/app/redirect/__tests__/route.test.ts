import { AdminSession, StudentSession } from "src/lib/session";
import { describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ getSession })),
}));

import { GET } from "../route";

/**
 * Feature: `/redirect` sends every visitor somewhere useful instead of
 * crashing — a Server Component tried to clear a cookie outside a Server
 * Action/Route Handler and 500'd; this is the route handler that replaced
 * it.
 */
describe("GET /redirect", () => {
  it("clears both session cookie names and sends a signed-out or unclassified visitor home", async () => {
    // Given no usable session — covers a stale/expired cookie AND a valid
    // session with no recorded role, since AuthService.getSession collapses
    // both into the same null result.
    getSession.mockResolvedValueOnce(null);

    const res = await GET(
      new Request("http://test/redirect", {
        headers: { cookie: "better-auth.session_token=stale" },
      }),
    );

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/");
    const setCookies = res.headers.getSetCookie();
    expect(
      setCookies.some((c) => c.startsWith("better-auth.session_token=;")),
    ).toBe(true);
    expect(
      setCookies.some((c) =>
        c.startsWith("__Secure-better-auth.session_token=;"),
      ),
    ).toBe(true);
  });

  it("sends an admin to the admin dashboard", async () => {
    getSession.mockResolvedValueOnce(
      new AdminSession({ userId: "admin-1", email: "admin@lms.internal" }),
    );

    const res = await GET(new Request("http://test/redirect"));

    expect(new URL(res.headers.get("location") ?? "").pathname).toBe(
      "/admin/dashboard",
    );
    // A signed-in admin keeps their session
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("sends a student to the student dashboard", async () => {
    getSession.mockResolvedValueOnce(
      new StudentSession({
        userId: "auth-1",
        username: "alice",
        studentId: "student-1",
      }),
    );

    const res = await GET(new Request("http://test/redirect"));

    expect(new URL(res.headers.get("location") ?? "").pathname).toBe(
      "/student/dashboard",
    );
    // A signed-in student keeps their session
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});
