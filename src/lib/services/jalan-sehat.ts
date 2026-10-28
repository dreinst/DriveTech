import { coba, cobaSatu, isDbConfigured, sql } from "@/lib/db";
import {
  KUOTA_JALAN_SEHAT,
  PESAN_DAFTAR_DITUTUP,
  PESAN_SUDAH_TERDAFTAR,
  pendaftaranOnlineDibuka,
} from "@/lib/domain/jalan-sehat";
import { fail, ok, type Result } from "@/lib/result";
import { dbFail, NO_CONFIG_MESSAGE } from "./slots";

/**
 * Pendaftaran jalan sehat dan undian doorprize (tabel public.jalan_sehat_peserta,
 * migrasi 20261028-jalan-sehat.sql). Nomor kupon = id.
 * Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
 */
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/jalan-sehat.ts hanya boleh dipakai di server.");
}

export type PesertaJalanSehat = {
  id: number;
  nama: string;
  phone: string;
  domisili: string;
  token: string;
  menang_at: string | null;
  created_at: string;
};

/**
 * Daftarkan peserta. Nomor yang sudah terdaftar ditolak (`SUDAH_ADA`) tanpa membuka
 * kupon lamanya: kupon hanya bisa dibuka lewat link token dari pendaftaran pertama.
 */
export async function daftarJalanSehat(input: {
  nama: string;
  phone: string;
  domisili: string;
}): Promise<Result<PesertaJalanSehat>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  if (!pendaftaranOnlineDibuka()) return fail(PESAN_DAFTAR_DITUTUP, "TUTUP");

  if (KUOTA_JALAN_SEHAT !== null) {
    const jumlah = await cobaSatu(sql<{ n: number }[]>`select count(*)::int as n from jalan_sehat_peserta`);
    if (jumlah.error) return dbFail(jumlah.error, "Gagal memeriksa kuota");
    if ((jumlah.data?.n ?? 0) >= KUOTA_JALAN_SEHAT) {
      return fail("Maaf, kuota peserta jalan sehat sudah penuh. Terima kasih atas antusiasnya!", "PENUH");
    }
  }

  // on conflict juga menangkap kiriman ganda bersamaan dari nomor yang sama.
  const baru = await cobaSatu(sql<PesertaJalanSehat[]>`
    insert into jalan_sehat_peserta (nama, phone, domisili)
    values (${input.nama}, ${input.phone}, ${input.domisili})
    on conflict (phone) do nothing
    returning *`);
  if (baru.error) return dbFail(baru.error, "Gagal menyimpan pendaftaran");
  return baru.data ? ok(baru.data) : fail(PESAN_SUDAH_TERDAFTAR, "SUDAH_ADA");
}

export async function getPesertaByToken(token: string): Promise<PesertaJalanSehat | null> {
  if (!isDbConfigured() || !/^[0-9a-f]{32}$/.test(token)) return null;
  const { data } = await cobaSatu(
    sql<PesertaJalanSehat[]>`select * from jalan_sehat_peserta where token = ${token}`,
  );
  return data;
}

export async function listPesertaJalanSehat(): Promise<Result<PesertaJalanSehat[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(
    sql<PesertaJalanSehat[]>`select * from jalan_sehat_peserta order by id`,
  );
  return error ? dbFail(error, "Gagal memuat peserta jalan sehat") : ok(data);
}

/** Pilih acak satu peserta yang belum menang lalu tandai menang. null kalau semua sudah menang. */
export async function undiPemenang(): Promise<Result<PesertaJalanSehat | null>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await cobaSatu(sql<PesertaJalanSehat[]>`
    update jalan_sehat_peserta set menang_at = now()
     where id = (select id from jalan_sehat_peserta where menang_at is null
                  order by random() limit 1 for update skip locked)
    returning *`);
  return error ? dbFail(error, "Gagal mengundi pemenang") : ok(data);
}
