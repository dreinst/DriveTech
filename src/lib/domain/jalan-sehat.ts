/**
 * Data jalan sehat DriveTech Vol. 1. Keputusan yang belum final (kuota, syarat
 * ambil doorprize) sengaja dijadikan konstanta di sini supaya mudah diubah.
 */
export const JALAN_SEHAT = {
  judul: "Jalan Sehat DriveTech",
  tanggal: "Minggu, 8 November 2026",
  mulai: "06.00 WIB",
  lokasi: "Kampung Tentara, Rest Area Singosari, Malang",
  bersama: "Bersama Divif 2 Kostrad, memperingati Hari Pahlawan 10 November",
  rundown: [
    { jam: "06.00", acara: "Jalan sehat dimulai" },
    { jam: "07.00", acara: "Zumba bersama" },
    { jam: "Lalu", acara: "Games dan undian doorprize sampai 11.15" },
  ],
} as const;

/** Batas jumlah pendaftar; null = tanpa batas. Belum diputuskan panitia. */
export const KUOTA_JALAN_SEHAT: number | null = null;

/** Tutup pendaftaran online dengan mengubah ini ke false. */
export const PENDAFTARAN_JALAN_SEHAT_DIBUKA = true;

/** Batas percobaan daftar per IP (rate_limit_events). */
// Longgar karena banyak HP berbagi satu IP operator seluler atau Wi-Fi lokasi.
export const BATAS_DAFTAR_PER_IP = { jumlah: 20, detik: 10 * 60 } as const;

/** Nomor kupon tampil: 1 -> "JS-0001". */
export function kodeKupon(nomor: number): string {
  return `JS-${String(nomor).padStart(4, "0")}`;
}
