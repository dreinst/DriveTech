/**
 * Paket sponsor Musim 1 — data statis untuk section "Sponsor" di beranda.
 *
 * Sumber: "Drive Tech Deck v4" slide 12–15 (2026-09-01). Angka dalam RUPIAH
 * per minggu (format dengan formatRupiah + teks "/minggu"). Harga sponsor
 * TERPISAH dari tarif sewa lapak penyewa & UMKM (zones.admin_fee).
 * Kalau deck direvisi, cukup ubah file ini.
 */

export type SponsorTier = {
  /** Slug stabil untuk key React & anchor. */
  id: "perak" | "emas" | "platina" | "zamrud";
  name: string;
  /** Keterangan tambahan di bawah nama (mis. "Sponsor Utama"). */
  tagline?: string;
  /** Jumlah slot sponsor yang tersedia di tier ini. */
  slots: number;
  /** Harga per minggu, rupiah. */
  pricePerWeek: number;
  benefits: readonly string[];
  /** Tier yang disorot sebagai penawaran utama. */
  highlighted?: boolean;
};

export type NamingRight = {
  id: string;
  name: string;
  /** Harga per minggu, rupiah. */
  pricePerWeek: number;
  /** Selalu 1 slot eksklusif per titik. */
  slots: number;
  description?: string;
};

/** Pengantar section sponsor (Deck v4 slide 1 & 15). */
export const SPONSOR_INTRO = {
  title: "Paket Sponsor Musim 1",
  points: [
    "8 minggu pilot program — eksposur berulang setiap akhir pekan, bukan satu kali tayang.",
    "Pasar mingguan gratis masuk, terbuka untuk semua kalangan.",
    "Berbasis transaksi: audiens datang untuk lihat, cek, coba, dan deal.",
  ],
  note: "Harga sponsor terpisah dari tarif sewa lapak penyewa dan UMKM.",
} as const;

/** Empat tingkatan sponsor (Deck v4 slide 12). */
export const SPONSOR_TIERS: readonly SponsorTier[] = [
  {
    id: "perak",
    name: "Perak",
    slots: 4,
    pricePerWeek: 300_000,
    benefits: ["Logo di media sosial acara", "Cocok untuk UMKM & merek kecil"],
  },
  {
    id: "emas",
    name: "Emas",
    slots: 3,
    pricePerWeek: 1_000_000,
    benefits: ["Disebutkan pembawa acara", "Logo di media sosial acara"],
  },
  {
    id: "platina",
    name: "Platina",
    slots: 2,
    pricePerWeek: 2_000_000,
    benefits: [
      "Disebutkan pembawa acara",
      "Logo di latar panggung utama",
      "Logo di media sosial acara",
    ],
  },
  {
    id: "zamrud",
    name: "Zamrud",
    tagline: "Sponsor Utama",
    slots: 1,
    pricePerWeek: 4_000_000,
    benefits: [
      "Semua manfaat Platina",
      "Sesi iklan khusus 15 menit",
      "1 konten promosi profesional",
    ],
    highlighted: true,
  },
];

/** Hak penamaan titik strategis (Deck v4 slide 14) — 1 slot per titik. */
export const NAMING_RIGHTS: readonly NamingRight[] = [
  { id: "panggung-utama", name: "Panggung Utama", pricePerWeek: 3_000_000, slots: 1 },
  { id: "senam-zumba", name: "Senam Pagi Zumba", pricePerWeek: 2_000_000, slots: 1 },
  { id: "pemeriksaan-kendaraan", name: "Pemeriksaan Kendaraan", pricePerWeek: 1_500_000, slots: 1 },
  { id: "coba-kendaraan", name: "Coba Kendaraan", pricePerWeek: 1_500_000, slots: 1 },
];

/** Paket gabungan hak penamaan (Deck v4 slide 14). */
export const NAMING_BUNDLE_NOTE =
  "Paket gabungan: dua hak penamaan sekaligus, hemat hingga Rp300 ribu per minggu dibanding beli terpisah.";

/** Eksklusivitas kategori pembiayaan (Deck v4 slide 13). */
export const CATEGORY_EXCLUSIVITY: NamingRight & { futureNote: string } = {
  id: "mitra-pembiayaan-resmi",
  name: "Mitra Pembiayaan Resmi",
  pricePerWeek: 1_500_000,
  slots: 1,
  description: "Penamaan resmi untuk seluruh tenda leasing di lokasi acara — 1 slot eksklusif per kategori.",
  futureNote:
    "Model eksklusivitas kategori ini terbuka untuk kategori lain (asuransi, media, kuliner); harga dan slotnya dibicarakan terpisah.",
};

/** Teks awal pesan WhatsApp untuk tombol CTA sponsor. */
export const SPONSOR_WA_TEXT = "Halo Panitia Drive Tech, saya tertarik dengan paket sponsor Musim 1.";
