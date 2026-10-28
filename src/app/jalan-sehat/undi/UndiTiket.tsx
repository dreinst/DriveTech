"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { JUMLAH_TIKET_FISIK, nomorTiket, SYARAT_AMBIL_HADIAH } from "@/lib/domain/jalan-sehat";

const KUNCI = "jalan-sehat-undi";
const LAMA_ANIMASI_MS = 1500;

type Simpanan = { jumlah: number; awal: number; keluar: number[] };

const AWAL: Simpanan = { jumlah: JUMLAH_TIKET_FISIK, awal: 1, keluar: [] };

function acak(n: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] % n;
}

/**
 * Undian tiket fisik tanpa server: nomor dipilih acak dari rentang tiket, nomor
 * yang sudah keluar tidak ikut lagi, riwayat disimpan di localStorage perangkat ini.
 */
export function UndiTiket() {
  const [data, setData] = useState<Simpanan>(AWAL);
  const [tampil, setTampil] = useState<number | null>(null);
  const [mengundi, setMengundi] = useState(false);
  const [konfirmasiUlang, setKonfirmasiUlang] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => {
    try {
      const lama = JSON.parse(localStorage.getItem(KUNCI) ?? "null") as Simpanan | null;
      if (lama && Array.isArray(lama.keluar)) {
        setData(lama);
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

  const jumlah = Math.max(0, Math.floor(data.jumlah) || 0);
  const awal = Math.floor(data.awal) || 0;
  const sudah = new Set(data.keluar);
  const sisa: number[] = [];
  for (let n = awal; n < awal + jumlah; n++) if (!sudah.has(n)) sisa.push(n);

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
      simpan({ ...data, keluar: [...data.keluar, pemenang] });
    }, LAMA_ANIMASI_MS);
    timer.current = [putar, henti];
  }

  function mulaiUlang() {
    simpan({ ...data, keluar: [] });
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
          <div className="flex flex-wrap gap-3">
            <div className="w-36">
              <Field label="Jumlah tiket" htmlFor="undi-jumlah">
                <Input
                  id="undi-jumlah"
                  type="number"
                  min={1}
                  value={data.jumlah}
                  disabled={mengundi}
                  onChange={(e) => simpan({ ...data, jumlah: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="w-36">
              <Field label="Nomor awal" htmlFor="undi-awal">
                <Input
                  id="undi-awal"
                  type="number"
                  min={0}
                  value={data.awal}
                  disabled={mengundi}
                  onChange={(e) => simpan({ ...data, awal: Number(e.target.value) })}
                />
              </Field>
            </div>
          </div>
        </header>

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
            {sisa.length === 0
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
