import {
  isBookableZoneType,
  isVehicleZoneType,
  MAX_PENDING_BOOKINGS_PER_PHONE,
  PAYMENT_DEADLINE_HOURS,
} from "@/lib/domain/constants";
import { slotAdminFee } from "@/lib/domain/harga";
import { hitungTotalBiaya } from "@/lib/domain/ketersediaan";
import { TENANT_TYPE_BY_ZONE_TYPE } from "@/lib/domain/labels";
import { notifyBooking, type BookingNotifKind } from "@/lib/notifications";
import { fail, ok, type Result } from "@/lib/result";
import { syncToSheet } from "@/lib/sheets";
import { formatTanggalWaktu, slotDisplayName } from "@/lib/utils";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import type {
  AdminFeePaymentRow,
  BookingDetail,
  BookingRow,
  Json,
  SlotRow,
  TenantRow,
  VehicleListingRow,
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
  tanggalHariIniJakarta,
  type PgError,
} from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/booking.ts hanya boleh dipakai di server.");
}

/** Kode error unique_violation Postgres — dipakai untuk mendeteksi rebutan slot. */
const UNIQUE_VIOLATION = "23505";

/**
 * Select standar booking + slot + zona + tenant + pembayaran (1:1) + tanggal sewa.
 * booking_dates ikut diambil mentah (event_date + is_active); baris nonaktif
 * disaring di normalizeBookingRow sesuai kontrak (BookingDetail.dates = aktif saja).
 */
export const BOOKING_SELECT =
  "*, slot:slots(*, zone:zones(*)), tenant:tenants(*), payment:admin_fee_payments(*), booking_dates(event_date, is_active), listing:vehicle_listings(*)";

type RawSlotWithZone = SlotRow & { zone: ZoneRow | ZoneRow[] | null };
type RawBookingDate = { event_date: string; is_active: boolean };
type RawBooking = BookingRow & {
  slot: RawSlotWithZone | RawSlotWithZone[] | null;
  tenant: TenantRow | TenantRow[] | null;
  payment: AdminFeePaymentRow | AdminFeePaymentRow[] | null;
  booking_dates: RawBookingDate[] | null;
  listing: VehicleListingRow | VehicleListingRow[] | null;
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
  const {
    slot: _slot,
    tenant: _tenant,
    payment: _payment,
    booking_dates: _dates,
    listing: _listing,
    ...bookingOnly
  } = row;
  void _slot;
  void _tenant;
  void _payment;
  void _dates;
  void _listing;

  const dates = (row.booking_dates ?? [])
    .filter((d) => d.is_active)
    .map((d) => d.event_date)
    .sort();

  return {
    ...(bookingOnly as BookingRow),
    slot: { ...(slotOnly as SlotRow), zone },
    tenant,
    payment: pickOne<AdminFeePaymentRow>(row.payment),
    dates,
    listing: pickOne<VehicleListingRow>(row.listing),
  };
}

/**
 * Buat booking baru untuk satu slot pada >= 1 tanggal weekend (model per tanggal).
 *
 * PENTING — tidak ada transaksi lintas-request di supabase-js, jadi langkah-langkah
 * di bawah dijalankan berurutan dengan KOMPENSASI MANUAL kalau langkah lanjutan gagal:
 *   1. insert bookings           -> gagal: berhenti
 *   2. insert booking_dates      -> unique violation: hapus booking (kompensasi)
 *                                   lalu laporkan DATE_TAKEN (tanggal baru terisi)
 *   3. insert admin_fee_payments -> gagal: hapus booking (cascade menghapus
 *                                   booking_dates)
 * slots.status TIDAK disentuh lagi — kolom itu kini berarti blokir panitia.
 * Pengaman utamanya tetap di database: unique index parsial
 * booking_dates_active_slot_date_idx (slot_id, event_date) where is_active.
 * SARAN PRODUKSI: pindahkan langkah-langkah ini ke satu Postgres function (rpc)
 * agar benar-benar atomik.
 */
