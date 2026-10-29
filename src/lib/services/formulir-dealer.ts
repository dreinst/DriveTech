import { coba, cobaSatu, isDbConfigured, sql } from "@/lib/db";
import type { DataDealer } from "@/lib/domain/formulir-dealer";
import { fail, ok, type Result } from "@/lib/result";
import { dbFail, NO_CONFIG_MESSAGE } from "./slots";

/**
 * Formulir dealer baru (tabel public.dealer_pendaftaran, migrasi 20261029-dealer-baru.sql).
 * Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
 */
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/formulir-dealer.ts hanya boleh dipakai di server.");
}

/** Baris tanpa kolom gambar, untuk daftar dan halaman status. */
export type PendaftaranDealer = {
  id: number;
  token: string;
  data: DataDealer;
  ada_stempel: boolean;
  ditandatangani_at: string | null;
  diterima_at: string | null;
  created_at: string;
};

export type GambarDealer = { ttd: Buffer | null; stempel: Buffer | null };

const KOLOM_RINGAN = sql`id, token, data, stempel is not null as ada_stempel, ditandatangani_at, diterima_at, created_at`;

/** Simpan isian. ttd boleh null: tanda tangan menyusul lewat /dealer/<token>. */
export async function simpanPendaftaranDealer(input: {
  data: DataDealer;
  ttd: Buffer | null;
  stempel: Buffer | null;
}): Promise<Result<PendaftaranDealer>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await cobaSatu(sql<PendaftaranDealer[]>`
    insert into dealer_pendaftaran (data, ttd, stempel, ditandatangani_at)
    values (${sql.json(input.data)}, ${input.ttd}, ${input.stempel}, ${input.ttd ? sql`now()` : null})
    returning ${KOLOM_RINGAN}`);
  if (error || !data) return dbFail(error ?? { message: "baris kosong" }, "Gagal menyimpan formulir dealer");
  return ok(data);
}

/** Tanda tangan menyusul. Formulir yang sudah ditandatangani tidak bisa ditimpa. */
export async function tandatanganiDealer(
  token: string,
  ttd: Buffer,
  stempel: Buffer | null,
): Promise<Result<PendaftaranDealer>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await cobaSatu(sql<PendaftaranDealer[]>`
    update dealer_pendaftaran
       set ttd = ${ttd}, stempel = coalesce(${stempel}, stempel), ditandatangani_at = now()
     where token = ${token} and ditandatangani_at is null
    returning ${KOLOM_RINGAN}`);
  if (error) return dbFail(error, "Gagal menyimpan tanda tangan");
  return data ? ok(data) : fail("Formulir ini sudah ditandatangani.", "SUDAH");
}

export async function getDealerByToken(token: string): Promise<PendaftaranDealer | null> {
  if (!isDbConfigured() || !/^[0-9a-f]{32}$/.test(token)) return null;
  const { data } = await cobaSatu(
    sql<PendaftaranDealer[]>`select ${KOLOM_RINGAN} from dealer_pendaftaran where token = ${token}`,
  );
  return data;
}

export async function getGambarDealer(id: number): Promise<GambarDealer> {
  const { data } = await cobaSatu(sql<GambarDealer[]>`select ttd, stempel from dealer_pendaftaran where id = ${id}`);
  return data ?? { ttd: null, stempel: null };
}

export async function listPendaftaranDealer(): Promise<Result<PendaftaranDealer[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(
    sql<PendaftaranDealer[]>`select ${KOLOM_RINGAN} from dealer_pendaftaran order by id desc`,
  );
  return error ? dbFail(error, "Gagal memuat formulir dealer") : ok(data);
}

/** Panitia menerima formulir yang sudah ditandatangani dealer. */
export async function terimaDealer(id: number): Promise<Result<null>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await cobaSatu(sql<{ id: number }[]>`
    update dealer_pendaftaran set diterima_at = now()
     where id = ${id} and ditandatangani_at is not null and diterima_at is null
    returning id`);
  if (error) return dbFail(error, "Gagal menerima formulir");
  return data ? ok(null) : fail("Formulir belum ditandatangani dealer atau sudah diterima.");
}
