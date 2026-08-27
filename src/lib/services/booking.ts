import { TENANT_TYPE_BY_ZONE_TYPE } from "@/lib/domain/labels";
import { fail, ok, type Result } from "@/lib/result";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import type {
  AdminFeePaymentRow,
  BookingDetail,
  BookingRow,
  Json,
  SlotRow,
  TenantRow,
  ZoneRow,
} from "@/lib/types/database";
import {
  createBookingSchema,
  submitPaymentSchema,
  zodFieldErrors,
  type CreateBookingInput,
  type SubmitPaymentInput,
} from "@/lib/validation/schemas";
import {
  dbFail,
  getSlotDetail,
  NO_CONFIG_MESSAGE,
  pickOne,
  type PgError,
} from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/booking.ts hanya boleh dipakai di server.");
}

/** Kode error unique_violation Postgres — dipakai untuk mendeteksi rebutan slot. */
const UNIQUE_VIOLATION = "23505";

/** Select standar booking + slot + zona + tenant + pembayaran (1:1). */
export const BOOKING_SELECT =
  "*, slot:slots(*, zone:zones(*)), tenant:tenants(*), payment:admin_fee_payments(*)";

type RawSlotWithZone = SlotRow & { zone: ZoneRow | ZoneRow[] | null };
type RawBooking = BookingRow & {
  slot: RawSlotWithZone | RawSlotWithZone[] | null;
  tenant: TenantRow | TenantRow[] | null;
  payment: AdminFeePaymentRow | AdminFeePaymentRow[] | null;
};

/** Rapikan baris mentah PostgREST jadi BookingDetail. Dipakai juga oleh services/admin.ts. */
export function normalizeBookingRow(raw: unknown): BookingDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as RawBooking;

  const rawSlot = pickOne<RawSlotWithZone>(row.slot);
  const zone = rawSlot ? pickOne<ZoneRow>(rawSlot.zone) : null;
  const tenant = pickOne<TenantRow>(row.tenant);
  if (!rawSlot || !zone || !tenant) return null;

  const { zone: _zone, ...slotOnly } = rawSlot;
  void _zone;
  const { slot: _slot, tenant: _tenant, payment: _payment, ...bookingOnly } = row;
  void _slot;
  void _tenant;
  void _payment;

  return {
    ...(bookingOnly as BookingRow),
    slot: { ...(slotOnly as SlotRow), zone },
    tenant,
    payment: pickOne<AdminFeePaymentRow>(row.payment),
  };
}

/**
 * Buat booking baru untuk satu slot.
 *
 * PENTING — tidak ada transaksi lintas-request di supabase-js, jadi langkah-langkah
 * di bawah dijalankan berurutan dengan KOMPENSASI MANUAL kalau langkah lanjutan gagal:
 *   1. insert bookings            -> gagal: berhenti
 *   2. insert admin_fee_payments  -> gagal: hapus booking (kompensasi)
 *   3. update slots -> 'pending'  -> gagal / 0 baris: hapus booking (cascade menghapus
 *                                    pembayaran) lalu laporkan slot sudah diambil
 * Pengaman utamanya tetap di database: unique index bookings_active_slot_idx.
 * SARAN PRODUKSI: pindahkan tiga langkah ini ke satu Postgres function (rpc)
 * agar benar-benar atomik.
 */
