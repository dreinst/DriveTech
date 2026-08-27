import { fail, ok, type Result } from "@/lib/result";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import type {
  AdminFeePaymentRow,
  BookingDetail,
  BookingStatus,
  LeasingApplicationRow,
  LeasingPartnerRow,
  PaymentStatus,
  PurchaseDetail,
  PurchaseTransactionRow,
  SlotDetail,
  SlotRow,
  SlotStatus,
  TablesUpdate,
  TenantRow,
  ZoneType,
} from "@/lib/types/database";
import { upsertPartnerSchema, type UpsertPartnerInput } from "@/lib/validation/schemas";
import { BOOKING_SELECT, normalizeBookingRow } from "./booking";
import { normalizePurchaseRow, PURCHASE_SELECT } from "./purchase";
import {
  compareSlots,
  dbFail,
  NO_CONFIG_MESSAGE,
  normalizeSlotDetail,
  pickOne,
  SLOT_WITH_ZONE_SELECT,
  type PgError,
} from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/admin.ts hanya boleh dipakai di server.");
}

/* ------------------------------------------------------------------ */
/* Tipe publik lapisan admin                                           */
/* ------------------------------------------------------------------ */

/** Rekap satu zona untuk dashboard. */
export type ZoneSlotStat = {
  zoneId: string;
  name: string;
  zoneType: ZoneType;
  total: number;
  available: number;
  pending: number;
  confirmed: number;
};

export type DashboardStats = {
  totalSlot: number;
  /** Rekap per zona (nama zona, tipe, total, available, pending, confirmed). */
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

  const perZona: ZoneSlotStat[] = zones.map((zone) => {
    const milik = slots.filter((slot) => slot.zone_id === zone.id);
    return {
      zoneId: zone.id,
      name: zone.name,
      zoneType: zone.zone_type,
      total: milik.length,
      available: milik.filter((slot) => slot.status === "available").length,
      pending: milik.filter((slot) => slot.status === "pending").length,
      confirmed: milik.filter((slot) => slot.status === "confirmed").length,
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

/** Override manual status slot oleh admin (dipakai saat pembayaran offline / koreksi). */
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
 * Verifikasi pembayaran: payment -> verified, booking -> confirmed, slot -> confirmed.
 * Tanpa transaksi: setiap langkah punya kompensasi manual kalau langkah lanjutan gagal.
 * SARAN PRODUKSI: jadikan satu Postgres function (rpc) supaya atomik.
 */
export async function verifyPayment(paymentId: string, adminId: string): Promise<Result<null>> {
  if (!isServiceRoleConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const paymentResult = await ambilPayment(paymentId);
  if (!paymentResult.ok) return fail<null>(paymentResult.error, paymentResult.code);
  const payment = paymentResult.data;
  if (payment.status === "verified") return ok(null); // idempoten

  const supabase = createAdminSupabase();
  const now = new Date().toISOString();

  const bookingQuery = await supabase
    .from("bookings")
    .select("id, slot_id, status")
    .eq("id", payment.booking_id)
    .maybeSingle();
  if (bookingQuery.error) {
    return dbFail<null>(bookingQuery.error as PgError, "Gagal memuat booking");
  }
  const booking = (bookingQuery.data ?? null) as
    | { id: string; slot_id: string; status: BookingStatus }
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

  const slotUpdate = await supabase
    .from("slots")
    .update({ status: "confirmed", updated_at: now })
    .eq("id", booking.slot_id);
  if (slotUpdate.error) {
    // Kompensasi berantai: booking dan pembayaran dikembalikan.
    await supabase.from("bookings").update({ status: booking.status }).eq("id", booking.id);
    await supabase
      .from("admin_fee_payments")
      .update({ status: payment.status, verified_by: null, verified_at: null })
      .eq("id", payment.id);
    return dbFail<null>(slotUpdate.error as PgError, "Gagal mengunci slot");
  }

  return ok(null);
}

/**
 * Tolak pembayaran: hanya status pembayaran + alasan yang berubah.
 * Booking tetap pending_payment dan slot tetap pending supaya tenant bisa unggah ulang.
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
  return ok(data as LeasingApplicationRow);
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
