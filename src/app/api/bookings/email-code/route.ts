import type { NextResponse } from "next/server";

import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { requestEmailCode } from "@/lib/services/otp";
import { requestEmailCodeSchema } from "@/lib/validation/schemas";
import {
  handleRoute,
  jsonError,
  jsonRateLimited,
  jsonValidationError,
  mapResultToResponse,
  readJsonObject,
  INVALID_JSON_MESSAGE,
} from "@/app/api/_lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bookings/email-code — kirim kode verifikasi ke email penyewa.
 * Body JSON: { email }. Sukses 200: {} (kode dikirim ke email; di luar produksi
 * tanpa SMTP ikut { devCode }). Pembatas: 3 kode / 10 menit per email dan
 * 10 / 10 menit per IP (bersama), plus lapis in-memory per instance.
 * Kode yang diterima dipakai sebagai `emailOtp` di POST /api/bookings.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute("POST /api/bookings/email-code", async () => {
    const ip = clientIpFrom(request);
    const laju = checkRateLimit(`email-code:${ip}`, 10, 600_000);
    if (!laju.allowed) return jsonRateLimited(laju.retryAfterSeconds);

    const body = await readJsonObject(request);
    if (body === null) return jsonError(INVALID_JSON_MESSAGE, 400, { code: "INVALID_BODY" });

    const parsed = requestEmailCodeSchema.safeParse(body);
    if (!parsed.success) return jsonValidationError("Email tidak valid.", parsed.error);

    const result = await requestEmailCode(parsed.data.email, ip);
    return mapResultToResponse(result, 200);
  });
}
