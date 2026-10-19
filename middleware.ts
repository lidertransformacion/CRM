import { NextResponse, type NextRequest } from "next/server";
import { allowsDuringPasswordChange, isPublicPath } from "@/lib/auth/guard";
import { readSessionFromRequest } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  const session = await readSessionFromRequest(request);
  if (!session) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
