"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  overrideSlotStatus,
  rejectPayment,
  setCommissionPaid,
  updateLeasingApplication,
  upsertPartner,
  verifyPayment,
  type LeasingApplicationPatch,
} from "@/lib/services/admin";
import { requireAdmin, signInAdmin, signOutAdmin } from "@/lib/services/auth";
import {
  adminLoginSchema,
  overrideSlotSchema,
  rejectPaymentSchema,
  updateLeasingSchema,
  upsertPartnerSchema,
  verifyPaymentSchema,
  zodFieldErrors,
} from "@/lib/validation/schemas";
import { errorState, successState, type ActionState } from "./state";

/* ------------------------------------------------------------------ */
/* Utilitas internal                                                   */
/* ------------------------------------------------------------------ */

/** Terima (prevState, formData) dari useActionState maupun (formData) dari <form action>. */
function ambilFormData(prevState: ActionState, formData: FormData): FormData {
  if (formData instanceof FormData) return formData;
  const kandidat = prevState as unknown;
  if (kandidat instanceof FormData) return kandidat;
  return new FormData();
}

function teks(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Hanya izinkan tujuan internal supaya tidak bisa dipakai open redirect. */
function tujuanAman(next: string): string {
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/admin";
}

/** Segarkan seluruh halaman admin yang menampilkan data slot/booking. */
function revalidateAdmin(): void {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/slots");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/tenants");
  revalidatePath("/admin/leasing");
}

/* ------------------------------------------------------------------ */
/* Autentikasi                                                         */
/* ------------------------------------------------------------------ */

/** Login admin di /admin/login. */
export async function adminLoginAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);

  const parsed = adminLoginSchema.safeParse({
    email: teks(form, "email"),
    password: teks(form, "password"),
  });
  if (!parsed.success) {
    return errorState("Periksa kembali email dan kata sandi.", zodFieldErrors(parsed.error));
  }

  const result = await signInAdmin(parsed.data.email, parsed.data.password);
  if (!result.ok) return errorState(result.error);

  const tujuan = tujuanAman(teks(form, "next"));
  revalidatePath("/admin");

  // redirect() melempar NEXT_REDIRECT — jangan dibungkus try/catch.
  redirect(tujuan);

  // Tidak pernah tercapai: redirect() melempar NEXT_REDIRECT.
  return { status: "success" };
}

/**
 * Logout admin. Tipe parameternya sengaja longgar supaya bisa dipakai lewat
 * useActionState maupun langsung sebagai <form action={adminLogoutAction}>.
 */
export async function adminLogoutAction(
  prevState?: ActionState | FormData,
  formData?: FormData,
): Promise<ActionState> {
  void prevState;
  void formData;

  await signOutAdmin();
  revalidatePath("/admin");

  redirect("/admin/login");

  // Tidak pernah tercapai: redirect() melempar NEXT_REDIRECT.
  return { status: "success" };
}

/* ------------------------------------------------------------------ */
/* Slot                                                                */
/* ------------------------------------------------------------------ */

/** Override manual status slot di /admin/slots. */
export async function overrideSlotStatusAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  await requireAdmin();

  const parsed = overrideSlotSchema.safeParse({
    slotId: teks(form, "slotId"),
    status: teks(form, "status"),
  });
  if (!parsed.success) {
    return errorState("Data slot tidak valid.", zodFieldErrors(parsed.error));
  }

  const result = await overrideSlotStatus(parsed.data.slotId, parsed.data.status);
  if (!result.ok) return errorState(result.error);

  revalidateAdmin();
  return successState("Status slot berhasil diperbarui.");
}

/* ------------------------------------------------------------------ */
/* Verifikasi pembayaran                                               */
/* ------------------------------------------------------------------ */

/** Setujui bukti pembayaran biaya admin di /admin/bookings. */
export async function verifyPaymentAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  const admin = await requireAdmin();

  const parsed = verifyPaymentSchema.safeParse({ paymentId: teks(form, "paymentId") });
  if (!parsed.success) {
    return errorState("Data pembayaran tidak valid.", zodFieldErrors(parsed.error));
  }

  const result = await verifyPayment(parsed.data.paymentId, admin.id);
  if (!result.ok) return errorState(result.error);

  revalidateAdmin();
  return successState("Pembayaran diverifikasi, slot dikunci sebagai terisi.");
}

