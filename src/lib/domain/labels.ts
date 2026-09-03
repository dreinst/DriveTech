import type {
  AdminRole,
  BookingStatus,
  LeasingStatus,
  PaymentMethod,
  PaymentStatus,
  PurchasePaymentMethod,
  PurchaseStatus,
  SlotStatus,
  TenantType,
  ZoneType,
} from "@/lib/types/database";

/** Semua teks yang dilihat pengguna berbahasa Indonesia. */

export const ZONE_TYPE_LABEL: Record<ZoneType, string> = {
  mobil_baru: "Mobil Baru",
  mobil_bekas: "Mobil Bekas",
  // Layout v2 + Deck v4 (2026-09-02): Area C dipecah motor baru (3 slot) & bekas (14 slot).
  motor_baru: "Motor Baru",
  // Keputusan pemilik 2026-08-29: zona 14 slot ini fokus MOTOR saja.
  mobil_motor_bekas: "Motor Bekas",
  umkm: "UMKM",
  booth_khusus: "Otomotif & Leasing",
  warung: "Warung",
  facility: "Fasilitas Umum",
};

export const SLOT_STATUS_LABEL: Record<SlotStatus, string> = {
  available: "Tersedia",
  pending: "Menunggu Pembayaran",
  confirmed: "Terisi",
};

/** Label legenda denah, termasuk kotak fasilitas yang tidak bisa dibooking. */
export const SLOT_LEGEND_LABEL: Record<SlotStatus | "facility", string> = {
  ...SLOT_STATUS_LABEL,
  facility: "Fasilitas",
};

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Menunggu Pembayaran",
  confirmed: "Terkonfirmasi",
  cancelled: "Dibatalkan",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Belum Dibayar",
  submitted: "Menunggu Verifikasi",
  verified: "Terverifikasi",
  rejected: "Ditolak",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tunai (Cash)",
  transfer: "Transfer Bank",
  // Sejak 2026-09-02 biaya admin dibayar lewat QRIS; 'transfer' & 'cash' tinggal untuk data lama.
  qris: "QRIS",
};

export const LEASING_STATUS_LABEL: Record<LeasingStatus, string> = {
  submitted: "Diajukan",
  verifying: "Sedang Diverifikasi",
  approved: "Disetujui",
  rejected: "Ditolak",
  completed: "Selesai",
};

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  new: "Baru",
  contacted: "Sudah Dihubungi",
  deal: "Deal",
  cancelled: "Dibatalkan",
};

export const PURCHASE_PAYMENT_METHOD_LABEL: Record<PurchasePaymentMethod, string> = {
  cash: "Tunai (Cash)",
  transfer: "Transfer Bank",
  credit: "Kredit / Leasing",
};

export const TENANT_TYPE_LABEL: Record<TenantType, string> = {
  dealer_mobil_baru: "Dealer Mobil Baru",
  dealer_motor_baru: "Dealer Motor Baru",
  individu_bekas: "Individu / Dealer Kendaraan Bekas",
  umkm: "Pelaku UMKM",
  mitra_booth: "Bank Leasing / Brand Otomotif",
  warung: "Pemilik Warung",
};

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  admin: "Admin",
  verifikator: "Verifikator",
};

/** Tipe tenant yang otomatis dipilih dari tipe zona slot. facility tidak bisa dibooking. */
export const TENANT_TYPE_BY_ZONE_TYPE: Record<ZoneType, TenantType | null> = {
  mobil_baru: "dealer_mobil_baru",
  mobil_bekas: "individu_bekas",
  motor_baru: "dealer_motor_baru",
  mobil_motor_bekas: "individu_bekas",
  umkm: "umkm",
  booth_khusus: "mitra_booth",
  warung: "warung",
  facility: null,
};
