import { fail, ok, type Result } from "@/lib/result";
import { syncToSheet } from "@/lib/sheets";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import type {
  BookingStatus,
  CatalogItem,
  SlotRow,
  VehicleListingRow,
  ZoneRow,
} from "@/lib/types/database";
import {
  dbFail,
  NO_CONFIG_MESSAGE,
  pickOne,
  tanggalHariIniJakarta,
  type PgError,
} from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/catalog.ts hanya boleh dipakai di server.");
}

/**
 * Select standar item katalog. Join bookings!inner supaya bisa memfilter
 * status confirmed; kolom tenant SENGAJA tidak pernah ikut — halaman katalog
 * publik hanya boleh melihat kendaraan + slot, bukan identitas penyewa.
 */
const CATALOG_SELECT =
  "*, slot:slots(*, zone:zones(*)), booking:bookings!inner(status, booking_dates(event_date, is_active))";

type RawSlotWithZone = SlotRow & { zone: ZoneRow | ZoneRow[] | null };
type RawCatalogBooking = {
  status: BookingStatus;
  booking_dates: { event_date: string; is_active: boolean }[] | null;
};
type RawCatalogRow = VehicleListingRow & {
  slot: RawSlotWithZone | RawSlotWithZone[] | null;
  booking: RawCatalogBooking | RawCatalogBooking[] | null;
};

function normalizeCatalogRow(raw: unknown): CatalogItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as RawCatalogRow;

  const rawSlot = pickOne<RawSlotWithZone>(row.slot);
  const zone = rawSlot ? pickOne<ZoneRow>(rawSlot.zone) : null;
  const booking = pickOne<RawCatalogBooking>(row.booking);
  if (!rawSlot || !zone || !booking) return null;

  const { zone: _zone, ...slotOnly } = rawSlot;
  void _zone;
  const { slot: _slot, booking: _booking, ...listingOnly } = row;
  void _slot;
  void _booking;

  const dates = (booking.booking_dates ?? [])
    .filter((d) => d.is_active)
    .map((d) => d.event_date)
    .sort();

  return {
    ...(listingOnly as VehicleListingRow),
    slot: { ...(slotOnly as SlotRow), zone },
    dates,
  };
}

export type CatalogData = {
  /** Tanggal gelaran aktif >= hari ini (YYYY-MM-DD), urut naik — bahan chips. */
  dates: string[];
  /** Tanggal yang sedang ditampilkan (dari query ?tanggal=, difallback ke terdekat). */
  selectedDate: string | null;
  /** Kendaraan yang hadir pada selectedDate: booking confirmed + is_visible. */
  items: CatalogItem[];
};

/**
 * Katalog kendaraan publik per tanggal. Hanya listing milik booking CONFIRMED
 * (pembayaran terverifikasi) yang tampil — keputusan pemilik 2026-08-28.
 */
export async function listCatalog(tanggal?: string): Promise<Result<CatalogData>> {
  if (!isServiceRoleConfigured()) return fail<CatalogData>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();

  const datesQuery = await supabase
    .from("event_dates")
    .select("event_date")
    .eq("is_active", true)
    .gte("event_date", tanggalHariIniJakarta())
    .order("event_date", { ascending: true });
  if (datesQuery.error) {
    return dbFail<CatalogData>(datesQuery.error as PgError, "Gagal memuat tanggal gelaran");
  }
  const dates = ((datesQuery.data ?? []) as { event_date: string }[]).map((d) => d.event_date);

  const selectedDate = tanggal && dates.includes(tanggal) ? tanggal : (dates[0] ?? null);
  if (!selectedDate) return ok<CatalogData>({ dates, selectedDate: null, items: [] });

  const listingQuery = await supabase
    .from("vehicle_listings")
    .select(CATALOG_SELECT)
    .eq("is_visible", true)
    .eq("booking.status", "confirmed");
  if (listingQuery.error) {
    return dbFail<CatalogData>(listingQuery.error as PgError, "Gagal memuat katalog kendaraan");
  }

  const items = ((listingQuery.data ?? []) as unknown[])
    .map(normalizeCatalogRow)
    .filter((item): item is CatalogItem => item !== null)
    .filter((item) => item.dates.includes(selectedDate))
    .sort((a, b) => {
      if (a.slot.zone.display_order !== b.slot.zone.display_order) {
        return a.slot.zone.display_order - b.slot.zone.display_order;
      }
      return (a.slot.slot_number ?? 0) - (b.slot.slot_number ?? 0);
    });

  return ok<CatalogData>({ dates, selectedDate, items });
}

/** Satu item katalog untuk halaman detail; 404 bila tak tampil publik. */
export async function getCatalogItem(id: string): Promise<Result<CatalogItem>> {
  if (!isServiceRoleConfigured()) return fail<CatalogItem>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("vehicle_listings")
    .select(CATALOG_SELECT)
    .eq("id", id)
    .eq("is_visible", true)
    .eq("booking.status", "confirmed")
    .maybeSingle();

  if (error) return dbFail<CatalogItem>(error as PgError, "Gagal memuat detail kendaraan");

  const item = normalizeCatalogRow(data);
  if (!item) return fail<CatalogItem>("Kendaraan tidak ditemukan di katalog.", "NOT_FOUND");
  return ok(item);
}

/** Tampilkan / sembunyikan satu listing dari katalog (aksi admin). */
export async function setVehicleVisibility(
  listingId: string,
  visible: boolean,
): Promise<Result<null>> {
  if (!isServiceRoleConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const existing = await supabase
    .from("vehicle_listings")
    .select("id, booking:bookings(booking_code)")
    .eq("id", listingId)
    .maybeSingle();
  if (existing.error) {
    return dbFail<null>(existing.error as PgError, "Gagal memuat data kendaraan");
  }
  if (!existing.data) return fail<null>("Listing kendaraan tidak ditemukan.", "NOT_FOUND");

  const updated = await supabase
    .from("vehicle_listings")
    .update({ is_visible: visible })
    .eq("id", listingId);
  if (updated.error) {
    return dbFail<null>(updated.error as PgError, "Gagal memperbarui visibilitas katalog");
  }

  const bookingCode = pickOne<{ booking_code: string }>(
    (existing.data as { booking: unknown }).booking as
      | { booking_code: string }
      | { booking_code: string }[]
      | null,
  )?.booking_code;
  if (bookingCode) {
    void syncToSheet("vehicle", {
      bookingCode,
      tampil: visible ? "ya" : "disembunyikan-admin",
    });
  }

  return ok(null);
}
