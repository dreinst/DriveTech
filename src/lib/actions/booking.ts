"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  isVehicleZoneType,
  MAX_PROOF_BYTES,
  STORAGE_BUCKET_BUKTI,
  STORAGE_BUCKET_FOTO_KENDARAAN,
} from "@/lib/domain/constants";
import { TENANT_TYPE_BY_ZONE_TYPE } from "@/lib/domain/labels";
import {
  cancelBooking,
  createBooking,
  getBookingByCode,
  getBookingDetail,
  submitPayment,
} from "@/lib/services/booking";
import { getSlotDetail } from "@/lib/services/slots";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import {
  cancelBookingSchema,
  createBookingSchema,
  submitPaymentSchema,
  zodFieldErrors,
} from "@/lib/validation/schemas";
import { errorState, type ActionState } from "./state";

/* ------------------------------------------------------------------ */
/* Utilitas internal                                                   */
/* ------------------------------------------------------------------ */

/**
 * React memanggil action dengan (prevState, formData) lewat useActionState,
 * tapi <form action={fn}> hanya mengirim (formData). Pembaca ini menerima keduanya.
 */
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

/** Field bebas dengan awalan "detail." dikumpulkan ke kolom jsonb tenants.detail. */
function ambilDetail(formData: FormData): Record<string, unknown> {
  const detail: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("detail.")) continue;
    const nama = key.slice("detail.".length).trim();
    if (nama.length === 0 || typeof value !== "string") continue;
    if (value.trim().length === 0) continue;
    detail[nama] = value.trim();
  }
  return detail;
}

/**
 * KONTRAK FORM (diikuti agen UI): tanggal-tanggal terpilih dikirim lewat SATU
 * hidden input name="eventDates" berisi JSON array string "YYYY-MM-DD",
 * mis. <input type="hidden" name="eventDates" value='["2026-08-29","2026-08-30"]' />.
 * Pembaca ini toleran: kalau bukan JSON array yang valid, hasilnya [] dan
 * validasi zod yang memberi pesan errornya.
 */
