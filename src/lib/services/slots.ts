import type { OccupancyRow } from "@/lib/domain/ketersediaan";
import { suggestAlternatives as pickAlternatives } from "@/lib/domain/suggestions";
import { fail, ok, type Result } from "@/lib/result";
import { coba, cobaSatu, isDbConfigured, sql, type Potongan } from "@/lib/db";
import type {
  BookingRow,
  EventRow,
  FloorPlanData,
  SlotDetail,
  SlotRow,
  TenantRow,
  ZoneRow,
  ZoneWithSlots,
} from "@/lib/types/database";

// Modul KHUSUS SERVER.
// Catatan: paket npm "server-only" tidak ada di dependencies proyek (package.json
// milik agen A), jadi `import "server-only"` akan menggagalkan build. Penjagaannya
// dibuat runtime, konsisten dengan src/lib/db.ts.
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/slots.ts hanya boleh dipakai di server.");
}

/* ------------------------------------------------------------------ */
/* Utilitas bersama lapisan service                                    */
/* ------------------------------------------------------------------ */

/** Pesan seragam kalau DATABASE_URL belum diisi. */
export const NO_CONFIG_MESSAGE =
  "Database belum dikonfigurasi. Salin .env.example ke .env.local dan isi DATABASE_URL.";

/** Bentuk error database yang kita pakai (`code` = kode galat Postgres). */
export type PgError = { message?: string; code?: string; details?: string } | null | undefined;

/** Bungkus error database jadi Result gagal berbahasa Indonesia. */
export function dbFail<T>(error: PgError, konteks: string): Result<T> {
  const pesan = error?.message ?? "kesalahan tidak diketahui";
  return fail<T>(`${konteks}: ${pesan}`, error?.code);
}

/** Relasi 1:1 bisa datang sebagai objek atau array; ambil satu. */
export function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Select standar untuk slot + zona induknya (alias tabel slot: `s`). */
export const slotWithZone = () =>
  sql`select s.*, to_jsonb(z) as zone from slots s left join zones z on z.id = s.zone_id`;

/** Subquery JSON slot + zona untuk baris induk yang punya kolom slot_id. */
export const slotJson = (slotId: Potongan) =>
  sql`(select to_jsonb(s) || jsonb_build_object('zone', to_jsonb(z))
         from slots s left join zones z on z.id = s.zone_id where s.id = ${slotId})`;

type RawSlotWithZone = SlotRow & { zone: ZoneRow | ZoneRow[] | null };

/** Ubah baris mentah hasil query menjadi SlotDetail; null kalau zona tidak ikut. */
export function normalizeSlotDetail(raw: unknown): SlotDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as RawSlotWithZone;
  const zone = pickOne<ZoneRow>(row.zone);
  if (!zone) return null;
  const { zone: _zone, ...slot } = row;
  void _zone;
  return { ...(slot as SlotRow), zone };
}

/** Dipindah ke domain/urutan.ts agar bisa dipakai komponen client; di-reexport demi kompatibilitas. */
import { compareSlots } from "@/lib/domain/urutan";

export { compareSlots } from "@/lib/domain/urutan";

