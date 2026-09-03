import { fail, ok, type Result } from "@/lib/result";
import { syncToSheet } from "@/lib/sheets";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import type {
  LeasingApplicationRow,
  LeasingDetail,
  LeasingPartnerRow,
  PurchaseDetail,
  PurchaseTransactionRow,
  SlotRow,
  ZoneRow,
} from "@/lib/types/database";
import {
  createPurchaseSchema,
  zodFieldErrors,
  type CreatePurchaseInput,
} from "@/lib/validation/schemas";
import { dbFail, getSlotDetail, NO_CONFIG_MESSAGE, pickOne, type PgError } from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/purchase.ts hanya boleh dipakai di server.");
}

/** Select standar transaksi pembelian + slot penjual + pengajuan leasingnya. */
export const PURCHASE_SELECT =
  "*, slot:slots(*, zone:zones(*)), leasing:leasing_applications(*, partner:leasing_partners(*))";

type RawSlotWithZone = SlotRow & { zone: ZoneRow | ZoneRow[] | null };
type RawLeasing = LeasingApplicationRow & {
  partner: LeasingPartnerRow | LeasingPartnerRow[] | null;
};
type RawPurchase = PurchaseTransactionRow & {
  slot: RawSlotWithZone | RawSlotWithZone[] | null;
  leasing: RawLeasing | RawLeasing[] | null;
};

/** Rapikan baris mentah PostgREST jadi PurchaseDetail. Dipakai juga services/admin.ts. */
export function normalizePurchaseRow(raw: unknown): PurchaseDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as RawPurchase;

  const rawSlot = pickOne<RawSlotWithZone>(row.slot);
  const zone = rawSlot ? pickOne<ZoneRow>(rawSlot.zone) : null;
  if (!rawSlot || !zone) return null;

  const { zone: _zone, ...slotOnly } = rawSlot;
  void _zone;
  const { slot: _slot, leasing: _leasing, ...purchaseOnly } = row;
  void _slot;
  void _leasing;

  const rawLeasing = pickOne<RawLeasing>(row.leasing);
  let leasing: LeasingDetail | null = null;
  if (rawLeasing) {
    const partner = pickOne<LeasingPartnerRow>(rawLeasing.partner);
    if (partner) {
      const { partner: _partner, ...leasingOnly } = rawLeasing;
      void _partner;
      leasing = { ...(leasingOnly as LeasingApplicationRow), partner };
    }
  }

  return {
    ...(purchaseOnly as PurchaseTransactionRow),
    slot: { ...(slotOnly as SlotRow), zone },
    leasing,
  };
}

/**
 * Catat minat/transaksi pembelian unit dari tenant pemilik slot.
 * Tidak mengubah status slot: slot adalah lapak tenant, bukan unit yang dijual.
 */
export async function createPurchase(
  input: CreatePurchaseInput,
): Promise<Result<{ purchaseId: string; transactionCode: string }>> {
  type Out = { purchaseId: string; transactionCode: string };
  if (!isServiceRoleConfigured()) return fail<Out>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const parsed = createPurchaseSchema.safeParse(input);
  if (!parsed.success) {
    const errors = zodFieldErrors(parsed.error);
    const first = Object.values(errors)[0] ?? "Data pembelian tidak valid.";
    return fail<Out>(first, "VALIDATION");
  }
  const data = parsed.data;

  const slotResult = await getSlotDetail(data.slotId);
  if (!slotResult.ok) return fail<Out>(slotResult.error, slotResult.code);
  const slot = slotResult.data;

  if (slot.zone.zone_type === "facility") {
    return fail<Out>("Fasilitas umum bukan lapak penjualan.", "NOT_BOOKABLE");
  }

  const supabase = createAdminSupabase();

  // Prospek hanya boleh dibuat untuk slot yang memang MEMASARKAN unit: ada
  // listing kendaraan yang tampil di katalog (is_visible) milik booking yang
  // sudah terkonfirmasi — kriteria yang sama dengan services/catalog.ts.
  // Tanpa ini endpoint publik bisa dipakai menumpuk prospek palsu ke slot
  // kosong (temuan audit 2026-09-03).
  const listingQuery = await supabase
    .from("vehicle_listings")
    .select("id, booking:bookings!inner(status)")
    .eq("slot_id", slot.id)
    .eq("is_visible", true)
    .eq("booking.status", "confirmed")
    .limit(1);
  if (listingQuery.error) {
    return dbFail<Out>(listingQuery.error as PgError, "Gagal memeriksa unit di slot ini");
  }
  if ((listingQuery.data ?? []).length === 0) {
    return fail<Out>("Slot ini belum memiliki unit yang dipasarkan.", "NO_LISTING");
  }

  const inserted = await supabase
    .from("purchase_transactions")
    .insert({
      slot_id: slot.id,
      buyer_name: data.buyerName,
      buyer_phone: data.buyerPhone,
      payment_method: data.paymentMethod,
      unit_description: data.unitDescription ?? null,
      unit_price: data.unitPrice ?? null,
      status: "new",
      notes: data.notes ?? null,
    })
    .select("id, transaction_code")
    .single();

  if (inserted.error || !inserted.data) {
    return dbFail<Out>(inserted.error as PgError, "Gagal menyimpan transaksi pembelian");
  }

  const row = inserted.data as { id: string; transaction_code: string };

  // Sinkron ke Google Sheets — fire-and-forget, tidak menahan respons.
  void syncToSheet("purchase", {
    transactionCode: row.transaction_code,
    status: "new",
    slot: slot.svg_element_id ?? slot.slot_label ?? slot.id,
    zona: slot.zone.name,
    buyerName: data.buyerName,
    buyerPhone: data.buyerPhone,
    paymentMethod: data.paymentMethod,
    unitDescription: data.unitDescription ?? "",
    unitPrice: data.unitPrice ?? "",
  });

  return ok<Out>({ purchaseId: row.id, transactionCode: row.transaction_code });
}

/** Transaksi pembelian lengkap berdasarkan id. */
export async function getPurchaseDetail(id: string): Promise<Result<PurchaseDetail>> {
  if (!isServiceRoleConfigured()) return fail<PurchaseDetail>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("purchase_transactions")
    .select(PURCHASE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return dbFail<PurchaseDetail>(error as PgError, "Gagal memuat transaksi pembelian");

  const detail = normalizePurchaseRow(data);
  if (!detail) return fail<PurchaseDetail>("Transaksi tidak ditemukan.", "NOT_FOUND");
  return ok(detail);
}

/** Transaksi pembelian lengkap berdasarkan kode transaksi (mis. "TX-A1B2C3"). */
export async function getPurchaseByCode(code: string): Promise<Result<PurchaseDetail>> {
  if (!isServiceRoleConfigured()) return fail<PurchaseDetail>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const normalized = code.trim().toUpperCase();
  if (normalized.length === 0) {
    return fail<PurchaseDetail>("Kode transaksi wajib diisi.", "VALIDATION");
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("purchase_transactions")
    .select(PURCHASE_SELECT)
    .eq("transaction_code", normalized)
    .maybeSingle();

  if (error) return dbFail<PurchaseDetail>(error as PgError, "Gagal memuat transaksi pembelian");

  const detail = normalizePurchaseRow(data);
  if (!detail) {
    return fail<PurchaseDetail>("Transaksi dengan kode tersebut tidak ditemukan.", "NOT_FOUND");
  }
  return ok(detail);
}
