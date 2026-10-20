import { NextResponse, type NextRequest } from "next/server";
import { agentAuthorized, allowsDuringPasswordChange, isPublicPath, isStaticAsset } from "@/lib/auth/guard";
import { readSessionFromRequest } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isStaticAsset(pathname) || isPublicPath(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/agent/")) {
    if (!(await agentAuthorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.next();
  }
  const session = await readSessionFromRequest(request);
  if (!session) {
    // Google sends the browser here. A JSON 401 would be a dead end, so send them to sign in.
    if (pathname === "/api/auth/google/callback") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("next", "/cuenta");
      return NextResponse.redirect(url);
    }
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (session.mustChangePassword && !allowsDuringPasswordChange(pathname)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "password_change_required" }, { status: 403 });
    const url = request.nextUrl.clone();
    url.pathname = "/cuenta";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.png|apple-touch-icon.png|manifest.webmanifest|icons/|brand/).*)"],
};
