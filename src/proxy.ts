import { type NextRequest, NextResponse } from "next/server";

const protectedRoutes = [
  "/admin/dashboard",
  "/admin/courses",
  "/student/dashboard",
  "/student/courses",
];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) =>
    path.startsWith(route),
  );

  // Check for Better Auth session cookie
  const sessionCookie = req.cookies.get("better-auth.session_token");

  // Redirect to login if accessing protected route without session
  if (isProtectedRoute && !sessionCookie) {
    const loginPath = path.startsWith("/admin")
      ? "/admin/login"
      : "/student/login";
    return NextResponse.redirect(new URL(loginPath, req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/student/:path*"],
};
