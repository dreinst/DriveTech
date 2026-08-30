import { z } from "zod";

import { TENOR_OPTIONS } from "@/lib/domain/constants";

/**
 * Skema zod untuk semua input publik & admin. Dipakai service, server action,
 * dan route handler supaya pesan error konsisten (bahasa Indonesia).
 */

/* ---------- Helper ---------- */

/** FormData mengirim "" untuk field kosong; ubah jadi undefined agar .optional() jalan. */
const emptyToUndefined = (value: unknown): unknown => {
  if (value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

const optionalText = z.preprocess(emptyToUndefined, z.string().trim().optional());

const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.email("Format email tidak valid.").optional(),
);

/**
 * URL http/https saja. z.url() polos menerima skema apa pun — termasuk
 * `javascript:` — dan proof_url dirender sebagai tautan di panel admin
 * (temuan audit: stored XSS via POST /api/bookings/[id]/payment).
 */
const httpUrl = z
  .url("Tautan tidak valid.")
  .refine((value) => /^https?:\/\//i.test(value), "Tautan harus diawali http(s)://.");

const optionalUrl = z.preprocess(emptyToUndefined, httpUrl.optional());

const optionalPositiveNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number().positive("Nilai harus lebih besar dari 0.").optional(),
);

const optionalNonNegativeNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number().min(0, "Nilai tidak boleh negatif.").optional(),
);

/** Checkbox HTML mengirim "on" saat dicentang dan tidak mengirim apa pun saat tidak. */
const checkboxBoolean = z.preprocess(
  (value) => value === true || value === "on" || value === "true" || value === "1",
  z.boolean(),
);

/**
 * Nomor Indonesia: boleh diawali +62 / 62 / 0. Spasi & tanda pisah diabaikan,
 * lalu DINORMALKAN ke bentuk lokal berawalan 0 ("+62812…" -> "0812…") supaya
 * "0812…" dan "+62812…" dikenali sebagai tenant yang sama (temuan audit).
 */
const PHONE_PATTERN = /^0[0-9]{8,15}$/;

const phone = z
  .string()
  .trim()
  .transform((value) => {
    const digits = value.replace(/[\s().-]/g, "");
    const tanpaKode = digits.replace(/^(?:\+62|62)/, "");
    if (tanpaKode === digits) return digits; // sudah format lokal (atau bukan nomor +62)
    return tanpaKode.startsWith("0") ? tanpaKode : `0${tanpaKode}`;
  })
  .pipe(
    z
      .string()
      .regex(PHONE_PATTERN, "Nomor telepon tidak valid. Contoh: 081234567890 atau +6281234567890."),
  );

const uuid = (label: string) => z.uuid(`${label} tidak valid.`);

/** Tanggal kalender polos "YYYY-MM-DD" (tanpa jam / zona waktu). */
const TANGGAL_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const tanggal = z
  .string()
  .regex(TANGGAL_PATTERN, "Format tanggal harus YYYY-MM-DD.");

/* ---------- Booking (tenant sewa slot) ---------- */

/**
 * Data kendaraan untuk katalog publik — WAJIB saat booking slot zona kendaraan
 * (mobil_baru / mobil_bekas / mobil_motor_bekas); service yang menegakkannya
 * karena butuh tipe zona slot. photoUrl diisi action setelah unggah foto.
 */
