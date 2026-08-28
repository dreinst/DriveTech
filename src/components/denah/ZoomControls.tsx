"use client";

/* ---------- Kontrol zoom: pil vertikal gelap mengambang kanan-bawah ---------- */

const ZOOM_BUTTON_CLASS =
  "flex h-11 w-11 items-center justify-center text-ink transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]";

export function ZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col divide-y divide-line overflow-hidden rounded-full border border-line bg-surface-3 shadow-[var(--shadow-md)]">
      <button type="button" onClick={onZoomIn} aria-label="Perbesar peta" className={ZOOM_BUTTON_CLASS}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button type="button" onClick={onZoomOut} aria-label="Perkecil peta" className={ZOOM_BUTTON_CLASS}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 12h14" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onReset}
        aria-label="Kembalikan tampilan peta"
        className={ZOOM_BUTTON_CLASS}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="6.5" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </div>
  );
}
