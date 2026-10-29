import { coba, cobaSatu, isDbConfigured, sql } from "@/lib/db";
import { fail, ok, type Result } from "@/lib/result";
import { dbFail, NO_CONFIG_MESSAGE } from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/penarikan.ts hanya boleh dipakai di server.");
}

export type PenarikanRow = {
  id: string;
  tanggal: string;
  nominal: number;
  catatan: string;
  dicatat_oleh: string;
  created_at: string;
};

export type RingkasanSaldo = {
  /** Jumlah pembayaran nontunai yang terverifikasi. */
  jumlah: number;
  /** Total tagihan biaya admin dari pembayaran nontunai terverifikasi. */
  tagihan: number;
  /** Total kode unik yang ikut ditransfer. */
  kodeUnik: number;
  /** Pembayaran tunai yang dicatat panitia; tidak masuk saldo QRIS. */
  tunai: number;
  ditarik: number;
  penarikan: PenarikanRow[];
};

/**
 * Uang masuk dari pembayaran terverifikasi dan catatan penarikan saldo.
 * Booking manual yang langsung dikonfirmasi tercatat sebagai tunai (uangnya
 * diterima panitia di luar QRIS), jadi dipisah dan tidak dihitung sebagai saldo.
 */
export async function ringkasanSaldo(): Promise<Result<RingkasanSaldo>> {
  if (!isDbConfigured()) return fail<RingkasanSaldo>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  type Masuk = { jumlah: number; tagihan: number; kode_unik: number; tunai: number };
  const masuk = await cobaSatu(sql<Masuk[]>`
    select count(*) filter (where method <> 'cash')::int as jumlah,
           coalesce(sum(amount) filter (where method <> 'cash'), 0) as tagihan,
           coalesce(sum(unique_code) filter (where method <> 'cash'), 0) as kode_unik,
           coalesce(sum(amount) filter (where method = 'cash'), 0) as tunai
      from admin_fee_payments where status = 'verified'`);
  if (masuk.error || !masuk.data) return dbFail<RingkasanSaldo>(masuk.error, "Gagal menghitung uang masuk");

  const daftar = await coba(sql<PenarikanRow[]>`
    select id, tanggal, nominal, catatan, dicatat_oleh, created_at
      from penarikan_saldo order by tanggal desc, created_at desc`);
  if (daftar.error) return dbFail<RingkasanSaldo>(daftar.error, "Gagal memuat catatan penarikan");

  return ok({
    jumlah: masuk.data.jumlah,
    tagihan: masuk.data.tagihan,
    kodeUnik: masuk.data.kode_unik,
    tunai: masuk.data.tunai,
    ditarik: daftar.data.reduce((n, row) => n + row.nominal, 0),
    penarikan: [...daftar.data],
  });
}

/** Catat satu penarikan saldo. `adminId` dipakai mengisi kolom dicatat_oleh dengan username saat itu. */
export async function tambahPenarikan(
  input: { tanggal: string; nominal: number; catatan: string },
  adminId: string,
): Promise<Result<null>> {
  if (!isDbConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { error } = await coba(sql`
    insert into penarikan_saldo (tanggal, nominal, catatan, dicatat_oleh)
    select ${input.tanggal}::date, ${input.nominal}, ${input.catatan}, coalesce(u.username, u.email)
      from admin_users u where u.id = ${adminId}`);
  if (error) return dbFail<null>(error, "Gagal mencatat penarikan");
  return ok(null);
}

/** Hapus satu catatan penarikan; mengembalikan barisnya untuk log. */
export async function hapusPenarikan(id: string): Promise<Result<PenarikanRow>> {
  if (!isDbConfigured()) return fail<PenarikanRow>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await cobaSatu(sql<PenarikanRow[]>`
    delete from penarikan_saldo where id = ${id}
    returning id, tanggal, nominal, catatan, dicatat_oleh, created_at`);
  if (error) return dbFail<PenarikanRow>(error, "Gagal menghapus catatan penarikan");
  if (!data) return fail<PenarikanRow>("Catatan penarikan tidak ditemukan.", "NOT_FOUND");
  return ok(data);
}
