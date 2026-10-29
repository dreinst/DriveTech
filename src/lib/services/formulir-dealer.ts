import { coba, cobaSatu, isDbConfigured, sql } from "@/lib/db";
import { KODE_WA_DEALER_RE, type DataDealer } from "@/lib/domain/formulir-dealer";
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
  /** Dealer sudah meminta PDF lewat chat WhatsApp kantor. */
  ada_wa: boolean;
  ditandatangani_at: string | null;
  diterima_at: string | null;
  created_at: string;
};

export type GambarDealer = { ttd: Buffer | null; stempel: Buffer | null };

const KOLOM_RINGAN = sql`id, token, data, stempel is not null as ada_stempel, wa_chat is not null as ada_wa,
  ditandatangani_at, diterima_at, created_at`;

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
       set ttd = ${ttd}, stempel = coalesce(${stempel}, stempel), ditandatangani_at = now(), kabar = 'ditandatangani'
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
    update dealer_pendaftaran set diterima_at = now(), kabar = 'diterima'
     where id = ${id} and ditandatangani_at is not null and diterima_at is null
    returning id`);
  if (error) return dbFail(error, "Gagal menerima formulir");
  return data ? ok(null) : fail("Formulir belum ditandatangani dealer atau sudah diterima.");
}

/**
 * Dealer yang meminta PDF lewat chat WhatsApp kantor (kode DL-0001-XXXXXXXX). Chat-nya disimpan supaya
 * PDF versi berikutnya (setelah tanda tangan menyusul atau diterima panitia) dikirim ke chat yang sama.
 * Kabar yang tertunda dihapus karena bot langsung mengirim PDF terbaru. null = kode tidak cocok.
 */
export async function hubungkanChatDealer(kode: string, chat: string | null): Promise<Result<PendaftaranDealer | null>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const cocok = KODE_WA_DEALER_RE.exec(kode);
  if (!cocok) return ok(null);
  const awalan = cocok[2].toLowerCase();
  const { data, error } = chat
    ? await cobaSatu(sql<PendaftaranDealer[]>`
        update dealer_pendaftaran set wa_chat = ${chat}, kabar = null
         where id = ${Number(cocok[1])} and left(token, 8) = ${awalan}
        returning ${KOLOM_RINGAN}`)
    : await cobaSatu(sql<PendaftaranDealer[]>`
        select ${KOLOM_RINGAN} from dealer_pendaftaran where id = ${Number(cocok[1])} and left(token, 8) = ${awalan}`);
  return error ? dbFail(error, "Gagal memuat formulir dealer") : ok(data);
}

export type KabarDealer = PendaftaranDealer & { wa_chat: string; kabar: "ditandatangani" | "diterima" };

/** Formulir yang PDF-nya berubah dan perlu dikirim ulang ke chat WhatsApp dealer. */
export async function kabarDealer(): Promise<Result<KabarDealer[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(sql<KabarDealer[]>`
    select ${KOLOM_RINGAN}, wa_chat, kabar from dealer_pendaftaran
     where kabar is not null and wa_chat is not null order by id limit 20`);
  return error ? dbFail(error, "Gagal memuat kabar dealer") : ok(data);
}

export async function kabarDealerTerkirim(id: number): Promise<void> {
  await coba(sql`update dealer_pendaftaran set kabar = null where id = ${id}`);
}
