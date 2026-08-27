import type { NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Cocokkan semua path kecuali:
     * - _next/static, _next/image, favicon.ico
     * - berkas statis umum (gambar, font, css, js, dll)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|xml|json|woff|woff2|ttf|otf)$).*)",
  ],
};
