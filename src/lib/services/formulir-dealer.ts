import { coba, cobaSatu, isDbConfigured, sql } from "@/lib/db";
import { hitungBiaya, KODE_WA_DEALER_RE, type DataDealer } from "@/lib/domain/formulir-dealer";
import { totalBayar } from "@/lib/domain/harga";
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
  /** Tagihan lapak, terisi setelah diterima panitia (migrasi 20261029-dealer-bayar.sql). */
  amount: number | null;
  unique_code: number | null;
  status_bayar: StatusBayarDealer;
  proof_url: string | null;
  submitted_at: string | null;
  alasan_tolak: string | null;
  lunas_at: string | null;
  lunas_lewat: LunasLewat | null;
  kwitansi_no: string | null;
};

export type StatusBayarDealer = "belum" | "dicek" | "lunas";
export type LunasLewat = "admin" | "discord" | "cocok";

export type GambarDealer = { ttd: Buffer | null; stempel: Buffer | null };

const KOLOM_RINGAN = sql`id, token, data, stempel is not null as ada_stempel, wa_chat is not null as ada_wa,
  ditandatangani_at, diterima_at, created_at, amount, unique_code, status_bayar, proof_url, submitted_at,
  alasan_tolak, lunas_at, lunas_lewat, kwitansi_no`;

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
  return data ? pastikanTagihan(data) : null;
}

async function dealerById(id: number): Promise<PendaftaranDealer | null> {
  const { data } = await cobaSatu(sql<PendaftaranDealer[]>`select ${KOLOM_RINGAN} from dealer_pendaftaran where id = ${id}`);
  return data;
}

/** "DL-0007" (atau kode WA "DL-0007-XXXXXXXX") -> formulir dealer. */
export async function dealerByKode(kode: string): Promise<PendaftaranDealer | null> {
  const cocok = /^DL-(\d{4,})(?:-[0-9A-F]{8})?$/i.exec(kode.trim());
  if (!isDbConfigured() || !cocok) return null;
  const d = await dealerById(Number(cocok[1]));
  return d ? pastikanTagihan(d) : null;
}

/**
 * Tagihan dibuat saat formulir diterima: biaya lapak dari isian lalu kode unik 501..999. Formulir yang sudah
 * diterima sebelum fitur bayar ada ikut dibuatkan tagihan saat pertama kali dibaca.
 */
async function pastikanTagihan(d: PendaftaranDealer): Promise<PendaftaranDealer> {
  if (!d.diterima_at || (d.amount !== null && d.unique_code !== null) || d.status_bayar === "lunas") return d;
  const total = hitungBiaya(d.data).total;
  if (total <= 0) return d;
  await coba(sql`update dealer_pendaftaran set amount = ${total} where id = ${d.id} and amount is null`);
  const kode = await cobaSatu(sql<{ kode: number | null }[]>`select alokasi_kode_unik_dl(${d.id}) as kode`);
  if (kode.data?.kode == null) console.warn(`[dealer] kode unik belum terbagi untuk dealer ${d.id}`);
  return (await dealerById(d.id)) ?? d;
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
  return error ? dbFail(error, "Gagal memuat formulir dealer") : ok(await Promise.all(data.map(pastikanTagihan)));
}

/** Panitia menerima formulir yang sudah ditandatangani dealer. */
export async function terimaDealer(id: number): Promise<Result<null>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await cobaSatu(sql<{ id: number }[]>`
    update dealer_pendaftaran set diterima_at = now(), kabar = 'diterima'
     where id = ${id} and ditandatangani_at is not null and diterima_at is null
    returning id`);
  if (error) return dbFail(error, "Gagal menerima formulir");
  if (!data) return fail("Formulir belum ditandatangani dealer atau sudah diterima.");
  const d = await dealerById(id);
  if (d) await pastikanTagihan(d);
  return ok(null);
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

/** Bukti bayar diunggah dealer di /dealer/<token>. Tagihan yang sudah lunas tidak berubah. */
export async function kirimBuktiDealer(id: number, proofUrl: string): Promise<Result<null>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(sql`
    update dealer_pendaftaran
       set status_bayar = 'dicek', proof_url = ${proofUrl}, submitted_at = now(), alasan_tolak = null
     where id = ${id} and amount is not null and status_bayar in ('belum', 'dicek')`);
  if (error) return dbFail(error, "Gagal menyimpan bukti bayar");
  return data.count === 0 ? fail("Tagihan ini belum siap atau sudah lunas.", "NOT_PAYABLE") : ok(null);
}