export async function createBooking(
  input: CreateBookingInput,
): Promise<Result<{ bookingId: string; bookingCode: string }>> {
  type Out = { bookingId: string; bookingCode: string };
  if (!isServiceRoleConfigured()) return fail<Out>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    const errors = zodFieldErrors(parsed.error);
    const first = Object.values(errors)[0] ?? "Data booking tidak valid.";
    return fail<Out>(first, "VALIDATION");
  }
  const data = parsed.data;

  const slotResult = await getSlotDetail(data.slotId);
  if (!slotResult.ok) return fail<Out>(slotResult.error, slotResult.code);
  const slot = slotResult.data;

  if (slot.zone.zone_type === "facility") {
    return fail<Out>("Fasilitas umum tidak bisa dibooking.", "NOT_BOOKABLE");
  }
  if (slot.status !== "available") {
    return fail<Out>("Slot ini sudah tidak tersedia.", "SLOT_TAKEN");
  }

  // Tipe tenant harus cocok dengan tipe zona (mis. zona UMKM hanya untuk tenant umkm).
  const expectedTenantType = TENANT_TYPE_BY_ZONE_TYPE[slot.zone.zone_type];
  const tenantType = expectedTenantType ?? data.tenantType;

  const supabase = createAdminSupabase();
  const now = new Date().toISOString();

  /* --- Langkah 0: temukan atau buat tenant (dikunci pada nomor telepon) --- */
  const existingTenant = await supabase
    .from("tenants")
    .select("*")
    .eq("phone", data.tenantPhone)
    .eq("tenant_type", tenantType)
    .limit(1)
    .maybeSingle();

  if (existingTenant.error) {
    return dbFail<Out>(existingTenant.error as PgError, "Gagal memeriksa data tenant");
  }

  let tenant = (existingTenant.data ?? null) as TenantRow | null;
  if (!tenant) {
    const inserted = await supabase
      .from("tenants")
      .insert({
        name: data.tenantName,
        phone: data.tenantPhone,
        email: data.tenantEmail ?? null,
        tenant_type: tenantType,
        detail: (data.detail ?? {}) as unknown as Json,
      })
      .select("*")
      .single();

    if (inserted.error || !inserted.data) {
      return dbFail<Out>(inserted.error as PgError, "Gagal menyimpan data tenant");
    }
    tenant = inserted.data as TenantRow;
  }

  /* --- Langkah 1: insert booking --- */
  const bookingInsert = await supabase
    .from("bookings")
    .insert({
      slot_id: slot.id,
      tenant_id: tenant.id,
      status: "pending_payment",
      notes: data.notes ?? null,
    })
    .select("id, booking_code")
    .single();

  if (bookingInsert.error || !bookingInsert.data) {
    const error = bookingInsert.error as PgError;
    if (error?.code === UNIQUE_VIOLATION) {
      return fail<Out>("Slot ini baru saja dibooking orang lain.", "SLOT_TAKEN");
    }
    return dbFail<Out>(error, "Gagal membuat booking");
  }
  const booking = bookingInsert.data as { id: string; booking_code: string };

  /* --- Langkah 2: insert tagihan admin fee (metode final dipilih di halaman bayar) --- */
  const paymentInsert = await supabase.from("admin_fee_payments").insert({
    booking_id: booking.id,
    amount: slot.zone.admin_fee,
    method: "cash",
    status: "unpaid",
  });

  if (paymentInsert.error) {
    // Kompensasi: booking batal dibuat.
    await supabase.from("bookings").delete().eq("id", booking.id);
    return dbFail<Out>(paymentInsert.error as PgError, "Gagal membuat tagihan biaya admin");
  }

  /* --- Langkah 3: kunci slot jadi 'pending' (hanya kalau masih 'available') --- */
  const slotUpdate = await supabase
    .from("slots")
    .update({ status: "pending", updated_at: now })
    .eq("id", slot.id)
    .eq("status", "available")
    .select("id");

  const affected = ((slotUpdate.data ?? []) as unknown[]).length;
  if (slotUpdate.error || affected === 0) {
    // Kompensasi: hapus booking (admin_fee_payments ikut terhapus lewat cascade).
    await supabase.from("bookings").delete().eq("id", booking.id);
    if (slotUpdate.error) {
      return dbFail<Out>(slotUpdate.error as PgError, "Gagal mengunci slot");
    }
    return fail<Out>("Slot ini baru saja dibooking orang lain.", "SLOT_TAKEN");
  }

  return ok<Out>({ bookingId: booking.id, bookingCode: booking.booking_code });
}

/** Booking lengkap berdasarkan id. */
export async function getBookingDetail(bookingId: string): Promise<Result<BookingDetail>> {
  if (!isServiceRoleConfigured()) return fail<BookingDetail>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();

  if (error) return dbFail<BookingDetail>(error as PgError, "Gagal memuat data booking");

  const detail = normalizeBookingRow(data);
  if (!detail) return fail<BookingDetail>("Booking tidak ditemukan.", "NOT_FOUND");
  return ok(detail);
}

