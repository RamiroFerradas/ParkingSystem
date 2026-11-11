import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Guarda de ruta: presencia de sesión. La validación completa del JWT y los
 * permisos ocurren server-side en cada página/ruta (capa de permisos).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Todo salvo: API de auth, assets internos, PWA y favicon
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-.+).*)",
  ],
};
