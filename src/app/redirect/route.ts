import { NextResponse } from "next/server";
import { getAuthService } from "src/lib/auth-singleton";
import { Role } from "src/lib/session";

/**
 * GET handler for `/redirect`. Sends an admin or student to their dashboard;
 * anyone else — a stale/expired cookie, or a valid session with no recorded
 * role — is signed out and sent home. `AuthService.getSession` collapses
 * both of those into the same `null`, so clearing here needs no extra
 * branch on top of the not-admin/not-student fallthrough.
 *
 * Replaces the old `page.tsx`: a Server Component can't clear a cookie
 * during render (`ReadonlyRequestCookiesError`) — only a Route Handler can.
 * @param request - Carries the session cookie via its own `Headers`, which
 * `getSession` accepts directly (no `cookies()`/`Headers` reconstruction).
 */
export async function GET(request: Request): Promise<Response> {
  const authService = await getAuthService();
  const session = await authService.getSession(request.headers);

  if (session?.role === Role.Admin) {
    return NextResponse.redirect(new URL("/admin/dashboard", request.url));
  }
  if (session?.role === Role.Student) {
    return NextResponse.redirect(new URL("/student/dashboard", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete({ name: "better-auth.session_token", path: "/" });
  // Production writes the `__Secure-` name over https — clearing only the
  // plain name here would still loop a live site through the proxy forever.
  response.cookies.delete({
    name: "__Secure-better-auth.session_token",
    path: "/",
    secure: true,
  });
  // getSessionCookie also falls back to a dash-joined prefix-name form —
  // clear that pair too, or a stale one of those loops the proxy forever.
  response.cookies.delete({ name: "better-auth-session_token", path: "/" });
  response.cookies.delete({
    name: "__Secure-better-auth-session_token",
    path: "/",
    secure: true,
  });
  return response;
}
