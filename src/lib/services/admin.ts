import { fail, ok, type Result } from "@/lib/result";
import { syncToSheet } from "@/lib/sheets";
import { coba, cobaSatu, isDbConfigured, sql } from "@/lib/db";
import { isBookableZoneType, isVehicleZoneType } from "@/lib/domain/constants";
import type {
  AdminFeePaymentRow,
  BookingDetail,
  BookingStatus,
  EventDateRow,
  SlotDateStatusRow,
  LeasingApplicationRow,
  LeasingPartnerRow,
  LeasingStatus,
  PaymentMethod,
  PaymentStatus,
  PurchaseDetail,
  PurchaseTransactionRow,
  SlotDetail,
  SlotRow,
  SlotStatus,
  TablesUpdate,
  TenantRow,
  ZoneRow,
  ZoneType,
} from "@/lib/types/database";
import {
  addEventDateSchema,
  upsertPartnerSchema,
  type UpsertPartnerInput,
} from "@/lib/validation/schemas";
import {
  bookingSelect,
  createBooking,
  getBookingDetail,
  kirimNotifikasiBooking,
  normalizeBookingRow,
} from "./booking";
import { normalizePurchaseRow, purchaseSelect } from "./purchase";
import {
  compareSlots,
  dbFail,
  getSlotDetail,
  NO_CONFIG_MESSAGE,
  normalizeSlotDetail,
  slotJson,
  slotWithZone,
  tanggalHariIniJakarta,
} from "./slots";
import type { CreateBookingInput } from "@/lib/validation/schemas";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/admin.ts hanya boleh dipakai di server.");
}

/* ------------------------------------------------------------------ */
/* Tipe publik lapisan admin                                           */
/* ------------------------------------------------------------------ */

/**
 * Rekap satu zona untuk dashboard — model per tanggal: available/pending/
 * confirmed dihitung untuk SATU tanggal (tanggal aktif terdekat), sedangkan
 * blocked = slot yang diblokir panitia (slots.status != 'available').
 */
export type ZoneSlotStat = {
  zoneId: string;
  name: string;
  zoneType: ZoneType;
  total: number;
  available: number;
  pending: number;
  confirmed: number;
  blocked: number;
};

export type DashboardStats = {
  totalSlot: number;
  /**
   * Tanggal (YYYY-MM-DD) yang dipakai menghitung okupansi per zona:
   * tanggal gelaran aktif terdekat >= hari ini. Null kalau tidak ada
   * tanggal mendatang — okupansi lalu dihitung tanpa baris booking
   * (semua slot tak terblokir dianggap available).
   */
  tanggalOkupansi: string | null;
  /** Rekap per zona (nama zona, tipe, total, available, pending, confirmed, blocked). */
  totalPerStatus: ZoneSlotStat[];
  pembayaranMenungguVerifikasi: number;
  bookingAktif: number;
  pengajuanLeasingMasuk: number;
  totalKomisiPotensial: number;
  totalAdminFeeTerverifikasi: number;
};

export type BookingFilter = {
  status?: BookingStatus;
  paymentStatus?: PaymentStatus;
  zoneId?: string;
  q?: string;
};

export type SlotFilter = {
  zoneId?: string;
  status?: SlotStatus;
  q?: string;
};

/** Tenant + jumlah booking miliknya (untuk /admin/tenants). */
export type TenantListItem = TenantRow & { bookingCount: number };

/** Pengajuan leasing beserta partner dan transaksi pembeliannya (untuk /admin/leasing). */
export type AdminLeasingItem = LeasingApplicationRow & {
  partner: LeasingPartnerRow | null;
  purchase: (PurchaseTransactionRow & { slot: SlotDetail | null }) | null;
};

/** Patch parsial untuk pengajuan leasing. */
export type LeasingApplicationPatch = TablesUpdate<"leasing_applications">;

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

const BOOKING_AKTIF: BookingStatus[] = ["pending_payment", "confirmed"];
const LEASING_MASUK = ["submitted", "verifying"];

/**
 * Tanggal gelaran aktif terdekat (>= hari ini WIB) beserta okupansinya dari
 * view slot_date_status. Dipakai dashboard & analitik supaya okupansi punya
 * makna jelas pada model per tanggal: "per <tanggal>".
 */
async function ambilOkupansiTanggalTerdekat(): Promise<
  Result<{ tanggal: string | null; occupancy: SlotDateStatusRow[] }>
> {
  type Out = { tanggal: string | null; occupancy: SlotDateStatusRow[] };

  const dateQuery = await cobaSatu(sql<{ event_date: string }[]>`
    select event_date from event_dates
     where is_active and event_date >= ${tanggalHariIniJakarta()}
     order by event_date limit 1`);
  if (dateQuery.error) {
    return dbFail<Out>(dateQuery.error, "Gagal memuat tanggal gelaran");
  }

  const tanggal = dateQuery.data?.event_date ?? null;
  if (!tanggal) return ok<Out>({ tanggal: null, occupancy: [] });

  const occQuery = await coba(sql<SlotDateStatusRow[]>`
    select slot_id, event_date, status from slot_date_status where event_date = ${tanggal}`);
  if (occQuery.error) {
    return dbFail<Out>(occQuery.error, "Gagal memuat okupansi slot");
  }

  return ok<Out>({ tanggal, occupancy: [...occQuery.data] });
}

