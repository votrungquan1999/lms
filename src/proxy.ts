import { type NextRequest, NextResponse } from "next/server";

const protectedRoutes = ["/admin/dashboard"];
const publicRoutes = ["/admin/login"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtectedRoute = protectedRoutes.some((route) =>
    path.startsWith(route),
  );
  const isPublicRoute = publicRoutes.some((route) => path.startsWith(route));

  // Check for Better Auth session cookie
  const sessionCookie = req.cookies.get("better-auth.session_token");

  // Redirect to login if accessing protected route without session
  if (isProtectedRoute && !sessionCookie) {
    return NextResponse.redirect(new URL("/admin/login", req.nextUrl));
  }

  // Redirect to dashboard if already logged in and visiting login page
  if (isPublicRoute && sessionCookie) {
    return NextResponse.redirect(new URL("/admin/dashboard", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
