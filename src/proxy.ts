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
    // Las API responden 401 JSON (sin redirect) para clientes no-navegador
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sesión requerida" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (
    hasSession &&
    pathname === "/login" &&
    // Una sesión vencida/inválida también tiene cookie: sin este marcador
    // el layout redirige a /login y el proxy devuelve a / en un loop.
    !request.nextUrl.searchParams.has("expired")
  ) {
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
