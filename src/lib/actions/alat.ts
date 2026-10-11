"use server";

import { revalidatePath } from "next/cache";

import { rateLimitShared } from "@/lib/rate-limit";
import { buatAkun, gantiSandiSendiri, setAkunAktif, setSandiAkun } from "@/lib/services/akun";
import { requireAdmin, requireFullAdmin } from "@/lib/services/auth";
import { catatLog } from "@/lib/services/log";
import { hapusPenarikan, tambahPenarikan } from "@/lib/services/penarikan";
import { setHadir } from "@/lib/services/regulang";
import {
  buatAkunSchema,
  gantiSandiAkunSchema,
  gantiSandiSendiriSchema,
  setHadirSchema,
  tambahPenarikanSchema,
  zodFieldErrors,
} from "@/lib/validation/schemas";
import type { z } from "zod";
import { errorState, successState, type ActionState } from "./state";

/* Server action untuk alat panel admin (akun, penarikan, reg ulang, promo).
   Semua dipanggil lewat useActionState (komponen FormAksi). */

function teks(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Pesan galat pertama dari hasil validasi zod. */
function galatPertama(err: z.ZodError): ActionState {
  return errorState(Object.values(zodFieldErrors(err))[0] ?? "Isian tidak valid.");
}

/* ------------------------------------------------------------------ */
/* Kelola akun admin                                                   */
/* ------------------------------------------------------------------ */

/** Buat akun admin baru di /drivetechadmin/akun (khusus superadmin). */
export async function buatAkunAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

  const parsed = buatAkunSchema.safeParse({
    username: teks(form, "username"),
    fullName: teks(form, "fullName"),
    role: teks(form, "role"),
    password: teks(form, "password"),
  });
  if (!parsed.success) return galatPertama(parsed.error);

  const result = await buatAkun(parsed.data);
  if (!result.ok) return errorState(result.error);
  await catatLog(gate.data.id, "buat_akun", `${parsed.data.username} (${parsed.data.role})`);

  revalidatePath("/drivetechadmin/akun");
  return successState(`Akun ${parsed.data.username} dibuat.`);
}

/** Ganti sandi akun mana pun (khusus superadmin). */
export async function gantiSandiAkunAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

  const parsed = gantiSandiAkunSchema.safeParse({
    id: teks(form, "id"),
    password: teks(form, "password"),
  });
  if (!parsed.success) return galatPertama(parsed.error);

  const result = await setSandiAkun(parsed.data.id, parsed.data.password);
  if (!result.ok) return errorState(result.error);
  await catatLog(gate.data.id, "ganti_sandi_akun", result.data);

  return successState(`Sandi ${result.data} diganti.`);
}

/** Nonaktifkan atau aktifkan lagi sebuah akun (khusus superadmin; field "aktif" = "1" untuk mengaktifkan). */
export async function setAkunAktifAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

  const aktif = teks(form, "aktif") === "1";
  const result = await setAkunAktif(teks(form, "id"), aktif, gate.data.id);
  if (!result.ok) return errorState(result.error);
  await catatLog(gate.data.id, aktif ? "aktifkan_akun" : "nonaktifkan_akun", result.data);

  revalidatePath("/drivetechadmin/akun");
  return successState(aktif ? "Akun diaktifkan lagi." : "Akun dinonaktifkan.");
}

/** Ganti sandi sendiri di /drivetechadmin/pengaturan (semua admin, butuh sandi lama). */
export async function gantiSandiSendiriAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = gantiSandiSendiriSchema.safeParse({
    sandiLama: teks(form, "sandiLama"),
    sandiBaru: teks(form, "sandiBaru"),
  });
  if (!parsed.success) return galatPertama(parsed.error);

  // Sesi yang jatuh ke tangan orang lain tidak boleh dipakai menebak sandi lama tanpa batas.
  if (!(await rateLimitShared(`sandi:${admin.id}`, 5, 600))) {
    return errorState("Terlalu banyak percobaan. Coba lagi dalam 10 menit.");
  }

  const result = await gantiSandiSendiri(admin.id, parsed.data.sandiLama, parsed.data.sandiBaru);
  if (!result.ok) return errorState(result.error);
  await catatLog(admin.id, "ganti_sandi_sendiri");

  return successState("Sandi diganti.");
}

/* ------------------------------------------------------------------ */
/* Penarikan saldo                                                     */
/* ------------------------------------------------------------------ */

/** Catat penarikan saldo di /drivetechadmin/penarikan (khusus superadmin). */
export async function tambahPenarikanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

  const parsed = tambahPenarikanSchema.safeParse({
    tanggal: teks(form, "tanggal"),
    nominal: teks(form, "nominal"),
    catatan: teks(form, "catatan"),
  });
  if (!parsed.success) return galatPertama(parsed.error);

  const result = await tambahPenarikan(parsed.data, gate.data.id);
  if (!result.ok) return errorState(result.error);
  await catatLog(
    gate.data.id,
    "catat_penarikan",
    `Rp${parsed.data.nominal} tanggal ${parsed.data.tanggal} ${parsed.data.catatan}`.trim(),
  );

  revalidatePath("/drivetechadmin/penarikan");
  return successState("Penarikan dicatat.");
}

/** Hapus satu catatan penarikan (khusus superadmin). */
export async function hapusPenarikanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

  const result = await hapusPenarikan(teks(form, "id"));
  if (!result.ok) return errorState(result.error);
  await catatLog(
    gate.data.id,
    "hapus_penarikan",
    `Rp${result.data.nominal} tanggal ${result.data.tanggal}`,
  );

  revalidatePath("/drivetechadmin/penarikan");
  return successState("Catatan dihapus.");
}

/* ------------------------------------------------------------------ */
/* Registrasi ulang hari-H                                             */
/* ------------------------------------------------------------------ */

/** Tandai hadir atau batalkan tandanya di /drivetechadmin/regulang (admin dan superadmin). */
export async function setHadirAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = setHadirSchema.safeParse({
    bookingId: teks(form, "bookingId"),
    tanggal: teks(form, "tanggal"),
    hadir: teks(form, "hadir"),
  });
  if (!parsed.success) return galatPertama(parsed.error);

  const hadir = parsed.data.hadir === "1";
  const result = await setHadir(parsed.data.bookingId, parsed.data.tanggal, hadir, admin.id);
  if (!result.ok) return errorState(result.error);
  await catatLog(
    admin.id,
    hadir ? "tandai_hadir" : "batal_hadir",
    `${result.data} tanggal ${parsed.data.tanggal}`,
  );

  revalidatePath("/drivetechadmin/regulang");
  return successState(hadir ? "Ditandai hadir." : "Tanda hadir dibatalkan.");
}
