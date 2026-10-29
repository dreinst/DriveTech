import { coba, cobaSatu, isDbConfigured, sql } from "@/lib/db";
import {
  batasBayarPesanan,
  HARGA_TIKET_JS,
  MAKS_TIKET_KOSONG,
  PESAN_DAFTAR_DITUTUP,
  pendaftaranOnlineDibuka,
  type StatusPesananJs,
  type SumberJalanSehat,
} from "@/lib/domain/jalan-sehat";
import { fail, ok, type Result } from "@/lib/result";
import { dbFail, NO_CONFIG_MESSAGE } from "./slots";

/**
 * Jalan sehat berbayar: pesanan (tabel jalan_sehat_pesanan) dan tiket undian (jalan_sehat_peserta,
 * nomor tiket = id). Migrasi 20261028-jalan-sehat.sql dan 20261029-jalan-sehat-berbayar.sql.
 * Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
 */
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/jalan-sehat.ts hanya boleh dipakai di server.");
}

export type PesananJalanSehat = {
  id: number;
  kode: string;
  token: string;
  nama: string;
  phone: string;
  domisili: string;
  jumlah: number;
  amount: number;
  unique_code: number | null;
  sumber: "web" | "wa";
  status: StatusPesananJs;
  batas_bayar: string;
  proof_url: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  alasan_tolak: string | null;
  wa_chat: string | null;
  kabar: "lunas" | "ditolak" | null;
  created_at: string;
};

export type PesertaJalanSehat = {
  id: number;
  // Kosong untuk tiket 'tempat' yang belum terjual atau dijual tanpa nama.
  nama: string | null;
  phone: string | null;
  domisili: string | null;
  token: string;
  pesanan_id: number | null;
  sumber: SumberJalanSehat;
  aktif: boolean;
  dicetak_at: string | null;
  menang_at: string | null;
  created_at: string;
};

/** Pesanan yang belum ada bukti bayar dan lewat batasnya jadi batal. Dipanggil sebelum membaca pesanan. */
async function batalkanKedaluwarsa(): Promise<void> {
  await coba(sql`
    update jalan_sehat_pesanan set status = 'batal'
     where status = 'menunggu' and batas_bayar < now()`);
}

/**
 * Buat pesanan baru lalu alokasikan kode unik nominal QRIS. Satu nomor boleh memesan berkali-kali
 * (misalnya rombongan menyusul); tiap pesanan dibayar sendiri.
 */
export async function buatPesanan(input: {
  nama: string;
  phone: string;
  domisili: string;
  jumlah: number;
  sumber: "web" | "wa";
  waChat?: string | null;
}): Promise<Result<PesananJalanSehat>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  if (!pendaftaranOnlineDibuka()) return fail(PESAN_DAFTAR_DITUTUP, "TUTUP");
  await batalkanKedaluwarsa();

  const baru = await cobaSatu(sql<{ id: number }[]>`
    insert into jalan_sehat_pesanan (nama, phone, domisili, jumlah, amount, sumber, batas_bayar, wa_chat)
    values (${input.nama}, ${input.phone}, ${input.domisili}, ${input.jumlah}, ${input.jumlah * HARGA_TIKET_JS},
            ${input.sumber}, ${batasBayarPesanan()}, ${input.waChat ?? null})
    returning id`);
  if (baru.error || !baru.data) return dbFail(baru.error ?? { message: "kosong" }, "Gagal menyimpan pendaftaran");

  const kode = await cobaSatu(sql<{ kode: number | null }[]>`select alokasi_kode_unik_js(${baru.data.id}) as kode`);
  if (kode.error) return dbFail(kode.error, "Gagal menyiapkan nominal pembayaran");
  // Semua 349 kode untuk nominal ini sedang dipakai: pesanan tetap sah, nominalnya dicocokkan manual.
  if (kode.data?.kode == null) console.warn(`[jalan-sehat] kode unik habis untuk pesanan ${baru.data.id}`);

  const pesanan = await pesananById(baru.data.id);
  return pesanan ? ok(pesanan) : fail("Gagal memuat pesanan", "DB");
}

async function pesananById(id: number): Promise<PesananJalanSehat | null> {
  const { data } = await cobaSatu(sql<PesananJalanSehat[]>`select * from jalan_sehat_pesanan where id = ${id}`);
  return data;
}

