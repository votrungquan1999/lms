import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { isPublicSignUpAllowed } from "src/lib/config";

const protectedRoutes = [
  "/admin/dashboard",
  "/admin/courses",
  "/student/dashboard",
  "/student/courses",
];

/** Only this exact path is gated — never a `/api/auth/:path*` wildcard,
 * which would also block sign-in/callback/sign-out/get-session. */
const SIGN_UP_PATH = "/api/auth/sign-up/email";

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Direct signup is closed by default (BUG-1) — only the school's own
  // screens (invite links, bulk import) create accounts in-process, which
  // never goes through this HTTP boundary.
  if (path === SIGN_UP_PATH && !isPublicSignUpAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sessionCookie = getSessionCookie(req);

  // Redirect authenticated users from landing page to role-based redirect
  if (path === "/" && sessionCookie) {
    return NextResponse.redirect(new URL("/redirect", req.nextUrl));
  }

  const isProtectedRoute = protectedRoutes.some((route) =>
    path.startsWith(route),
  );

  // Redirect to login if accessing protected route without session
  if (isProtectedRoute && !sessionCookie) {
    const loginPath = path.startsWith("/admin")
      ? "/admin/login"
      : "/student/login";
    return NextResponse.redirect(new URL(loginPath, req.nextUrl));
  }

  return NextResponse.next();
}

// Next parses this array statically at build time, before constant folding —
// a variable reference here is unresolvable and silently discards the whole
// matcher, widening the proxy to every route. Keep it a literal; SIGN_UP_PATH
// above is for the runtime comparison only.
export const config = {
  matcher: ["/", "/admin/:path*", "/student/:path*", "/api/auth/sign-up/email"],
};
