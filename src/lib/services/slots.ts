import { suggestAlternatives as pickAlternatives } from "@/lib/domain/suggestions";
import { fail, ok, type Result } from "@/lib/result";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
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
// dibuat runtime — konsisten dengan src/lib/supabase/admin.ts.
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/slots.ts hanya boleh dipakai di server.");
}

/* ------------------------------------------------------------------ */
/* Utilitas bersama lapisan service                                    */
/* ------------------------------------------------------------------ */

/** Pesan seragam kalau env service role belum diisi. */
export const NO_CONFIG_MESSAGE =
  "Supabase belum dikonfigurasi. Salin .env.example ke .env.local dan isi kredensialnya.";

/** Bentuk error PostgREST yang kita pakai. */
export type PgError = { message?: string; code?: string; details?: string } | null | undefined;

/** Bungkus error database jadi Result gagal berbahasa Indonesia. */
export function dbFail<T>(error: PgError, konteks: string): Result<T> {
  const pesan = error?.message ?? "kesalahan tidak diketahui";
  return fail<T>(`${konteks}: ${pesan}`, error?.code);
}

/** PostgREST kadang mengembalikan objek, kadang array, untuk relasi 1:1. */
export function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Select standar untuk slot + zona induknya. */
export const SLOT_WITH_ZONE_SELECT = "*, zone:zones(*)";

type RawSlotWithZone = SlotRow & { zone: ZoneRow | ZoneRow[] | null };

/** Ubah baris mentah PostgREST menjadi SlotDetail; null kalau zona tidak ikut. */
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

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/**
 * Data denah publik: event aktif + seluruh zona (urut display_order) beserta slotnya.
 * Dipakai halaman "/" dan sebagai basis langganan realtime tabel slots.
 */
export async function getFloorPlan(): Promise<Result<FloorPlanData>> {
  if (!isServiceRoleConfigured()) return fail<FloorPlanData>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();

  const eventQuery = await supabase
    .from("events")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (eventQuery.error) {
    return dbFail<FloorPlanData>(eventQuery.error as PgError, "Gagal memuat data event");
  }
  const event = (eventQuery.data ?? null) as EventRow | null;

  // Satu query berelasi: zona beserta seluruh slotnya.
  const zoneSelect = "*, slots(*)";
  const zoneQuery = event
    ? await supabase
        .from("zones")
        .select(zoneSelect)
        .eq("event_id", event.id)
        .order("display_order", { ascending: true })
    : await supabase.from("zones").select(zoneSelect).order("display_order", { ascending: true });

  if (zoneQuery.error) {
    return dbFail<FloorPlanData>(zoneQuery.error as PgError, "Gagal memuat data zona");
  }

  const rawZones = (zoneQuery.data ?? []) as unknown as Array<ZoneRow & { slots: SlotRow[] | null }>;
  const zones: ZoneWithSlots[] = rawZones
    .map((zone) => ({ ...zone, slots: [...(zone.slots ?? [])].sort(compareSlots) }))
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, "id-ID"));

  return ok<FloorPlanData>({ event, zones });
}

/** Satu slot beserta zona induknya (untuk halaman booking / beli). */
export async function getSlotDetail(slotId: string): Promise<Result<SlotDetail>> {
  if (!isServiceRoleConfigured()) return fail<SlotDetail>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("slots")
    .select(SLOT_WITH_ZONE_SELECT)
    .eq("id", slotId)
    .maybeSingle();

  if (error) return dbFail<SlotDetail>(error as PgError, "Gagal memuat data slot");

  const slot = normalizeSlotDetail(data);
  if (!slot) return fail<SlotDetail>("Slot tidak ditemukan.", "NOT_FOUND");
  return ok(slot);
}

/** Cari slot lewat id elemen SVG denah (mis. "slot-umkm-07"). */
export async function getSlotBySvgId(svgElementId: string): Promise<Result<SlotDetail>> {
  if (!isServiceRoleConfigured()) return fail<SlotDetail>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("slots")
    .select(SLOT_WITH_ZONE_SELECT)
    .eq("svg_element_id", svgElementId)
    .maybeSingle();

  if (error) return dbFail<SlotDetail>(error as PgError, "Gagal memuat data slot");

  const slot = normalizeSlotDetail(data);
  if (!slot) return fail<SlotDetail>("Slot tidak ditemukan.", "NOT_FOUND");
  return ok(slot);
}

/**
 * Saran slot pengganti saat slot pilihan sudah tidak tersedia.
 * Aturan urutannya ada di src/lib/domain/suggestions.ts (murni, tanpa Supabase).
 */
export async function suggestAlternatives(
  slotId: string,
  limit?: number,
): Promise<Result<SlotDetail[]>> {
  if (!isServiceRoleConfigured()) return fail<SlotDetail[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const target = await getSlotDetail(slotId);
  if (!target.ok) return fail<SlotDetail[]>(target.error, target.code);

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("slots")
    .select(SLOT_WITH_ZONE_SELECT)
    .eq("status", "available");

  if (error) return dbFail<SlotDetail[]>(error as PgError, "Gagal memuat slot alternatif");

  const rows = (data ?? []) as unknown[];
  const allSlots = rows
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
 * Berkat unique index parsial bookings(slot_id) where status in
 * ('pending_payment','confirmed'), satu lapak paling banyak punya SATU booking aktif.
 * Mengembalikan ok(null) kalau lapak belum ada penyewanya — itu bukan error.
 */
export async function getSlotTenant(slotId: string): Promise<Result<SlotTenant | null>> {
  if (!isServiceRoleConfigured()) return fail<SlotTenant | null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, booking_code, tenant:tenants(*)")
    .eq("slot_id", slotId)
    .in("status", ["pending_payment", "confirmed"])
    .limit(1)
    .maybeSingle();

  if (error) return dbFail<SlotTenant | null>(error as PgError, "Gagal memuat data tenant lapak");
  if (!data) return ok(null);

  const row = data as { id: string; status: BookingRow["status"]; booking_code: string; tenant: TenantRow | TenantRow[] | null };
  const tenant = pickOne(row.tenant);
  if (!tenant) return ok(null);

  return ok({
    tenant,
    booking: { id: row.id, status: row.status, booking_code: row.booking_code },
  });
}