/** Ringkasan angka untuk /admin. */
export async function getDashboardStats(): Promise<Result<DashboardStats>> {
  if (!isDbConfigured()) return fail<DashboardStats>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  type ZonaRingkas = { id: string; name: string; zone_type: ZoneType; display_order: number };
  const zonesQuery = await coba(sql<ZonaRingkas[]>`
    select id, name, zone_type, display_order from zones order by display_order`);
  if (zonesQuery.error) {
    return dbFail<DashboardStats>(zonesQuery.error, "Gagal memuat zona");
  }
  const zones = zonesQuery.data;

  const slotsQuery = await coba(
    sql<{ id: string; zone_id: string; status: SlotStatus }[]>`select id, zone_id, status from slots`,
  );
  if (slotsQuery.error) {
    return dbFail<DashboardStats>(slotsQuery.error, "Gagal memuat slot");
  }
  const slots = slotsQuery.data;

  // Okupansi dihitung untuk tanggal gelaran aktif terdekat (model per tanggal).
  const okupansiResult = await ambilOkupansiTanggalTerdekat();
  if (!okupansiResult.ok) {
    return fail<DashboardStats>(okupansiResult.error, okupansiResult.code);
  }
  const { tanggal: tanggalOkupansi, occupancy } = okupansiResult.data;
  const statusPerSlot = new Map<string, BookingStatus>();
  for (const row of occupancy) {
    // confirmed menang atas pending_payment kalau (secara teori) keduanya ada.
    if (statusPerSlot.get(row.slot_id) !== "confirmed") {
      statusPerSlot.set(row.slot_id, row.status);
    }
  }

  const perZona: ZoneSlotStat[] = zones.map((zone) => {
    const milik = slots.filter((slot) => slot.zone_id === zone.id);
    // slots.status != 'available' = DIBLOKIR PANITIA untuk semua tanggal.
    const blocked = milik.filter((slot) => slot.status !== "available").length;
    const bebas = milik.filter((slot) => slot.status === "available");
    const confirmed = bebas.filter((slot) => statusPerSlot.get(slot.id) === "confirmed").length;
    const pending = bebas.filter(
      (slot) => statusPerSlot.get(slot.id) === "pending_payment",
    ).length;
    return {
      zoneId: zone.id,
      name: zone.name,
      zoneType: zone.zone_type,
      total: milik.length,
      available: bebas.length - confirmed - pending,
      pending,
      confirmed,
      blocked,
    };
  });

  // Tiga angka pelengkap di bawah tidak fatal: kalau query gagal, dihitung nol.
  const paymentRows =
    (await coba(sql<{ amount: number; status: PaymentStatus }[]>`
      select amount, status from admin_fee_payments`)).data ?? [];

  const bookingAktif =
    (await coba(sql`select id from bookings where status in ${sql(BOOKING_AKTIF)}`)).data?.length ?? 0;

  type LeasingRingkas = {
    id: string;
    status: string;
    commission_amount: number | null;
    commission_paid: boolean | null;
  };
  const leasingRows =
    (await coba(sql<LeasingRingkas[]>`
      select id, status, commission_amount, commission_paid from leasing_applications`)).data ?? [];

  const totalKomisiPotensial = leasingRows
    .filter((row) => row.commission_paid !== true && row.status !== "rejected")
    .reduce((sum, row) => sum + (row.commission_amount ?? 0), 0);

  return ok<DashboardStats>({
    totalSlot: slots.length,
    tanggalOkupansi,
    totalPerStatus: perZona,
    pembayaranMenungguVerifikasi: paymentRows.filter((row) => row.status === "submitted").length,
    bookingAktif,
    pengajuanLeasingMasuk: leasingRows.filter((row) => LEASING_MASUK.includes(row.status)).length,
    totalKomisiPotensial,
    totalAdminFeeTerverifikasi: paymentRows
      .filter((row) => row.status === "verified")
      .reduce((sum, row) => sum + (row.amount ?? 0), 0),
  });
}

/* ------------------------------------------------------------------ */
/* Booking & tenant                                                    */
/* ------------------------------------------------------------------ */

