import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function hasValidMutationOrigin(request: NextRequest): boolean {
  const host = request.headers.get("host");
  if (!host) return true;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  return true;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/admin/")) {
    return NextResponse.next();
  }
  if (pathname === "/api/admin/login" && request.method === "POST") {
    return NextResponse.next();
  }
  if (pathname === "/api/admin/session" && request.method === "GET") {
    return NextResponse.next();
  }
  if (request.method === "GET" || request.method === "HEAD") {
    return NextResponse.next();
  }
  if (!hasValidMutationOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origen no permitido." }, { status: 403 });
  }
  const token = request.cookies.get("vedisa_admin_session")?.value;
  if (!token?.trim()) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
