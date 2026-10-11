import { NextResponse, type NextRequest } from "next/server";

import { bacaSesi, SESI_COOKIE } from "@/lib/sesi";

const LOGIN_PATH = "/admin/login";

/**
 * Menjaga rute /admin: tanpa cookie sesi yang tanda tangannya sah dan belum
 * kedaluwarsa, pengunjung dialihkan ke halaman login. Middleware tidak
 * menyentuh database; pencocokan ke tabel admin_users dilakukan getCurrentAdmin.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminPath && pathname !== LOGIN_PATH) {
    const adminId = await bacaSesi(request.cookies.get(SESI_COOKIE)?.value);
    if (!adminId) {
      const url = request.nextUrl.clone();
      url.pathname = LOGIN_PATH;
      url.search = "";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
