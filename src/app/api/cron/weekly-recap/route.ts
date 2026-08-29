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
 * (lihat vercel.json). Kalau CRON_SECRET diisi, request wajib membawa
 * "Authorization: Bearer <CRON_SECRET>" (dikirim otomatis oleh Vercel Cron).
 *
 * Butuh SHEETS_WEBHOOK_URL. Kunci aksi diambil dari env SHEETS_ACTION_KEY
 * (samakan dengan RESET_KEY di tools/google-sheets-webhook.gs); default memakai
 * kunci bawaan skrip agar tetap jalan tanpa env tambahan.
 */
const DEFAULT_ACTION_KEY = "dt-reset-c9k4x7wq21";

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/cron/weekly-recap", async () => {
    const secret = process.env.CRON_SECRET ?? "";
    if (secret.length > 0 && request.headers.get("authorization") !== `Bearer ${secret}`) {
      return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    }

    const url = process.env.SHEETS_WEBHOOK_URL;
    if (!url) {
      return jsonError("SHEETS_WEBHOOK_URL belum dikonfigurasi.", 503, { code: "NO_CONFIG" });
    }
    const key = process.env.SHEETS_ACTION_KEY?.trim() || DEFAULT_ACTION_KEY;
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
