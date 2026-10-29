"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { MAX_PROOF_BYTES, STORAGE_BUCKET_BUKTI } from "@/lib/domain/constants";
import { kodeDealer, MAKS_STEMPEL_BYTES, MAKS_TTD_BYTES, type DataDealer } from "@/lib/domain/formulir-dealer";
import { clientIpFromHeaders, rateLimitShared } from "@/lib/rate-limit";
import { requireAdmin, requireFullAdmin } from "@/lib/services/auth";
import { catatLog } from "@/lib/services/log";
import {
  getDealerByToken,
  kirimBuktiDealer,
  lunaskanDealer,
  simpanPendaftaranDealer,
  simpanTtdKwitansi,
  tandatanganiDealer,
  terimaDealer,
  tolakBayarDealer,
} from "@/lib/services/formulir-dealer";
import { simpanBerkas } from "@/lib/storage";
import { formulirDealerSchema, zodFieldErrors } from "@/lib/validation/schemas";
import { errorState, successState, type ActionState } from "./state";

/** Banyak dealer bisa mengisi bergantian dari iPad panitia, jadi batasnya longgar. */
const BATAS_KIRIM_PER_IP = { jumlah: 30, detik: 600 };

type Gambar = { ok: true; isi: Buffer | null } | { ok: false; pesan: string };

/** Data URL dari kanvas atau foto (PNG/JPEG) jadi Buffer. Kosong = null. */
function bacaGambar(nilai: FormDataEntryValue | null, maks: number, nama: string): Gambar {
  if (typeof nilai !== "string" || nilai === "") return { ok: true, isi: null };
  const cocok = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(nilai);
  if (!cocok) return { ok: false, pesan: `Gambar ${nama} tidak terbaca. Coba ulangi.` };
  const isi = Buffer.from(cocok[2], "base64");
  const png = isi[0] === 0x89 && isi[1] === 0x50;
  const jpeg = isi[0] === 0xff && isi[1] === 0xd8;
  if (!(png || jpeg)) return { ok: false, pesan: `Gambar ${nama} tidak terbaca. Coba ulangi.` };
  if (isi.length > maks) return { ok: false, pesan: `Gambar ${nama} terlalu besar.` };
  return { ok: true, isi };
}

/** Form /dealer. Sukses: redirect ke halaman formulir dealer (unduh PDF, tanda tangan menyusul). */
export async function kirimFormulirDealerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ip = await clientIpFromHeaders();
  if (!(await rateLimitShared(`dealer:ip:${ip}`, BATAS_KIRIM_PER_IP.jumlah, BATAS_KIRIM_PER_IP.detik))) {
    return errorState("Terlalu banyak kiriman dari jaringan ini. Coba lagi beberapa menit lagi ya.");
  }

  const parsed = formulirDealerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return errorState("Ada isian yang perlu dicek lagi.", zodFieldErrors(parsed.error));
  }
  if (formData.get("setuju") !== "on") {
    return errorState("Centang persetujuan Surat Pernyataan Komitmen Dealer dulu ya.", {
      setuju: "Wajib dicentang.",
    });
  }

  const ttd = bacaGambar(formData.get("ttd"), MAKS_TTD_BYTES, "tanda tangan");
  const stempel = bacaGambar(formData.get("stempel"), MAKS_STEMPEL_BYTES, "stempel");
  if (!ttd.ok) return errorState(ttd.pesan);
  if (!stempel.ok) return errorState(stempel.pesan);

  // Simpan datar sebagai teks; kotak centang yang dicentang jadi "ya", yang kosong dibuang.
  const data: DataDealer = {};
  for (const [kunci, nilai] of Object.entries(parsed.data as Record<string, unknown>)) {
    if (nilai === undefined || nilai === false || nilai === 0) continue;
    data[kunci] = nilai === true ? "ya" : String(nilai);
  }

  const hasil = await simpanPendaftaranDealer({ data, ttd: ttd.isi, stempel: stempel.isi });
  if (!hasil.ok) {
    console.warn(`[dealer] ${hasil.error}`);
    return errorState("Formulir belum tersimpan. Coba sebentar lagi ya.");
  }
  revalidatePath("/drivetechadmin/dealer");
  redirect(`/dealer/${hasil.data.token}`);
}

/** Tanda tangan menyusul di /dealer/<token>, misalnya di iPad panitia saat di lokasi. */
export async function tandatanganiDealerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const ttd = bacaGambar(formData.get("ttd"), MAKS_TTD_BYTES, "tanda tangan");
  const stempel = bacaGambar(formData.get("stempel"), MAKS_STEMPEL_BYTES, "stempel");
  if (!ttd.ok) return errorState(ttd.pesan);
  if (!stempel.ok) return errorState(stempel.pesan);
  if (!ttd.isi) return errorState("Tanda tangan dulu di kotak yang tersedia.");

  const hasil = await tandatanganiDealer(token, ttd.isi, stempel.isi);
  if (!hasil.ok) return errorState(hasil.code === "SUDAH" ? hasil.error : "Tanda tangan belum tersimpan. Coba lagi ya.");
  revalidatePath(`/dealer/${token}`);
  revalidatePath("/drivetechadmin/dealer");
  return successState("Tanda tangan tersimpan.");
}

