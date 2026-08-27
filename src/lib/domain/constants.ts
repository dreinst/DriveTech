import type { SlotStatus, ZoneType } from "@/lib/types/database";

/** Data event di-hardcode: sistem ini khusus untuk satu pameran (keputusan di .md). */
export const EVENT_INFO = {
  name: "Pameran Mobil & Motor Bekas",
  location: "Lapangan Utama, Kota Bandung",
  startDate: "2026-09-12",
  endDate: "2026-09-14",
  organizer: "Panitia Pameran Mobil & Motor",
  contact: "0812-3456-7890",
  description:
    "Pameran mobil baru, mobil & motor bekas, UMKM, dan kuliner. Pilih slot di denah, isi data, lalu bayar biaya admin.",
} as const;

/** Rekening tujuan untuk pembayaran biaya admin via transfer. */
export const BANK_ACCOUNT = {
  bankName: "Bank BCA",
  accountNumber: "1234567890",
  accountName: "Panitia Pameran Mobil & Motor",
} as const;

/**
 * Warna isi kotak slot pada denah ditentukan STATUS (bukan zona) supaya
 * ketersediaan tetap terbaca sekilas. Warna aksen zona ada di domain/layout.ts.
 */
export const SLOT_STATUS_STYLE: Record<SlotStatus | "facility", { fill: string; stroke: string; text: string }> = {
  available: { fill: "#dcfce7", stroke: "#16a34a", text: "#166534" },
  pending: { fill: "#fef3c7", stroke: "#d97706", text: "#92400e" },
  confirmed: { fill: "#fee2e2", stroke: "#dc2626", text: "#991b1b" },
  facility: { fill: "#e2e8f0", stroke: "#94a3b8", text: "#475569" },
};

/** Bucket publik Supabase Storage untuk bukti transfer. */
export const STORAGE_BUCKET_BUKTI = "bukti-transfer";

/** Batas ukuran unggahan bukti transfer: 2 MB. */
export const MAX_PROOF_BYTES = 2 * 1024 * 1024;

/** Pilihan tenor cicilan leasing (bulan). */
export const TENOR_OPTIONS: readonly number[] = [12, 18, 24, 36, 48, 60];

/**
 * Zona pengganti kalau zona yang dipilih penuh (aturan 2 bagian 4 arsitektur).
 *
 * Contoh yang ditulis eksplisit di .md — "Area Pameran Mobil penuh -> tawarkan Area
 * Pameran Mobil & Motor" — melintasi zone_type (mobil_bekas -> mobil_motor_bekas),
 * jadi mencocokkan zone_type saja tidak cukup. Urutan array = urutan prioritas saran.
 * Kosongkan array kalau sebuah tipe zona tidak boleh disarankan pindah.
 */
export const ZONE_TYPE_FALLBACK: Record<ZoneType, readonly ZoneType[]> = {
  // Dealer resmi tidak dicampur ke area kendaraan bekas.
  mobil_baru: [],
  mobil_bekas: ["mobil_motor_bekas"],
  mobil_motor_bekas: ["mobil_bekas"],
  // UMKM non-kuliner dan warung kuliner beda peruntukan -> tidak saling disarankan.
  umkm: [],
  warung: [],
  facility: [],
};