export const vehicleInfoSchema = z.object({
  vehicleName: z.string().trim().min(2, "Nama kendaraan minimal 2 karakter."),
  /** mobil | motor — hanya bisa dipilih di zona campuran; default mobil di service. */
  kind: z.preprocess(
    emptyToUndefined,
    z.enum(["mobil", "motor"], { error: "Jenis kendaraan tidak valid." }).optional(),
  ),
  /**
   * OPSIONAL: zona mobil_baru tidak memakai plat (mobil baru belum berplat).
   * Zona kendaraan bekas tetap mewajibkannya — ditegakkan createBooking karena
   * butuh tipe zona slot. Kalau diisi, tetap divalidasi 3-12 karakter.
   */
  plateNumber: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(3, "Nomor plat minimal 3 karakter.")
      .max(12, "Nomor plat maksimal 12 karakter.")
      .transform((value) => value.toUpperCase().replace(/\s+/g, " "))
      .optional(),
  ),
  price: z.coerce
    .number({ error: "Harga harus berupa angka." })
    .positive("Harga harus lebih besar dari 0."),
  year: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int("Tahun harus bilangan bulat.")
      .min(1950, "Tahun tidak valid.")
      .max(2100, "Tahun tidak valid.")
      .optional(),
  ),
  mileageKm: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int("Kilometer harus bilangan bulat.")
      .min(0, "Kilometer tidak boleh negatif.")
      .optional(),
  ),
  transmission: z.preprocess(
    emptyToUndefined,
    z.enum(["manual", "matic"], { error: "Transmisi tidak valid." }).optional(),
  ),
  color: optionalText,
  description: optionalText,
  photoUrl: z
    .url("Foto kendaraan wajib diunggah.")
    .refine((value) => /^https?:\/\//i.test(value), "Tautan foto harus diawali http(s)://."),
});

export const createBookingSchema = z.object({
  slotId: uuid("ID slot"),
  /** Tanggal weekend yang disewa (model per tanggal), minimal satu. */
  eventDates: z
    .array(tanggal)
    .min(1, "Pilih minimal satu tanggal.")
    .max(16, "Maksimal 16 tanggal per booking."),
  tenantName: z.string().trim().min(2, "Nama minimal 2 karakter."),
  tenantPhone: phone,
  tenantEmail: optionalEmail,
  /**
   * WAJIB memuat SEMUA nilai enum tenant_type di database. "mitra_booth" sempat
   * tertinggal saat zona booth_khusus ditambahkan (2026-08-29) sehingga setiap
   * booking slot Booth Leasing & Brand Otomotif selalu ditolak "Tipe tenant
   * tidak valid" — 10 slot x Rp500.000/tanggal tidak bisa dipesan sama sekali.
   * Kalau menambah tipe tenant baru, tambahkan di sini juga.
   */
  tenantType: z.enum(["dealer_mobil_baru", "individu_bekas", "umkm", "mitra_booth", "warung"], {
    error: "Tipe tenant tidak valid.",
  }),
  detail: z.record(z.string(), z.unknown()).optional(),
  notes: optionalText,
  /** Wajib untuk zona kendaraan — ditegakkan createBooking (butuh tipe zona). */
  vehicle: vehicleInfoSchema.optional(),
});

export const submitPaymentSchema = z
  .object({
    bookingId: uuid("ID booking"),
    // Opsi cash dihapus (keputusan pemilik, 2026-08-28): booking hanya dikunci
    // lewat transfer + bukti. Enum DB masih menyimpan 'cash' untuk data lama.
    method: z.literal("transfer", { error: "Pembayaran hanya menerima transfer bank." }),
    proofUrl: optionalUrl,
  })
  .superRefine((value, ctx) => {
    if (value.method === "transfer" && !value.proofUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["proofUrl"],
        message: "Bukti transfer wajib diunggah untuk metode transfer.",
      });
    }
  });

export const cancelBookingSchema = z.object({
  bookingId: uuid("ID booking"),
});

/** Pembatalan booking oleh admin — wajib alasan (tercatat & dikirim ke tenant). */
export const adminCancelBookingSchema = z.object({
  bookingId: uuid("ID booking"),
  reason: z.string().trim().min(3, "Alasan pembatalan minimal 3 karakter."),
});

/* ---------- Pembelian unit & leasing ---------- */

export const createPurchaseSchema = z.object({
  slotId: uuid("ID slot"),
  buyerName: z.string().trim().min(2, "Nama pembeli minimal 2 karakter."),
  buyerPhone: phone,
  paymentMethod: z.enum(["cash", "transfer", "credit"], {
    error: "Metode pembayaran tidak valid.",
  }),
  unitDescription: optionalText,
  unitPrice: optionalPositiveNumber,
  notes: optionalText,
});

