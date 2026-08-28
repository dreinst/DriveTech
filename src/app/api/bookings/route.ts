import type { NextResponse } from "next/server";

import { slotAdminFee } from "@/lib/domain/harga";
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
  /** Harga admin fee per tanggal EFEKTIF slot ini (override slot > harga zona). */
  adminFee: number;
  /** Peruntukan khusus slot (mis. "Booth Leasing"); null = umum. */
  peruntukan: string | null;
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
 * MODEL PER TANGGAL: slot.status kini berarti kondisi slot itu sendiri —
 * 'available' = normal, selain itu = DIBLOKIR PANITIA untuk semua tanggal
 * (bukan lagi status booking). Ketersediaan per tanggal dibaca dari view
 * slot_date_status; respons GET ini menyertakan `eventDates` (tanggal gelaran
 * aktif mendatang) dan `occupancy` (baris view untuk tanggal-tanggal itu)
 * supaya integrasi eksternal bisa menghitung ketersediaan per tanggal.
 *
 * Ditujukan untuk integrasi eksternal yang ingin polling ketersediaan tanpa
 * memakai Realtime. Filter opsional lewat query string:
 *   ?status=available|pending|confirmed   (filter kolom slots.status mentah)
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
          adminFee: slotAdminFee(slot, zone),
          peruntukan: slot.peruntukan,
          zone: zonaRingkas,
        });
      }
    }

    const event = plan.data.event;
    return jsonOk({
      // Model per tanggal: jadwal gelaran ada di eventDates, bukan rentang tanggal.
      event: event
        ? {
            id: event.id,
            name: event.name,
            location: event.location,
          }
        : null,
      // Tanggal gelaran aktif mendatang (model per tanggal), urut naik.
      eventDates: plan.data.eventDates.map((d) => ({ id: d.id, date: d.event_date })),
      // Okupansi per (slot, tanggal) untuk tanggal-tanggal di atas.
      occupancy: plan.data.occupancy.map((row) => ({
        slotId: row.slot_id,
        date: row.event_date,
        status: row.status,
      })),
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
 *   { slotId, eventDates, tenantName, tenantPhone, tenantEmail?, tenantType, detail?, notes? }
 * eventDates: array string "YYYY-MM-DD" (min 1, maks 16) — tanggal weekend yang
 * disewa; slot harus bebas di SEMUA tanggal tersebut.
 * Sukses 201: { bookingId, bookingCode }
 * Gagal: 400 (validasi), 409 SLOT_TAKEN (slot diblokir) / DATE_TAKEN (sebagian
 * tanggal baru saja terisi), 503 (Supabase belum dikonfigurasi).
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