export async function createBooking(
  input: CreateBookingInput,
  opts?: { skipPendingLimit?: boolean },
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
  // Warung (dan tipe non-bookable lain di NON_BOOKABLE_ZONE_TYPES) ditutup online.
  if (!isBookableZoneType(slot.zone.zone_type)) {
    return fail<Out>(
      "Zona warung belum dibuka untuk booking online. Hubungi panitia langsung.",
      "ZONE_CLOSED",
    );
  }
  // Makna baru slots.status: selain 'available' berarti DIBLOKIR PANITIA
  // untuk semua tanggal (bukan status booking).
  if (slot.status !== "available") {
    return fail<Out>("Slot ini sedang diblokir panitia dan tidak bisa dibooking.", "SLOT_TAKEN");
  }

  // Tipe tenant harus cocok dengan tipe zona (mis. zona UMKM hanya untuk tenant umkm).
  const expectedTenantType = TENANT_TYPE_BY_ZONE_TYPE[slot.zone.zone_type];
  const tenantType = expectedTenantType ?? data.tenantType;

  // Zona kendaraan WAJIB menyertakan data kendaraan untuk katalog publik
  // (1 slot = 1 kendaraan); zona lain mengabaikan field vehicle bila terkirim.
  const zonaKendaraan = isVehicleZoneType(slot.zone.zone_type);
  const zonaMobilBaru = slot.zone.zone_type === "mobil_baru";
  if (zonaKendaraan && !data.vehicle) {
    return fail<Out>(
      "Data kendaraan (nama, harga, dan foto) wajib diisi untuk slot zona kendaraan.",
      "VALIDATION",
    );
  }
  // Plat wajib untuk kendaraan BEKAS; mobil baru belum berplat (dikecualikan).
  if (zonaKendaraan && !zonaMobilBaru && !data.vehicle?.plateNumber) {
    return fail<Out>("Nomor plat wajib diisi untuk kendaraan bekas.", "VALIDATION");
  }

  const supabase = createAdminSupabase();

  /* --- Validasi tanggal: unik, terdaftar aktif di event_dates, dan >= hari ini --- */
  const today = tanggalHariIniJakarta();
  const dates = Array.from(new Set(data.eventDates)).sort();

  if (dates.some((d) => d < today)) {
    return fail<Out>("Tanggal yang dipilih sudah lewat.", "VALIDATION");
  }

  const validDatesQuery = await supabase
    .from("event_dates")
    .select("event_date")
    .eq("is_active", true)
    .in("event_date", dates);

  if (validDatesQuery.error) {
    return dbFail<Out>(validDatesQuery.error as PgError, "Gagal memeriksa tanggal gelaran");
  }
  const terdaftar = new Set(
    ((validDatesQuery.data ?? []) as Array<{ event_date: string }>).map((d) => d.event_date),
  );
  if (dates.some((d) => !terdaftar.has(d))) {
    return fail<Out>(
      "Sebagian tanggal yang dipilih bukan tanggal gelaran yang tersedia.",
      "VALIDATION",
    );
  }

  /* --- Anti-penimbunan slot: batasi booking pending per nomor telepon ---
     Booking pending menahan tanggal sampai 24 jam (atau 72 jam bila bukti
     sudah dikirim); tanpa batas ini satu nomor bisa mengunci banyak tanggal
     tanpa pernah membayar. Booking manual oleh admin (skipPendingLimit) lewat
     dari batas ini karena admin tepercaya. */
  if (!opts?.skipPendingLimit) {
    const tenantSemuaTipe = await supabase
      .from("tenants")
      .select("id")
      .eq("phone", data.tenantPhone);
    if (tenantSemuaTipe.error) {
      return dbFail<Out>(tenantSemuaTipe.error as PgError, "Gagal memeriksa data tenant");
    }
    const tenantIds = ((tenantSemuaTipe.data ?? []) as Array<{ id: string }>).map((t) => t.id);
    if (tenantIds.length > 0) {
      const pendingCount = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("tenant_id", tenantIds)
        .eq("status", "pending_payment");
      if (pendingCount.error) {
        return dbFail<Out>(pendingCount.error as PgError, "Gagal memeriksa booking berjalan");
      }
      if ((pendingCount.count ?? 0) >= MAX_PENDING_BOOKINGS_PER_PHONE) {
        return fail<Out>(
          `Nomor telepon ini masih punya ${pendingCount.count} booking menunggu pembayaran. ` +
            "Selesaikan pembayarannya (atau batalkan) dulu sebelum membuat booking baru.",
          "TOO_MANY_PENDING",
        );
      }
    }
  }

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
  let tenantBaru = false;
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
      if ((inserted.error as PgError)?.code !== UNIQUE_VIOLATION) {
        return dbFail<Out>(inserted.error as PgError, "Gagal menyimpan data tenant");
      }
      // Kena index unik tenants_phone_type_uidx: request lain baru saja membuat
      // tenant dengan (telepon, jenis) yang sama — pakai baris itu, jangan ganda.
      const ulang = await supabase
        .from("tenants")
        .select("*")
        .eq("phone", data.tenantPhone)
        .eq("tenant_type", tenantType)
        .limit(1)
        .maybeSingle();
      if (ulang.error || !ulang.data) {
        return dbFail<Out>(
          (ulang.error ?? inserted.error) as PgError,
          "Gagal menyimpan data tenant",
        );
      }
      tenant = ulang.data as TenantRow;
    } else {
      tenant = inserted.data as TenantRow;
      tenantBaru = true;
    }
  }

  // Kompensasi bersama: tenant yang BARU dibuat request ini ikut dihapus saat
  // langkah berikutnya gagal, supaya tidak ada baris PII yatim tanpa booking.
  // Tenant lama (ditemukan lewat telepon) tidak pernah disentuh.
  const tenantId = tenant.id;
  const hapusTenantYatim = async (): Promise<void> => {
    if (!tenantBaru) return;
    await supabase.from("tenants").delete().eq("id", tenantId);
  };

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
    await hapusTenantYatim();
    const error = bookingInsert.error as PgError;
    if (error?.code === UNIQUE_VIOLATION) {
      return fail<Out>("Slot ini baru saja dibooking orang lain.", "SLOT_TAKEN");
    }
    return dbFail<Out>(error, "Gagal membuat booking");
  }
  const booking = bookingInsert.data as { id: string; booking_code: string };

  /* --- Langkah 2: kunci pasangan (slot, tanggal) lewat booking_dates --- */
  const datesInsert = await supabase.from("booking_dates").insert(
    dates.map((event_date) => ({
      booking_id: booking.id,
      slot_id: slot.id,
      event_date,
    })),
  );

  if (datesInsert.error) {
    // Kompensasi: booking batal dibuat (cascade menghapus baris booking_dates
    // yang mungkin sempat masuk).
    await supabase.from("bookings").delete().eq("id", booking.id);
    await hapusTenantYatim();
    if ((datesInsert.error as PgError)?.code === UNIQUE_VIOLATION) {
      return fail<Out>(
        "Sebagian tanggal yang dipilih baru saja terisi. Silakan pilih tanggal lain.",
        "DATE_TAKEN",
      );
    }
    return dbFail<Out>(datesInsert.error as PgError, "Gagal menyimpan tanggal booking");
  }

  /* --- Langkah 3: insert tagihan admin fee = biaya per tanggal x jumlah tanggal ---
     Harga per tanggal diresolusi lewat slotAdminFee (override slot > harga zona). */
  const amount = hitungTotalBiaya(slotAdminFee(slot, slot.zone), dates.length);
  const paymentInsert = await supabase.from("admin_fee_payments").insert({
    booking_id: booking.id,
    amount,
    // Transfer-only: tagihan langsung memakai metode transfer; booking yang
    // tidak kunjung membayar dibatalkan otomatis expire_unpaid_bookings().
    method: "transfer",
    status: "unpaid",
  });

  if (paymentInsert.error) {
    // Kompensasi: booking batal dibuat (booking_dates ikut terhapus lewat cascade).
    await supabase.from("bookings").delete().eq("id", booking.id);
    await hapusTenantYatim();
    return dbFail<Out>(paymentInsert.error as PgError, "Gagal membuat tagihan biaya admin");
  }

  /* --- Langkah 4: simpan data kendaraan untuk katalog (khusus zona kendaraan) --- */
  if (zonaKendaraan && data.vehicle) {
    const v = data.vehicle;
    // Jenis kendaraan DITENTUKAN zona, bukan kiriman klien (keputusan pemilik
    // 2026-08-29: zona mobil_motor_bekas khusus motor) — v.kind diabaikan agar
    // pemanggil API tidak bisa menaruh "mobil" di zona motor.
    const jenisDariZona = slot.zone.zone_type === "mobil_motor_bekas" ? "motor" : "mobil";
    const listingInsert = await supabase.from("vehicle_listings").insert({
      booking_id: booking.id,
      slot_id: slot.id,
      vehicle_name: v.vehicleName,
      vehicle_kind: jenisDariZona,
      plate_number: v.plateNumber ?? null,
      price: v.price,
      year: v.year ?? null,
      mileage_km: v.mileageKm ?? null,
      transmission: v.transmission ?? null,
      color: v.color ?? null,
      description: v.description ?? null,
      photo_url: v.photoUrl,
    });

    if (listingInsert.error) {
      // Kompensasi penuh: tanpa listing, katalog kehilangan unitnya — batalkan
      // seluruh booking supaya penyewa mengulang dengan bersih.
      await supabase.from("bookings").delete().eq("id", booking.id);
      await hapusTenantYatim();
      return dbFail<Out>(listingInsert.error as PgError, "Gagal menyimpan data kendaraan");
    }

    void syncToSheet("vehicle", {
      bookingCode: booking.booking_code,
      vehicleName: v.vehicleName,
      jenis: jenisDariZona,
      plate: v.plateNumber,
      price: v.price,
      tahun: v.year ?? "",
      km: v.mileageKm ?? "",
      transmisi: v.transmission ?? "",
      warna: v.color ?? "",
      slot: slot.svg_element_id ?? slot.slot_label ?? slot.id,
      zona: slot.zone.name,
      tanggal: dates.join(", "),
      photoUrl: v.photoUrl,
      tampil: "menunggu-konfirmasi",
    });
  }

  // Sinkron ke Google Sheets — fire-and-forget, tidak menahan respons.
  void syncToSheet("booking", {
    bookingCode: booking.booking_code,
    status: "pending_payment",
    tanggal: dates.join(", "),
    slot: slot.svg_element_id ?? slot.slot_label ?? slot.id,
    zona: slot.zone.name,
    tenantName: data.tenantName,
    phone: data.tenantPhone,
    amount,
  });

  // Notifikasi WA/email ke tenant (fire-and-forget). Tenggat = created + 24 jam,
  // cermin expire_unpaid_bookings; dihitung di sini karena notif modul murni.
  const tenggat = new Date(Date.now() + PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000);
  void notifyBooking("created", {
    tenantName: data.tenantName,
    tenantPhone: data.tenantPhone,
    tenantEmail: data.tenantEmail ?? null,
    bookingCode: booking.booking_code,
    slotName: slotDisplayName(slot),
    zoneName: slot.zone.name,
    dates,
    amount,
    deadlineText: `${formatTanggalWaktu(tenggat)} WIB`,
  });

  return ok<Out>({ bookingId: booking.id, bookingCode: booking.booking_code });
}

