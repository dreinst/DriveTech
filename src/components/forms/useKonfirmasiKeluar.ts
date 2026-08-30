"use client";

import { useEffect, useRef } from "react";

/**
 * Cegah isian formulir hilang tanpa disadari saat pengguna menutup tab,
 * memuat ulang, atau menekan tombol BACK di HP.
 *
 * Dipakai bersama draft otomatis di localStorage (lihat BookingForm): draft
 * adalah jaring pengaman, dialog ini adalah peringatannya. Keduanya perlu —
 * draft bisa gagal di mode penyamaran, saat penyimpanan penuh, atau ketika
 * pengguna kembali dari perangkat lain.
 *
 * BATAS BROWSER YANG PERLU DIKETAHUI (bukan pilihan desain kami):
 * - Menutup tab / memuat ulang: browser HANYA menampilkan dialog bawaannya
 *   sendiri. Teks kustom TIDAK bisa ditampilkan (sudah lama diblokir semua
 *   browser demi mencegah penyalahgunaan). Karena itu `pesan` hanya dipakai
 *   untuk kasus tombol BACK, di mana kita memang boleh menentukan teksnya.
 * - Tombol BACK: dijaga dengan menyisipkan satu entri riwayat "sentinel".
 *   Tekanan back pertama tertangkap di sini, bukan langsung meninggalkan
 *   halaman. Kalau pengguna memilih tetap keluar, barulah kita mundur sungguhan.
 *
 * Penjaga hanya menyala saat `aktif` true — supaya tidak pernah mengganggu
 * pengguna yang formulirnya masih kosong atau yang sudah menekan kirim.
 */
export function useKonfirmasiKeluar(aktif: boolean, pesan: string): void {
  // Ref supaya handler popstate selalu membaca nilai terkini tanpa dipasang ulang.
  const aktifRef = useRef(aktif);
  aktifRef.current = aktif;

  /* --- Menutup tab / memuat ulang: dialog bawaan browser --- */
  useEffect(() => {
    if (!aktif) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Sebagian browser lama masih memerlukan returnValue diisi.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [aktif]);

  /* --- Tombol BACK (paling sering di HP): dialog kita sendiri --- */
  useEffect(() => {
    if (!aktif) return;

    // Sisipkan entri sentinel: back pertama akan mendarat di sini lebih dulu.
    window.history.pushState({ dtPenjagaKeluar: true }, "", window.location.href);

    const onPopState = () => {
      if (!aktifRef.current) return; // penjaga sudah dilepas — biarkan lewat
      const tetapKeluar = window.confirm(pesan);
      if (tetapKeluar) {
        // Lepas penjaga dulu supaya mundur berikutnya tidak ditangkap lagi.
        aktifRef.current = false;
        window.history.back();
      } else {
        // Batal keluar: pasang lagi sentinelnya agar back berikutnya tetap dijaga.
        window.history.pushState({ dtPenjagaKeluar: true }, "", window.location.href);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [aktif, pesan]);
}