/** Tombol "Terima" di panel admin: tanda tangan panitia ikut tampil di PDF. */
export async function terimaDealerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const hasil = await terimaDealer(id);
  if (!hasil.ok) return errorState(hasil.error);
  await catatLog(admin.id, "terima_formulir_dealer", kodeDealer(id));
  revalidatePath("/drivetechadmin/dealer");
  return successState("Diterima.");
}

const EKSTENSI_BUKTI: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Dealer mengunggah screenshot bukti bayar QRIS di /dealer/<token>. */
export async function kirimBuktiDealerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ip = await clientIpFromHeaders();
  if (!(await rateLimitShared(`dealer-bukti:ip:${ip}`, 20, 600))) {
    return errorState("Terlalu banyak unggahan dari jaringan ini. Coba lagi beberapa menit lagi ya.");
  }
  const token = String(formData.get("token") ?? "");
  const dealer = await getDealerByToken(token);
  if (!dealer || dealer.amount === null) return errorState("Tagihan dealer tidak ditemukan.");
  if (dealer.status_bayar === "lunas") return errorState("Pembayaran ini sudah lunas.");

  const berkas = formData.get("proof");
  if (!(berkas instanceof File) || berkas.size === 0) return errorState("Pilih screenshot bukti bayar dulu.");
  const ext = EKSTENSI_BUKTI[berkas.type];
  if (!ext) return errorState("Bukti bayar harus berupa gambar JPG, PNG, atau WEBP.");
  if (berkas.size > MAX_PROOF_BYTES) return errorState("Ukuran bukti bayar maksimal 2 MB.");
  const url = await simpanBerkas(STORAGE_BUCKET_BUKTI, `dl-${kodeDealer(dealer.id)}-web-${Date.now()}.${ext}`, berkas);
  if (!url) return errorState("Bukti bayar gagal diunggah, coba lagi.");

  const hasil = await kirimBuktiDealer(dealer.id, url);
  if (!hasil.ok) return errorState(hasil.error);
  revalidatePath(`/dealer/${token}`);
  revalidatePath("/drivetechadmin/dealer");
  return successState("Bukti bayar terkirim.");
}

/** Tombol "Lunas" di /drivetechadmin/dealer dan /drivetechadmin/cocok: kwitansi dibuat otomatis. */
export async function lunaskanDealerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const lewat = formData.get("lewat") === "cocok" ? "cocok" : "admin";
  const hasil = await lunaskanDealer(id, admin.id, lewat);
  if (!hasil.ok) return errorState(hasil.error);
  await catatLog(admin.id, "dealer_lunas", `${kodeDealer(id)}, kwitansi ${hasil.data.kwitansi_no} lewat ${lewat}`);
  revalidatePath("/drivetechadmin/dealer");
  revalidatePath("/drivetechadmin/cocok");
  return successState(`Lunas, kwitansi ${hasil.data.kwitansi_no}.`);
}

/** Bukti bayar dealer tidak cocok: dealer diminta mengunggah ulang. */
export async function tolakBayarDealerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const alasan = String(formData.get("alasan") ?? "").trim().slice(0, 200) || "Pembayaran belum kami temukan";
  const hasil = await tolakBayarDealer(id, alasan);
  if (!hasil.ok) return errorState(hasil.error);
  await catatLog(admin.id, "dealer_bayar_tolak", `${kodeDealer(id)}: ${alasan}`);
  revalidatePath("/drivetechadmin/dealer");
  return successState("Bukti ditolak.");
}

/** Goresan tanda tangan kwitansi di /drivetechadmin/kwitansi (khusus superadmin). */
export async function simpanTtdKwitansiAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);
  const ttd = bacaGambar(formData.get("ttd"), MAKS_TTD_BYTES, "tanda tangan");
  if (!ttd.ok) return errorState(ttd.pesan);
  if (!ttd.isi) return errorState("Tanda tangan dulu di kotak yang tersedia.");
  const hasil = await simpanTtdKwitansi(ttd.isi, gate.data.id);
  if (!hasil.ok) return errorState(hasil.error);
  await catatLog(gate.data.id, "ttd_kwitansi", "goresan tanda tangan kwitansi diganti");
  revalidatePath("/drivetechadmin/kwitansi");
  return successState("Tanda tangan kwitansi tersimpan.");
}