/**
 * Kirim notifikasi WA/email untuk satu booking berdasarkan id (memuat detail
 * lengkap dulu supaya nama/slot/tanggal/nominal ikut). Dipakai lapisan service
 * (verifikasi, penolakan, pembatalan). Tidak pernah melempar; kalau detail gagal
 * dimuat, notifikasi dilewati diam-diam — operasi utama tidak boleh terganggu.
 */
export async function kirimNotifikasiBooking(
  kind: BookingNotifKind,
  bookingId: string,
  opts?: { reason?: string | null },
): Promise<void> {
  try {
    const detail = await getBookingDetail(bookingId);
    if (!detail.ok) return;
    const b = detail.data;
    const amount =
      b.payment?.amount ??
      hitungTotalBiaya(slotAdminFee(b.slot, b.slot.zone), Math.max(b.dates.length, 1));
    // Bukti ditolak -> tenant punya jendela unggah ulang 24 jam sejak sekarang.
    const deadlineText =
      kind === "rejected"
        ? `${formatTanggalWaktu(new Date(Date.now() + PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000))} WIB`
        : null;
    await notifyBooking(kind, {
      tenantName: b.tenant.name,
      tenantPhone: b.tenant.phone,
      tenantEmail: b.tenant.email,
      bookingCode: b.booking_code,
      slotName: slotDisplayName(b.slot),
      zoneName: b.slot.zone.name,
      dates: b.dates,
      amount,
      deadlineText,
      reason: opts?.reason ?? null,
    });
  } catch {
    // Notifikasi opsional: kegagalan tidak pernah menggagalkan operasi utama.
  }
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
  // memakai harga efektif slot (slotAdminFee) x jumlah tanggal agar alur
  // pengguna tidak buntu.
  if (!booking.payment) {
    const amount = hitungTotalBiaya(
      slotAdminFee(booking.slot, booking.slot.zone),
      Math.max(booking.dates.length, 1),
    );
    const inserted = await supabase.from("admin_fee_payments").insert({
      booking_id: booking.id,
      amount,
      method: data.method,
      status: "submitted",
      proof_url: data.proofUrl ?? null,
      submitted_at: now,
    });
    if (inserted.error) {
      return dbFail<Out>(inserted.error as PgError, "Gagal menyimpan pembayaran");
    }

    void syncToSheet("payment", {
      bookingCode: booking.booking_code,
      status: "submitted",
      method: data.method,
      amount,
      proofUrl: data.proofUrl ?? "",
      submittedAt: now,
    });

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

  void syncToSheet("payment", {
    bookingCode: booking.booking_code,
    status: "submitted",
    method: data.method,
    amount: booking.payment.amount,
    proofUrl: data.proofUrl ?? booking.payment.proof_url ?? "",
    submittedAt: now,
  });

  return ok<Out>({ bookingId: booking.id });
}

/**
 * Batalkan booking (pembatalan MANDIRI oleh tenant). Cukup set status
 * 'cancelled' — trigger sync_booking_dates_active di database otomatis
 * menonaktifkan baris booking_dates sehingga pasangan (slot, tanggal) lepas
 * kembali. slots.status TIDAK disentuh (kolom itu kini berarti blokir panitia).
 *
 * HANYA booking berstatus 'pending_payment' yang boleh dibatalkan sendiri.
 * Booking 'confirmed' (pembayaran sudah diverifikasi = slot resmi milik tenant)
 * ditolak: pembatalan/refund-nya wewenang panitia, bukan tombol publik yang
 * cukup bermodal UUID booking (temuan audit 2026-08-29, poin 2). UI status
 * memang sudah menyembunyikan tombolnya, ini pertahanan sisi server.
 */
export async function cancelBooking(bookingId: string): Promise<Result<null>> {
  if (!isServiceRoleConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const current = await supabase
    .from("bookings")
    .select("id, booking_code, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (current.error) return dbFail<null>(current.error as PgError, "Gagal memuat data booking");

  const booking = (current.data ?? null) as
    | { id: string; booking_code: string; status: BookingRow["status"] }
    | null;
  if (!booking) return fail<null>("Booking tidak ditemukan.", "NOT_FOUND");
  if (booking.status === "cancelled") return ok(null); // idempoten
  if (booking.status === "confirmed") {
    return fail<null>(
      "Booking yang pembayarannya sudah diverifikasi tidak bisa dibatalkan sendiri. " +
        "Hubungi panitia untuk pembatalan atau pengembalian dana.",
      "ALREADY_CONFIRMED",
    );
  }

  const now = new Date().toISOString();

  // Filter status = 'pending_payment' menutup celah balapan: kalau panitia baru
  // saja memverifikasi (pending -> confirmed) di antara SELECT dan UPDATE ini,
  // update tidak mengenai baris apa pun dan pembatalan ditolak, bukan diam-diam
  // membatalkan booking yang sudah sah.
  const bookingUpdate = await supabase
    .from("bookings")
    .update({ status: "cancelled", updated_at: now })
    .eq("id", booking.id)
    .eq("status", "pending_payment")
    .select("id")
    .maybeSingle();

  if (bookingUpdate.error) {
    return dbFail<null>(bookingUpdate.error as PgError, "Gagal membatalkan booking");
  }
  if (!bookingUpdate.data) {
    return fail<null>(
      "Status booking baru saja berubah (kemungkinan pembayaran Anda sudah diverifikasi), " +
        "jadi tidak bisa dibatalkan. Muat ulang halaman untuk melihat status terbaru.",
      "ALREADY_CONFIRMED",
    );
  }

  void syncToSheet("booking", {
    bookingCode: booking.booking_code,
    status: "cancelled",
  });

  void kirimNotifikasiBooking("cancelled", booking.id);

  return ok(null);
}