/**
 * Tandai lunas (tombol admin, kartu Discord, atau halaman cocok). Nomor kwitansi seri
 * NNN/DPRO-DT-KW/<bulan romawi>/<tahun> (WIB) dibuat di sini sekali, lalu bot WhatsApp mengirim kwitansinya.
 */
export async function lunaskanDealer(id: number, adminId: string, lewat: LunasLewat): Promise<Result<PendaftaranDealer>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await cobaSatu(sql<{ id: number }[]>`
    update dealer_pendaftaran
       set status_bayar = 'lunas', lunas_at = now(), lunas_oleh = ${adminId}, lunas_lewat = ${lewat},
           alasan_tolak = null, kabar_bayar = 'lunas',
           kwitansi_no = coalesce(kwitansi_no, lpad(nextval('kwitansi_dealer_seq')::text, 3, '0') || '/DPRO-DT-KW/'
             || trim(to_char(now() at time zone 'Asia/Jakarta', 'RM')) || '/'
             || to_char(now() at time zone 'Asia/Jakarta', 'YYYY'))
     where id = ${id} and amount is not null and status_bayar <> 'lunas'
    returning id`);
  if (error) return dbFail(error, "Gagal menandai lunas");
  if (!data) return fail("Tagihan dealer belum ada atau sudah lunas.", "ALREADY_CONFIRMED");
  const d = await dealerById(id);
  return d ? ok(d) : fail("Formulir dealer tidak ditemukan.", "NOT_FOUND");
}

/** Bukti tidak cocok: kembali menunggu bukti, dealer dikabari lewat bot. */
export async function tolakBayarDealer(id: number, alasan: string): Promise<Result<null>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(sql`
    update dealer_pendaftaran set status_bayar = 'belum', alasan_tolak = ${alasan}, kabar_bayar = 'ditolak'
     where id = ${id} and status_bayar = 'dicek'`);
  if (error) return dbFail(error, "Gagal menolak bukti");
  return data.count === 0 ? fail("Hanya tagihan berstatus bukti dicek yang bisa ditolak.", "NOT_SUBMITTED") : ok(null);
}

/** Tagihan dealer yang total bayarnya sama dengan salah satu nominal mutasi QRIS (halaman cocok). */
export async function dealerCocok(nominal: number[]): Promise<Result<PendaftaranDealer[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  if (nominal.length === 0) return ok([]);
  const { data, error } = await coba(sql<PendaftaranDealer[]>`
    select ${KOLOM_RINGAN} from dealer_pendaftaran where amount is not null order by id desc`);
  if (error) return dbFail(error, "Gagal mencocokkan tagihan dealer");
  return ok(data.filter((d) => nominal.includes(totalBayar({ amount: d.amount ?? 0, unique_code: d.unique_code }))));
}

export type KabarBayarDealer = PendaftaranDealer & { wa_chat: string; kabar_bayar: "lunas" | "ditolak" };

/** Kabar pembayaran untuk bot WhatsApp kantor: kwitansi (lunas) atau minta bukti ulang (ditolak). */
export async function kabarBayarDealer(): Promise<Result<KabarBayarDealer[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(sql<KabarBayarDealer[]>`
    select ${KOLOM_RINGAN}, wa_chat, kabar_bayar from dealer_pendaftaran
     where kabar_bayar is not null and wa_chat is not null order by id limit 20`);
  return error ? dbFail(error, "Gagal memuat kabar bayar dealer") : ok(data);
}

export async function kabarBayarDealerTerkirim(id: number): Promise<void> {
  await coba(sql`update dealer_pendaftaran set kabar_bayar = null where id = ${id}`);
}

/** Goresan tanda tangan penanda tangan kwitansi (PNG transparan); null kalau belum dibuat. */
export async function getTtdKwitansi(): Promise<Buffer | null> {
  if (!isDbConfigured()) return null;
  const { data } = await cobaSatu(sql<{ png: Buffer }[]>`select png from kwitansi_ttd where id = 1`);
  return data?.png ?? null;
}

export async function simpanTtdKwitansi(png: Buffer, adminId: string): Promise<Result<null>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { error } = await coba(sql`
    insert into kwitansi_ttd (id, png, updated_by) values (1, ${png}, ${adminId})
    on conflict (id) do update set png = excluded.png, updated_at = now(), updated_by = excluded.updated_by`);
  return error ? dbFail(error, "Gagal menyimpan tanda tangan") : ok(null);
}