export const submitLeasingSchema = z.object({
  purchaseTransactionId: uuid("ID transaksi"),
  leasingPartnerId: uuid("ID partner leasing"),
  dpAmount: z.coerce.number().min(0, "DP tidak boleh negatif."),
  tenorBulan: z.coerce
    .number()
    .int("Tenor harus bilangan bulat.")
    .refine((value) => TENOR_OPTIONS.includes(value), "Tenor yang dipilih tidak tersedia."),
  notes: optionalText,
});

/* ---------- Admin ---------- */

/**
 * Login admin memakai USERNAME (mis. "Administrator"), bukan email — form sengaja
 * disederhanakan (keputusan pemilik). Username dipetakan ke email internal
 * Supabase Auth di services/auth.ts (usernameToAdminEmail). Karakter dibatasi
 * huruf/angka/titik/underscore/strip agar aman menjadi bagian local-part email.
 */
export const adminLoginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username minimal 3 karakter.")
    .max(50, "Username maksimal 50 karakter.")
    .regex(/^[A-Za-z0-9._-]+$/, "Username hanya boleh huruf, angka, titik, underscore, atau strip."),
  password: z.string().min(6, "Kata sandi minimal 6 karakter."),
});

export const overrideSlotSchema = z.object({
  slotId: uuid("ID slot"),
  status: z.enum(["available", "pending", "confirmed"], { error: "Status slot tidak valid." }),
});

export const verifyPaymentSchema = z.object({
  paymentId: uuid("ID pembayaran"),
});

export const rejectPaymentSchema = z.object({
  paymentId: uuid("ID pembayaran"),
  reason: z.string().trim().min(3, "Alasan penolakan minimal 3 karakter."),
});

export const updateLeasingSchema = z.object({
  id: uuid("ID pengajuan leasing"),
  status: z
    .enum(["submitted", "verifying", "approved", "rejected", "completed"], {
      error: "Status pengajuan tidak valid.",
    })
    .optional(),
  dpAmount: optionalNonNegativeNumber,
  tenorBulan: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int("Tenor harus bilangan bulat.").positive("Tenor harus lebih dari 0.").optional(),
  ),
  commissionAmount: optionalNonNegativeNumber,
  commissionPaid: checkboxBoolean.optional(),
  notes: optionalText,
});

/** Tambah satu tanggal gelaran baru di admin. */
export const addEventDateSchema = z.object({
  date: tanggal,
});

export const updateZoneFeeSchema = z.object({
  zoneId: uuid("ID zona"),
  adminFee: z.coerce
    .number({ error: "Biaya admin harus berupa angka." })
    .min(0, "Biaya admin tidak boleh negatif."),
});

export const upsertPartnerSchema = z.object({
  id: z.preprocess(emptyToUndefined, z.uuid("ID partner tidak valid.").optional()),
  name: z.string().trim().min(2, "Nama partner minimal 2 karakter."),
  contact: optionalText,
  commissionRate: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .min(0, "Komisi tidak boleh negatif.")
      .max(100, "Komisi maksimal 100%.")
      .optional(),
  ),
  isActive: checkboxBoolean.optional(),
});

/* ---------- Tipe input ---------- */

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type VehicleInfoInput = z.infer<typeof vehicleInfoSchema>;
export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type AdminCancelBookingInput = z.infer<typeof adminCancelBookingSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type SubmitLeasingInput = z.infer<typeof submitLeasingSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type OverrideSlotInput = z.infer<typeof overrideSlotSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;
export type UpdateLeasingInput = z.infer<typeof updateLeasingSchema>;
export type AddEventDateInput = z.infer<typeof addEventDateSchema>;
export type UpdateZoneFeeInput = z.infer<typeof updateZoneFeeSchema>;
export type UpsertPartnerInput = z.infer<typeof upsertPartnerSchema>;

/** Ambil pesan error pertama per nama field, siap dipakai ActionState.fieldErrors. */
export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}
