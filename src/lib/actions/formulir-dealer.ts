"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { kodeDealer, MAKS_STEMPEL_BYTES, MAKS_TTD_BYTES, type DataDealer } from "@/lib/domain/formulir-dealer";
import { clientIpFromHeaders, rateLimitShared } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/services/auth";
import { catatLog } from "@/lib/services/log";
import { simpanPendaftaranDealer, tandatanganiDealer, terimaDealer } from "@/lib/services/formulir-dealer";
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