export async function pesananByToken(token: string): Promise<PesananJalanSehat | null> {
  if (!isDbConfigured() || !/^[0-9a-f]{32}$/.test(token)) return null;
  await batalkanKedaluwarsa();
  const { data } = await cobaSatu(sql<PesananJalanSehat[]>`select * from jalan_sehat_pesanan where token = ${token}`);
  return data;
}

export async function pesananByKode(kode: string): Promise<PesananJalanSehat | null> {
  const k = kode.trim().toUpperCase();
  if (!isDbConfigured() || !/^JS-[0-9A-F]{8}$/.test(k)) return null;
  await batalkanKedaluwarsa();
  const { data } = await cobaSatu(sql<PesananJalanSehat[]>`select * from jalan_sehat_pesanan where kode = ${k}`);
  return data;
}

/** Semua pesanan satu nomor, terbaru dulu. */
export async function pesananByPhone(phone: string): Promise<Result<PesananJalanSehat[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  await batalkanKedaluwarsa();
  const { data, error } = await coba(sql<PesananJalanSehat[]>`
    select * from jalan_sehat_pesanan where phone = ${phone} order by id desc`);
  return error ? dbFail(error, "Gagal memuat pesanan") : ok(data);
}

export async function listPesanan(): Promise<Result<PesananJalanSehat[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  await batalkanKedaluwarsa();
  const { data, error } = await coba(sql<PesananJalanSehat[]>`select * from jalan_sehat_pesanan order by id desc`);
  return error ? dbFail(error, "Gagal memuat pesanan jalan sehat") : ok(data);
}

/** Simpan chat WhatsApp pesanan supaya kabar lunas/ditolak dikirim ke chat itu. */
export async function simpanChatPesanan(id: number, chat: string): Promise<void> {
  await coba(sql`update jalan_sehat_pesanan set wa_chat = ${chat} where id = ${id}`);
}

/** Bukti bayar masuk (dari bot WhatsApp). Pesanan yang sudah lunas tidak berubah. */
export async function kirimBuktiPesanan(id: number, proofUrl: string): Promise<Result<PesananJalanSehat>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { error } = await coba(sql`
    update jalan_sehat_pesanan
       set status = 'dicek', proof_url = ${proofUrl}, submitted_at = now(), alasan_tolak = null
     where id = ${id} and status in ('menunggu', 'dicek', 'batal')`);
  if (error) return dbFail(error, "Gagal menyimpan bukti bayar");
  const p = await pesananById(id);
  return p ? ok(p) : fail("Pesanan tidak ditemukan.", "NOT_FOUND");
}

/**
 * Pembayaran cocok: pesanan lunas dan tiket undiannya (satu per peserta) dibuat dalam satu pernyataan.
 * Pesanan batal boleh diverifikasi kalau uangnya ternyata masuk.
 */
export async function verifikasiPesanan(id: number): Promise<Result<number[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(sql<{ id: number }[]>`
    with p as (
      update jalan_sehat_pesanan
         set status = 'lunas', verified_at = now(), kabar = 'lunas', alasan_tolak = null
       where id = ${id} and status <> 'lunas'
      returning *
    )
    insert into jalan_sehat_peserta (nama, phone, domisili, sumber, pesanan_id)
    select p.nama, p.phone, p.domisili, p.sumber, p.id from p, generate_series(1, p.jumlah)
    returning id`);
  if (error) return dbFail(error, "Gagal memverifikasi pesanan");
  if (data.length === 0) return fail("Pesanan sudah lunas atau tidak ditemukan.", "ALREADY_CONFIRMED");
  return ok(data.map((r) => r.id).sort((a, b) => a - b));
}

/** Bukti tidak cocok: pesanan kembali menunggu bukti, peserta dikabari lewat bot. */
export async function tolakPesanan(id: number, alasan: string): Promise<Result<null>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(sql`
    update jalan_sehat_pesanan
       set status = 'menunggu', alasan_tolak = ${alasan}, kabar = 'ditolak',
           batas_bayar = greatest(batas_bayar, now() + interval '6 hours')
     where id = ${id} and status = 'dicek'`);
  if (error) return dbFail(error, "Gagal menolak bukti");
  return data.count === 0 ? fail("Hanya pesanan berstatus bukti dicek yang bisa ditolak.", "NOT_SUBMITTED") : ok(null);
}

