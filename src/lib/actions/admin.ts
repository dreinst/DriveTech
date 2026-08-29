"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addEventDate,
  adminCancelBooking,
  overrideSlotStatus,
  rejectPayment,
  setCommissionPaid,
  setEventDateActive,
  updateLeasingApplication,
  updateZoneFee,
  upsertPartner,
  verifyPayment,
  type LeasingApplicationPatch,
} from "@/lib/services/admin";
import { setVehicleVisibility } from "@/lib/services/catalog";
import { requireAdmin, requireFullAdmin, signInAdmin, signOutAdmin } from "@/lib/services/auth";
import { tujuanAdminAman } from "@/lib/utils";
import {
  addEventDateSchema,
  adminCancelBookingSchema,
  adminLoginSchema,
  overrideSlotSchema,
  rejectPaymentSchema,
  updateLeasingSchema,
  updateZoneFeeSchema,
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
    username: teks(form, "username"),
    password: teks(form, "password"),
  });
  if (!parsed.success) {
    return errorState("Periksa kembali username dan kata sandi.", zodFieldErrors(parsed.error));
  }

  const result = await signInAdmin(parsed.data.username, parsed.data.password);
  if (!result.ok) return errorState(result.error);

  const tujuan = tujuanAdminAman(teks(form, "next"));
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
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

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

/** Tampilkan / sembunyikan satu kendaraan dari katalog publik (/admin/bookings). */
export async function setVehicleVisibilityAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

  const listingId = teks(form, "listingId");
  if (listingId.length === 0) {
    return errorState("ID listing tidak valid.", { listingId: "ID wajib diisi." });
  }
  const nilai = form.get("visible");
  const visible = nilai === "on" || nilai === "true" || nilai === "1";

  const result = await setVehicleVisibility(listingId, visible);
  if (!result.ok) return errorState(result.error);

  revalidatePath("/katalog");
  revalidatePath("/admin/bookings");
  return successState(
    visible ? "Kendaraan ditampilkan di katalog." : "Kendaraan disembunyikan dari katalog.",
  );
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
  return successState("Pembayaran diverifikasi, booking dikonfirmasi.");
}

/** Batalkan booking dari dashboard admin (wajib alasan; tenant diberi tahu). */
export async function adminCancelBookingAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

  const parsed = adminCancelBookingSchema.safeParse({
    bookingId: teks(form, "bookingId"),
    reason: teks(form, "reason"),
  });
  if (!parsed.success) {
    return errorState("Alasan pembatalan wajib diisi.", zodFieldErrors(parsed.error));
  }

  const result = await adminCancelBooking(parsed.data.bookingId, parsed.data.reason);
  if (!result.ok) return errorState(result.error);

  revalidateAdmin();
  return successState("Booking dibatalkan. Tanggal sewa dilepas dan tenant diberi tahu.");
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
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

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
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

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
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

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

/* ------------------------------------------------------------------ */
/* Tanggal gelaran                                                     */
/* ------------------------------------------------------------------ */

/** Tambah tanggal gelaran baru di /admin/pengaturan (field form: "date"). */
export async function addEventDateAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

  const parsed = addEventDateSchema.safeParse({ date: teks(form, "date") });
  if (!parsed.success) {
    return errorState("Periksa kembali tanggal yang diisi.", zodFieldErrors(parsed.error));
  }

  const result = await addEventDate(parsed.data.date);
  if (!result.ok) return errorState(result.error);

  revalidatePath("/");
  revalidatePath("/admin/pengaturan");
  return successState("Tanggal gelaran ditambahkan.");
}

/** Aktifkan / nonaktifkan satu tanggal gelaran (field form: "id", "active"). */
export async function setEventDateActiveAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

  const id = teks(form, "id");
  if (id.length === 0) return errorState("ID tanggal tidak valid.", { id: "ID wajib diisi." });

  const nilai = teks(form, "active");
  const active = nilai === "on" || nilai === "true" || nilai === "1";

  const result = await setEventDateActive(id, active);
  if (!result.ok) return errorState(result.error);

  revalidatePath("/");
  revalidatePath("/admin/pengaturan");
  return successState(active ? "Tanggal gelaran diaktifkan." : "Tanggal gelaran dinonaktifkan.");
}

/* ------------------------------------------------------------------ */
/* Pengaturan                                                          */
/* ------------------------------------------------------------------ */

/** Simpan biaya admin satu zona di /admin/pengaturan. */
export async function updateZoneFeeAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  const gate = await requireFullAdmin();
  if (!gate.ok) return errorState(gate.error);

  const parsed = updateZoneFeeSchema.safeParse({
    zoneId: teks(form, "zoneId"),
    adminFee: teks(form, "adminFee"),
  });
  if (!parsed.success) {
    return errorState("Periksa kembali biaya admin.", zodFieldErrors(parsed.error));
  }

  const result = await updateZoneFee(parsed.data.zoneId, parsed.data.adminFee);
  if (!result.ok) return errorState(result.error);

  // Biaya tampil di denah publik, dashboard, dan halaman pengaturan.
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/pengaturan");
  revalidatePath("/admin/slots");
  return successState("Biaya admin zona tersimpan.");
}
