/**
 * Empat langkah alur booking ala mockup sistem_pemesanan —
 * dipakai <Stepper /> di ketiga halaman booking. Urutan mengikuti alur "slot
 * dulu, tanggal belakangan" (zona -> slot -> tanggal):
 *   /booking/[slotId]          -> current 1 ("Slot & Tanggal" selesai saat slot
 *                                 dipilih dari denah; tanggal masih bisa diubah)
 *   /booking/[bookingId]/bayar -> current 2
 *   /booking/[bookingId]/status-> current 3
 */
export const LANGKAH_BOOKING: readonly string[] = [
  "Slot & Tanggal",
  "Info Tenant",
  "Pembayaran",
  "Konfirmasi",
];
