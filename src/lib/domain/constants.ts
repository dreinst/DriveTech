import type { SlotStatus, ZoneType } from "@/lib/types/database";

/**
 * Data event di-hardcode: sistem ini khusus untuk satu gelaran (keputusan di .md).
 * Model per tanggal: TIDAK ada lagi startDate/endDate — jadwal ditampilkan lewat
 * scheduleText, dan tanggal konkretnya diambil dari tabel event_dates.
 */
export const EVENT_INFO = {
  name: "Drive Tech",
  location: "Kampung Tentara, Singosari, Malang",
  /** Tautan Google Maps lokasi — tampilkan "Lihat di Google Maps" (_blank, rel noopener). */
  mapsUrl: "https://maps.app.goo.gl/g3tuQ5juNDEVowEp7",
  /**
   * URL embed Google Maps TANPA API key untuk iframe peta di section kontak.
   * Lokasi resmi: Rest Area Singosari Malang (alias Kampung Tentara).
   */
  mapsEmbedUrl: "https://www.google.com/maps?q=-7.8773823,112.6773862&z=16&output=embed",
  scheduleText: "Setiap Sabtu & Minggu mulai 12 September 2026",
  organizer: "Panitia Drive Tech",
  contact: "08123456789",
  description:
    "Pasar otomotif akhir pekan di Kota Malang: pilih tanggal, pilih zona, lalu booking lapak langsung dari denah.",
} as const;

/** Rekening tujuan untuk pembayaran biaya admin via transfer. */
export const BANK_ACCOUNT = {
  bankName: "Bank BCA",
  accountNumber: "1234567890",
  accountName: "Panitia Pameran Mobil & Motor",
} as const;

/**
 * SUMBER KEBENARAN TUNGGAL zona yang tidak bisa dibooking online.
 * facility memang tidak disewakan; warung SEMENTARA ditutup untuk booking online
 * (keputusan produk) — denah, saran slot, dan service booking semua merujuk ke sini.
 */
export const NON_BOOKABLE_ZONE_TYPES = ["facility", "warung"] as const satisfies readonly ZoneType[];

/** True kalau tipe zona bisa dibooking online. */
export function isBookableZoneType(z: ZoneType): boolean {
  return !(NON_BOOKABLE_ZONE_TYPES as readonly ZoneType[]).includes(z);
}

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

/**
 * Gaya slot yang sedang DIPILIH pengguna di denah (status "Dipilih" biru ala
 * mockup auto_market_weekend): isi biru lembut + garis & teks biru aksen.
 */
export const SLOT_SELECTED_STYLE = {
  // Terpilih: isi oranye aksen + garis TEBAL HITAM — sengaja bukan garis oranye,
  // supaya tidak tertukar dengan status "Tertunda" (amber) di peta.
  fill: "rgba(255,140,0,0.20)",
  stroke: "#0A0A0A",
  text: "#0A0A0A",
} as const;

/** Bucket publik Supabase Storage untuk bukti transfer. */
export const STORAGE_BUCKET_BUKTI = "bukti-transfer";

/** Bucket publik Supabase Storage untuk foto kendaraan di katalog. */
export const STORAGE_BUCKET_FOTO_KENDARAAN = "foto-kendaraan";

/** Batas ukuran unggahan bukti transfer: 2 MB. */
export const MAX_PROOF_BYTES = 2 * 1024 * 1024;

/**
 * Zona yang slotnya memuat kendaraan untuk dijual — booking di zona ini WAJIB
 * menyertakan data kendaraan (nama, plat, harga, 1 foto) dan tampil di /katalog
 * setelah pembayarannya diverifikasi.
 */
export const VEHICLE_ZONE_TYPES = [
  "mobil_baru",
  "mobil_bekas",
  "mobil_motor_bekas",
] as const satisfies readonly ZoneType[];

/** True kalau tipe zona memuat kendaraan (katalog + field kendaraan di form). */
export function isVehicleZoneType(z: ZoneType): boolean {
  return (VEHICLE_ZONE_TYPES as readonly ZoneType[]).includes(z);
}

/** Jenis kendaraan di katalog — filter navbar "Katalog Mobil" / "Katalog Motor". */
export const VEHICLE_KIND_LABEL = { mobil: "Mobil", motor: "Motor" } as const;
export type VehicleKind = keyof typeof VEHICLE_KIND_LABEL;

/** Pilihan transmisi kendaraan di form booking & katalog. */
export const TRANSMISSION_OPTIONS = ["manual", "matic"] as const;
export type TransmissionOption = (typeof TRANSMISSION_OPTIONS)[number];

export const TRANSMISSION_LABEL: Record<TransmissionOption, string> = {
  manual: "Manual",
  matic: "Matic",
};

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
