import { coba, cobaSatu, isDbConfigured, sql } from "@/lib/db";
import { fail, ok, type Result } from "@/lib/result";
import type { BookingDetail, BookingStatus } from "@/lib/types/database";
import { listBookings } from "./admin";
import { dbFail, NO_CONFIG_MESSAGE, tanggalHariIniJakarta } from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/regulang.ts hanya boleh dipakai di server.");
}

/** Hasil pencarian yang ditampilkan; kata kunci yang terlalu umum diminta dipersempit. */
export const MAKS_HASIL_REGULANG = 20;

export type HitunganHadir = { tanggal: string; hadir: number; total: number };

export type HasilRegUlang = {
  bookings: BookingDetail[];
  /** Jumlah seluruh booking yang cocok (bisa lebih besar dari yang ditampilkan). */
  jumlahCocok: number;
  /** Kunci "<id booking>|<tanggal>" untuk setiap kehadiran yang sudah dicatat. */
  hadir: Set<string>;
};

/** Booking terkonfirmasi yang hadir dibanding yang dijadwalkan untuk hari ini (WIB). */
export async function hitungHadirHariIni(): Promise<Result<HitunganHadir>> {
  if (!isDbConfigured()) return fail<HitunganHadir>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const tanggal = tanggalHariIniJakarta();
  const { data, error } = await cobaSatu(sql<{ hadir: number; total: number }[]>`
    select count(k.id)::int as hadir, count(*)::int as total
      from booking_dates d
      join bookings b on b.id = d.booking_id
      left join kehadiran k on k.booking_id = d.booking_id and k.tanggal = d.event_date
     where d.event_date = ${tanggal} and d.is_active and b.status = 'confirmed'`);
  if (error || !data) return dbFail<HitunganHadir>(error, "Gagal menghitung kehadiran");
  return ok({ tanggal, ...data });
}

/** Cari booking lewat kode booking, nama, atau nomor HP, lengkap dengan kehadiran yang sudah dicatat. */
export async function cariRegUlang(q: string): Promise<Result<HasilRegUlang>> {
  if (q.trim().length === 0) return ok({ bookings: [], jumlahCocok: 0, hadir: new Set<string>() });
  const cari = await listBookings({ q });
  if (!cari.ok) return fail<HasilRegUlang>(cari.error, cari.code);

  const bookings = cari.data.slice(0, MAKS_HASIL_REGULANG);
  const hadir = new Set<string>();
  if (bookings.length > 0) {
    const { data, error } = await coba(sql<{ booking_id: string; tanggal: string }[]>`
      select booking_id, tanggal from kehadiran where booking_id in ${sql(bookings.map((b) => b.id))}`);
    if (error) return dbFail<HasilRegUlang>(error, "Gagal memuat kehadiran");
    for (const row of data) hadir.add(`${row.booking_id}|${row.tanggal}`);
  }
  return ok({ bookings, jumlahCocok: cari.data.length, hadir });
}

/**
 * Tandai hadir (atau batalkan tanda) satu booking pada satu tanggal sewanya.
 * Hanya booking berstatus confirmed yang bisa ditandai; menandai dua kali tidak
 * membuat baris ganda (kunci unik booking + tanggal). Mengembalikan kode booking untuk log.
 */
export async function setHadir(
  bookingId: string,
  tanggal: string,
  hadir: boolean,
  adminId: string,
): Promise<Result<string>> {
  if (!isDbConfigured()) return fail<string>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const cek = await cobaSatu(
    sql<{ booking_code: string; status: BookingStatus; sewa: boolean }[]>`
      select b.booking_code, b.status,
             exists (select 1 from booking_dates d
                      where d.booking_id = b.id and d.is_active and d.event_date = ${tanggal}::date) as sewa
        from bookings b where b.id = ${bookingId}`,
  );
  if (cek.error) return dbFail<string>(cek.error, "Gagal memuat booking");
  if (!cek.data) return fail<string>("Booking tidak ditemukan.", "NOT_FOUND");

  if (!hadir) {
    const hapus = await coba(sql`
      delete from kehadiran where booking_id = ${bookingId} and tanggal = ${tanggal}::date`);
    if (hapus.error) return dbFail<string>(hapus.error, "Gagal membatalkan tanda hadir");
    return ok(cek.data.booking_code);
  }

  if (cek.data.status !== "confirmed") {
    return fail<string>(
      "Hanya booking yang sudah terkonfirmasi yang bisa ditandai hadir.",
      "NOT_CONFIRMED",
    );
  }
  if (!cek.data.sewa) return fail<string>("Booking ini tidak menyewa tanggal tersebut.", "VALIDATION");

  const simpan = await coba(sql`
    insert into kehadiran (booking_id, tanggal, dicatat_oleh)
    select ${bookingId}, ${tanggal}::date, coalesce(u.username, u.email)
      from admin_users u where u.id = ${adminId}
    on conflict (booking_id, tanggal) do nothing`);
  if (simpan.error) return dbFail<string>(simpan.error, "Gagal menandai hadir");
  return ok(cek.data.booking_code);
}
