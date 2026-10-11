import type { NextResponse } from "next/server";

import { getSlotStatus } from "@/lib/services/slots";
import { handleRoute, mapResultToResponse } from "@/app/api/_lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/slots/status: status denah terkini (okupansi per tanggal + blokir
 * panitia) untuk polling browser, lihat components/denah/useRealtimeSlots.ts.
 * Sukses 200: { occupancy, slots }
 */
export async function GET(): Promise<NextResponse> {
  return handleRoute("GET /api/slots/status", async () => mapResultToResponse(await getSlotStatus()));
}
