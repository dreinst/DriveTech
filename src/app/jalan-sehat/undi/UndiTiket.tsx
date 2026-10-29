"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { nomorTiket, SYARAT_AMBIL_HADIAH } from "@/lib/domain/jalan-sehat";

const KUNCI = "jalan-sehat-undi";
const LAMA_ANIMASI_MS = 1500;

type Simpanan = { keluar: number[] };

const AWAL: Simpanan = { keluar: [] };

function acak(n: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] % n;
}

/**
 * Undian di perangkat MC: nomor dipilih acak dari tiket aktif (web, WhatsApp, dan tiket
 * di lokasi yang sudah diaktifkan panitia), nomor yang sudah keluar tidak ikut lagi,
 * riwayat disimpan di localStorage perangkat ini.
 */
export function UndiTiket({ nomor, galat }: { nomor: number[]; galat: string | null }) {
  const router = useRouter();
  const [memuat, mulaiMuat] = useTransition();
  const [data, setData] = useState<Simpanan>(AWAL);
  const [tampil, setTampil] = useState<number | null>(null);
  const [mengundi, setMengundi] = useState(false);
  const [konfirmasiUlang, setKonfirmasiUlang] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => {
    try {
      const lama = JSON.parse(localStorage.getItem(KUNCI) ?? "null") as Simpanan | null;
      if (lama && Array.isArray(lama.keluar)) {
        setData({ keluar: lama.keluar });
        setTampil(lama.keluar.at(-1) ?? null);
      }
    } catch {
      // Simpanan rusak: mulai dari awal.
    }
    const t = timer.current;
    return () => t.forEach(clearTimeout);
  }, []);

  function simpan(baru: Simpanan) {
    setData(baru);
    localStorage.setItem(KUNCI, JSON.stringify(baru));
  }

  const sudah = new Set(data.keluar);
  const sisa = nomor.filter((n) => !sudah.has(n));

  function undi() {
    if (sisa.length === 0 || mengundi) return;
    const pemenang = sisa[acak(sisa.length)];
    setMengundi(true);
    setKonfirmasiUlang(false);
    const putar = setInterval(() => setTampil(sisa[acak(sisa.length)]), 60);
    const henti = setTimeout(() => {
      clearInterval(putar);
      setTampil(pemenang);
      setMengundi(false);
      simpan({ keluar: [...data.keluar, pemenang] });
    }, LAMA_ANIMASI_MS);
    timer.current = [putar, henti];
  }

  function mulaiUlang() {
    simpan({ keluar: [] });
    setTampil(null);
    setKonfirmasiUlang(false);
  }

  return (
    <section className="gelap min-h-[calc(100svh-4rem)] bg-[#0a0a0a]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label text-sm text-accent">Jalan sehat DriveTech</p>
            <h1 className="judul text-[clamp(2.5rem,6vw,4rem)] text-ink">Undian doorprize</h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-ink/80">{nomor.length} tiket terdaftar</p>
            <Button
              variant="secondary"
              size="sm"
              disabled={mengundi || memuat}
              onClick={() => mulaiMuat(() => router.refresh())}
            >
              {memuat ? "Memuat…" : "Perbarui daftar"}
            </Button>
          </div>
        </header>

        {galat ? <Alert tone="error" title="Daftar tiket belum bisa dimuat">{galat}</Alert> : null}

        <div className="flex flex-col items-center gap-6 border border-line bg-card px-4 py-10 text-center">
          <p
            className={`judul leading-none tabular-nums text-[clamp(8rem,32vw,24rem)] ${mengundi ? "text-ink/60" : "text-accent"}`}
            role="status"
            aria-live="polite"
          >
            {tampil === null ? "????" : nomorTiket(tampil)}
          </p>
          {/* Tombol sendiri (bukan <Button>) karena ukurannya jauh di atas ukuran baku. */}
          <button
            type="button"
            onClick={undi}
            disabled={mengundi || sisa.length === 0}
            className="judul bg-accent px-16 py-5 text-5xl text-[#0a0a0a] transition-transform hover:bg-[var(--accent-hover)] focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none active:scale-[0.98] disabled:opacity-50 sm:px-24 sm:text-6xl"
          >
            {mengundi ? "Mengundi…" : "Undi"}
          </button>
          <p className="text-lg text-ink/80">
            {nomor.length === 0
              ? "Belum ada tiket terdaftar."
              : sisa.length === 0
              ? "Semua nomor tiket sudah keluar."
              : `${sisa.length} nomor tiket masih ikut diundi.`}
          </p>
          <p className="text-xl font-semibold text-ink">{SYARAT_AMBIL_HADIAH}</p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="judul text-3xl text-ink">Pemenang ({data.keluar.length})</h2>
            {data.keluar.length > 0 && !konfirmasiUlang ? (
              <Button variant="secondary" size="sm" disabled={mengundi} onClick={() => setKonfirmasiUlang(true)}>
                Mulai ulang
              </Button>
            ) : null}
          </div>
          {konfirmasiUlang ? (
            <div className="flex flex-wrap items-center gap-3 border border-line bg-card p-4" role="alertdialog">
              <p className="text-ink">Hapus semua riwayat pemenang di perangkat ini dan mulai undian dari awal?</p>
              <Button variant="danger" size="sm" onClick={mulaiUlang}>
                Ya, mulai ulang
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setKonfirmasiUlang(false)}>
                Batal
              </Button>
            </div>
          ) : null}
          {data.keluar.length === 0 ? (
            <p className="text-ink/70">Belum ada nomor yang keluar.</p>
          ) : (
            <ol className="flex flex-wrap gap-3">
              {[...data.keluar].reverse().map((n, i) => (
                <li
                  key={n}
                  className="judul border border-line bg-card px-4 py-2 text-3xl tabular-nums text-ink"
                >
                  <span className="mr-2 text-base text-ink/60">{data.keluar.length - i}.</span>
                  {nomorTiket(n)}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
