import { fail, ok, type Result } from "@/lib/result";
import { syncToSheet } from "@/lib/sheets";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { isBookableZoneType } from "@/lib/domain/constants";
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
import { BOOKING_SELECT, normalizeBookingRow } from "./booking";
import { normalizePurchaseRow, PURCHASE_SELECT } from "./purchase";
import {
  compareSlots,
  dbFail,
  NO_CONFIG_MESSAGE,
  normalizeSlotDetail,
  pickOne,
  SLOT_WITH_ZONE_SELECT,
  tanggalHariIniJakarta,
  type PgError,
} from "./slots";

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
async function ambilOkupansiTanggalTerdekat(
  supabase: ReturnType<typeof createAdminSupabase>,
): Promise<Result<{ tanggal: string | null; occupancy: SlotDateStatusRow[] }>> {
  type Out = { tanggal: string | null; occupancy: SlotDateStatusRow[] };

  const today = tanggalHariIniJakarta();
  const dateQuery = await supabase
    .from("event_dates")
    .select("event_date")
    .eq("is_active", true)
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (dateQuery.error) {
    return dbFail<Out>(dateQuery.error as PgError, "Gagal memuat tanggal gelaran");
  }

  const tanggal = ((dateQuery.data ?? null) as { event_date: string } | null)?.event_date ?? null;
  if (!tanggal) return ok<Out>({ tanggal: null, occupancy: [] });

  const occQuery = await supabase
    .from("slot_date_status")
    .select("slot_id, event_date, status")
    .eq("event_date", tanggal);
  if (occQuery.error) {
    return dbFail<Out>(occQuery.error as PgError, "Gagal memuat okupansi slot");
  }

  return ok<Out>({ tanggal, occupancy: (occQuery.data ?? []) as SlotDateStatusRow[] });
}

/** Ringkasan angka untuk /admin. */
export async function getDashboardStats(): Promise<Result<DashboardStats>> {
  if (!isServiceRoleConfigured()) return fail<DashboardStats>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();

  const zonesQuery = await supabase
    .from("zones")
    .select("id, name, zone_type, display_order")
    .order("display_order", { ascending: true });
  if (zonesQuery.error) {
    return dbFail<DashboardStats>(zonesQuery.error as PgError, "Gagal memuat zona");
  }
  const zones = (zonesQuery.data ?? []) as Array<{
    id: string;
    name: string;
    zone_type: ZoneType;
    display_order: number;
  }>;

  const slotsQuery = await supabase.from("slots").select("id, zone_id, status");
  if (slotsQuery.error) {
    return dbFail<DashboardStats>(slotsQuery.error as PgError, "Gagal memuat slot");
  }
  const slots = (slotsQuery.data ?? []) as Array<{
    id: string;
    zone_id: string;
    status: SlotStatus;
  }>;

  // Okupansi dihitung untuk tanggal gelaran aktif terdekat (model per tanggal).
  const okupansiResult = await ambilOkupansiTanggalTerdekat(supabase);
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

  const paymentsQuery = await supabase.from("admin_fee_payments").select("amount, status");
  const paymentRows = paymentsQuery.error
    ? []
    : ((paymentsQuery.data ?? []) as Array<{ amount: number; status: PaymentStatus }>);

  const bookingsQuery = await supabase
    .from("bookings")
    .select("id, status")
    .in("status", BOOKING_AKTIF);
  const bookingAktif = bookingsQuery.error
    ? 0
    : ((bookingsQuery.data ?? []) as unknown[]).length;

  const leasingQuery = await supabase
    .from("leasing_applications")
    .select("id, status, commission_amount, commission_paid");
  const leasingRows = leasingQuery.error
    ? []
    : ((leasingQuery.data ?? []) as Array<{
        id: string;
        status: string;
        commission_amount: number | null;
        commission_paid: boolean | null;
      }>);

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
  if (!isServiceRoleConfigured()) return fail<BookingDetail[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  let query = supabase.from("bookings").select(BOOKING_SELECT);
  if (filter?.status) query = query.eq("status", filter.status);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return dbFail<BookingDetail[]>(error as PgError, "Gagal memuat daftar booking");

  const keyword = filter?.q?.trim().toLowerCase() ?? "";
  const rows = ((data ?? []) as unknown[])
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
  if (!isServiceRoleConfigured()) return fail<TenantListItem[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const tenantsQuery = await supabase
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: false });
  if (tenantsQuery.error) {
    return dbFail<TenantListItem[]>(tenantsQuery.error as PgError, "Gagal memuat daftar tenant");
  }

  const bookingsQuery = await supabase.from("bookings").select("tenant_id, status");
  const bookings = bookingsQuery.error
    ? []
    : ((bookingsQuery.data ?? []) as Array<{ tenant_id: string; status: BookingStatus }>);

  const hitung = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.status === "cancelled") continue;
    hitung.set(booking.tenant_id, (hitung.get(booking.tenant_id) ?? 0) + 1);
  }

  const tenants = ((tenantsQuery.data ?? []) as TenantRow[]).map((tenant) => ({
    ...tenant,
    bookingCount: hitung.get(tenant.id) ?? 0,
  }));

  return ok(tenants);
}