/** Formatter "YYYY-MM-DD" pada zona waktu penyelenggara (Asia/Jakarta). */
const tanggalJakartaFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "Hari ini" versi penyelenggara (WIB), dipakai membatasi tanggal gelaran mendatang. */
export function tanggalHariIniJakarta(): string {
  return tanggalJakartaFormat.format(new Date());
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/**
 * Data denah publik: event aktif + seluruh zona (urut display_order) beserta
 * slotnya, ditambah (model per tanggal):
 *   - eventDates: tanggal gelaran aktif >= hari ini (WIB), urut naik;
 *   - occupancy : baris view slot_date_status untuk tanggal-tanggal tersebut.
 * Dipakai halaman "/" dan sebagai data awal denah (penyegarannya lewat getSlotStatus).
 */
export async function getFloorPlan(): Promise<Result<FloorPlanData>> {
  if (!isDbConfigured()) return fail<FloorPlanData>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const eventQuery = await cobaSatu(
    sql<EventRow[]>`select * from events where is_active order by created_at limit 1`,
  );
  if (eventQuery.error) {
    return dbFail<FloorPlanData>(eventQuery.error, "Gagal memuat data event");
  }
  const event = eventQuery.data;

  // Satu query: zona beserta seluruh slotnya.
  const zoneQuery = await coba(sql<Array<ZoneRow & { slots: SlotRow[] }>>`
    select z.*,
           (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from slots s where s.zone_id = z.id) as slots
      from zones z
     where ${event ? sql`z.event_id = ${event.id}` : sql`true`}
     order by z.display_order`);
  if (zoneQuery.error) {
    return dbFail<FloorPlanData>(zoneQuery.error, "Gagal memuat data zona");
  }

  const zones: ZoneWithSlots[] = zoneQuery.data
    .map((zone) => ({ ...zone, slots: [...(zone.slots ?? [])].sort(compareSlots) }))
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, "id-ID"));

  // Tanggal gelaran aktif mendatang (>= hari ini WIB), urut naik.
  const today = tanggalHariIniJakarta();
  const datesQuery = await getActiveEventDates();
  if (!datesQuery.ok) return fail<FloorPlanData>(datesQuery.error, datesQuery.code);
  const eventDates = datesQuery.data;

  // Okupansi per (slot, tanggal) untuk tanggal aktif mendatang saja.
  const aktif = new Set(eventDates.map((d) => d.event_date));
  const occupancyQuery = await coba(sql<FloorPlanData["occupancy"]>`
    select slot_id, event_date, status from slot_date_status where event_date >= ${today}`);
  if (occupancyQuery.error) {
    return dbFail<FloorPlanData>(occupancyQuery.error, "Gagal memuat okupansi slot");
  }
  const occupancy = occupancyQuery.data.filter((row) => aktif.has(row.event_date));

  return ok<FloorPlanData>({ event, zones, eventDates, occupancy });
}

/**
 * Tanggal gelaran aktif >= hari ini (WIB), urut naik — versi ringan getFloorPlan
 * untuk halaman yang tidak butuh zona/slot (mis. /booking/[slotId]).
 */
