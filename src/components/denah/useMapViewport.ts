"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import { FLOOR_PLAN_VIEWBOX, type Rect } from "@/lib/domain/layout";

/**
 * Hook pan/zoom untuk peta lokasi — TANPA dependency tambahan.
 *
 * - Wheel = zoom ke arah kursor (termasuk pinch trackpad yang datang sebagai
 *   wheel + ctrlKey). Listener dipasang native dengan { passive: false }
 *   supaya preventDefault() sah (React memasang wheel secara pasif).
 * - Drag pointer = pan, dengan pointer capture. Klik vs drag dibedakan lewat
 *   ambang 6px: di bawah ambang, event click diteruskan ke slot SVG di bawahnya;
 *   di atas ambang, click berikutnya ditelan supaya tidak salah memilih slot.
 * - Dua jari (pointer events) = pinch zoom + pan mengikuti titik tengah jari.
 * - Double click = zoom in ke arah kursor.
 *
 * Transform diterapkan langsung ke elemen konten (div pembungkus SVG) lewat
 * style.transform — bukan state React — supaya gerakan halus tanpa merender
 * ulang ratusan kotak slot pada tiap frame. Hit-testing DOM mengikuti CSS
 * transform, jadi klik slot tetap jatuh ke slot yang benar saat zoom/pan.
 *
 * Mode `locked`: seluruh navigasi manual (wheel, drag, pinch, double click)
 * dimatikan — peta hanya bisa digerakkan lewat zoomToRect/reset programatik.
 * Dipakai alur booking per zona: peta dikunci pada zona terpilih supaya
 * pengunjung tidak bisa menggeser ke slot zona lain. Klik/tap slot tetap
 * berfungsi, dan touch-action dilonggarkan ke pan-y supaya halaman masih bisa
 * di-scroll melewati peta di layar sentuh.
 */

const MIN_SCALE = 0.8;
const MAX_SCALE = 4;
/** Di bawah jarak ini pointer dianggap klik, bukan drag. */
const DRAG_THRESHOLD_PX = 6;
/** Konten minimal yang harus tetap terlihat di dalam kotak peta (px layar). */
const KEEP_VISIBLE_PX = 64;
/** Faktor zoom tombol +/− dan double click. */
const STEP_FACTOR = 1.5;

type ViewState = { scale: number; tx: number; ty: number };

type PointerPoint = { x: number; y: number };

export type UseMapViewportResult = {
  /** Pasang ke div kotak peta (posisi relative, overflow hidden). */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Pasang ke div konten yang berisi SVG (absolute inset-0). */
  contentRef: RefObject<HTMLDivElement | null>;
  /** Sebar ke div kotak peta: {...containerHandlers}. */
  containerHandlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
    onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  };
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  /**
   * Zoom otomatis ke sebuah kotak dalam SATUAN VIEWBOX denah (mis. container
   * zona dari domain/layout.ts) sehingga kotak itu pas di kotak peta dengan
   * padding 24px. Dipakai alur "pilih zona dulu" ala studio bioskop.
   */
  zoomToRect: (rect: Rect, options?: { animate?: boolean; paddingPx?: number }) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type UseMapViewportOptions = {
  /** True = kunci navigasi manual (lihat komentar modul). Default false. */
  locked?: boolean;
};