/* ------------------------------------------------------------------ */
/* Slot                                                                */
/* ------------------------------------------------------------------ */

/** Daftar slot + zona untuk /admin/slots. */
export async function listSlots(filter?: SlotFilter): Promise<Result<SlotDetail[]>> {
  if (!isServiceRoleConfigured()) return fail<SlotDetail[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  let query = supabase.from("slots").select(SLOT_WITH_ZONE_SELECT);
  if (filter?.zoneId) query = query.eq("zone_id", filter.zoneId);
  if (filter?.status) query = query.eq("status", filter.status);

  const { data, error } = await query;
  if (error) return dbFail<SlotDetail[]>(error as PgError, "Gagal memuat daftar slot");

  const keyword = filter?.q?.trim().toLowerCase() ?? "";
  const rows = ((data ?? []) as unknown[])
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
  if (!isServiceRoleConfigured()) return fail<SlotRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("slots")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", slotId)
    .select("*")
    .maybeSingle();

  if (error) return dbFail<SlotRow>(error as PgError, "Gagal mengubah status slot");
  if (!data) return fail<SlotRow>("Slot tidak ditemukan.", "NOT_FOUND");
  return ok(data as SlotRow);
}

/* ------------------------------------------------------------------ */
/* Verifikasi pembayaran biaya admin                                   */
/* ------------------------------------------------------------------ */

type PaymentLite = Pick<AdminFeePaymentRow, "id" | "booking_id" | "status">;

async function ambilPayment(paymentId: string): Promise<Result<PaymentLite>> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("admin_fee_payments")
    .select("id, booking_id, status")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) return dbFail<PaymentLite>(error as PgError, "Gagal memuat data pembayaran");
  if (!data) return fail<PaymentLite>("Data pembayaran tidak ditemukan.", "NOT_FOUND");
  return ok(data as PaymentLite);
}

/**
 * Verifikasi pembayaran: payment -> verified, booking -> confirmed.
 * slots.status TIDAK disentuh lagi (model per tanggal): trigger
 * sync_booking_dates_active menjaga baris booking_dates tetap aktif, dan
 * peta membaca okupansi dari view slot_date_status.
 * Tanpa transaksi: ada kompensasi manual kalau langkah lanjutan gagal.
 * SARAN PRODUKSI: jadikan satu Postgres function (rpc) supaya atomik.
 */
