"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Kotak tanda tangan untuk jari, mouse, atau Apple Pencil. Hasilnya PNG transparan yang
 * sudah dipotong ke area coretan, dikirim lewat input tersembunyi `name` sebagai data URL.
 * Tebal garis mengikuti tekanan pena kalau perangkat mendukung (Apple Pencil).
 */
export function TandaTanganPad({ name, onChange }: { name: string; onChange?: (adaIsi: boolean) => void }) {
  const kanvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titikAkhir = useRef<{ x: number; y: number; w: number } | null>(null);
  const batas = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [adaIsi, setAdaIsi] = useState(false);

  const siapkan = useCallback(() => {
    const c = kanvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f2159";
    batas.current = null;
    if (input.current) input.current.value = "";
    setAdaIsi(false);
    onChange?.(false);
  }, [onChange]);

  // Ukuran kanvas diatur ulang (dan dikosongkan) saat layar diputar, supaya coretan tidak meleset.
  useEffect(() => {
    siapkan();
    let lebar = kanvas.current?.getBoundingClientRect().width;
    const ro = new ResizeObserver(() => {
      const baru = kanvas.current?.getBoundingClientRect().width;
      if (baru !== lebar) {
        lebar = baru;
        siapkan();
      }
    });
    if (kanvas.current) ro.observe(kanvas.current);
    return () => ro.disconnect();
  }, [siapkan]);

  function posisi(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    // Mouse melaporkan tekanan 0.5 tetap; jari 0 atau 1. Hanya pena yang dipakai tekanannya.
    const tekanan = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: 1.2 + tekanan * 2.6 };
  }

  function catatBatas(x: number, y: number) {
    const b = batas.current;
    batas.current = b
      ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) }
      : { x0: x, y0: y, x1: x, y1: y };
  }

  function mulai(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = posisi(e);
    titikAkhir.current = p;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#0f2159";
    ctx.fill();
    catatBatas(p.x, p.y);
  }

  function gerak(e: React.PointerEvent<HTMLCanvasElement>) {
    const akhir = titikAkhir.current;
    const ctx = e.currentTarget.getContext("2d");
    if (!akhir || !ctx) return;
    // Titik antara (coalesced) membuat garis Apple Pencil tetap halus.
    const daftar = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    let sebelum = akhir;
    for (const ev of daftar) {
      const r = e.currentTarget.getBoundingClientRect();
      const tekanan = ev.pointerType === "pen" && ev.pressure > 0 ? ev.pressure : 0.5;
      const p = { x: ev.clientX - r.left, y: ev.clientY - r.top, w: 1.2 + tekanan * 2.6 };
      ctx.lineWidth = (sebelum.w + p.w) / 2;
      ctx.beginPath();
      ctx.moveTo(sebelum.x, sebelum.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      catatBatas(p.x, p.y);
      sebelum = p;
    }
    titikAkhir.current = sebelum;
  }

  function selesai() {
    if (!titikAkhir.current) return;
    titikAkhir.current = null;
    const c = kanvas.current;
    const b = batas.current;
    if (!c || !b || !input.current) return;
    // Potong ke area coretan (plus jarak 6 px) supaya tanda tangan pas di kotak PDF.
    const dpr = window.devicePixelRatio || 1;
    const pad = 6;
    const sx = Math.max(0, (b.x0 - pad) * dpr);
    const sy = Math.max(0, (b.y0 - pad) * dpr);
    const sw = Math.min(c.width - sx, (b.x1 - b.x0 + pad * 2) * dpr);
    const sh = Math.min(c.height - sy, (b.y1 - b.y0 + pad * 2) * dpr);
    // Hasil dibatasi lebar 900 px: cukup tajam untuk cetak, tetap kecil untuk dikirim.
    const skala = Math.min(1, 900 / sw);
    const potong = document.createElement("canvas");
    potong.width = Math.max(1, Math.round(sw * skala));
    potong.height = Math.max(1, Math.round(sh * skala));
    potong.getContext("2d")?.drawImage(c, sx, sy, sw, sh, 0, 0, potong.width, potong.height);
    input.current.value = potong.toDataURL("image/png");
    setAdaIsi(true);
    onChange?.(true);
  }

  return (
    <div className="space-y-2">
      <div className="relative border border-line bg-white">
        <canvas
          ref={kanvas}
          className="block h-48 w-full cursor-crosshair touch-none sm:h-56"
          onPointerDown={mulai}
          onPointerMove={gerak}
          onPointerUp={selesai}
          onPointerCancel={selesai}
          aria-label="Kotak tanda tangan"
        />
        {!adaIsi ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[#0a0a0a]/40">
            Tanda tangan di sini
          </span>
        ) : null}
        <span className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-[#0a0a0a]/25" />
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={siapkan} className="text-sm font-medium text-accent underline underline-offset-4">
          Hapus dan ulangi
        </button>
      </div>
      <input ref={input} type="hidden" name={name} />
    </div>
  );
}

/**
 * Foto stempel opsional. Diperkecil ke 600 px dan dikirim sebagai JPEG data URL lewat
 * input tersembunyi `name`; di PDF latar putihnya hilang (blend multiply).
 */
export function StempelInput({ name }: { name: string }) {
  const [pratinjau, setPratinjau] = useState("");

  async function pilih(e: React.ChangeEvent<HTMLInputElement>) {
    const berkas = e.target.files?.[0];
    if (!berkas) return setPratinjau("");
    const bitmap = await createImageBitmap(berkas).catch(() => null);
    if (!bitmap) return setPratinjau("");
    const s = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bitmap.width * s);
    c.height = Math.round(bitmap.height * s);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    setPratinjau(c.toDataURL("image/jpeg", 0.85));
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="cursor-pointer border border-line bg-card px-4 py-2.5 text-sm font-medium text-ink hover:border-line-strong">
        {pratinjau ? "Ganti foto stempel" : "Pilih foto stempel"}
        <input type="file" accept="image/*" className="sr-only" onChange={pilih} />
      </label>
      {pratinjau ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau data URL lokal */}
          <img src={pratinjau} alt="Pratinjau stempel" className="h-16 w-auto bg-white" />
          <button type="button" onClick={() => setPratinjau("")} className="text-sm text-muted underline underline-offset-4">
            Hapus
          </button>
        </>
      ) : null}
      <input type="hidden" name={name} value={pratinjau} />
    </div>
  );
}