/** Booking lengkap berdasarkan kode booking (mis. "BK-A1B2C3"). */
export async function getBookingByCode(code: string): Promise<Result<BookingDetail>> {
  if (!isServiceRoleConfigured()) return fail<BookingDetail>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const normalized = code.trim().toUpperCase();
  if (normalized.length === 0) {
    return fail<BookingDetail>("Kode booking wajib diisi.", "VALIDATION");
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("booking_code", normalized)
    .maybeSingle();

  if (error) return dbFail<BookingDetail>(error as PgError, "Gagal memuat data booking");

  const detail = normalizeBookingRow(data);
  if (!detail) {
    return fail<BookingDetail>("Booking dengan kode tersebut tidak ditemukan.", "NOT_FOUND");
  }
  return ok(detail);
}

/**
 * Simpan pilihan metode pembayaran (+ bukti transfer kalau ada) lalu tandai
 * pembayaran sebagai "submitted" agar masuk antrean verifikasi admin.
 */
export async function submitPayment(
  input: SubmitPaymentInput,
): Promise<Result<{ bookingId: string }>> {
  type Out = { bookingId: string };
  if (!isServiceRoleConfigured()) return fail<Out>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const parsed = submitPaymentSchema.safeParse(input);
  if (!parsed.success) {
    const errors = zodFieldErrors(parsed.error);
    const first = Object.values(errors)[0] ?? "Data pembayaran tidak valid.";
    return fail<Out>(first, "VALIDATION");
  }
  const data = parsed.data;

  const bookingResult = await getBookingDetail(data.bookingId);
  if (!bookingResult.ok) return fail<Out>(bookingResult.error, bookingResult.code);
  const booking = bookingResult.data;

  if (booking.status === "cancelled") {
    return fail<Out>("Booking ini sudah dibatalkan.", "CANCELLED");
  }
  if (booking.payment?.status === "verified") {
    return fail<Out>("Pembayaran booking ini sudah terverifikasi.", "ALREADY_VERIFIED");
  }

  const supabase = createAdminSupabase();
  const now = new Date().toISOString();

  // Tagihan seharusnya sudah dibuat createBooking; kalau hilang, buat ulang
  // memakai admin_fee zona agar alur pengguna tidak buntu.
  if (!booking.payment) {
    const inserted = await supabase.from("admin_fee_payments").insert({
      booking_id: booking.id,
      amount: booking.slot.zone.admin_fee,
      method: data.method,
      status: "submitted",
      proof_url: data.proofUrl ?? null,
      submitted_at: now,
    });
    if (inserted.error) {
      return dbFail<Out>(inserted.error as PgError, "Gagal menyimpan pembayaran");
    }
    return ok<Out>({ bookingId: booking.id });
  }

  const updated = await supabase
    .from("admin_fee_payments")
    .update({
      method: data.method,
      status: "submitted",
      proof_url: data.proofUrl ?? booking.payment.proof_url ?? null,
      submitted_at: now,
      reject_reason: null,
      updated_at: now,
    })
    .eq("id", booking.payment.id);

  if (updated.error) {
    return dbFail<Out>(updated.error as PgError, "Gagal menyimpan pembayaran");
  }

  return ok<Out>({ bookingId: booking.id });
}

/**
 * Batalkan booking dan lepas slotnya kembali ke 'available'.
 * Tanpa transaksi: kalau pelepasan slot gagal, status booking dikembalikan (kompensasi).
 */
export async function cancelBooking(bookingId: string): Promise<Result<null>> {
  if (!isServiceRoleConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const current = await supabase
    .from("bookings")
    .select("id, slot_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (current.error) return dbFail<null>(current.error as PgError, "Gagal memuat data booking");

  const booking = (current.data ?? null) as
    | { id: string; slot_id: string; status: BookingRow["status"] }
    | null;
  if (!booking) return fail<null>("Booking tidak ditemukan.", "NOT_FOUND");
  if (booking.status === "cancelled") return ok(null); // idempoten

  const now = new Date().toISOString();

  const bookingUpdate = await supabase
    .from("bookings")
    .update({ status: "cancelled", updated_at: now })
    .eq("id", booking.id);

  if (bookingUpdate.error) {
    return dbFail<null>(bookingUpdate.error as PgError, "Gagal membatalkan booking");
  }

  const slotUpdate = await supabase
    .from("slots")
    .update({ status: "available", updated_at: now })
    .eq("id", booking.slot_id);

  if (slotUpdate.error) {
    // Kompensasi: kembalikan status booking supaya data tidak jadi tidak konsisten.
    await supabase.from("bookings").update({ status: booking.status }).eq("id", booking.id);
    return dbFail<null>(slotUpdate.error as PgError, "Gagal melepas slot");
  }

  return ok(null);
}
