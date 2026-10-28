"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { BATAS_DAFTAR_PER_IP, kodeKupon } from "@/lib/domain/jalan-sehat";
import { clientIpFromHeaders, rateLimitShared } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/services/auth";
import { daftarJalanSehat, undiPemenang } from "@/lib/services/jalan-sehat";
import { jalanSehatSchema, zodFieldErrors } from "@/lib/validation/schemas";
import { errorState, successState, type ActionState } from "./state";

/** Form pendaftaran di /jalan-sehat. Sukses: redirect ke halaman kupon. */
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

  const hasil = await daftarJalanSehat(parsed.data);
  if (!hasil.ok) {
    if (hasil.code === "TUTUP" || hasil.code === "PENUH" || hasil.code === "SUDAH_ADA") {
      return errorState(hasil.error);
    }
    console.warn(`[jalan-sehat] ${hasil.error}`);
    return errorState("Pendaftaran belum tersimpan. Coba sebentar lagi ya.");
  }

  redirect(`/jalan-sehat/kupon/${hasil.data.token}`);
}

/** Tombol undi di panel admin: pilih satu pemenang acak dari yang belum menang. */
export async function undiPemenangAction(): Promise<ActionState> {
  await requireAdmin();
  const hasil = await undiPemenang();
  if (!hasil.ok) return errorState(hasil.error);
  if (!hasil.data) return errorState("Semua peserta sudah pernah menang, tidak ada yang bisa diundi lagi.");
  revalidatePath("/drivetechadmin/jalan-sehat");
  const p = hasil.data;
  return successState(`${kodeKupon(p.id)} | ${p.nama} | ${p.domisili}`);
}
