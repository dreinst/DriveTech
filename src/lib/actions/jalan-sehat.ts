"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { bacaDaftarNomor, BATAS_DAFTAR_PER_IP, nomorTiket } from "@/lib/domain/jalan-sehat";
import { clientIpFromHeaders, rateLimitShared } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/services/auth";
import {
  aktifkanTiket,
  buatPesanan,
  buatTiketKosong,
  tandaiDicetak,
  tolakPesanan,
  undiPemenang,
  verifikasiPesanan,
} from "@/lib/services/jalan-sehat";
import { jalanSehatSchema, zodFieldErrors } from "@/lib/validation/schemas";
import { errorState, successState, type ActionState } from "./state";

const ADMIN = "/drivetechadmin/jalan-sehat";

/** Form pendaftaran di /jalan-sehat. Sukses: redirect ke halaman pesanan berisi QRIS. */
export async function daftarJalanSehatAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = await clientIpFromHeaders();
  if (!(await rateLimitShared(`jalan-sehat:ip:${ip}`, BATAS_DAFTAR_PER_IP.jumlah, BATAS_DAFTAR_PER_IP.detik))) {
    return errorState("Banyak sekali pendaftaran dari jaringan ini. Coba lagi beberapa menit lagi ya.");
  }

  const parsed = jalanSehatSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return errorState("Ada isian yang perlu dicek lagi.", zodFieldErrors(parsed.error));
  }

  const hasil = await buatPesanan({ ...parsed.data, sumber: "web" });
  if (!hasil.ok) {
    if (hasil.code === "TUTUP") return errorState(hasil.error);
    console.warn(`[jalan-sehat] ${hasil.error}`);
    return errorState("Pendaftaran belum tersimpan. Coba sebentar lagi ya.");
  }

  redirect(`/jalan-sehat/pesanan/${hasil.data.token}`);
}

/** Pembayaran pesanan cocok dengan mutasi QRIS: tiket dibuat dan bot mengirimnya ke chat pemesan. */
export async function verifikasiPesananAction(id: number): Promise<ActionState> {
  await requireAdmin();
  const hasil = await verifikasiPesanan(id);
  if (!hasil.ok) return errorState(hasil.error);
  revalidatePath(ADMIN);
  const ids = hasil.data;
  const rentang = ids.length > 1 ? `${nomorTiket(ids[0])} sampai ${nomorTiket(ids.at(-1) ?? ids[0])}` : nomorTiket(ids[0]);
  return successState(`Lunas. Tiket ${rentang} dibuat.`);
}

/** Bukti tidak cocok: pesanan kembali menunggu bukti dan pemesan dikabari alasannya. */
export async function tolakPesananAction(id: number, alasan: string): Promise<ActionState> {
  await requireAdmin();
  const teks = alasan.trim().slice(0, 200);
  if (teks.length < 3) return errorState("Tulis alasan penolakan.");
  const hasil = await tolakPesanan(id, teks);
  if (!hasil.ok) return errorState(hasil.error);
  revalidatePath(ADMIN);
  return successState("Bukti ditolak, pemesan dikabari lewat WhatsApp.");
}

/** Tombol undi di panel admin: pilih satu pemenang acak dari tiket aktif yang belum menang. */
export async function undiPemenangAction(): Promise<ActionState> {
  await requireAdmin();
  const hasil = await undiPemenang();
  if (!hasil.ok) return errorState(hasil.error);
  if (!hasil.data) return errorState("Semua tiket aktif sudah pernah menang, tidak ada yang bisa diundi lagi.");
  revalidatePath(ADMIN);
  const p = hasil.data;
  return successState([nomorTiket(p.id), p.nama, p.domisili].filter(Boolean).join(" | "));
}

/** Buat sejumlah tiket kosong untuk peserta di lokasi; belum ikut undian sampai diaktifkan. */
export async function buatTiketKosongAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const hasil = await buatTiketKosong(Number(formData.get("jumlah")));
  if (!hasil.ok) return errorState(hasil.error);
  revalidatePath(ADMIN);
  const ids = hasil.data;
  return successState(
    `${ids.length} tiket kosong dibuat, nomor ${nomorTiket(ids[0])} sampai ${nomorTiket(ids.at(-1) ?? ids[0])}. Cetak lewat tombol "Tiket kosong belum dicetak".`,
  );
}

/** Panitia menandai tiket kosong sudah dibagikan: nomornya ikut undian. */
export async function aktifkanTiketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const ids = bacaDaftarNomor(String(formData.get("nomor") ?? ""));
  if (!ids || ids.length === 0) {
    return errorState("Tulis nomor tiket, misalnya 512 atau 501-520, pisahkan dengan koma.");
  }
  const nama = String(formData.get("nama") ?? "").trim().slice(0, 80);
  const hasil = await aktifkanTiket(ids, ids.length === 1 && nama ? nama : null);
  if (!hasil.ok) return errorState(hasil.error);
  revalidatePath(ADMIN);
  if (hasil.data.length === 0) {
    return errorState("Tidak ada tiket yang berubah. Nomor itu bukan tiket kosong, atau sudah aktif.");
  }
  const lewat = ids.length - hasil.data.length;
  return successState(
    `${hasil.data.length} tiket aktif dan ikut undian${lewat > 0 ? ` (${lewat} nomor dilewati karena bukan tiket kosong atau sudah aktif)` : ""}.`,
  );
}

/** Dipanggil dari halaman cetak setelah lembar tiket dicetak. */
export async function tandaiDicetakAction(ids: number[]): Promise<ActionState> {
  await requireAdmin();
  const hasil = await tandaiDicetak(ids.filter((n) => Number.isInteger(n) && n > 0));
  if (!hasil.ok) return errorState(hasil.error);
  revalidatePath(ADMIN);
  return successState(`${hasil.data} tiket ditandai sudah dicetak.`);
}
