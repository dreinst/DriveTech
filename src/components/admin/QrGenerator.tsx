"use client";

import { useMemo, useState } from "react";

import { CopyButton } from "@/app/booking/_components/CopyButton";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import {
  goPath,
  goUrl,
  QR_MEDIA_PRESETS,
  QR_MEDIA_UJI,
  QR_SLUG_RE,
  rapikanSlug,
} from "@/lib/qr-media";
import { cn } from "@/lib/utils";

const TEKS_DEFAULT = "Scan untuk pesan lapak";
const TEKS_MAKS = 40;

export type QrGeneratorProps = {
  /** Basis URL yang di-encode ke QR (alamat produksi tetap). */
  baseUrl: string;
};

/**
 * Pembuat QR promosi: pilih media (atau ketik sendiri), pratinjau langsung
 * dari /api/admin/qr, unduh SVG (cetak/vektor) atau PNG (media sosial/WA).
 * PNG dirasterkan di browser lewat <canvas> dari SVG yang sama, jadi tidak
 * butuh pustaka gambar di server.
 */
export function QrGenerator({ baseUrl }: QrGeneratorProps) {
  const [slug, setSlug] = useState<string>(QR_MEDIA_PRESETS[0]?.slug ?? "spanduk");
  const [teks, setTeks] = useState(TEKS_DEFAULT);
  const [denganTeks, setDenganTeks] = useState(true);
  const [polos, setPolos] = useState(false);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const slugValid = QR_SLUG_RE.test(slug);
  const preset = QR_MEDIA_PRESETS.find((item) => item.slug === slug);

  const svgSrc = useMemo(() => {
    const q = new URLSearchParams({
      dari: slug,
      variant: polos ? "plain" : "branded",
      caption: denganTeks ? "1" : "0",
    });
    if (denganTeks && teks.trim()) q.set("teks", teks.trim());
    return `/api/admin/qr?${q.toString()}`;
  }, [slug, polos, denganTeks, teks]);

  const urlQr = goUrl(baseUrl, slug);
  const namaBerkas = `qr-drivetech-${slug}`;

  async function ambilSvg(): Promise<string> {
    const res = await fetch(svgSrc, { cache: "no-store" });
    if (!res.ok) throw new Error(`Gagal mengambil SVG (${res.status}).`);
    return res.text();
  }

  async function jalankan(kunci: string, kerja: () => Promise<void>) {
    setSibuk(kunci);
    setGalat(null);
    try {
      await kerja();
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Terjadi kesalahan saat mengunduh.");
    } finally {
      setSibuk(null);
    }
  }

  function unduhSvg() {
    return jalankan("svg", async () => {
      const svg = await ambilSvg();
      unduhBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${namaBerkas}.svg`);
    });
  }

  function unduhPng(px: number) {
    return jalankan(`png${px}`, async () => {
      const svg = await ambilSvg();
      const png = await rasterkanSvg(svg, px);
      unduhBlob(png, `${namaBerkas}-${px}px.png`);
    });
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Buat kode QR</h2>
      <p className="mt-0.5 text-sm text-muted">
        Satu QR per media supaya jumlah scan tiap media bisa dibandingkan. Semua QR mengarah ke
        beranda lewat halaman sambutan beranimasi.
      </p>

      {/* ---------- Pilih media ---------- */}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">Media</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {QR_MEDIA_PRESETS.map((item) => {
            const aktif = item.slug === slug;
            return (
              <button
                key={item.slug}
                type="button"
                onClick={() => setSlug(item.slug)}
                aria-pressed={aktif}
                className={cn(
                  "h-9 rounded-full px-4 text-xs transition-colors duration-150",
                  aktif
                    ? "bg-accent font-semibold text-[#0a0a0a]"
                    : "border border-line bg-card font-medium text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 max-w-sm">
          <Field
            label="Atau media lain (slug)"
            htmlFor="qr-slug"
            hint="Huruf kecil, angka, dan strip. Contoh: baliho-jalan-raya."
            error={slugValid ? undefined : "Slug belum valid."}
          >
            <Input
              id="qr-slug"
              value={slug}
              onChange={(event) => setSlug(rapikanSlug(event.target.value))}
              placeholder="baliho-jalan-raya"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>
        {preset ? <p className="mt-2 text-xs text-muted">{preset.hint}</p> : null}
      </div>

      {/* ---------- Opsi tampilan ---------- */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={denganTeks}
            onChange={(event) => setDenganTeks(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            Tulisan di bawah kode
            <span className="block text-xs text-muted">
              Plus alamat situs sebagai cadangan kalau kamera gagal membaca.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={polos}
            onChange={(event) => setPolos(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            Versi polos (tanpa logo)
            <span className="block text-xs text-muted">
              Cadangan untuk cetakan sangat kecil atau printer berkualitas rendah.
            </span>
          </span>
        </label>
      </div>
      {denganTeks ? (
        <div className="mt-3 max-w-sm">
          <Field label="Teks keterangan" htmlFor="qr-teks" hint={`Maksimal ${TEKS_MAKS} karakter.`}>
            <Input
              id="qr-teks"
              value={teks}
              maxLength={TEKS_MAKS}
              onChange={(event) => setTeks(event.target.value)}
            />
          </Field>
        </div>
      ) : null}

      {/* ---------- Pratinjau + unduh ---------- */}
      <div className="mt-6 flex flex-col gap-5 border-t border-line pt-5 md:flex-row md:items-start">
        <div className="shrink-0 self-center rounded-[var(--radius)] bg-white p-3 md:self-start">
          {slugValid ? (
            // eslint-disable-next-line @next/next/no-img-element -- SVG dinamis dari API admin
            <img
              key={svgSrc}
              src={svgSrc}
              alt={`Pratinjau kode QR media ${slug}`}
              className="block h-auto w-64 sm:w-72"
            />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center text-center text-xs text-[#6e6e6e]">
              Isi slug yang valid untuk melihat pratinjau.
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">
              Isi kode QR
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <code className="min-w-0 break-all rounded-[var(--radius-sm)] bg-surface-2 px-2.5 py-1.5 text-xs text-ink">
                {urlQr}
              </code>
              <CopyButton value={urlQr} label="Salin" className="h-9 px-4 text-xs" />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">Unduh</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={unduhSvg}
                disabled={!slugValid || sibuk !== null}
              >
                {sibuk === "svg" ? "Menyiapkan…" : "SVG (cetak / vektor)"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => unduhPng(1024)}
                disabled={!slugValid || sibuk !== null}
              >
                {sibuk === "png1024" ? "Menyiapkan…" : "PNG 1024 px"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => unduhPng(2048)}
                disabled={!slugValid || sibuk !== null}
              >
                {sibuk === "png2048" ? "Menyiapkan…" : "PNG 2048 px"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              SVG untuk percetakan (tajam di ukuran berapa pun). PNG untuk WhatsApp, Instagram, atau
              layar LED.
            </p>
            {galat ? <p className="mt-2 text-xs text-danger">{galat}</p> : null}
          </div>

          <div className="border-t border-line pt-4">
            <a
              href={goPath(QR_MEDIA_UJI)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("ghost", "sm")}
            >
              Lihat animasi sambutan ↗
            </a>
            <p className="mt-1.5 text-xs text-muted">
              Dibuka sebagai media &ldquo;{QR_MEDIA_UJI}&rdquo; supaya tidak tercampur dengan
              statistik media asli.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Utilitas unduh (hanya di browser)                                   */
/* ------------------------------------------------------------------ */

function unduhBlob(blob: Blob, nama: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Rasterkan string SVG ke PNG selebar `px` (tinggi mengikuti rasio viewBox).
 * Atribut width/height disisipkan ke SVG supaya Safari/Firefox merender pada
 * resolusi target, bukan ukuran intrinsik kecil yang lalu diperbesar (buram).
 */
async function rasterkanSvg(svg: string, px: number): Promise<Blob> {
  const match = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const rasio = match ? Number(match[2]) / Number(match[1]) : 1;
  const tinggi = Math.round(px * rasio);
  const svgBerukuran = svg.replace(/<svg\s/, `<svg width="${px}" height="${tinggi}" `);

  const url = URL.createObjectURL(new Blob([svgBerukuran], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gambar SVG gagal dimuat untuk dirasterkan."));
      el.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = tinggi;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak tersedia di browser ini.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Gagal membuat berkas PNG."))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
