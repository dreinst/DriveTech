import { fail, ok, type Result } from "@/lib/result";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import type {
  LeasingApplicationRow,
  LeasingDetail,
  LeasingPartnerRow,
} from "@/lib/types/database";
import {
  submitLeasingSchema,
  zodFieldErrors,
  type SubmitLeasingInput,
} from "@/lib/validation/schemas";
import { dbFail, NO_CONFIG_MESSAGE, pickOne, type PgError } from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/leasing.ts hanya boleh dipakai di server.");
}

const UNIQUE_VIOLATION = "23505";

type RawLeasing = LeasingApplicationRow & {
  partner: LeasingPartnerRow | LeasingPartnerRow[] | null;
};

function normalizeLeasingRow(raw: unknown): LeasingDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as RawLeasing;
  const partner = pickOne<LeasingPartnerRow>(row.partner);
  if (!partner) return null;
  const { partner: _partner, ...applicationOnly } = row;
  void _partner;
  return { ...(applicationOnly as LeasingApplicationRow), partner };
}

/**
 * Komisi platform dihitung dari pokok pembiayaan (harga unit dikurangi DP)
 * dikali commission_rate partner (persen). Null kalau data harga belum lengkap.
 */
export function hitungKomisi(
  unitPrice: number | null,
  dpAmount: number | null,
  commissionRate: number | null,
): number | null {
  if (unitPrice === null || commissionRate === null) return null;
  const pokok = Math.max(unitPrice - (dpAmount ?? 0), 0);
  return Math.round((pokok * commissionRate) / 100);
}

/** Daftar partner leasing yang aktif (dipakai form pengajuan kredit). */
export async function listActivePartners(): Promise<Result<LeasingPartnerRow[]>> {
  if (!isServiceRoleConfigured()) return fail<LeasingPartnerRow[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("leasing_partners")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return dbFail<LeasingPartnerRow[]>(error as PgError, "Gagal memuat partner leasing");
  return ok((data ?? []) as LeasingPartnerRow[]);
}

/**
 * Ajukan pembiayaan untuk satu transaksi pembelian berstatus kredit.
 * Relasi 1:1 dijaga unique constraint di kolom purchase_transaction_id.
 */
export async function submitLeasingApplication(
  input: SubmitLeasingInput,
): Promise<Result<{ leasingApplicationId: string }>> {
  type Out = { leasingApplicationId: string };
  if (!isServiceRoleConfigured()) return fail<Out>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const parsed = submitLeasingSchema.safeParse(input);
  if (!parsed.success) {
    const errors = zodFieldErrors(parsed.error);
    const first = Object.values(errors)[0] ?? "Data pengajuan tidak valid.";
    return fail<Out>(first, "VALIDATION");
  }
  const data = parsed.data;

  const supabase = createAdminSupabase();

  const purchaseQuery = await supabase
    .from("purchase_transactions")
    .select("id, payment_method, unit_price")
    .eq("id", data.purchaseTransactionId)
    .maybeSingle();

  if (purchaseQuery.error) {
    return dbFail<Out>(purchaseQuery.error as PgError, "Gagal memuat transaksi pembelian");
  }
  const purchase = (purchaseQuery.data ?? null) as
    | { id: string; payment_method: string; unit_price: number | null }
    | null;
  if (!purchase) return fail<Out>("Transaksi tidak ditemukan.", "NOT_FOUND");
  if (purchase.payment_method !== "credit") {
    return fail<Out>(
      "Pengajuan leasing hanya untuk pembelian dengan metode kredit.",
      "NOT_CREDIT",
    );
  }

  const partnerQuery = await supabase
    .from("leasing_partners")
    .select("id, commission_rate, is_active")
    .eq("id", data.leasingPartnerId)
    .maybeSingle();

  if (partnerQuery.error) {
    return dbFail<Out>(partnerQuery.error as PgError, "Gagal memuat partner leasing");
  }
  const partner = (partnerQuery.data ?? null) as
    | { id: string; commission_rate: number | null; is_active: boolean }
    | null;
  if (!partner) return fail<Out>("Partner leasing tidak ditemukan.", "NOT_FOUND");
  if (!partner.is_active) {
    return fail<Out>("Partner leasing tersebut sedang tidak aktif.", "INACTIVE_PARTNER");
  }

  const commission = hitungKomisi(purchase.unit_price, data.dpAmount, partner.commission_rate);

  const inserted = await supabase
    .from("leasing_applications")
    .insert({
      purchase_transaction_id: purchase.id,
      leasing_partner_id: partner.id,
      dp_amount: data.dpAmount,
      tenor_bulan: data.tenorBulan,
      status: "submitted",
      commission_amount: commission,
      commission_paid: false,
      notes: data.notes ?? null,
    })
    .select("id")
    .single();

  if (inserted.error || !inserted.data) {
    const error = inserted.error as PgError;
    if (error?.code === UNIQUE_VIOLATION) {
      return fail<Out>("Transaksi ini sudah punya pengajuan leasing.", "ALREADY_EXISTS");
    }
    return dbFail<Out>(error, "Gagal menyimpan pengajuan leasing");
  }

  const row = inserted.data as { id: string };
  return ok<Out>({ leasingApplicationId: row.id });
}

/** Pengajuan leasing (kalau ada) milik satu transaksi pembelian. */
export async function getLeasingByPurchase(
  purchaseId: string,
): Promise<Result<LeasingDetail | null>> {
  if (!isServiceRoleConfigured()) {
    return fail<LeasingDetail | null>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("leasing_applications")
    .select("*, partner:leasing_partners(*)")
    .eq("purchase_transaction_id", purchaseId)
    .maybeSingle();

  if (error) {
    return dbFail<LeasingDetail | null>(error as PgError, "Gagal memuat pengajuan leasing");
  }

  return ok(normalizeLeasingRow(data));
}
