import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk } from "@/app/api/_lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/weekly-recap — memicu snapshot recap mingguan di Google Sheets.
 *
 * Memanggil webhook Apps Script (?action=recap&key=...) yang menyalin sheet
 * "Bookings" ke tab arsip "Recap YYYY-MM-DD" TANPA menghapus master (keputusan
 * pemilik: recap tanpa kehilangan data). Dipicu Vercel Cron sekali seminggu
 * (lihat vercel.json).
 *
 * Penjagaan (temuan audit 2026-09-03, FAIL-CLOSED):
 * - Di produksi CRON_SECRET WAJIB diisi; tanpa itu endpoint menolak 503, bukan
 *   terbuka untuk siapa pun. Vercel Cron mengirim "Authorization: Bearer
 *   <CRON_SECRET>" otomatis saat env itu ada. Di development boleh tanpa secret.
 * - Kunci aksi recap WAJIB dari env SHEETS_ACTION_KEY (= RECAP_KEY di
 *   tools/google-sheets-webhook.gs). Tidak ada lagi kunci bawaan di kode:
 *   kunci yang tertulis di repo dulu sama dengan kunci reset sheet.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/cron/weekly-recap", async () => {
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

    const url = process.env.SHEETS_WEBHOOK_URL;
    if (!url) {
      return jsonError("SHEETS_WEBHOOK_URL belum dikonfigurasi.", 503, { code: "NO_CONFIG" });
    }
    const key = process.env.SHEETS_ACTION_KEY?.trim() ?? "";
    if (key.length === 0) {
      return jsonError("SHEETS_ACTION_KEY belum dikonfigurasi; recap tidak dipicu.", 503, {
        code: "NO_CONFIG",
      });
    }
    const target = `${url}${url.includes("?") ? "&" : "?"}action=recap&key=${encodeURIComponent(key)}`;

    try {
      const response = await fetch(target, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
      const body = (await response.text()).slice(0, 500);
      if (!response.ok) {
        return jsonError("Webhook recap membalas status non-OK.", 502, { code: "RECAP_FAILED" });
      }
      return jsonOk({ triggered: true, status: response.status, body });
    } catch {
      return jsonError("Gagal memicu recap Google Sheets.", 502, { code: "RECAP_FAILED" });
    }
  });
}
