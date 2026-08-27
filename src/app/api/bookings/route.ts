import type { NextResponse } from "next/server";

import { createBooking } from "@/lib/services/booking";
import { getFloorPlan } from "@/lib/services/slots";
import type { SlotStatus, ZoneType } from "@/lib/types/database";
import { slotDisplayName } from "@/lib/utils";
import { createBookingSchema } from "@/lib/validation/schemas";
import {
  handleRoute,
  jsonOk,
  jsonValidationError,
  mapResultToResponse,
  readJsonObject,
  INVALID_JSON_MESSAGE,
  jsonError,
} from "@/app/api/_lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* GET /api/bookings — daftar slot ringkas untuk polling eksternal      */
/* ------------------------------------------------------------------ */

/** Bentuk zona ringkas di dalam setiap baris slot. */
type ZonaRingkas = {
  id: string;
  name: string;
  zoneType: ZoneType;
  svgGroupId: string | null;
  adminFee: number;
};

/** Satu baris slot pada respons GET. */
type SlotRingkas = {
  id: string;
  slotNumber: number | null;
  slotLabel: string | null;
  displayName: string;
  status: SlotStatus;
  svgElementId: string | null;
  bookable: boolean;
  zone: ZonaRingkas;
};

const STATUS_VALID: readonly SlotStatus[] = ["available", "pending", "confirmed"];

function parseStatusFilter(nilai: string | null): SlotStatus | null | "invalid" {
  if (nilai === null || nilai.trim().length === 0) return null;
  const bersih = nilai.trim().toLowerCase() as SlotStatus;
  return STATUS_VALID.includes(bersih) ? bersih : "invalid";
}

/**
 * Daftar seluruh slot beserta status terkininya.
 *
 * Ditujukan untuk integrasi eksternal yang ingin polling ketersediaan tanpa
 * memakai Realtime. Filter opsional lewat query string:
 *   ?status=available|pending|confirmed
 *   ?zone=<svg_group_id>   mis. zone-umkm
 *   ?bookable=true         hanya slot yang bisa dibooking (bukan fasilitas)
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/bookings", async () => {
    const { searchParams } = new URL(request.url);

    const status = parseStatusFilter(searchParams.get("status"));
    if (status === "invalid") {
      return jsonError(
        "Nilai status tidak valid. Pilih available, pending, atau confirmed.",
        400,
        { code: "VALIDATION", fieldErrors: { status: "Status slot tidak valid." } },
      );
    }

    const zoneFilter = (searchParams.get("zone") ?? "").trim();
    const bookableOnly = ["1", "true", "ya"].includes(
      (searchParams.get("bookable") ?? "").trim().toLowerCase(),
    );

    const plan = await getFloorPlan();
    if (!plan.ok) return mapResultToResponse(plan);

    const slots: SlotRingkas[] = [];
    for (const zone of plan.data.zones) {
      if (zoneFilter.length > 0 && zone.svg_group_id !== zoneFilter) continue;

      const bookableZone = zone.zone_type !== "facility";
      if (bookableOnly && !bookableZone) continue;

      const zonaRingkas: ZonaRingkas = {
        id: zone.id,
        name: zone.name,
        zoneType: zone.zone_type,
        svgGroupId: zone.svg_group_id,
        adminFee: zone.admin_fee,
      };

      for (const slot of zone.slots) {
        if (status !== null && slot.status !== status) continue;
        slots.push({
          id: slot.id,
          slotNumber: slot.slot_number,
          slotLabel: slot.slot_label,
          displayName: slotDisplayName(slot),
          status: slot.status,
          svgElementId: slot.svg_element_id,
          bookable: bookableZone,
          zone: zonaRingkas,
        });
      }
    }

    const event = plan.data.event;
    return jsonOk({
      event: event
        ? {
            id: event.id,
            name: event.name,
            location: event.location,
            startDate: event.start_date,
            endDate: event.end_date,
          }
        : null,
      total: slots.length,
      fetchedAt: new Date().toISOString(),
      slots,
    });
  });
}

/* ------------------------------------------------------------------ */
/* POST /api/bookings — buat booking baru                              */
/* ------------------------------------------------------------------ */

/**
 * Body JSON:
 *   { slotId, tenantName, tenantPhone, tenantEmail?, tenantType, detail?, notes? }
 * Sukses 201: { bookingId, bookingCode }
 * Gagal: 400 (validasi), 409 (slot sudah diambil), 503 (Supabase belum dikonfigurasi).
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute("POST /api/bookings", async () => {
    const body = await readJsonObject(request);
    if (body === null) return jsonError(INVALID_JSON_MESSAGE, 400, { code: "INVALID_BODY" });

    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      return jsonValidationError("Data booking tidak valid.", parsed.error);
    }

    const result = await createBooking(parsed.data);
    return mapResultToResponse(result, 201);
  });
}