/** Daftar booking untuk /admin/bookings. Filter turunan dikerjakan di memori. */
export async function listBookings(filter?: BookingFilter): Promise<Result<BookingDetail[]>> {
  if (!isDbConfigured()) return fail<BookingDetail[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await coba(sql`
    ${bookingSelect()}
    where ${filter?.status ? sql`b.status = ${filter.status}` : sql`true`}
    order by b.created_at desc`);
  if (error) return dbFail<BookingDetail[]>(error, "Gagal memuat daftar booking");

  const keyword = filter?.q?.trim().toLowerCase() ?? "";
  const rows = data
    .map(normalizeBookingRow)
    .filter((row): row is BookingDetail => row !== null)
    .filter((row) => (filter?.zoneId ? row.slot.zone_id === filter.zoneId : true))
    .filter((row) => (filter?.paymentStatus ? row.payment?.status === filter.paymentStatus : true))
    .filter((row) => {
      if (keyword.length === 0) return true;
      const haystack = [
        row.booking_code,
        row.tenant.name,
        row.tenant.phone ?? "",
        row.tenant.email ?? "",
        row.slot.slot_label ?? "",
        row.slot.svg_element_id ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });

  return ok(rows);
}

/** Daftar tenant + jumlah bookingnya. */
export async function listTenants(): Promise<Result<TenantListItem[]>> {
  if (!isDbConfigured()) return fail<TenantListItem[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const tenantsQuery = await coba(sql<TenantListItem[]>`
    select t.*,
           (select count(*)::int from bookings b
             where b.tenant_id = t.id and b.status <> 'cancelled') as "bookingCount"
      from tenants t
     order by t.created_at desc`);
  if (tenantsQuery.error) {
    return dbFail<TenantListItem[]>(tenantsQuery.error, "Gagal memuat daftar tenant");
  }
  const tenants = [...tenantsQuery.data];

  return ok(tenants);
}

/* ------------------------------------------------------------------ */
/* Slot                                                                */
/* ------------------------------------------------------------------ */

/** Daftar slot + zona untuk /admin/slots. */
export async function listSlots(filter?: SlotFilter): Promise<Result<SlotDetail[]>> {
  if (!isDbConfigured()) return fail<SlotDetail[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await coba(sql`
    ${slotWithZone()}
    where ${filter?.zoneId ? sql`s.zone_id = ${filter.zoneId}` : sql`true`}
      and ${filter?.status ? sql`s.status = ${filter.status}` : sql`true`}`);
  if (error) return dbFail<SlotDetail[]>(error, "Gagal memuat daftar slot");

  const keyword = filter?.q?.trim().toLowerCase() ?? "";
  const rows = data
    .map(normalizeSlotDetail)
    .filter((row): row is SlotDetail => row !== null)
    .filter((row) => {
      if (keyword.length === 0) return true;
      const haystack = [
        row.slot_label ?? "",
        row.svg_element_id ?? "",
        row.slot_number === null ? "" : String(row.slot_number),
        row.zone.name,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    })
    .sort(
      (a, b) => a.zone.display_order - b.zone.display_order || compareSlots(a, b),
    );

  return ok(rows);
}

/**
 * Override manual status slot oleh admin. Model per tanggal: 'available' =
 * normal, selain itu berarti slot DIBLOKIR PANITIA untuk semua tanggal
 * (label UI: "Diblokir") — bukan lagi status booking.
 */
export async function overrideSlotStatus(
  slotId: string,
  status: SlotStatus,
): Promise<Result<SlotRow>> {
  if (!isDbConfigured()) return fail<SlotRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await cobaSatu(sql<SlotRow[]>`
    update slots set status = ${status}, updated_at = now() where id = ${slotId} returning *`);

  if (error) return dbFail<SlotRow>(error, "Gagal mengubah status slot");
  if (!data) return fail<SlotRow>("Slot tidak ditemukan.", "NOT_FOUND");
  return ok(data);
}

/* ------------------------------------------------------------------ */
/* Verifikasi pembayaran biaya admin                                   */
/* ------------------------------------------------------------------ */

type PaymentLite = Pick<AdminFeePaymentRow, "id" | "booking_id" | "status">;

async function ambilPayment(paymentId: string): Promise<Result<PaymentLite>> {
  const { data, error } = await cobaSatu(sql<PaymentLite[]>`
    select id, booking_id, status from admin_fee_payments where id = ${paymentId}`);

  if (error) return dbFail<PaymentLite>(error, "Gagal memuat data pembayaran");
  if (!data) return fail<PaymentLite>("Data pembayaran tidak ditemukan.", "NOT_FOUND");
  return ok(data);
}

/**
 * Verifikasi pembayaran: payment -> verified, booking -> confirmed.
 * slots.status TIDAK disentuh lagi (model per tanggal): trigger
 * sync_booking_dates_active menjaga baris booking_dates tetap aktif, dan
 * peta membaca okupansi dari view slot_date_status.
 * Tanpa transaksi: ada kompensasi manual kalau langkah lanjutan gagal.
 * SARAN PRODUKSI: bungkus dalam satu transaksi (sql.begin) supaya atomik.
 */
export async function verifyPayment(paymentId: string, adminId: string): Promise<Result<null>> {
  if (!isDbConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const paymentResult = await ambilPayment(paymentId);
  if (!paymentResult.ok) return fail<null>(paymentResult.error, paymentResult.code);
  const payment = paymentResult.data;
  if (payment.status === "verified") return ok(null); // idempoten
  if (payment.status === "unpaid") {
    // Belum ada bukti sama sekali — tidak ada yang bisa diperiksa; mencegah
    // salah klik mengonfirmasi booking yang belum membayar (temuan audit).
    return fail<null>(
      "Belum ada bukti pembayaran yang dikirim untuk tagihan ini, jadi belum bisa diverifikasi.",
      "NOT_SUBMITTED",
    );
  }
  if (payment.status === "rejected") {
    // Bukti terakhir sudah DITOLAK; verifikasi hanya boleh atas bukti BARU
    // (status kembali 'submitted' setelah penyewa mengunggah ulang). Tanpa
    // penjaga ini, salah klik bisa mengonfirmasi booking dengan bukti yang
    // tadi dinyatakan tidak sah (temuan audit 2026-09-03).
    return fail<null>(
      "Bukti pembayaran terakhir sudah ditolak. Tunggu penyewa mengunggah bukti baru sebelum diverifikasi.",
      "NOT_SUBMITTED",
    );
  }

  const now = new Date().toISOString();

  const bookingQuery = await cobaSatu(
    sql<{ id: string; booking_code: string; status: BookingStatus }[]>`
      select id, booking_code, status from bookings where id = ${payment.booking_id}`,
  );
  if (bookingQuery.error) {
    return dbFail<null>(bookingQuery.error, "Gagal memuat booking");
  }
  const booking = bookingQuery.data;
  if (!booking) return fail<null>("Booking terkait tidak ditemukan.", "NOT_FOUND");
  if (booking.status === "cancelled") {
    return fail<null>("Booking sudah dibatalkan, pembayaran tidak bisa diverifikasi.", "CANCELLED");
  }

  const paymentUpdate = await coba(sql`
    update admin_fee_payments set ${sql({
      status: "verified",
      verified_by: adminId,
      verified_at: now,
      reject_reason: null,
      updated_at: now,
    })} where id = ${payment.id}`);
  if (paymentUpdate.error) {
    return dbFail<null>(paymentUpdate.error, "Gagal memverifikasi pembayaran");
  }

  const bookingUpdate = await coba(sql`
    update bookings set status = 'confirmed', updated_at = ${now} where id = ${booking.id}`);
  if (bookingUpdate.error) {
    // Kompensasi: kembalikan pembayaran ke status sebelumnya.
    await coba(sql`
      update admin_fee_payments
         set status = ${payment.status}, verified_by = null, verified_at = null
       where id = ${payment.id}`);
    return dbFail<null>(bookingUpdate.error, "Gagal mengonfirmasi booking");
  }

  void syncToSheet("payment", {
    bookingCode: booking.booking_code,
    status: "verified",
    verifiedAt: now,
  });
  void syncToSheet("booking", {
    bookingCode: booking.booking_code,
    status: "confirmed",
  });

  // Booking confirmed = kendaraannya (bila ada) mulai tampil di /katalog.
  const listing = await cobaSatu(sql<{ is_visible: boolean }[]>`
    select is_visible from vehicle_listings where booking_id = ${booking.id}`);
  if (listing.data) {
    void syncToSheet("vehicle", {
      bookingCode: booking.booking_code,
      tampil: listing.data.is_visible ? "ya" : "disembunyikan-admin",
    });
  }

  void kirimNotifikasiBooking("verified", booking.id);

  return ok(null);
}

/**
 * Tolak pembayaran: hanya status pembayaran + alasan yang berubah.
 * Booking tetap pending_payment (tanggal-tanggal sewanya tetap terkunci)
 * supaya tenant bisa mengunggah bukti baru. slots.status tidak disentuh.
 */
export async function rejectPayment(
  paymentId: string,
  adminId: string,
  reason: string,
): Promise<Result<null>> {
  if (!isDbConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const alasan = reason.trim();
  if (alasan.length < 3) {
    return fail<null>("Alasan penolakan minimal 3 karakter.", "VALIDATION");
  }

  const paymentResult = await ambilPayment(paymentId);
  if (!paymentResult.ok) return fail<null>(paymentResult.error, paymentResult.code);

  const { error } = await coba(sql`
    update admin_fee_payments set ${sql({
      status: "rejected",
      reject_reason: alasan,
      verified_by: adminId,
      verified_at: null,
      updated_at: new Date().toISOString(),
    })} where id = ${paymentResult.data.id}`);

  if (error) return dbFail<null>(error, "Gagal menolak pembayaran");

  // Kode booking hanya untuk sinkron sheet — kegagalan query tidak menggagalkan operasi.
  const bookingQuery = await cobaSatu(sql<{ booking_code: string }[]>`
    select booking_code from bookings where id = ${paymentResult.data.booking_id}`);
  const bookingCode = bookingQuery.data?.booking_code ?? null;
  if (bookingCode) {
    void syncToSheet("payment", {
      bookingCode,
      status: "rejected",
      rejectReason: alasan,
    });
  }

  void kirimNotifikasiBooking("rejected", paymentResult.data.booking_id, { reason: alasan });

  return ok(null);
}

/**
 * Booking MANUAL oleh admin (mis. tenant mendaftar offline / lewat telepon).
 * Memakai createBooking (validasi slot/tanggal sama) tapi melewati batas booking
 * pending per telepon. Zona kendaraan ditolak: butuh foto unit untuk katalog,
 * jadi harus lewat form publik. Bila `autoConfirm`, booking langsung dikonfirmasi
 * (pembayaran dianggap sudah diterima panitia di luar sistem).
 */
export async function adminCreateBooking(
  input: CreateBookingInput,
  opts: { autoConfirm: boolean; adminId: string },
): Promise<Result<{ bookingId: string; bookingCode: string }>> {
  type Out = { bookingId: string; bookingCode: string };
  if (!isDbConfigured()) return fail<Out>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const slotResult = await getSlotDetail(input.slotId);
  if (!slotResult.ok) return fail<Out>(slotResult.error, slotResult.code);
  if (isVehicleZoneType(slotResult.data.zone.zone_type)) {
    return fail<Out>(
      "Slot zona kendaraan harus didaftarkan lewat form publik karena wajib foto unit untuk katalog.",
      "VEHICLE_ZONE_MANUAL",
    );
  }

  // Admin tepercaya: lewati batas pending per telepon dan verifikasi kode email
  // (penyewa mendaftar langsung ke panitia, email boleh kosong).
  const created = await createBooking(input, { skipPendingLimit: true, skipEmailOtp: true });
  if (!created.ok) return created;

  if (opts.autoConfirm) {
    const now = new Date().toISOString();
    // Tandai lunas: pembayaran dikumpulkan panitia di luar sistem (tanpa bukti),
    // jadi dicatat sebagai 'cash' — bukan 'qris' yang khusus alur publik.
    await coba(sql`
      update admin_fee_payments set ${sql({
        status: "verified",
        method: "cash",
        verified_by: opts.adminId,
        verified_at: now,
        reject_reason: null,
        updated_at: now,
      })} where booking_id = ${created.data.bookingId}`);
    await coba(sql`
      update bookings set status = 'confirmed', updated_at = ${now}
       where id = ${created.data.bookingId}`);

    void syncToSheet("booking", {
      bookingCode: created.data.bookingCode,
      status: "confirmed",
    });
    void kirimNotifikasiBooking("verified", created.data.bookingId);
  }

  return created;
}

/**
 * Pindahkan booking ke slot lain (aksi admin). Slot tujuan wajib: bisa dipesan,
 * tidak diblokir, TIPE ZONA SAMA (agar jenis tenant & data kendaraan tetap
 * valid), dan BEBAS pada semua tanggal aktif booking. Memindah booking.slot_id +
 * baris booking_dates aktif + listing kendaraan (bila ada), lalu sinkron Sheet.
 */
export async function adminMoveBookingSlot(
  bookingId: string,
  targetSlotId: string,
): Promise<Result<null>> {
  if (!isDbConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const bookingResult = await getBookingDetail(bookingId);
  if (!bookingResult.ok) return fail<null>(bookingResult.error, bookingResult.code);
  const booking = bookingResult.data;
  if (booking.status === "cancelled") {
    return fail<null>("Booking sudah dibatalkan, tidak bisa dipindah.", "CANCELLED");
  }
  if (booking.slot_id === targetSlotId) {
    return fail<null>("Booking sudah berada di slot tersebut.", "VALIDATION");
  }
  if (booking.dates.length === 0) {
    return fail<null>("Booking tidak punya tanggal aktif untuk dipindah.", "VALIDATION");
  }

  const targetResult = await getSlotDetail(targetSlotId);
  if (!targetResult.ok) return fail<null>(targetResult.error, targetResult.code);
  const target = targetResult.data;
  if (!isBookableZoneType(target.zone.zone_type)) {
    return fail<null>("Slot tujuan bukan slot yang bisa dipesan.", "NOT_BOOKABLE");
  }
  if (target.status !== "available") {
    return fail<null>("Slot tujuan sedang diblokir panitia.", "SLOT_TAKEN");
  }
  if (target.zone.zone_type !== booking.slot.zone.zone_type) {
    return fail<null>("Slot tujuan harus di zona dengan tipe yang sama.", "ZONE_MISMATCH");
  }

  // Slot tujuan harus bebas pada SEMUA tanggal aktif booking ini.
  const bentrok = await coba(sql`
    select event_date from booking_dates
     where slot_id = ${targetSlotId} and is_active and event_date in ${sql(booking.dates)}`);
  if (bentrok.error) {
    return dbFail<null>(bentrok.error, "Gagal memeriksa ketersediaan slot tujuan");
  }
  if (bentrok.data.length > 0) {
    return fail<null>(
      "Slot tujuan sudah terisi pada sebagian tanggal booking ini.",
      "DATE_TAKEN",
    );
  }

  const updBooking = await coba(sql`
    update bookings set slot_id = ${targetSlotId}, updated_at = now() where id = ${booking.id}`);
  if (updBooking.error) {
    return dbFail<null>(updBooking.error, "Gagal memindahkan booking");
  }

  const updDates = await coba(sql`
    update booking_dates set slot_id = ${targetSlotId}
     where booking_id = ${booking.id} and is_active`);
  if (updDates.error) {
    // Kompensasi: kembalikan slot_id booking ke asal.
    await coba(sql`update bookings set slot_id = ${booking.slot_id} where id = ${booking.id}`);
    return dbFail<null>(updDates.error, "Gagal memindahkan tanggal booking");
  }

  if (booking.listing) {
    // Listing katalog ikut pindah slot; kegagalan di sini tidak fatal.
    await coba(sql`
      update vehicle_listings set slot_id = ${targetSlotId} where booking_id = ${booking.id}`);
  }

  void syncToSheet("booking", {
    bookingCode: booking.booking_code,
    slot: target.svg_element_id ?? target.slot_label ?? target.id,
    zona: target.zone.name,
  });

  return ok(null);
}

/**
 * Pembatalan booking OLEH ADMIN (butuh alasan) — berbeda dari cancelBooking
 * mandiri tenant yang menolak status confirmed. Admin berwenang membatalkan
 * booking apa pun, termasuk yang sudah confirmed (mis. refund disepakati di
 * luar sistem). Trigger sync_booking_dates_active melepas tanggalnya; kalau ada
 * pembayaran verified, statusnya tidak diubah (jejak audit) — refund di luar app.
 */
export async function adminCancelBooking(
  bookingId: string,
  reason: string,
): Promise<Result<null>> {
  if (!isDbConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const alasan = reason.trim();
  if (alasan.length < 3) return fail<null>("Alasan pembatalan minimal 3 karakter.", "VALIDATION");

  const current = await cobaSatu(
    sql<{ id: string; booking_code: string; status: BookingStatus }[]>`
      select id, booking_code, status from bookings where id = ${bookingId}`,
  );
  if (current.error) return dbFail<null>(current.error, "Gagal memuat data booking");

  const booking = current.data;
  if (!booking) return fail<null>("Booking tidak ditemukan.", "NOT_FOUND");
  if (booking.status === "cancelled") return ok(null); // idempoten

  const updated = await cobaSatu(sql<{ id: string }[]>`
    update bookings set status = 'cancelled', updated_at = now()
     where id = ${booking.id} and status <> 'cancelled'
    returning id`);

  if (updated.error) return dbFail<null>(updated.error, "Gagal membatalkan booking");
  if (!updated.data) return ok(null); // sudah dibatalkan proses lain — idempoten

  void syncToSheet("booking", {
    bookingCode: booking.booking_code,
    status: "cancelled",
    catatan: `dibatalkan panitia: ${alasan}`,
  });
  void kirimNotifikasiBooking("cancelled", booking.id, { reason: alasan });

  return ok(null);
}

/* ------------------------------------------------------------------ */
/* Pembelian unit & leasing                                            */
/* ------------------------------------------------------------------ */

/** Semua transaksi pembelian unit (terbaru dulu). */
export async function listPurchases(): Promise<Result<PurchaseDetail[]>> {
  if (!isDbConfigured()) return fail<PurchaseDetail[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await coba(sql`${purchaseSelect()} order by p.created_at desc`);

  if (error) return dbFail<PurchaseDetail[]>(error, "Gagal memuat transaksi pembelian");

  const rows = data
    .map(normalizePurchaseRow)
    .filter((row): row is PurchaseDetail => row !== null);
  return ok(rows);
}

/** Semua pengajuan leasing + partner + transaksi pembelian (terbaru dulu). */
export async function listLeasingApplications(): Promise<Result<AdminLeasingItem[]>> {
  if (!isDbConfigured()) return fail<AdminLeasingItem[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  type Baris = LeasingApplicationRow & {
    partner: LeasingPartnerRow | null;
    purchase: (PurchaseTransactionRow & { slot: unknown }) | null;
  };
  const { data, error } = await coba(sql<Baris[]>`
    select la.*,
           (select to_jsonb(lp) from leasing_partners lp where lp.id = la.leasing_partner_id) as partner,
           (select to_jsonb(p) || jsonb_build_object('slot', ${slotJson(sql`p.slot_id`)})
              from purchase_transactions p where p.id = la.purchase_transaction_id) as purchase
      from leasing_applications la
     order by la.created_at desc`);

  if (error) {
    return dbFail<AdminLeasingItem[]>(error, "Gagal memuat pengajuan leasing");
  }

  const rows = data.map((row): AdminLeasingItem => ({
    ...row,
    purchase: row.purchase && { ...row.purchase, slot: normalizeSlotDetail(row.purchase.slot) },
  }));

  return ok(rows);
}

/** Update sebagian kolom pengajuan leasing (status, DP, tenor, komisi, catatan). */
export async function updateLeasingApplication(
  id: string,
  patch: LeasingApplicationPatch,
): Promise<Result<LeasingApplicationRow>> {
  if (!isDbConfigured()) {
    return fail<LeasingApplicationRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  }

  const bersih: TablesUpdate<"leasing_applications"> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (bersih as Record<string, unknown>)[key] = value;
    }
  }
  bersih.updated_at = new Date().toISOString();

  const { data, error } = await cobaSatu(sql<LeasingApplicationRow[]>`
    update leasing_applications set ${sql(bersih)} where id = ${id} returning *`);

  if (error) {
    return dbFail<LeasingApplicationRow>(error, "Gagal memperbarui pengajuan leasing");
  }
  if (!data) return fail<LeasingApplicationRow>("Pengajuan leasing tidak ditemukan.", "NOT_FOUND");

  const row = data;
  void syncToSheet("leasing", {
    leasingId: row.id,
    purchaseTransactionId: row.purchase_transaction_id,
    status: row.status,
    dpAmount: row.dp_amount ?? "",
    tenorBulan: row.tenor_bulan ?? "",
    commissionAmount: row.commission_amount ?? "",
    commissionPaid: row.commission_paid === true,
    notes: row.notes ?? "",
  });

  return ok(row);
}

/** Semua partner leasing (aktif maupun tidak) untuk pengelolaan admin. */
export async function listPartners(): Promise<Result<LeasingPartnerRow[]>> {
  if (!isDbConfigured()) return fail<LeasingPartnerRow[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await coba(
    sql<LeasingPartnerRow[]>`select * from leasing_partners order by name`,
  );

  if (error) return dbFail<LeasingPartnerRow[]>(error, "Gagal memuat partner leasing");
  return ok([...data]);
}

/** Tambah partner baru atau perbarui yang sudah ada (kalau input.id diisi). */
export async function upsertPartner(
  input: UpsertPartnerInput,
): Promise<Result<LeasingPartnerRow>> {
  if (!isDbConfigured()) return fail<LeasingPartnerRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const parsed = upsertPartnerSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Data partner tidak valid.";
    return fail<LeasingPartnerRow>(first, "VALIDATION");
  }
  const data = parsed.data;

  // Checkbox HTML tidak terkirim saat tidak dicentang, jadi form SELALU mengirim
  // key isActive (nilainya null kalau tidak dicentang). Nilai bawaan `true` hanya
  // dipakai pemanggil programatik yang memang tidak menyertakan field ini sama sekali.
  const isActiveDikirim =
    Object.prototype.hasOwnProperty.call(input, "isActive") &&
    (input as { isActive?: unknown }).isActive !== undefined;

  const payload = {
    name: data.name,
    contact: data.contact ?? null,
    commission_rate: data.commissionRate ?? null,
    is_active: isActiveDikirim ? (data.isActive ?? false) : true,
  };

  if (data.id) {
    const diperbarui = await cobaSatu(sql<LeasingPartnerRow[]>`
      update leasing_partners set ${sql(payload)} where id = ${data.id} returning *`);

    if (diperbarui.error) {
      return dbFail<LeasingPartnerRow>(diperbarui.error, "Gagal menyimpan partner leasing");
    }
    if (!diperbarui.data) {
      return fail<LeasingPartnerRow>("Partner leasing tidak ditemukan.", "NOT_FOUND");
    }
    return ok(diperbarui.data);
  }

  const dibuat = await cobaSatu(
    sql<LeasingPartnerRow[]>`insert into leasing_partners ${sql(payload)} returning *`,
  );
  if (dibuat.error || !dibuat.data) {
    return dbFail<LeasingPartnerRow>(dibuat.error, "Gagal menyimpan partner leasing");
  }
  return ok(dibuat.data);
}

/** Tandai komisi platform sudah / belum dibayarkan partner. */
export async function setCommissionPaid(id: string, paid: boolean): Promise<Result<null>> {
  if (!isDbConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { error } = await coba(sql`
    update leasing_applications set commission_paid = ${paid}, updated_at = now() where id = ${id}`);

  if (error) return dbFail<null>(error, "Gagal memperbarui status komisi");
  return ok(null);
}

/* ------------------------------------------------------------------ */
/* Pengaturan zona (biaya admin)                                       */
/* ------------------------------------------------------------------ */

/** Semua zona (urut display_order) untuk halaman pengaturan admin. */
export async function listZonesAdmin(): Promise<Result<ZoneRow[]>> {
  if (!isDbConfigured()) return fail<ZoneRow[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await coba(sql<ZoneRow[]>`select * from zones order by display_order`);

  if (error) return dbFail<ZoneRow[]>(error, "Gagal memuat daftar zona");
  return ok([...data]);
}

/** Ubah biaya admin satu zona (dipakai /admin/pengaturan). */
export async function updateZoneFee(zoneId: string, adminFee: number): Promise<Result<ZoneRow>> {
  if (!isDbConfigured()) return fail<ZoneRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  if (!Number.isFinite(adminFee) || adminFee < 0) {
    return fail<ZoneRow>("Biaya admin tidak boleh negatif.", "VALIDATION");
  }

  const { data, error } = await cobaSatu(sql<ZoneRow[]>`
    update zones set admin_fee = ${adminFee} where id = ${zoneId} returning *`);

  if (error) return dbFail<ZoneRow>(error, "Gagal menyimpan biaya admin zona");
  if (!data) return fail<ZoneRow>("Zona tidak ditemukan.", "NOT_FOUND");
  return ok(data);
}

/* ------------------------------------------------------------------ */
/* Tanggal gelaran (event_dates)                                       */
/* ------------------------------------------------------------------ */

/** Semua tanggal gelaran (aktif maupun tidak), urut naik. */
export async function listEventDates(): Promise<Result<EventDateRow[]>> {
  if (!isDbConfigured()) return fail<EventDateRow[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await coba(
    sql<EventDateRow[]>`select * from event_dates order by event_date`,
  );

  if (error) return dbFail<EventDateRow[]>(error, "Gagal memuat tanggal gelaran");
  return ok([...data]);
}

/** Tambah satu tanggal gelaran baru (YYYY-MM-DD). */
export async function addEventDate(date: string): Promise<Result<EventDateRow>> {
  if (!isDbConfigured()) return fail<EventDateRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const parsed = addEventDateSchema.safeParse({ date });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Tanggal tidak valid.";
    return fail<EventDateRow>(first, "VALIDATION");
  }

  // Tanggal ditautkan ke event aktif (satu event saja di sistem ini).
  const inserted = await cobaSatu(sql<EventDateRow[]>`
    insert into event_dates (event_id, event_date, is_active)
    values ((select id from events where is_active order by created_at limit 1), ${parsed.data.date}, true)
    returning *`);

  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === "23505") {
      return fail<EventDateRow>("Tanggal tersebut sudah terdaftar.", "ALREADY_EXISTS");
    }
    return dbFail<EventDateRow>(inserted.error, "Gagal menambah tanggal gelaran");
  }
  return ok(inserted.data);
}

/** Aktifkan / nonaktifkan satu tanggal gelaran. */
export async function setEventDateActive(
  id: string,
  active: boolean,
): Promise<Result<EventDateRow>> {
  if (!isDbConfigured()) return fail<EventDateRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await cobaSatu(sql<EventDateRow[]>`
    update event_dates set is_active = ${active} where id = ${id} returning *`);

  if (error) return dbFail<EventDateRow>(error, "Gagal memperbarui tanggal gelaran");
  if (!data) return fail<EventDateRow>("Tanggal gelaran tidak ditemukan.", "NOT_FOUND");
  return ok(data);
}

/* ------------------------------------------------------------------ */
/* Analitik                                                            */
/* ------------------------------------------------------------------ */

/**
 * Okupansi satu zona pada SATU tanggal (tanggal aktif terdekat) — model per
 * tanggal. `diblokir` = slot yang ditutup panitia (slots.status != 'available').
 */
export type ZoneOccupancyPoint = {
  zona: string;
  terisi: number;
  menunggu: number;
  tersedia: number;
  diblokir: number;
};

export type DailyBookingPoint = {
  /** Kunci tanggal "YYYY-MM-DD" (zona waktu Asia/Jakarta). */
  tanggal: string;
  jumlah: number;
};

export type LeasingStatusPoint = { status: LeasingStatus; jumlah: number };
export type PaymentMethodPoint = { metode: PaymentMethod; jumlah: number };

export type AnalyticsData = {
  /**
   * Tanggal (YYYY-MM-DD) yang dipakai menghitung okupansiPerZona — tanggal
   * gelaran aktif terdekat >= hari ini; null kalau tidak ada tanggal mendatang.
   * UI menampilkan "per <tanggal>" dari nilai ini.
   */
  tanggalOkupansi: string | null;
  okupansiPerZona: ZoneOccupancyPoint[];
  bookingPerHari: DailyBookingPoint[];
  leasingPerStatus: LeasingStatusPoint[];
  metodePembayaran: PaymentMethodPoint[];
};

/** "2026-08-27" untuk sebuah timestamp, dihitung pada zona waktu Indonesia bagian barat. */
const tanggalJakarta = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function kunciTanggal(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return tanggalJakarta.format(date);
}

const LEASING_STATUS_URUT: readonly LeasingStatus[] = [
  "submitted",
  "verifying",
  "approved",
  "rejected",
  "completed",
];

/**
 * Semua seri untuk /admin/analitik dalam satu panggilan.
 * Data sedikit itu wajar (event baru): seri kosong dikembalikan sebagai array
 * kosong supaya halaman bisa menampilkan EmptyState per kartu.
 */
export async function getAnalyticsData(): Promise<Result<AnalyticsData>> {
  if (!isDbConfigured()) return fail<AnalyticsData>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  type ZonaRingkas = { id: string; name: string; zone_type: ZoneType; display_order: number };
  const zonesQuery = await coba(sql<ZonaRingkas[]>`
    select id, name, zone_type, display_order from zones order by display_order`);
  if (zonesQuery.error) {
    return dbFail<AnalyticsData>(zonesQuery.error, "Gagal memuat zona");
  }
  const zones = zonesQuery.data;

  const slotsQuery = await coba(
    sql<{ id: string; zone_id: string; status: SlotStatus }[]>`select id, zone_id, status from slots`,
  );
  if (slotsQuery.error) {
    return dbFail<AnalyticsData>(slotsQuery.error, "Gagal memuat slot");
  }
  const slots = slotsQuery.data;

  // (a) Okupansi per zona bookable pada tanggal aktif terdekat (model per tanggal).
  const okupansiResult = await ambilOkupansiTanggalTerdekat();
  if (!okupansiResult.ok) {
    return fail<AnalyticsData>(okupansiResult.error, okupansiResult.code);
  }
  const { tanggal: tanggalOkupansi, occupancy } = okupansiResult.data;
  const statusPerSlot = new Map<string, BookingStatus>();
  for (const row of occupancy) {
    if (statusPerSlot.get(row.slot_id) !== "confirmed") {
      statusPerSlot.set(row.slot_id, row.status);
    }
  }

  const okupansiPerZona: ZoneOccupancyPoint[] = zones
    .filter((zone) => isBookableZoneType(zone.zone_type))
    .map((zone) => {
      const milik = slots.filter((slot) => slot.zone_id === zone.id);
      const diblokir = milik.filter((slot) => slot.status !== "available").length;
      const bebas = milik.filter((slot) => slot.status === "available");
      const terisi = bebas.filter((slot) => statusPerSlot.get(slot.id) === "confirmed").length;
      const menunggu = bebas.filter(
        (slot) => statusPerSlot.get(slot.id) === "pending_payment",
      ).length;
      return {
        zona: zone.name,
        terisi,
        menunggu,
        tersedia: bebas.length - terisi - menunggu,
        diblokir,
      };
    })
    .filter((zone) => zone.terisi + zone.menunggu + zone.tersedia + zone.diblokir > 0);

  // (b) Booking per hari dari created_at (dikelompokkan di server, hari kosong diisi 0).
  const bookingsQuery = await coba(sql<{ created_at: string }[]>`select created_at from bookings`);
  if (bookingsQuery.error) {
    return dbFail<AnalyticsData>(bookingsQuery.error, "Gagal memuat booking");
  }
  const perTanggal = new Map<string, number>();
  for (const row of bookingsQuery.data) {
    const kunci = kunciTanggal(row.created_at);
    if (!kunci) continue;
    perTanggal.set(kunci, (perTanggal.get(kunci) ?? 0) + 1);
  }
  const kunciUrut = Array.from(perTanggal.keys()).sort();
  const bookingPerHari: DailyBookingPoint[] = [];
  if (kunciUrut.length > 0) {
    // Isi hari tanpa booking dengan 0 supaya garis tren tidak melompat.
    const mulai = new Date(`${kunciUrut[0]}T00:00:00Z`);
    const selesai = new Date(`${kunciUrut[kunciUrut.length - 1]}T00:00:00Z`);
    const MS_SEHARI = 24 * 60 * 60 * 1000;
    const MAKS_HARI = 90; // pengaman: event tunggal, rentang wajar
    for (
      let t = mulai.getTime(), n = 0;
      t <= selesai.getTime() && n < MAKS_HARI;
      t += MS_SEHARI, n += 1
    ) {
      const kunci = new Date(t).toISOString().slice(0, 10);
      bookingPerHari.push({ tanggal: kunci, jumlah: perTanggal.get(kunci) ?? 0 });
    }
  }

  // (c) Leasing per status.
  const leasingQuery = await coba(
    sql<{ status: LeasingStatus }[]>`select status from leasing_applications`,
  );
  if (leasingQuery.error) {
    return dbFail<AnalyticsData>(leasingQuery.error, "Gagal memuat pengajuan leasing");
  }
  const leasingRows = leasingQuery.data;
  const leasingPerStatus: LeasingStatusPoint[] =
    leasingRows.length === 0
      ? []
      : LEASING_STATUS_URUT.map((status) => ({
          status,
          jumlah: leasingRows.filter((row) => row.status === status).length,
        }));

  // (d) Metode pembayaran biaya admin: qris (alur publik sejak 2026-09-02),
  //     plus data lama transfer/cash.
  const paymentsQuery = await coba(
    sql<{ method: PaymentMethod }[]>`select method from admin_fee_payments`,
  );
  if (paymentsQuery.error) {
    return dbFail<AnalyticsData>(paymentsQuery.error, "Gagal memuat pembayaran");
  }
  const paymentRows = paymentsQuery.data;
  const metodePembayaran: PaymentMethodPoint[] = (["qris", "transfer", "cash"] as const)
    .map((metode) => ({
      metode,
      jumlah: paymentRows.filter((row) => row.method === metode).length,
    }))
    .filter((titik) => titik.jumlah > 0);

  return ok<AnalyticsData>({
    tanggalOkupansi,
    okupansiPerZona,
    bookingPerHari,
    leasingPerStatus,
    metodePembayaran,
  });
}
