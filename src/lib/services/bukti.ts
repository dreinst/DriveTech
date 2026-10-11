import { coba, isDbConfigured, sql } from "@/lib/db";
import { fail, ok, type Result } from "@/lib/result";
import type { BookingStatus, PaymentStatus } from "@/lib/types/database";
import { dbFail, NO_CONFIG_MESSAGE } from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/bukti.ts hanya boleh dipakai di server.");
}

export type BuktiBayar = {
  booking_code: string;
  booking_status: BookingStatus;
  tenant_name: string;
  amount: number;
  unique_code: number | null;
  status: PaymentStatus;
  submitted_at: string | null;
  proof_url: string;
};

/** Semua tagihan yang punya bukti bayar, kiriman terbaru di atas. */
export async function listBukti(): Promise<Result<BuktiBayar[]>> {
  if (!isDbConfigured()) return fail<BuktiBayar[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(sql<BuktiBayar[]>`
    select b.booking_code, b.status as booking_status, t.name as tenant_name,
           p.amount, p.unique_code, p.status, p.submitted_at, p.proof_url
      from admin_fee_payments p
      join bookings b on b.id = p.booking_id
      join tenants t on t.id = b.tenant_id
     where p.proof_url is not null
     order by p.submitted_at desc nulls last`);
  if (error) return dbFail<BuktiBayar[]>(error, "Gagal memuat daftar bukti bayar");
  return ok([...data]);
}
