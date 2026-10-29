/**
 * Data jalan sehat DriveTech Vol. 1, berbayar per orang. Satu pendaftaran (web atau chat WhatsApp
 * kantor) = satu pesanan untuk N peserta, dibayar lewat QRIS DriveTech. Setelah pembayaran
 * diverifikasi, setiap peserta mendapat nomor tiket undian sendiri (nomor = urutan tiket).
 * Peserta tanpa HP membeli tiket kosong tunai di lokasi.
 */
export const JALAN_SEHAT = {
  judul: "Jalan Sehat DriveTech",
  tanggal: "Minggu, 8 November 2026",
  mulai: "06.00 WIB",
  lokasi: "Kampung Tentara, Rest Area Singosari, Malang",
  bersama: "Bersama Divif 2 Kostrad, memperingati Hari Pahlawan 10 November",
  // Jam kosong = belum ditetapkan, tampil tanpa jam.
  rundown: [
    { jam: "05.30", acara: "Registrasi dan pengambilan tiket undian" },
    { jam: "06.00", acara: "Jalan sehat dimulai" },
    { jam: "07.00", acara: "Zumba bersama" },
    { jam: "", acara: "Games, penampilan band, dan undian doorprize" },
    { jam: "11.15", acara: "Acara selesai" },
  ],
} as const;

/** Harga tiket per orang, sama untuk pesanan online dan pembelian tunai di lokasi. */
export const HARGA_TIKET_JS = 10_000;

/** Pesanan online yang belum dibayar batal setelah 24 jam, paling lambat saat pendaftaran online tutup. */
export const BATAS_BAYAR_JAM = 24;

/**
 * Pendaftaran web dan WhatsApp tutup Minggu 09.00 WIB, sebelum undian, supaya peserta
 * yang baru tahu di lokasi masih sempat daftar. Tiket kosong panitia tidak terikat jam ini.
 */
export const TUTUP_DAFTAR_ONLINE = new Date("2026-11-08T09:00:00+07:00");

export function pendaftaranOnlineDibuka(sekarang: Date = new Date()): boolean {
  return sekarang < TUTUP_DAFTAR_ONLINE;
}

/** Batas bayar pesanan yang dibuat pada `dibuat`. */
export function batasBayarPesanan(dibuat: Date = new Date()): Date {
  const batas = new Date(dibuat.getTime() + BATAS_BAYAR_JAM * 3600_000);
  return batas < TUTUP_DAFTAR_ONLINE ? batas : TUTUP_DAFTAR_ONLINE;
}

export const PESAN_DAFTAR_DITUTUP =
  "Pendaftaran online sudah ditutup. Kalau Anda sudah di lokasi, tiket undian masih bisa dibeli tunai di panitia jalan sehat.";

export const SYARAT_AMBIL_HADIAH = "Hadiah diambil dengan menunjukkan tiket (di HP atau cetak) yang nomornya sama.";

export const SUMBER_JALAN_SEHAT = { web: "Web", wa: "WhatsApp", tempat: "Di lokasi" } as const;
export type SumberJalanSehat = keyof typeof SUMBER_JALAN_SEHAT;

export const STATUS_PESANAN_JS = {
  menunggu: "Menunggu bayar",
  dicek: "Bukti dicek",
  lunas: "Lunas",
  batal: "Batal",
} as const;
export type StatusPesananJs = keyof typeof STATUS_PESANAN_JS;

/** Kode pesanan, misalnya JS-1A2B3C4D. Ditulis peserta di chat supaya bot mengenali pesanannya. */
export const KODE_PESANAN_RE = /JS-[0-9A-F]{8}/i;

/** Pesan yang dikirim peserta ke WhatsApp kantor untuk daftar lewat chat (ditulis juga di baliho). */
export const KATA_KUNCI_WA = "DAFTAR JALAN SEHAT";

/** Batas tiket kosong yang bisa dibuat sekali klik di panel admin. */
export const MAKS_TIKET_KOSONG = 500;

/** Batas percobaan daftar per IP (rate_limit_events). */
// Longgar karena banyak HP berbagi satu IP operator seluler atau Wi-Fi lokasi.
export const BATAS_DAFTAR_PER_IP = { jumlah: 20, detik: 10 * 60 } as const;

/** Nomor tiket tampil: 427 -> "0427". */
export function nomorTiket(nomor: number): string {
  return String(nomor).padStart(4, "0");
}

/**
 * Daftar nomor tiket dari ketikan panitia: "501-510, 515 520" -> [501, ..., 510, 515, 520].
 * null kalau ada bagian yang bukan angka atau rentang terlalu panjang.
 */
export function bacaDaftarNomor(teks: string, maks = MAKS_TIKET_KOSONG): number[] | null {
  const hasil = new Set<number>();
  for (const bagian of teks.split(/[\s,;]+/).filter(Boolean)) {
    const m = bagian.match(/^(\d{1,6})(?:-(\d{1,6}))?$/);
    if (!m) return null;
    const awal = Number(m[1]);
    const akhir = m[2] ? Number(m[2]) : awal;
    if (akhir < awal || akhir - awal >= maks) return null;
    for (let n = awal; n <= akhir; n++) hasil.add(n);
    if (hasil.size > maks) return null;
  }
  return [...hasil].sort((a, b) => a - b);
}
