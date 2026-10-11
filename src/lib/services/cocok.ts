import { coba, isDbConfigured, sql } from "@/lib/db";
import { fail, ok, type Result } from "@/lib/result";
import type { BookingDetail } from "@/lib/types/database";
import { bookingSelect, normalizeBookingRow } from "./booking";
import { dbFail, NO_CONFIG_MESSAGE } from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/cocok.ts hanya boleh dipakai di server.");
}

/** Jumlah nominal yang diproses sekali cocokkan. */
export const MAKS_NOMINAL = 50;

/**
 * Ambil nominal rupiah dari teks tempelan mutasi QRIS: satu nominal per baris
 * atau dipisah spasi. "Rp250.412", "250,412", "250412.00", dan "250.412,00"
 * semuanya terbaca 250412. Angka ganda dibuang, urutan dipertahankan.
 */
export function bacaNominal(teks: string): number[] {
  const hasil: number[] = [];
  for (const kata of teks.split(/[\s;]+/)) {
    const angka = Number(kata.replace(/[.,]\d{2}$/, "").replace(/\D/g, ""));
    if (angka > 0 && Number.isSafeInteger(angka) && !hasil.includes(angka)) hasil.push(angka);
    if (hasil.length >= MAKS_NOMINAL) break;
  }
  return hasil;
}

/** Booking yang total tagihannya (tagihan + kode unik) sama dengan salah satu nominal. */
export async function tagihanCocok(nominal: number[]): Promise<Result<BookingDetail[]>> {
  if (!isDbConfigured()) return fail<BookingDetail[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  if (nominal.length === 0) return ok([]);
  const { data, error } = await coba(sql`
    ${bookingSelect()}
    where exists (
      select 1 from admin_fee_payments p
       where p.booking_id = b.id and p.amount + coalesce(p.unique_code, 0) in ${sql(nominal)})
    order by b.created_at desc`);
  if (error) return dbFail<BookingDetail[]>(error, "Gagal mencocokkan tagihan");
  return ok(data.map(normalizeBookingRow).filter((row): row is BookingDetail => row !== null));
}