/** Tolak bukti pembayaran beserta alasannya. */
export async function rejectPaymentAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  const admin = await requireAdmin();

  const parsed = rejectPaymentSchema.safeParse({
    paymentId: teks(form, "paymentId"),
    reason: teks(form, "reason"),
  });
  if (!parsed.success) {
    return errorState("Alasan penolakan wajib diisi.", zodFieldErrors(parsed.error));
  }

  const result = await rejectPayment(parsed.data.paymentId, admin.id, parsed.data.reason);
  if (!result.ok) return errorState(result.error);

  revalidateAdmin();
  return successState("Pembayaran ditolak. Tenant bisa mengunggah bukti baru.");
}

/* ------------------------------------------------------------------ */
/* Leasing                                                             */
/* ------------------------------------------------------------------ */

/** Perbarui status/DP/tenor/komisi satu pengajuan leasing di /admin/leasing. */
export async function updateLeasingApplicationAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  await requireAdmin();

  const parsed = updateLeasingSchema.safeParse({
    id: teks(form, "id"),
    status: teks(form, "status") || undefined,
    dpAmount: teks(form, "dpAmount"),
    tenorBulan: teks(form, "tenorBulan"),
    commissionAmount: teks(form, "commissionAmount"),
    // Checkbox tak dicentang tidak terkirim. Supaya update lain tidak diam-diam
    // mereset flag komisi, kolom ini hanya ikut dipatch kalau formnya memang
    // mengelolanya: checkbox tercentang, atau ada penanda "commissionPaidPresent".
    commissionPaid:
      form.has("commissionPaid") || form.has("commissionPaidPresent")
        ? form.get("commissionPaid")
        : undefined,
    notes: teks(form, "notes"),
  });
  if (!parsed.success) {
    return errorState("Periksa kembali isian pengajuan.", zodFieldErrors(parsed.error));
  }

  const patch: LeasingApplicationPatch = {};
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.dpAmount !== undefined) patch.dp_amount = parsed.data.dpAmount;
  if (parsed.data.tenorBulan !== undefined) patch.tenor_bulan = parsed.data.tenorBulan;
  if (parsed.data.commissionAmount !== undefined) {
    patch.commission_amount = parsed.data.commissionAmount;
  }
  if (parsed.data.commissionPaid !== undefined) patch.commission_paid = parsed.data.commissionPaid;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;

  const result = await updateLeasingApplication(parsed.data.id, patch);
  if (!result.ok) return errorState(result.error);

  revalidatePath("/admin");
  revalidatePath("/admin/leasing");
  return successState("Pengajuan leasing berhasil diperbarui.");
}

/** Centang/lepas centang komisi sudah dibayar. */
export async function setCommissionPaidAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  await requireAdmin();

  const id = teks(form, "id");
  if (id.length === 0) return errorState("ID pengajuan tidak valid.", { id: "ID wajib diisi." });

  const nilai = form.get("paid");
  const paid = nilai === "on" || nilai === "true" || nilai === "1";

  const result = await setCommissionPaid(id, paid);
  if (!result.ok) return errorState(result.error);

  revalidatePath("/admin");
  revalidatePath("/admin/leasing");
  return successState(paid ? "Komisi ditandai sudah dibayar." : "Komisi ditandai belum dibayar.");
}

/** Tambah atau perbarui partner leasing. */
export async function upsertPartnerAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  await requireAdmin();

  const parsed = upsertPartnerSchema.safeParse({
    id: teks(form, "id"),
    name: teks(form, "name"),
    contact: teks(form, "contact"),
    commissionRate: teks(form, "commissionRate"),
    // Form partner WAJIB merender checkbox "isActive" (semantik checkbox biasa:
    // tercentang = aktif, tidak tercentang = nonaktif).
    isActive: form.get("isActive"),
  });
  if (!parsed.success) {
    return errorState("Periksa kembali data partner.", zodFieldErrors(parsed.error));
  }

  const result = await upsertPartner(parsed.data);
  if (!result.ok) return errorState(result.error);

  revalidatePath("/admin/leasing");
  return successState("Data partner leasing tersimpan.");
}