/** Pesanan yang punya kabar untuk bot dan chat WhatsApp-nya diketahui. */
export async function kabarPesanan(): Promise<Result<PesananJalanSehat[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(sql<PesananJalanSehat[]>`
    select * from jalan_sehat_pesanan where kabar is not null and wa_chat is not null order by id limit 20`);
  return error ? dbFail(error, "Gagal memuat kabar") : ok(data);
}

export async function kabarTerkirim(id: number): Promise<void> {
  await coba(sql`update jalan_sehat_pesanan set kabar = null where id = ${id}`);
}

/** Tiket milik satu pesanan, urut nomor. */
export async function tiketPesanan(pesananId: number): Promise<Result<PesertaJalanSehat[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(sql<PesertaJalanSehat[]>`
    select * from jalan_sehat_peserta where pesanan_id = ${pesananId} order by id`);
  return error ? dbFail(error, "Gagal memuat tiket") : ok(data);
}

export async function listPesertaJalanSehat(): Promise<Result<PesertaJalanSehat[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(
    sql<PesertaJalanSehat[]>`select * from jalan_sehat_peserta order by id`,
  );
  return error ? dbFail(error, "Gagal memuat peserta jalan sehat") : ok(data);
}

/** Nomor tiket yang ikut undian (aktif). Hanya angka, tanpa data pribadi. */
export async function nomorTiketAktif(): Promise<Result<number[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(
    sql<{ id: number }[]>`select id from jalan_sehat_peserta where aktif order by id`,
  );
  return error ? dbFail(error, "Gagal memuat nomor tiket") : ok(data.map((r) => r.id));
}

/** Buat tiket kosong (belum aktif) untuk dijual tunai di lokasi ke peserta tanpa HP. */
export async function buatTiketKosong(jumlah: number): Promise<Result<number[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > MAKS_TIKET_KOSONG) {
    return fail(`Jumlah tiket kosong 1 sampai ${MAKS_TIKET_KOSONG}.`, "VALIDATION");
  }
  const { data, error } = await coba(sql<{ id: number }[]>`
    insert into jalan_sehat_peserta (sumber, aktif)
    select 'tempat', false from generate_series(1, ${jumlah})
    returning id`);
  return error ? dbFail(error, "Gagal membuat tiket kosong") : ok(data.map((r) => r.id));
}

/**
 * Tandai tiket kosong sudah terjual sehingga ikut undian. Nama opsional (diisi hanya kalau
 * satu tiket). Balas nomor yang benar-benar berubah; nomor yang bukan tiket 'tempat' diabaikan.
 */
export async function aktifkanTiket(ids: number[], nama: string | null): Promise<Result<number[]>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  if (ids.length === 0) return ok([]);
  const { data, error } = await coba(sql<{ id: number }[]>`
    update jalan_sehat_peserta set aktif = true, nama = coalesce(${nama}, nama)
     where sumber = 'tempat' and not aktif and id in ${sql(ids)}
    returning id`);
  return error ? dbFail(error, "Gagal mengaktifkan tiket") : ok(data.map((r) => r.id).sort((a, b) => a - b));
}

export async function tandaiDicetak(ids: number[]): Promise<Result<number>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  if (ids.length === 0) return ok(0);
  const { data, error } = await coba(sql`
    update jalan_sehat_peserta set dicetak_at = now() where dicetak_at is null and id in ${sql(ids)}`);
  return error ? dbFail(error, "Gagal menandai tiket tercetak") : ok(data.count);
}

/** Pilih acak satu tiket aktif yang belum menang lalu tandai menang. null kalau tidak ada lagi. */
export async function undiPemenang(): Promise<Result<PesertaJalanSehat | null>> {
  if (!isDbConfigured()) return fail(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await cobaSatu(sql<PesertaJalanSehat[]>`
    update jalan_sehat_peserta set menang_at = now()
     where id = (select id from jalan_sehat_peserta where aktif and menang_at is null
                  order by random() limit 1 for update skip locked)
    returning *`);
  return error ? dbFail(error, "Gagal mengundi pemenang") : ok(data);
}
