import { fail, ok, type Result } from "@/lib/result";
import { cobaSatu, isDbConfigured, sql } from "@/lib/db";
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
import { dbFail, getSlotDetail, NO_CONFIG_MESSAGE, pickOne, slotJson } from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/purchase.ts hanya boleh dipakai di server.");
}

/** Select standar transaksi pembelian + slot penjual + pengajuan leasingnya (alias tabel: `p`). */
export const purchaseSelect = () => sql`
  select p.*,
         ${slotJson(sql`p.slot_id`)} as slot,
         (select to_jsonb(la) || jsonb_build_object('partner', to_jsonb(lp))
            from leasing_applications la
            left join leasing_partners lp on lp.id = la.leasing_partner_id
           where la.purchase_transaction_id = p.id) as leasing
    from purchase_transactions p`;

type RawSlotWithZone = SlotRow & { zone: ZoneRow | ZoneRow[] | null };
type RawLeasing = LeasingApplicationRow & {
  partner: LeasingPartnerRow | LeasingPartnerRow[] | null;
};
type RawPurchase = PurchaseTransactionRow & {
  slot: RawSlotWithZone | RawSlotWithZone[] | null;
  leasing: RawLeasing | RawLeasing[] | null;
};

/** Rapikan baris mentah hasil query jadi PurchaseDetail. Dipakai juga services/admin.ts. */
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
 * Apakah slot ini MEMASARKAN unit: ada listing kendaraan yang tampil di katalog
 * (is_visible) milik booking yang sudah TERKONFIRMASI — kriteria yang sama
 * dengan services/catalog.ts. Dipakai halaman /beli (gerbang tampilan) dan
 * createPurchase (validasi server). Jangan menilai dari slots.status: sejak
 * booking per tanggal, kolom itu tetap "available" walau lapak sudah disewa.
 */
export async function slotHasMarketedUnit(slotId: string): Promise<Result<boolean>> {
  if (!isDbConfigured()) return fail<boolean>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const listingQuery = await cobaSatu(sql<{ ada: boolean }[]>`
    select exists (
      select 1 from vehicle_listings l join bookings b on b.id = l.booking_id
       where l.slot_id = ${slotId} and l.is_visible and b.status = 'confirmed') as ada`);

  if (listingQuery.error) {
    return dbFail<boolean>(listingQuery.error, "Gagal memeriksa unit di slot ini");
  }
  return ok(listingQuery.data?.ada === true);
}

/**
 * Catat minat/transaksi pembelian unit dari tenant pemilik slot.
 * Tidak mengubah status slot: slot adalah lapak tenant, bukan unit yang dijual.
 */
export async function createPurchase(
  input: CreatePurchaseInput,
): Promise<Result<{ purchaseId: string; transactionCode: string }>> {
  type Out = { purchaseId: string; transactionCode: string };
  if (!isDbConfigured()) return fail<Out>(NO_CONFIG_MESSAGE, "NO_CONFIG");

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

  // Prospek hanya boleh dibuat untuk slot yang memang MEMASARKAN unit
  // (temuan audit 2026-09-03): tanpa ini endpoint publik bisa dipakai
  // menumpuk prospek palsu ke slot kosong.
  const unitResult = await slotHasMarketedUnit(slot.id);
  if (!unitResult.ok) return fail<Out>(unitResult.error, unitResult.code);
  if (!unitResult.data) {
    return fail<Out>("Slot ini belum memiliki unit yang dipasarkan.", "NO_LISTING");
  }

  const inserted = await cobaSatu(sql<{ id: string; transaction_code: string }[]>`
    insert into purchase_transactions ${sql({
      slot_id: slot.id,
      buyer_name: data.buyerName,
      buyer_phone: data.buyerPhone,
      payment_method: data.paymentMethod,
      unit_description: data.unitDescription ?? null,
      unit_price: data.unitPrice ?? null,
      status: "new",
      notes: data.notes ?? null,
    })} returning id, transaction_code`);

  if (inserted.error || !inserted.data) {
    return dbFail<Out>(inserted.error, "Gagal menyimpan transaksi pembelian");
  }

  const row = inserted.data;


  return ok<Out>({ purchaseId: row.id, transactionCode: row.transaction_code });
}

/** Transaksi pembelian lengkap berdasarkan id. */
export async function getPurchaseDetail(id: string): Promise<Result<PurchaseDetail>> {
  if (!isDbConfigured()) return fail<PurchaseDetail>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const { data, error } = await cobaSatu(sql`${purchaseSelect()} where p.id = ${id}`);

  if (error) return dbFail<PurchaseDetail>(error, "Gagal memuat transaksi pembelian");

  const detail = normalizePurchaseRow(data);
  if (!detail) return fail<PurchaseDetail>("Transaksi tidak ditemukan.", "NOT_FOUND");
  return ok(detail);
}

/** Transaksi pembelian lengkap berdasarkan kode transaksi (mis. "TX-A1B2C3"). */
export async function getPurchaseByCode(code: string): Promise<Result<PurchaseDetail>> {
  if (!isDbConfigured()) return fail<PurchaseDetail>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const normalized = code.trim().toUpperCase();
  if (normalized.length === 0) {
    return fail<PurchaseDetail>("Kode transaksi wajib diisi.", "VALIDATION");
  }

  const { data, error } = await cobaSatu(
    sql`${purchaseSelect()} where p.transaction_code = ${normalized}`,
  );

  if (error) return dbFail<PurchaseDetail>(error, "Gagal memuat transaksi pembelian");

  const detail = normalizePurchaseRow(data);
  if (!detail) {
    return fail<PurchaseDetail>("Transaksi dengan kode tersebut tidak ditemukan.", "NOT_FOUND");
  }
  return ok(detail);
}
