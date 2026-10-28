/**
 * Data jalan sehat DriveTech Vol. 1. Undian memakai tiket fisik bernomor yang
 * dibagikan di lokasi; pendaftaran online hanya opsional dan kuponnya ditukar
 * jadi tiket fisik di meja registrasi.
 */
export const JALAN_SEHAT = {
  judul: "Jalan Sehat DriveTech",
  tanggal: "Minggu, 8 November 2026",
  mulai: "06.00 WIB",
  lokasi: "Kampung Tentara, Rest Area Singosari, Malang",
  bersama: "Bersama Divif 2 Kostrad, memperingati Hari Pahlawan 10 November",
  // Jam kosong = belum ditetapkan, tampil tanpa jam.
  rundown: [
    { jam: "05.30", acara: "Registrasi dan penukaran tiket undian" },
    { jam: "06.00", acara: "Jalan sehat dimulai" },
    { jam: "07.00", acara: "Zumba bersama" },
    { jam: "", acara: "Games, penampilan band, dan undian doorprize" },
    { jam: "11.15", acara: "Acara selesai" },
  ],
} as const;

/** Jumlah tiket undian fisik yang dicetak; bawaan di halaman /jalan-sehat/undi. */
export const JUMLAH_TIKET_FISIK = 1000;

/** Batas jumlah pendaftar online; null = tanpa batas. */
export const KUOTA_JALAN_SEHAT: number | null = null;

/** Pendaftaran online tutup otomatis di akhir acara hari Sabtu. */
export const TUTUP_DAFTAR_ONLINE = new Date("2026-11-07T21:30:00+07:00");

export function pendaftaranOnlineDibuka(sekarang: Date = new Date()): boolean {
  return sekarang < TUTUP_DAFTAR_ONLINE;
}

export const PESAN_DAFTAR_DITUTUP =
  "Pendaftaran online sudah ditutup. Tenang, tiket undian tetap bisa diambil di meja registrasi Minggu pagi mulai pukul 05.30 WIB. Sampai jumpa di lokasi ya!";

export const PESAN_SUDAH_TERDAFTAR =
  "Nomor ini sudah terdaftar. Kupon sudah muncul saat pendaftaran pertama, simpan tangkapan layarnya ya.";

export const SYARAT_AMBIL_HADIAH = "Hadiah diambil dengan menunjukkan tiket fisik yang nomornya sama.";

/** Batas percobaan daftar per IP (rate_limit_events). */
// Longgar karena banyak HP berbagi satu IP operator seluler atau Wi-Fi lokasi.
export const BATAS_DAFTAR_PER_IP = { jumlah: 20, detik: 10 * 60 } as const;

/** Nomor kupon tampil: 1 -> "JS-0001". */
export function kodeKupon(nomor: number): string {
  return `JS-${String(nomor).padStart(4, "0")}`;
}

/** Nomor tiket fisik tampil: 427 -> "0427". */
export function nomorTiket(nomor: number): string {
  return String(nomor).padStart(4, "0");
}
