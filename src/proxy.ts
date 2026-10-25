import { NextRequest, NextResponse } from "next/server";
import { getAuth0, isAuthConfigured } from "./lib/auth0";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/+$/, "");
  // The app needs only its own /api/me, not SDK user claims or browser tokens.
  if (path === "/auth/profile" || path === "/auth/access-token") {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!isAuthConfigured()) {
    if (path.startsWith("/auth/")) {
      return new NextResponse("Sign-in setup is incomplete. Configure Auth0 using DEVELOPMENT.md, then restart the app.", {
        status: 503, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return NextResponse.next();
  }
  try {
    return await getAuth0().middleware(request);
  } catch {
    return new NextResponse("Sign-in is temporarily unavailable. Return home and try again.", {
      status: 503, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
