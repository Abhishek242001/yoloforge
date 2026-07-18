import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

// Middleware runs in the Edge Runtime, which cannot use Node's `crypto`
// module or a Postgres connection pool — so this does NOT call the full
// `auth()` (that hits the DB on every request, via src/lib/auth.ts).
// Instead it does a lightweight JWT presence/role check using the same
// signed cookie, which is Edge-safe. The authoritative 48h-expiry check
// against the `sessions` table still happens in the `session` callback
// in src/lib/auth.ts on every actual page/API request — this middleware
// is just a fast redirect for the common case, not the security boundary.
export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  const isLoggedIn = !!token;
  const isAdmin = token?.role === "admin";

  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) return NextResponse.redirect(new URL("/login", req.url));
    if (!isAdmin) return NextResponse.redirect(new URL("/", req.url));
  }

  if (pathname.startsWith("/settings") && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/settings/:path*"],
};
