import type { NextResponse } from "next/server";

import { syncToSheet } from "@/lib/sheets";
import { coba, isDbConfigured, sql } from "@/lib/db";
import { handleRoute, jsonError, jsonOk } from "@/app/api/_lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cron jalan harian; jendela 25 jam memberi tumpang-tindih 1 jam antar-run. */
const LOOKBACK_MS = 25 * 60 * 60 * 1000;

/**
 * GET /api/cron/sync-cancelled — rekonsiliasi Google Sheets untuk booking yang
 * dibatalkan otomatis oleh expire_unpaid_bookings() (fungsi itu mengubah baris
 * langsung di database, lihat /api/cron/rutin, jadi sheet tidak pernah diberi
 * tahu dan barisnya membeku di "pending_payment").
 *
 * Dipicu timer systemd di VPS (drivetech-cron-sync-cancelled) sekali sehari. Aman dipanggil ulang:
 * Apps Script meng-upsert per bookingCode.
 *
 * Penjagaan (temuan audit 2026-09-03, FAIL-CLOSED): di produksi CRON_SECRET
 * WAJIB diisi — tanpa itu endpoint menolak 503, bukan terbuka untuk siapa pun.
 * Timer VPS mengirim "Authorization: Bearer <CRON_SECRET>" otomatis saat env
 * itu ada. Di development boleh tanpa secret.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/cron/sync-cancelled", async () => {
    const secret = process.env.CRON_SECRET?.trim() ?? "";
    if (secret.length === 0) {
      if (process.env.NODE_ENV === "production") {
        return jsonError("CRON_SECRET belum dikonfigurasi; endpoint cron ditutup.", 503, {
          code: "NO_CONFIG",
        });
      }
    } else if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    }
    if (!isDbConfigured()) {
      return jsonError("Database belum dikonfigurasi.", 503, { code: "NO_CONFIG" });
    }

    const sejak = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const { data: rows, error } = await coba(sql<{ booking_code: string }[]>`
      select booking_code from bookings where status = 'cancelled' and updated_at >= ${sejak}`);
    if (error) {
      return jsonError("Gagal memuat booking yang dibatalkan.", 502, { code: "DB_ERROR" });
    }

    for (const row of rows) {
      void syncToSheet("booking", { bookingCode: row.booking_code, status: "cancelled" });
    }

    return jsonOk({ synced: rows.length, since: sejak });
  });
}
