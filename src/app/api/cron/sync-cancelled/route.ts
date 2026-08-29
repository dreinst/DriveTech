import type { NextResponse } from "next/server";

import { syncToSheet } from "@/lib/sheets";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { handleRoute, jsonError, jsonOk } from "@/app/api/_lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cron jalan harian; jendela 25 jam memberi tumpang-tindih 1 jam antar-run. */
const LOOKBACK_MS = 25 * 60 * 60 * 1000;

/**
 * GET /api/cron/sync-cancelled — rekonsiliasi Google Sheets untuk booking yang
 * dibatalkan otomatis oleh expire_unpaid_bookings() (pg_cron menulis langsung
 * ke database tanpa lewat aplikasi, jadi sheet tidak pernah diberi tahu dan
 * barisnya membeku di "pending_payment").
 *
 * Dipicu Vercel Cron (lihat vercel.json) sekali sehari. Aman dipanggil ulang:
 * Apps Script meng-upsert per bookingCode. Kalau env CRON_SECRET diisi,
 * permintaan wajib membawa "Authorization: Bearer <CRON_SECRET>" (header ini
 * dikirim otomatis oleh Vercel Cron saat env tersebut ada).
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/cron/sync-cancelled", async () => {
    const secret = process.env.CRON_SECRET ?? "";
    if (secret.length > 0 && request.headers.get("authorization") !== `Bearer ${secret}`) {
      return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    }
    if (!isServiceRoleConfigured()) {
      return jsonError("Supabase belum dikonfigurasi.", 503, { code: "NO_CONFIG" });
    }

    const sejak = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const supabase = createAdminSupabase();
    const { data, error } = await supabase
      .from("bookings")
      .select("booking_code")
      .eq("status", "cancelled")
      .gte("updated_at", sejak);
    if (error) {
      return jsonError("Gagal memuat booking yang dibatalkan.", 502, { code: "DB_ERROR" });
    }

    const rows = (data ?? []) as Array<{ booking_code: string }>;
    for (const row of rows) {
      void syncToSheet("booking", { bookingCode: row.booking_code, status: "cancelled" });
    }

    return jsonOk({ synced: rows.length, since: sejak });
  });
}