export async function getActiveEventDates(): Promise<Result<{ id: string; event_date: string }[]>> {
  if (!isDbConfigured()) {
    return fail<{ id: string; event_date: string }[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  }

  const { data, error } = await coba(sql<{ id: string; event_date: string }[]>`
    select id, event_date from event_dates
     where is_active and event_date >= ${tanggalHariIniJakarta()}
     order by event_date`);

  if (error) {
    return dbFail<{ id: string; event_date: string }[]>(error, "Gagal memuat tanggal gelaran");
  }
  return ok([...data]);
}

/**
 * Okupansi SATU slot dari view slot_date_status untuk tanggal >= hari ini (WIB)
 * — dipakai halaman /booking/[slotId] agar chip tanggalnya sadar-slot (tanggal
 * terisi dinonaktifkan). Validasi server createBooking (DATE_TAKEN) tetap
 * sumber kebenaran terakhir.
 */
export async function getSlotOccupancy(slotId: string): Promise<Result<OccupancyRow[]>> {
  if (!isDbConfigured()) return fail<OccupancyRow[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await coba(sql<OccupancyRow[]>`
    select slot_id, event_date, status from slot_date_status
     where slot_id = ${slotId} and event_date >= ${tanggalHariIniJakarta()}`);

  if (error) return dbFail<OccupancyRow[]>(error, "Gagal memuat okupansi slot");
  return ok([...data]);
}

/** Status terkini denah untuk polling browser (GET /api/slots/status). */
export type SlotStatusData = {
  /** Okupansi per (slot, tanggal) untuk tanggal >= hari ini (WIB). */
  occupancy: OccupancyRow[];
  /** Status blokir panitia tiap slot. */
  slots: Pick<SlotRow, "id" | "status">[];
};

export async function getSlotStatus(): Promise<Result<SlotStatusData>> {
  if (!isDbConfigured()) return fail<SlotStatusData>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const occupancy = await coba(sql<OccupancyRow[]>`
    select slot_id, event_date, status from slot_date_status
     where event_date >= ${tanggalHariIniJakarta()}`);
  if (occupancy.error) return dbFail<SlotStatusData>(occupancy.error, "Gagal memuat okupansi slot");

  const slots = await coba(sql<SlotStatusData["slots"]>`select id, status from slots`);
  if (slots.error) return dbFail<SlotStatusData>(slots.error, "Gagal memuat status slot");

  return ok({ occupancy: [...occupancy.data], slots: [...slots.data] });
}

/** Satu slot beserta zona induknya (untuk halaman booking / beli). */
export async function getSlotDetail(slotId: string): Promise<Result<SlotDetail>> {
  if (!isDbConfigured()) return fail<SlotDetail>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await cobaSatu(sql`${slotWithZone()} where s.id = ${slotId}`);

  if (error) return dbFail<SlotDetail>(error, "Gagal memuat data slot");

  const slot = normalizeSlotDetail(data);
  if (!slot) return fail<SlotDetail>("Slot tidak ditemukan.", "NOT_FOUND");
  return ok(slot);
}

/** Cari slot lewat id elemen SVG denah (mis. "slot-umkm-07"). */
export async function getSlotBySvgId(svgElementId: string): Promise<Result<SlotDetail>> {
  if (!isDbConfigured()) return fail<SlotDetail>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await cobaSatu(
    sql`${slotWithZone()} where s.svg_element_id = ${svgElementId}`,
  );

  if (error) return dbFail<SlotDetail>(error, "Gagal memuat data slot");

  const slot = normalizeSlotDetail(data);
  if (!slot) return fail<SlotDetail>("Slot tidak ditemukan.", "NOT_FOUND");
  return ok(slot);
}

/**
 * Saran slot pengganti saat slot pilihan sudah tidak tersedia.
 * Aturan urutannya ada di src/lib/domain/suggestions.ts (murni, tanpa database).
 */
export async function suggestAlternatives(
  slotId: string,
  limit?: number,
): Promise<Result<SlotDetail[]>> {
  if (!isDbConfigured()) return fail<SlotDetail[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const target = await getSlotDetail(slotId);
  if (!target.ok) return fail<SlotDetail[]>(target.error, target.code);

  const { data, error } = await coba(sql`${slotWithZone()} where s.status = 'available'`);

  if (error) return dbFail<SlotDetail[]>(error, "Gagal memuat slot alternatif");

  const allSlots = data
    .map(normalizeSlotDetail)
    .filter((slot): slot is SlotDetail => slot !== null);

  return ok(pickAlternatives({ target: target.data, allSlots, limit }));
}

/** Tenant yang sedang memegang sebuah lapak, beserta booking aktifnya. */
export type SlotTenant = {
  tenant: TenantRow;
  booking: Pick<BookingRow, "id" | "status" | "booking_code">;
};

/**
 * Tenant penyewa sebuah lapak (untuk ditampilkan ke pembeli di alur /beli).
 *
 * Bagian 1 arsitektur menyebut pembeli membeli unit "dari salah satu tenant", jadi
 * nama tenant perlu terlihat di alur pembelian — itulah yang membuat entity Tenant
 * benar-benar dipakai bersama oleh kedua alur transaksi.
 *
 * Model per tanggal: satu lapak bisa punya beberapa booking aktif (tanggal
 * berbeda). Untuk alur /beli cukup ditampilkan penyewa aktif pertama
 * (terlama) — mengembalikan ok(null) kalau lapak belum ada penyewanya.
 */
export async function getSlotTenant(slotId: string): Promise<Result<SlotTenant | null>> {
  if (!isDbConfigured()) return fail<SlotTenant | null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  type Baris = { id: string; status: BookingRow["status"]; booking_code: string; tenant: TenantRow | null };
  const { data: row, error } = await cobaSatu(sql<Baris[]>`
    select b.id, b.status, b.booking_code, to_jsonb(t) as tenant
      from bookings b left join tenants t on t.id = b.tenant_id
     where b.slot_id = ${slotId} and b.status in ('pending_payment', 'confirmed')
     order by b.created_at limit 1`);

  if (error) return dbFail<SlotTenant | null>(error, "Gagal memuat data tenant lapak");
  if (!row) return ok(null);

  const tenant = pickOne(row.tenant);
  if (!tenant) return ok(null);

  return ok({
    tenant,
    booking: { id: row.id, status: row.status, booking_code: row.booking_code },
  });
}
