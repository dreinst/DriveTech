import { NextResponse, type NextRequest } from "next/server";

import { bacaSesi, SESI_COOKIE } from "@/lib/sesi";

const LOGIN_PATH = "/drivetechadmin/login";

/**
 * Menjaga rute /drivetechadmin: tanpa cookie sesi yang tanda tangannya sah dan belum
 * kedaluwarsa, semua halaman selain login tampil sebagai 404, jadi orang yang
 * iseng mencoba alamatnya tidak tahu panel ini ada. Middleware tidak menyentuh
 * database; pencocokan ke tabel admin_users dilakukan getCurrentAdmin.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isAdminPath = pathname === "/drivetechadmin" || pathname.startsWith("/drivetechadmin/");

  if (isAdminPath && pathname !== LOGIN_PATH) {
    const adminId = await bacaSesi(request.cookies.get(SESI_COOKIE)?.value);
    if (!adminId) {
      return NextResponse.rewrite(new URL("/_tidak-ada", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/drivetechadmin/:path*"],
};
