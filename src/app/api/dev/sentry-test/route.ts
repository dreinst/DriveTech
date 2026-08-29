import type { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { handleRoute, jsonError, jsonOk } from "@/app/api/_lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint DIAGNOSTIK sementara untuk memastikan Sentry menerima event
 * (dipakai sekali setelah SENTRY_DSN dipasang). Terkunci lewat ?key= agar tidak
 * bisa dipanggil sembarang orang. Hapus setelah verifikasi.
 */
const TEST_KEY = "dt-sentry-check-9f3a";

export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/dev/sentry-test", async () => {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("key") !== TEST_KEY) {
      return jsonError("Tidak ditemukan.", 404, { code: "NOT_FOUND" });
    }

    const dsnConfigured = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
    const eventId = Sentry.captureMessage("Drive Tech — uji koneksi Sentry", "info");
    // flush: pastikan event terkirim sebelum fungsi serverless berhenti.
    await Sentry.flush(3000);

    return jsonOk({ ok: true, dsnConfigured, eventId });
  });
}
