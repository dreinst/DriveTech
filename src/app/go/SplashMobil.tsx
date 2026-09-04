"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { buttonClass } from "@/components/ui/Button";
import { EVENT_INFO } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

/** Lama splash sebelum otomatis pindah. Keyframe go-mobil di globals.css = 2,3 s. */
const DURASI_MS = 2600;
/** Saat pengguna meminta gerak dikurangi: tanpa animasi, langsung masuk. */
const DURASI_KURANGI_GERAK_MS = 300;

/**
 * Layar sambutan setelah scan QR: mobil melaju melintasi layar, logo muncul,
 * lalu otomatis ke `tujuan`. Menutupi header/footer situs (fixed, z tinggi)
 * supaya terasa seperti "pintu masuk", bukan halaman biasa.
 *
 * Aturan UX: maks ±2,6 detik, tombol Lewati selalu ada, hormati
 * prefers-reduced-motion, dan pakai router.replace agar tombol Kembali di
 * browser tidak memutar ulang splash.
 */
export function SplashMobil({ tujuan }: { tujuan: string }) {
  const router = useRouter();
  const sudahPindah = useRef(false);

  const pindah = useCallback(() => {
    if (sudahPindah.current) return;
    sudahPindah.current = true;
    router.replace(tujuan);
  }, [router, tujuan]);

  useEffect(() => {
    router.prefetch(tujuan);
    const kurangiGerak =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(pindah, kurangiGerak ? DURASI_KURANGI_GERAK_MS : DURASI_MS);
    return () => window.clearTimeout(timer);
  }, [pindah, router, tujuan]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0a] text-ink"
      role="status"
      aria-live="polite"
      aria-label={`Membuka ${EVENT_INFO.name}`}
    >
      {/* Logo + nama: muncul setelah mobil masuk */}
      <div className="go-logo flex flex-col items-center gap-3 px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG statis di public/ */}
        <img
          src="/logo-drivetech.svg"
          alt=""
          aria-hidden="true"
          className="h-20 w-20 sm:h-24 sm:w-24"
        />
        <p className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">{EVENT_INFO.name}</p>
        <p className="text-sm text-muted">{EVENT_INFO.location}</p>
      </div>

      {/* Panggung mobil (dekoratif) */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[22%] flex justify-center"
        aria-hidden="true"
      >
        <MobilSvg className="go-mobil w-[min(68vw,420px)]" />
      </div>
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-[21%] h-1 w-full"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1="1"
          x2="100%"
          y2="1"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="2"
          strokeDasharray="24 24"
          className="go-jalan"
        />
      </svg>

      <button
        type="button"
        onClick={pindah}
        className={cn(buttonClass("ghost", "sm"), "absolute bottom-8 right-6 sm:bottom-10 sm:right-10")}
      >
        Lewati →
      </button>
      <noscript>
        <a href={tujuan} className="absolute bottom-8 left-6 text-sm underline">
          Masuk ke situs
        </a>
      </noscript>
    </div>
  );
}

/**
 * Mobil tampak samping menghadap kanan, plus garis kecepatan di belakangnya.
 * ViewBox diperlebar ke kiri (-90) untuk ruang garis kecepatan.
 */
function MobilSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="-90 0 340 110" className={className} aria-hidden="true">
      {/* Garis kecepatan (urutan nth-of-type dipakai untuk jeda animasi) */}
      <line x1="-84" y1="44" x2="-24" y2="44" stroke="#ff7b00" strokeWidth="4" strokeLinecap="round" className="go-garis" />
      <line x1="-72" y1="60" x2="-18" y2="60" stroke="rgba(255,255,255,0.55)" strokeWidth="3" strokeLinecap="round" className="go-garis" />
      <line x1="-80" y1="76" x2="-30" y2="76" stroke="#ff7b00" strokeWidth="3" strokeLinecap="round" className="go-garis" />

      {/* Bayangan di aspal */}
      <ellipse cx="124" cy="96" rx="104" ry="5" fill="rgba(0,0,0,0.55)" />

      {/* Bodi */}
      <path
        d="M18 66 C18 58 24 52 34 50 L58 46 L82 26 C86 22 90 20 96 20 L150 20 C158 20 164 24 170 30 L192 48 L214 52 C224 54 230 60 230 68 L230 74 C230 78 227 80 223 80 L26 80 C21 80 18 77 18 72 Z"
        fill="#ff7b00"
      />
      {/* Garis bodi bawah (tone lebih gelap) */}
      <path d="M22 72 L226 72 L226 76 C226 78 224 80 222 80 L26 80 C22 80 20 78 20 76 Z" fill="#d96600" />
      {/* Kaca */}
      <path d="M92 27 L146 27 L148 45 L78 45 Z" fill="#0a0a0a" opacity="0.9" />
      <path d="M154 28 L166 30 L184 46 L152 46 Z" fill="#0a0a0a" opacity="0.9" />
      {/* Pegangan pintu */}
      <rect x="126" y="52" width="14" height="3" rx="1.5" fill="#b85400" />
      <rect x="150" y="52" width="14" height="3" rx="1.5" fill="#b85400" />
      {/* Lampu depan & belakang */}
      <rect x="224" y="57" width="7" height="7" rx="2" fill="#fff4c2" />
      <rect x="18" y="58" width="5" height="7" rx="1.5" fill="#ff453a" />

      {/* Roda (berputar) */}
      <g className="go-roda">
        <circle cx="64" cy="80" r="17" fill="#0a0a0a" stroke="#2a2a2a" strokeWidth="2" />
        <circle cx="64" cy="80" r="8" fill="#d0d0d0" />
        <path d="M64 72 V88 M56 80 H72 M58.3 74.3 L69.7 85.7 M69.7 74.3 L58.3 85.7" stroke="#6e6e6e" strokeWidth="1.6" />
      </g>
      <g className="go-roda">
        <circle cx="186" cy="80" r="17" fill="#0a0a0a" stroke="#2a2a2a" strokeWidth="2" />
        <circle cx="186" cy="80" r="8" fill="#d0d0d0" />
        <path d="M186 72 V88 M178 80 H194 M180.3 74.3 L191.7 85.7 M191.7 74.3 L180.3 85.7" stroke="#6e6e6e" strokeWidth="1.6" />
      </g>
    </svg>
  );
}