export async function verifyPayment(paymentId: string, adminId: string): Promise<Result<null>> {
  if (!isServiceRoleConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

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

  const supabase = createAdminSupabase();
  const now = new Date().toISOString();

  const bookingQuery = await supabase
    .from("bookings")
    .select("id, booking_code, status")
    .eq("id", payment.booking_id)
    .maybeSingle();
  if (bookingQuery.error) {
    return dbFail<null>(bookingQuery.error as PgError, "Gagal memuat booking");
  }
  const booking = (bookingQuery.data ?? null) as
    | { id: string; booking_code: string; status: BookingStatus }
    | null;
  if (!booking) return fail<null>("Booking terkait tidak ditemukan.", "NOT_FOUND");
  if (booking.status === "cancelled") {
    return fail<null>("Booking sudah dibatalkan, pembayaran tidak bisa diverifikasi.", "CANCELLED");
  }

  const paymentUpdate = await supabase
    .from("admin_fee_payments")
    .update({
      status: "verified",
      verified_by: adminId,
      verified_at: now,
      reject_reason: null,
      updated_at: now,
    })
    .eq("id", payment.id);
  if (paymentUpdate.error) {
    return dbFail<null>(paymentUpdate.error as PgError, "Gagal memverifikasi pembayaran");
  }

  const bookingUpdate = await supabase
    .from("bookings")
    .update({ status: "confirmed", updated_at: now })
    .eq("id", booking.id);
  if (bookingUpdate.error) {
    // Kompensasi: kembalikan pembayaran ke status sebelumnya.
    await supabase
      .from("admin_fee_payments")
      .update({ status: payment.status, verified_by: null, verified_at: null })
      .eq("id", payment.id);
    return dbFail<null>(bookingUpdate.error as PgError, "Gagal mengonfirmasi booking");
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
  const listing = await supabase
    .from("vehicle_listings")
    .select("id, is_visible")
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (!listing.error && listing.data) {
    void syncToSheet("vehicle", {
      bookingCode: booking.booking_code,
      tampil: (listing.data as { is_visible: boolean }).is_visible ? "ya" : "disembunyikan-admin",
    });
  }

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
  if (!isServiceRoleConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const alasan = reason.trim();
  if (alasan.length < 3) {
    return fail<null>("Alasan penolakan minimal 3 karakter.", "VALIDATION");
  }

  const paymentResult = await ambilPayment(paymentId);
  if (!paymentResult.ok) return fail<null>(paymentResult.error, paymentResult.code);

  const supabase = createAdminSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("admin_fee_payments")
    .update({
      status: "rejected",
      reject_reason: alasan,
      verified_by: adminId,
      verified_at: null,
      updated_at: now,
    })
    .eq("id", paymentResult.data.id);

  if (error) return dbFail<null>(error as PgError, "Gagal menolak pembayaran");

  // Kode booking hanya untuk sinkron sheet — kegagalan query tidak menggagalkan operasi.
  const bookingQuery = await supabase
    .from("bookings")
    .select("booking_code")
    .eq("id", paymentResult.data.booking_id)
    .maybeSingle();
  const bookingCode =
    ((bookingQuery.data ?? null) as { booking_code: string } | null)?.booking_code ?? null;
  if (bookingCode) {
    void syncToSheet("payment", {
      bookingCode,
      status: "rejected",
      rejectReason: alasan,
    });
  }

  return ok(null);
}

/* ------------------------------------------------------------------ */
/* Pembelian unit & leasing                                            */
/* ------------------------------------------------------------------ */

/** Semua transaksi pembelian unit (terbaru dulu). */
export async function listPurchases(): Promise<Result<PurchaseDetail[]>> {
  if (!isServiceRoleConfigured()) return fail<PurchaseDetail[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("purchase_transactions")
    .select(PURCHASE_SELECT)
    .order("created_at", { ascending: false });

  if (error) return dbFail<PurchaseDetail[]>(error as PgError, "Gagal memuat transaksi pembelian");

  const rows = ((data ?? []) as unknown[])
    .map(normalizePurchaseRow)
    .filter((row): row is PurchaseDetail => row !== null);
  return ok(rows);
}

type RawAdminLeasing = LeasingApplicationRow & {
  partner: LeasingPartnerRow | LeasingPartnerRow[] | null;
  purchase:
    | (PurchaseTransactionRow & { slot: unknown })
    | Array<PurchaseTransactionRow & { slot: unknown }>
    | null;
};

/** Semua pengajuan leasing + partner + transaksi pembelian (terbaru dulu). */
export async function listLeasingApplications(): Promise<Result<AdminLeasingItem[]>> {
  if (!isServiceRoleConfigured()) return fail<AdminLeasingItem[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("leasing_applications")
    .select(
      "*, partner:leasing_partners(*), purchase:purchase_transactions(*, slot:slots(*, zone:zones(*)))",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return dbFail<AdminLeasingItem[]>(error as PgError, "Gagal memuat pengajuan leasing");
  }

  const rows = ((data ?? []) as unknown[]).map((raw): AdminLeasingItem => {
    const row = raw as RawAdminLeasing;
    const { partner: _partner, purchase: _purchase, ...applicationOnly } = row;
    void _partner;
    void _purchase;

    const rawPurchase = pickOne<PurchaseTransactionRow & { slot: unknown }>(row.purchase);
    let purchase: AdminLeasingItem["purchase"] = null;
    if (rawPurchase) {
      const { slot: _slot, ...purchaseOnly } = rawPurchase;
      void _slot;
      purchase = {
        ...(purchaseOnly as PurchaseTransactionRow),
        slot: normalizeSlotDetail(
          Array.isArray(rawPurchase.slot) ? rawPurchase.slot[0] : rawPurchase.slot,
        ),
      };
    }

    return {
      ...(applicationOnly as LeasingApplicationRow),
      partner: pickOne<LeasingPartnerRow>(row.partner),
      purchase,
    };
  });

  return ok(rows);
}

/** Update sebagian kolom pengajuan leasing (status, DP, tenor, komisi, catatan). */
export async function updateLeasingApplication(
  id: string,
  patch: LeasingApplicationPatch,
): Promise<Result<LeasingApplicationRow>> {
  if (!isServiceRoleConfigured()) {
    return fail<LeasingApplicationRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  }

  const bersih: TablesUpdate<"leasing_applications"> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (bersih as Record<string, unknown>)[key] = value;
    }
  }
  bersih.updated_at = new Date().toISOString();

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("leasing_applications")
    .update(bersih)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return dbFail<LeasingApplicationRow>(error as PgError, "Gagal memperbarui pengajuan leasing");
  }
  if (!data) return fail<LeasingApplicationRow>("Pengajuan leasing tidak ditemukan.", "NOT_FOUND");

  const row = data as LeasingApplicationRow;
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
  if (!isServiceRoleConfigured()) return fail<LeasingPartnerRow[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("leasing_partners")
    .select("*")
    .order("name", { ascending: true });

  if (error) return dbFail<LeasingPartnerRow[]>(error as PgError, "Gagal memuat partner leasing");
  return ok((data ?? []) as LeasingPartnerRow[]);
}

/** Tambah partner baru atau perbarui yang sudah ada (kalau input.id diisi). */
export async function upsertPartner(
  input: UpsertPartnerInput,
): Promise<Result<LeasingPartnerRow>> {
  if (!isServiceRoleConfigured()) return fail<LeasingPartnerRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");

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

  const supabase = createAdminSupabase();

  if (data.id) {
    const diperbarui = await supabase
      .from("leasing_partners")
      .update(payload)
      .eq("id", data.id)
      .select("*")
      .maybeSingle();

    if (diperbarui.error) {
      return dbFail<LeasingPartnerRow>(diperbarui.error as PgError, "Gagal menyimpan partner leasing");
    }
    if (!diperbarui.data) {
      return fail<LeasingPartnerRow>("Partner leasing tidak ditemukan.", "NOT_FOUND");
    }
    return ok(diperbarui.data as LeasingPartnerRow);
  }

  const dibuat = await supabase.from("leasing_partners").insert(payload).select("*").single();
  if (dibuat.error || !dibuat.data) {
    return dbFail<LeasingPartnerRow>(dibuat.error as PgError, "Gagal menyimpan partner leasing");
  }
  return ok(dibuat.data as LeasingPartnerRow);
}

/** Tandai komisi platform sudah / belum dibayarkan partner. */
export async function setCommissionPaid(id: string, paid: boolean): Promise<Result<null>> {
  if (!isServiceRoleConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("leasing_applications")
    .update({ commission_paid: paid, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return dbFail<null>(error as PgError, "Gagal memperbarui status komisi");
  return ok(null);
}

/* ------------------------------------------------------------------ */
/* Pengaturan zona (biaya admin)                                       */
/* ------------------------------------------------------------------ */

/** Semua zona (urut display_order) untuk halaman pengaturan admin. */
export async function listZonesAdmin(): Promise<Result<ZoneRow[]>> {
  if (!isServiceRoleConfigured()) return fail<ZoneRow[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("zones")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) return dbFail<ZoneRow[]>(error as PgError, "Gagal memuat daftar zona");
  return ok((data ?? []) as ZoneRow[]);
}

/** Ubah biaya admin satu zona (dipakai /admin/pengaturan). */
export async function updateZoneFee(zoneId: string, adminFee: number): Promise<Result<ZoneRow>> {
  if (!isServiceRoleConfigured()) return fail<ZoneRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  if (!Number.isFinite(adminFee) || adminFee < 0) {
    return fail<ZoneRow>("Biaya admin tidak boleh negatif.", "VALIDATION");
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("zones")
    .update({ admin_fee: adminFee })
    .eq("id", zoneId)
    .select("*")
    .maybeSingle();

  if (error) return dbFail<ZoneRow>(error as PgError, "Gagal menyimpan biaya admin zona");
  if (!data) return fail<ZoneRow>("Zona tidak ditemukan.", "NOT_FOUND");
  return ok(data as ZoneRow);
}

/* ------------------------------------------------------------------ */
/* Tanggal gelaran (event_dates)                                       */
/* ------------------------------------------------------------------ */

/** Semua tanggal gelaran (aktif maupun tidak), urut naik. */
export async function listEventDates(): Promise<Result<EventDateRow[]>> {
  if (!isServiceRoleConfigured()) return fail<EventDateRow[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("event_dates")
    .select("*")
    .order("event_date", { ascending: true });

  if (error) return dbFail<EventDateRow[]>(error as PgError, "Gagal memuat tanggal gelaran");
  return ok((data ?? []) as EventDateRow[]);
}

/** Tambah satu tanggal gelaran baru (YYYY-MM-DD). */
export async function addEventDate(date: string): Promise<Result<EventDateRow>> {
  if (!isServiceRoleConfigured()) return fail<EventDateRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const parsed = addEventDateSchema.safeParse({ date });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Tanggal tidak valid.";
    return fail<EventDateRow>(first, "VALIDATION");
  }

  const supabase = createAdminSupabase();

  // Tanggal ditautkan ke event aktif (satu event saja di sistem ini).
  const eventQuery = await supabase
    .from("events")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (eventQuery.error) {
    return dbFail<EventDateRow>(eventQuery.error as PgError, "Gagal memuat data event");
  }
  const eventId = ((eventQuery.data ?? null) as { id: string } | null)?.id ?? null;

  const inserted = await supabase
    .from("event_dates")
    .insert({ event_id: eventId, event_date: parsed.data.date, is_active: true })
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    const err = inserted.error as PgError;
    if (err?.code === "23505") {
      return fail<EventDateRow>("Tanggal tersebut sudah terdaftar.", "ALREADY_EXISTS");
    }
    return dbFail<EventDateRow>(err, "Gagal menambah tanggal gelaran");
  }
  return ok(inserted.data as EventDateRow);
}

/** Aktifkan / nonaktifkan satu tanggal gelaran. */
export async function setEventDateActive(
  id: string,
  active: boolean,
): Promise<Result<EventDateRow>> {
  if (!isServiceRoleConfigured()) return fail<EventDateRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("event_dates")
    .update({ is_active: active })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return dbFail<EventDateRow>(error as PgError, "Gagal memperbarui tanggal gelaran");
  if (!data) return fail<EventDateRow>("Tanggal gelaran tidak ditemukan.", "NOT_FOUND");
  return ok(data as EventDateRow);
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
  if (!isServiceRoleConfigured()) return fail<AnalyticsData>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();

  const zonesQuery = await supabase
    .from("zones")
    .select("id, name, zone_type, display_order")
    .order("display_order", { ascending: true });
  if (zonesQuery.error) {
    return dbFail<AnalyticsData>(zonesQuery.error as PgError, "Gagal memuat zona");
  }
  const zones = (zonesQuery.data ?? []) as Array<{
    id: string;
    name: string;
    zone_type: ZoneType;
    display_order: number;
  }>;

  const slotsQuery = await supabase.from("slots").select("id, zone_id, status");
  if (slotsQuery.error) {
    return dbFail<AnalyticsData>(slotsQuery.error as PgError, "Gagal memuat slot");
  }
  const slots = (slotsQuery.data ?? []) as Array<{
    id: string;
    zone_id: string;
    status: SlotStatus;
  }>;

  // (a) Okupansi per zona bookable pada tanggal aktif terdekat (model per tanggal).
  const okupansiResult = await ambilOkupansiTanggalTerdekat(supabase);
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
  const bookingsQuery = await supabase.from("bookings").select("created_at");
  if (bookingsQuery.error) {
    return dbFail<AnalyticsData>(bookingsQuery.error as PgError, "Gagal memuat booking");
  }
  const perTanggal = new Map<string, number>();
  for (const row of (bookingsQuery.data ?? []) as Array<{ created_at: string }>) {
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
  const leasingQuery = await supabase.from("leasing_applications").select("status");
  if (leasingQuery.error) {
    return dbFail<AnalyticsData>(leasingQuery.error as PgError, "Gagal memuat pengajuan leasing");
  }
  const leasingRows = (leasingQuery.data ?? []) as Array<{ status: LeasingStatus }>;
  const leasingPerStatus: LeasingStatusPoint[] =
    leasingRows.length === 0
      ? []
      : LEASING_STATUS_URUT.map((status) => ({
          status,
          jumlah: leasingRows.filter((row) => row.status === status).length,
        }));

  // (d) Metode pembayaran biaya admin (cash vs transfer).
  const paymentsQuery = await supabase.from("admin_fee_payments").select("method");
  if (paymentsQuery.error) {
    return dbFail<AnalyticsData>(paymentsQuery.error as PgError, "Gagal memuat pembayaran");
  }
  const paymentRows = (paymentsQuery.data ?? []) as Array<{ method: PaymentMethod }>;
  const metodePembayaran: PaymentMethodPoint[] = (["transfer", "cash"] as const)
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
