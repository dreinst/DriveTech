import type { NextResponse } from "next/server";

import { isDbConfigured, sql } from "@/lib/db";
import { handleRoute, jsonError, jsonOk } from "@/app/api/_lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/rutin: tiga tugas rutin database dalam satu panggilan.
 *  1. expire_unpaid_bookings(): batalkan booking yang lewat tenggat bayar.
 *  2. Hapus rate_limit_events yang lebih tua dari 1 hari.
 *  3. Hapus email_verifications yang lebih tua dari 1 hari.
 *
 * Dipicu timer systemd di VPS (drivetech-cron-rutin) tiap 15 menit. Aman
 * dipanggil ulang kapan pun.
 *
 * Penjagaan sama dengan cron lain (FAIL-CLOSED): di produksi CRON_SECRET WAJIB
 * diisi, tanpa itu endpoint menolak 503. Timer VPS mengirim
 * "Authorization: Bearer <CRON_SECRET>". Di development boleh tanpa secret.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/cron/rutin", async () => {
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

    const [{ jumlah }] = await sql<{ jumlah: number }[]>`select expire_unpaid_bookings() as jumlah`;
    const laju = await sql`delete from rate_limit_events where created_at < now() - interval '1 day'`;
    const kode = await sql`delete from email_verifications where created_at < now() - interval '1 day'`;

    return jsonOk({
      bookingDibatalkan: jumlah,
      rateLimitDihapus: laju.count,
      kodeEmailDihapus: kode.count,
    });
  });
}