export function useMapViewport(options?: UseMapViewportOptions): UseMapViewportResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const locked = options?.locked ?? false;
  // Ref supaya handler wheel/pointer yang sudah terpasang membaca nilai terkini
  // tanpa perlu melepas-pasang listener saat locked berubah.
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const view = useRef<ViewState>({ scale: 1, tx: 0, ty: 0 });
  /** Pointer yang sedang menekan, untuk pan (1 jari) dan pinch (2 jari). */
  const pointers = useRef<Map<number, PointerPoint>>(new Map());
  const dragging = useRef(false);
  const downPoint = useRef<PointerPoint | null>(null);
  /** Jarak & titik tengah pinch pada frame sebelumnya. */
  const pinchPrev = useRef<{ dist: number; mid: PointerPoint } | null>(null);
  /** True tepat setelah drag/pinch: click berikutnya ditelan (bukan pilih slot). */
  const suppressClick = useRef(false);

  /** Jaga tx/ty supaya konten tidak terlempar hilang dari kotak peta. */
  const clampPan = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const v = view.current;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const w = content.offsetWidth * v.scale;
    const h = content.offsetHeight * v.scale;
    v.tx = clamp(v.tx, KEEP_VISIBLE_PX - w, cw - KEEP_VISIBLE_PX);
    v.ty = clamp(v.ty, KEEP_VISIBLE_PX - h, ch - KEEP_VISIBLE_PX);
  }, []);

  const apply = useCallback(
    (smooth = false) => {
      const content = contentRef.current;
      if (!content) return;
      clampPan();
      const v = view.current;
      content.style.transition = smooth
        ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
      content.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`;
    },
    [clampPan],
  );

  /** Zoom dengan jangkar di titik (cx, cy) relatif terhadap kotak peta. */
  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number, smooth = false) => {
      const v = view.current;
      const nextScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = nextScale / v.scale;
      if (k !== 1) {
        v.tx = cx - k * (cx - v.tx);
        v.ty = cy - k * (cy - v.ty);
        v.scale = nextScale;
      }
      // Tetap apply meski skala mentok: pan pinch yang menyertainya harus terlihat.
      apply(smooth);
    },
    [apply],
  );

  const zoomAtCenter = useCallback(
    (factor: number) => {
      const container = containerRef.current;
      if (!container) return;
      zoomAt(container.clientWidth / 2, container.clientHeight / 2, factor, true);
    },
    [zoomAt],
  );

  const zoomIn = useCallback(() => zoomAtCenter(STEP_FACTOR), [zoomAtCenter]);
  const zoomOut = useCallback(() => zoomAtCenter(1 / STEP_FACTOR), [zoomAtCenter]);

  const reset = useCallback(() => {
    view.current = { scale: 1, tx: 0, ty: 0 };
    const content = contentRef.current;
    if (!content) return;
    content.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
    content.style.transform = "translate(0px, 0px) scale(1)";
  }, []);

  /**
   * Pas-kan sebuah rect (satuan viewBox denah) ke tengah kotak peta.
   *
   * SVG denah dirender dengan preserveAspectRatio "xMidYMid meet", jadi viewBox
   * dipaskan di tengah elemen konten dengan skala dasar `base` + offset (ox, oy).
   * Rect viewBox dipetakan dulu ke piksel konten, lalu scale/tx/ty dihitung agar
   * bounding box zona pas dengan padding. Transform tetap lewat style CSS yang
   * sama dengan pan/zoom manual, jadi hit-testing klik slot tetap akurat.
   */
  const zoomToRect = useCallback(
    (rect: Rect, options?: { animate?: boolean; paddingPx?: number }) => {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw <= 0 || ch <= 0 || rect.width <= 0 || rect.height <= 0) return;

      const base = Math.min(cw / FLOOR_PLAN_VIEWBOX.width, ch / FLOOR_PLAN_VIEWBOX.height);
      const ox = (cw - FLOOR_PLAN_VIEWBOX.width * base) / 2;
      const oy = (ch - FLOOR_PLAN_VIEWBOX.height * base) / 2;

      // Rect dalam piksel konten (skala 1, sebelum transform zoom).
      const px = ox + rect.x * base;
      const py = oy + rect.y * base;
      const pw = rect.width * base;
      const ph = rect.height * base;

      const padding = options?.paddingPx ?? 24;
      const scale = clamp(
        Math.min((cw - padding * 2) / pw, (ch - padding * 2) / ph),
        MIN_SCALE,
        MAX_SCALE,
      );

      const v = view.current;
      v.scale = scale;
      v.tx = cw / 2 - scale * (px + pw / 2);
      v.ty = ch / 2 - scale * (py + ph / 2);
      clampPan();

      content.style.transition =
        options?.animate === false ? "none" : "transform 300ms ease";
      content.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`;
    },
    [clampPan],
  );

  /** Posisi event relatif terhadap sudut kiri-atas kotak peta. */
  const relativePoint = useCallback((clientX: number, clientY: number): PointerPoint => {
    const container = containerRef.current;
    if (!container) return { x: clientX, y: clientY };
    const rect = container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  /* ---------- Wheel (native, non-passive) + persiapan elemen ---------- */

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    // Pointer events butuh touch-action none supaya browser tidak mengambil alih
    // gesture; overscroll dikurung supaya pinch tidak menggeser halaman.
    // (touch-action diatur di effect terpisah karena bergantung pada `locked`.)
    container.style.overscrollBehavior = "contain";
    content.style.transformOrigin = "0 0";
    content.style.willChange = "transform";

    const handleWheel = (event: WheelEvent) => {
      // Terkunci: biarkan wheel berlaku normal (scroll halaman), tanpa zoom.
      if (lockedRef.current) return;
      event.preventDefault();
      // Pinch trackpad dikirim sebagai wheel + ctrlKey dengan delta halus.
      const intensity = event.ctrlKey ? 0.01 : 0.0022;
      const factor = Math.exp(-event.deltaY * intensity);
      const point = relativePoint(event.clientX, event.clientY);
      zoomAt(point.x, point.y, factor);
    };

    // Fokus keyboard ke slot bisa menggeser scroll internal container
    // (overflow hidden tetap bisa punya scrollLeft/Top) — kembalikan ke 0
    // supaya tidak bertabrakan dengan transform.
    const handleScroll = () => {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [relativePoint, zoomAt]);

  // touch-action mengikuti mode: bebas -> none (semua gesture kita tangani);
  // terkunci -> pan-y supaya sentuhan di atas peta tetap bisa scroll halaman
  // (pinch di elemen ini ikut terblokir oleh pan-y).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.style.touchAction = locked ? "pan-y" : "none";
  }, [locked]);

  /* ---------- Pointer: pan satu jari + pinch dua jari ---------- */

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Terkunci: tanpa pan/pinch — tap diteruskan jadi click slot biasa.
      if (lockedRef.current) return;
      // Hanya tombol utama / sentuhan / pena.
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const point = relativePoint(event.clientX, event.clientY);
      pointers.current.set(event.pointerId, point);

      if (pointers.current.size === 1) {
        downPoint.current = point;
        dragging.current = false;
        // Interaksi baru: buang sisa penekan click dari gesture yang dibatalkan
        // (pointercancel tidak diikuti click, jadi flag bisa tertinggal true).
        suppressClick.current = false;
      } else if (pointers.current.size === 2) {
        // Pinch dimulai: tidak mungkin lagi jadi klik.
        dragging.current = true;
        suppressClick.current = true;
        const [p1, p2] = [...pointers.current.values()];
        pinchPrev.current = {
          dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
          mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        };
        containerRef.current?.setPointerCapture(event.pointerId);
      }
    },
    [relativePoint],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (lockedRef.current) return;
      if (!pointers.current.has(event.pointerId)) return;
      const point = relativePoint(event.clientX, event.clientY);
      const prev = pointers.current.get(event.pointerId)!;
      pointers.current.set(event.pointerId, point);

      if (pointers.current.size === 2) {
        const [p1, p2] = [...pointers.current.values()];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const before = pinchPrev.current;
        pinchPrev.current = { dist, mid };
        if (!before || before.dist <= 0) return;
        // Geser mengikuti titik tengah, lalu zoom mengelilingi titik tengah baru.
        const v = view.current;
        v.tx += mid.x - before.mid.x;
        v.ty += mid.y - before.mid.y;
        zoomAt(mid.x, mid.y, dist / before.dist);
        return;
      }

      if (pointers.current.size !== 1) return;

      if (!dragging.current) {
        const start = downPoint.current;
        if (!start) return;
        const moved = Math.hypot(point.x - start.x, point.y - start.y);
        if (moved < DRAG_THRESHOLD_PX) return;
        // Ambang terlampaui: mulai drag. Baru DI SINI pointer di-capture,
        // supaya tap biasa tetap menghasilkan click di slot yang ditekan.
        dragging.current = true;
        suppressClick.current = true;
        containerRef.current?.setPointerCapture(event.pointerId);
      }

      const v = view.current;
      v.tx += point.x - prev.x;
      v.ty += point.y - prev.y;
      apply();
    },
    [apply, relativePoint, zoomAt],
  );

  const endPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (containerRef.current?.hasPointerCapture(event.pointerId)) {
      containerRef.current.releasePointerCapture(event.pointerId);
    }
    if (pointers.current.size < 2) pinchPrev.current = null;
    if (pointers.current.size === 0) {
      dragging.current = false;
      downPoint.current = null;
      // suppressClick TIDAK direset di sini: event click datang SETELAH
      // pointerup, dan onClickCapture di bawah yang menghabiskannya.
    }
  }, []);

  const onDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (lockedRef.current) return;
      const point = relativePoint(event.clientX, event.clientY);
      zoomAt(point.x, point.y, STEP_FACTOR, true);
    },
    [relativePoint, zoomAt],
  );

  /** Telan click yang lahir dari drag/pinch supaya tidak salah memilih slot. */
  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    containerRef,
    contentRef,
    containerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onDoubleClick,
      onClickCapture,
    },
    zoomIn,
    zoomOut,
    reset,
    zoomToRect,
  };
}