function ambilEventDates(formData: FormData): string[] {
  const mentah = formData.get("eventDates");
  if (typeof mentah !== "string" || mentah.trim().length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(mentah);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

const JENIS_BUKTI_DIIZINKAN = ["image/jpeg", "image/png", "image/webp"];

/**
 * URL sementara agar skema (photoUrl wajib http/https) bisa divalidasi SEBELUM
 * foto diunggah; tidak pernah tersimpan — diganti URL storage asli usai unggah.
 */
const FOTO_PLACEHOLDER_URL = "https://placeholder.invalid/foto-kendaraan.jpg";

function ekstensiBukti(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/* ------------------------------------------------------------------ */
/* Action                                                              */
/* ------------------------------------------------------------------ */

/** Form data tenant di /booking/[slotId]. */
export async function createBookingAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  const slotId = teks(form, "slotId");

  // Tipe tenant ditentukan tipe zona slot; nilai dari form hanya cadangan.
  let tenantType = teks(form, "tenantType");
  let zonaKendaraan = false;
  if (slotId.length > 0) {
    const slot = await getSlotDetail(slotId);
    if (slot.ok) {
      const otomatis = TENANT_TYPE_BY_ZONE_TYPE[slot.data.zone.zone_type];
      if (otomatis) tenantType = otomatis;
      zonaKendaraan = isVehicleZoneType(slot.data.zone.zone_type);
    }
  }

  // Zona kendaraan: berkas dicek dan skema divalidasi DULU, foto baru diunggah
  // setelah seluruh isian lolos — supaya form ini tidak bisa dipakai menumpang
  // unggah gambar dengan isian asal-asalan (temuan audit 2026-08-29). Skema
  // divalidasi memakai URL placeholder; URL asli dipasang setelah unggah.
  let fotoKendaraan: File | null = null;
  let fotoKendaraanKecil: File | null = null;
  let vehicle: Record<string, unknown> | undefined;
  if (zonaKendaraan) {
    const fotoMentah = form.get("vehiclePhoto");
    const foto = fotoMentah instanceof File && fotoMentah.size > 0 ? fotoMentah : null;
    if (foto === null) {
      return errorState("Foto kendaraan wajib diunggah.", {
        vehiclePhoto: "Unggah 1 foto terbaik kendaraan Anda.",
      });
    }
    if (foto.size > MAX_PROOF_BYTES) {
      return errorState("Ukuran foto kendaraan maksimal 2 MB.", {
        vehiclePhoto: "Ukuran foto maksimal 2 MB.",
      });
    }
    if (!JENIS_BUKTI_DIIZINKAN.includes(foto.type)) {
      return errorState("Format foto kendaraan harus JPG, PNG, atau WEBP.", {
        vehiclePhoto: "Format foto harus JPG, PNG, atau WEBP.",
      });
    }

    fotoKendaraan = foto;
    // Versi kecil (kartu katalog) — opsional; divalidasi seadanya, kalau tidak
    // memenuhi syarat cukup diabaikan tanpa menggagalkan booking.
    const kecilMentah = form.get("vehiclePhotoKecil");
    fotoKendaraanKecil =
      kecilMentah instanceof File &&
      kecilMentah.size > 0 &&
      kecilMentah.size <= MAX_PROOF_BYTES &&
      JENIS_BUKTI_DIIZINKAN.includes(kecilMentah.type)
        ? kecilMentah
        : null;

    vehicle = {
      vehicleName: teks(form, "vehicleName"),
      kind: teks(form, "vehicleKind"),
      plateNumber: teks(form, "plateNumber"),
      price: teks(form, "vehiclePrice"),
      year: teks(form, "vehicleYear"),
      mileageKm: teks(form, "vehicleMileage"),
      transmission: teks(form, "vehicleTransmission"),
      color: teks(form, "vehicleColor"),
      description: teks(form, "vehicleDescription"),
      photoUrl: FOTO_PLACEHOLDER_URL,
    };
  }

  const detail = ambilDetail(form);
  const parsed = createBookingSchema.safeParse({
    slotId,
    eventDates: ambilEventDates(form),
    tenantName: teks(form, "tenantName"),
    tenantPhone: teks(form, "tenantPhone"),
    tenantEmail: teks(form, "tenantEmail"),
    tenantType,
    detail: Object.keys(detail).length > 0 ? detail : undefined,
    notes: teks(form, "notes"),
    vehicle,
  });

  if (!parsed.success) {
    return errorState("Periksa kembali isian formulir.", zodFieldErrors(parsed.error));
  }

  // Isian valid — sekarang baru foto diunggah dan URL aslinya dipasang.
  let vehicleFinal = parsed.data.vehicle;
  if (zonaKendaraan && fotoKendaraan && vehicleFinal) {
    if (!isServiceRoleConfigured()) {
      return errorState(
        "Supabase belum dikonfigurasi. Salin .env.example ke .env.local dan isi kredensialnya.",
      );
    }

    const supabase = createAdminSupabase();
    const dasar = crypto.randomUUID();
    const nama = `${dasar}.${ekstensiBukti(fotoKendaraan.type)}`;
    const unggah = await supabase.storage
      .from(STORAGE_BUCKET_FOTO_KENDARAAN)
      .upload(nama, fotoKendaraan, { contentType: fotoKendaraan.type, cacheControl: "3600" });
    if (unggah.error) {
      return errorState(`Gagal mengunggah foto kendaraan: ${unggah.error.message}`, {
        vehiclePhoto: "Foto gagal diunggah, coba lagi.",
      });
    }
    const { data } = supabase.storage.from(STORAGE_BUCKET_FOTO_KENDARAAN).getPublicUrl(nama);
    vehicleFinal = { ...vehicleFinal, photoUrl: data.publicUrl };

    // Versi kecil: BONUS, tidak pernah menggagalkan booking. Kalau unggahannya
    // gagal, kartu katalog tinggal memakai foto besar seperti sebelumnya.
    if (fotoKendaraanKecil) {
      const namaKecil = `${dasar}-kartu.${ekstensiBukti(fotoKendaraanKecil.type)}`;
      const unggahKecil = await supabase.storage
        .from(STORAGE_BUCKET_FOTO_KENDARAAN)
        .upload(namaKecil, fotoKendaraanKecil, {
          contentType: fotoKendaraanKecil.type,
          cacheControl: "3600",
        });
      if (!unggahKecil.error) {
        const kecil = supabase.storage
          .from(STORAGE_BUCKET_FOTO_KENDARAAN)
          .getPublicUrl(namaKecil);
        vehicleFinal = { ...vehicleFinal, photoThumbUrl: kecil.data.publicUrl };
      }
    }
  }

  const result = await createBooking({ ...parsed.data, vehicle: vehicleFinal });
  if (!result.ok) {
    if (result.code === "SLOT_TAKEN") return errorState(result.error, { slotId: result.error });
    if (result.code === "DATE_TAKEN") return errorState(result.error, { eventDates: result.error });
    return errorState(result.error);
  }

  revalidatePath("/");
  revalidatePath(`/booking/${parsed.data.slotId}`);
  revalidatePath("/admin/bookings");

  // redirect() melempar NEXT_REDIRECT — jangan dibungkus try/catch.
  redirect(`/booking/${result.data.bookingId}/bayar`);
  // Tidak pernah tercapai: redirect() melempar NEXT_REDIRECT.
  return { status: "success" };
}

/** Unggah bukti pembayaran QRIS di /booking/[bookingId]/bayar (metode tunggal: qris). */
export async function submitPaymentAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  const bookingId = teks(form, "bookingId");
  const method = teks(form, "method");

  const bookingResult = await getBookingDetail(bookingId);
  if (!bookingResult.ok) {
    return errorState(bookingResult.error, { bookingId: bookingResult.error });
  }
  const booking = bookingResult.data;

  let proofUrl = booking.payment?.proof_url ?? "";

  const berkasMentah = form.get("proof");
  const berkas =
    berkasMentah instanceof File && berkasMentah.size > 0 ? berkasMentah : null;

  if (method === "qris" && berkas !== null) {
    if (berkas.size > MAX_PROOF_BYTES) {
      return errorState("Ukuran bukti pembayaran maksimal 2 MB.", {
        proof: "Ukuran bukti pembayaran maksimal 2 MB.",
      });
    }
    if (!JENIS_BUKTI_DIIZINKAN.includes(berkas.type)) {
      return errorState("Format bukti pembayaran harus JPG, PNG, atau WEBP.", {
        proof: "Format bukti pembayaran harus JPG, PNG, atau WEBP.",
      });
    }
    if (!isServiceRoleConfigured()) {
      return errorState(
        "Supabase belum dikonfigurasi. Salin .env.example ke .env.local dan isi kredensialnya.",
      );
    }

    const supabase = createAdminSupabase();
    const nama = `${booking.id}-${booking.slot_id}.${ekstensiBukti(berkas.type)}`;
    const unggah = await supabase.storage.from(STORAGE_BUCKET_BUKTI).upload(nama, berkas, {
      upsert: true,
      contentType: berkas.type,
      cacheControl: "3600",
    });

    if (unggah.error) {
      return errorState(`Gagal mengunggah bukti pembayaran: ${unggah.error.message}`, {
        proof: "Bukti pembayaran gagal diunggah, coba lagi.",
      });
    }

    const { data } = supabase.storage.from(STORAGE_BUCKET_BUKTI).getPublicUrl(nama);
    proofUrl = data.publicUrl;
  }

  const parsed = submitPaymentSchema.safeParse({ bookingId, method, proofUrl });
  if (!parsed.success) {
    const errors = zodFieldErrors(parsed.error);
    // Nama field di formulir adalah "proof", sedangkan skema memakai "proofUrl".
    if (errors.proofUrl && !errors.proof) errors.proof = errors.proofUrl;
    return errorState("Periksa kembali pilihan pembayaran.", errors);
  }

  const result = await submitPayment(parsed.data);
  if (!result.ok) return errorState(result.error);

  revalidatePath(`/booking/${bookingId}/bayar`);
  revalidatePath(`/booking/${bookingId}/status`);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin");

  redirect(`/booking/${bookingId}/status`);
  // Tidak pernah tercapai: redirect() melempar NEXT_REDIRECT.
  return { status: "success" };
}

/** Batalkan booking dari halaman status; slot kembali tersedia. */
export async function cancelBookingAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  const parsed = cancelBookingSchema.safeParse({
    bookingId: teks(form, "bookingId"),
    phoneLast4: teks(form, "phoneLast4"),
  });
  if (!parsed.success) {
    return errorState("Periksa kembali isian pembatalan.", zodFieldErrors(parsed.error));
  }

  const result = await cancelBooking(parsed.data.bookingId, parsed.data.phoneLast4);
  if (!result.ok) return errorState(result.error);

  revalidatePath("/");
  revalidatePath(`/booking/${parsed.data.bookingId}/status`);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/slots");

  redirect(`/booking/${parsed.data.bookingId}/status`);
  // Tidak pernah tercapai: redirect() melempar NEXT_REDIRECT.
  return { status: "success" };
}

/** Cek status booking lewat kode "BK-XXXXXX" lalu arahkan ke halaman statusnya. */
export async function cekStatusAction(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const form = ambilFormData(prevState, formData);
  const kode = teks(form, "code").trim();

  if (kode.length === 0) {
    return errorState("Masukkan kode booking Anda.", { code: "Kode booking wajib diisi." });
  }

  const result = await getBookingByCode(kode);
  if (!result.ok) {
    return errorState(result.error, { code: result.error });
  }

  redirect(`/booking/${result.data.id}/status`);
  // Tidak pernah tercapai: redirect() melempar NEXT_REDIRECT.
  return { status: "success" };
}
