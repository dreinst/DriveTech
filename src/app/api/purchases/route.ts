import type { NextResponse } from "next/server";

import { checkRateLimit, clientIpFrom, rateLimitShared } from "@/lib/rate-limit";
import { createPurchase } from "@/lib/services/purchase";
import { createPurchaseSchema } from "@/lib/validation/schemas";
import {
  handleRoute,
  jsonError,
  jsonOk,
  jsonRateLimited,
  jsonValidationError,
  mapResultToResponse,
  readJsonObject,
  INVALID_JSON_MESSAGE,
} from "@/app/api/_lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchases — catat minat/transaksi pembelian unit dari tenant pemilik slot.
 *
 * Body JSON:
 *   { slotId, buyerName, buyerPhone, paymentMethod: "cash"|"transfer"|"credit",
 *     unitDescription?, unitPrice?, notes? }
 * Sukses 201: { transactionId, transactionCode }
 * Kalau paymentMethod = "credit", lanjutkan ke POST /api/purchases/{transactionId}/leasing.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute("POST /api/purchases", async () => {
    // Lapis in-memory per instance + pembatas bersama lintas instance
    // (per menit tiap permintaan, per 24 jam hanya permintaan valid).
    const ip = clientIpFrom(request);
    const laju = checkRateLimit(`purchases:${ip}`, 5, 60_000);
    if (!laju.allowed) return jsonRateLimited(laju.retryAfterSeconds);
    if (!(await rateLimitShared(`purchase:ip:${ip}:1m`, 5, 60))) return jsonRateLimited(60);

    const body = await readJsonObject(request);
    if (body === null) return jsonError(INVALID_JSON_MESSAGE, 400, { code: "INVALID_BODY" });

    const parsed = createPurchaseSchema.safeParse(body);
    if (!parsed.success) {
      return jsonValidationError("Data pembelian tidak valid.", parsed.error);
    }
    if (!(await rateLimitShared(`purchase:ip:${ip}:24h`, 20, 86_400))) return jsonRateLimited(3600);

    const result = await createPurchase(parsed.data);
    if (!result.ok) return mapResultToResponse(result);

    // Service memakai nama internal `purchaseId`; kontrak API memakai `transactionId`.
    return jsonOk(
      {
        transactionId: result.data.purchaseId,
        transactionCode: result.data.transactionCode,
        needsLeasing: parsed.data.paymentMethod === "credit",
      },
      201,
    );
  });
}
