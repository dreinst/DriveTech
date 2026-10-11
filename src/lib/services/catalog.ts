import { fail, ok, type Result } from "@/lib/result";
import { syncToSheet } from "@/lib/sheets";
import { coba, cobaSatu, isDbConfigured, sql } from "@/lib/db";
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
  slotJson,
  tanggalHariIniJakarta,
} from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/catalog.ts hanya boleh dipakai di server.");
}

/**
 * Select standar item katalog: hanya listing yang tampil (is_visible) milik
 * booking confirmed. Kolom tenant SENGAJA tidak pernah ikut: halaman katalog
 * publik hanya boleh melihat kendaraan + slot, bukan identitas penyewa.
 */
const catalogSelect = () => sql`
  select l.*,
         ${slotJson(sql`l.slot_id`)} as slot,
         jsonb_build_object(
           'status', b.status,
           'booking_dates', (select coalesce(jsonb_agg(jsonb_build_object('event_date', d.event_date, 'is_active', d.is_active)), '[]')
                               from booking_dates d where d.booking_id = b.id)) as booking
    from vehicle_listings l
    join bookings b on b.id = l.booking_id
   where l.is_visible and b.status = 'confirmed'`;

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
 * `jenis` menyaring mobil/motor (tautan navbar "Katalog Mobil"/"Katalog Motor").
 */
export async function listCatalog(
  tanggal?: string,
  jenis?: "mobil" | "motor",
): Promise<Result<CatalogData>> {
  if (!isDbConfigured()) return fail<CatalogData>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const datesQuery = await coba(sql<{ event_date: string }[]>`
    select event_date from event_dates
     where is_active and event_date >= ${tanggalHariIniJakarta()}
     order by event_date`);
  if (datesQuery.error) {
    return dbFail<CatalogData>(datesQuery.error, "Gagal memuat tanggal gelaran");
  }
  const dates = datesQuery.data.map((d) => d.event_date);
  const selectedDate = tanggal && dates.includes(tanggal) ? tanggal : (dates[0] ?? null);
  if (!selectedDate) return ok<CatalogData>({ dates, selectedDate: null, items: [] });

  const listingQuery = await coba(catalogSelect());
  if (listingQuery.error) {
    return dbFail<CatalogData>(listingQuery.error, "Gagal memuat katalog kendaraan");
  }

  const items = listingQuery.data
    .map(normalizeCatalogRow)
    .filter((item): item is CatalogItem => item !== null)
    .filter((item) => item.dates.includes(selectedDate))
    .filter((item) => (jenis ? item.vehicle_kind === jenis : true))
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
  if (!isDbConfigured()) return fail<CatalogItem>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await cobaSatu(sql`${catalogSelect()} and l.id = ${id}`);

  if (error) return dbFail<CatalogItem>(error, "Gagal memuat detail kendaraan");

  const item = normalizeCatalogRow(data);
  if (!item) return fail<CatalogItem>("Kendaraan tidak ditemukan di katalog.", "NOT_FOUND");
  return ok(item);
}

/** Tampilkan / sembunyikan satu listing dari katalog (aksi admin). */
export async function setVehicleVisibility(
  listingId: string,
  visible: boolean,
): Promise<Result<null>> {
  if (!isDbConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const updated = await cobaSatu(sql<{ booking_code: string | null }[]>`
    update vehicle_listings l set is_visible = ${visible}
     where l.id = ${listingId}
    returning (select b.booking_code from bookings b where b.id = l.booking_id) as booking_code`);
  if (updated.error) {
    return dbFail<null>(updated.error, "Gagal memperbarui visibilitas katalog");
  }
  if (!updated.data) return fail<null>("Listing kendaraan tidak ditemukan.", "NOT_FOUND");

  const bookingCode = updated.data.booking_code;
  if (bookingCode) {
    void syncToSheet("vehicle", {
      bookingCode,
      tampil: visible ? "ya" : "disembunyikan-admin",
    });
  }

  return ok(null);
}
