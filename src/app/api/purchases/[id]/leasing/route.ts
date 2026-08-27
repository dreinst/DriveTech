import type { NextResponse } from "next/server";

import { submitLeasingApplication } from "@/lib/services/leasing";
import { submitLeasingSchema } from "@/lib/validation/schemas";
import {
  handleRoute,
  jsonError,
  jsonValidationError,
  mapResultToResponse,
  readJsonObject,
  INVALID_JSON_MESSAGE,
} from "@/app/api/_lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Next 15: params pada route handler adalah Promise.
type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/purchases/{transactionId}/leasing — ajukan pembiayaan ke partner leasing.
 *
 * Body JSON: { leasingPartnerId, dpAmount, tenorBulan, notes? }
 * `transactionId` diambil dari URL, bukan dari body.
 * Sukses 201: { leasingApplicationId }
 * Transaksi harus bermetode "credit" dan belum punya pengajuan (relasi 1:1).
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  return handleRoute("POST /api/purchases/[id]/leasing", async () => {
    const { id: purchaseTransactionId } = await params;

    const body = await readJsonObject(request);
    if (body === null) return jsonError(INVALID_JSON_MESSAGE, 400, { code: "INVALID_BODY" });

    const parsed = submitLeasingSchema.safeParse({ ...body, purchaseTransactionId });
    if (!parsed.success) {
      return jsonValidationError("Data pengajuan leasing tidak valid.", parsed.error);
    }

    const result = await submitLeasingApplication(parsed.data);
    return mapResultToResponse(result, 201);
  });
}
