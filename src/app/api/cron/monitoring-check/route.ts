import type { NextResponse } from "next/server";

import { handleRoute, jsonError, mapResultToResponse } from "@/app/api/_lib/respond";
import { runChecks } from "@/lib/services/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/cron/monitoring-check — menyondir target di MONITORING_TARGETS
 * (DB Supabase + beberapa halaman publik kunci) dan menyimpan satu baris
 * sampel per target ke public.monitoring_checks.
 *
 * Dipicu Vercel Cron (lihat vercel.json, jadwal tiap 5 menit) atau bisa
 * dipanggil manual dari dashboard /admin/monitoring ("Jalankan sekarang").
 * Sama seperti /api/cron/sync-cancelled: kalau env CRON_SECRET diisi,
 * permintaan wajib membawa header Authorization: Bearer ***.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/cron/monitoring-check", async () => {
    const secret = process.env.CRON_SECRET ?? "";
    if (secret.length > 0 && request.headers.get("authorization") !== `Bearer ${secret}`) {
      return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    }

    const result = await runChecks();
    return mapResultToResponse(result, 201);
  });
}
