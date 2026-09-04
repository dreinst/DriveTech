import type { NextResponse } from "next/server";

import { handleRoute, jsonError, mapResultToResponse } from "@/app/api/_lib/respond";
import { getCurrentAdmin } from "@/lib/services/auth";
import { runChecks } from "@/lib/services/monitoring";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/monitoring — jalankan sondir monitoring sekali secara manual
 * dari dashboard /admin/monitoring (tombol "Jalankan sekarang"). Khusus admin
 * yang sudah login (sesi Supabase Auth + baris admin_users) — sama seperti
 * /api/admin/qr, TIDAK memakai CRON_SECRET karena bukan dipanggil Vercel Cron.
 */
export async function POST(): Promise<NextResponse> {
  return handleRoute("POST /api/admin/monitoring", async () => {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return jsonError("Butuh sesi admin.", 401, { code: "UNAUTHORIZED" });
    }

    const result = await runChecks();
    return mapResultToResponse(result, 201);
  });
}
