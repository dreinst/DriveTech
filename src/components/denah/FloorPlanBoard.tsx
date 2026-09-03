"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DateChips, type DateChipStatus } from "@/components/denah/DateChips";
import {
  FloorPlan,
  type ActiveZoneFilter,
  type SelectedSlotPayload,
} from "@/components/denah/FloorPlan";
import { FloorPlanLegend } from "@/components/denah/FloorPlanLegend";
import { SlotSuggestions } from "@/components/denah/SlotSuggestions";
import { useMapViewport } from "@/components/denah/useMapViewport";
import { useRealtimeSlots } from "@/components/denah/useRealtimeSlots";
import { FadeUp, Pressable, SheetIn } from "@/components/motion/motion";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClass } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Stepper } from "@/components/ui/Stepper";
import {
  EVENT_INFO,
  isBookableZoneType,
  isVehicleZoneType,
  MUSIM_1_DATES,
} from "@/lib/domain/constants";
import { slotAdminFee, zoneHasVariedFees, zoneMinAdminFee } from "@/lib/domain/harga";
import {
  dateStatusForSlot,
  freeDatesForSlot,
  hitungTotalBiaya,
  slotStatusAcrossDates,
  type OccupancyRow,
  type SlotDateVerdict,
} from "@/lib/domain/ketersediaan";
import {
  FLOOR_PLAN_ZONES,
  zoneBoundingRect,
  type LayoutZone,
  type Rect,
} from "@/lib/domain/layout";
import { suggestAlternatives } from "@/lib/domain/suggestions";
import type { SlotDetail, SlotStatus, ZoneType, ZoneWithSlots } from "@/lib/types/database";
import { cn, formatRupiah, slotDisplayName } from "@/lib/utils";

/** Satu tanggal gelaran aktif (subset kolom event_dates, sama dengan FloorPlanData). */
export type EventDateItem = { id: string; event_date: string };

export type FloorPlanBoardProps = {
  zones: ZoneWithSlots[];
  /** Tanggal gelaran aktif >= hari ini, urut naik (FloorPlanData.eventDates). */
  eventDates: EventDateItem[];
  /** Okupansi awal per (slot, tanggal) dari view slot_date_status (FloorPlanData.occupancy). */
  occupancy: OccupancyRow[];
  /** True kalau data berasal dari fallback layout (database belum terhubung). */
  isFallback?: boolean;
  className?: string;
};

const SUGGESTION_LIMIT = 5;

/** Label kecil uppercase ala mockup ("TOTAL SLOT", "LEGENDA STATUS"). */
const PANEL_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.08em] text-subtle";

/**
 * Dua layar alur "slot dulu, tanggal belakangan": zona -> peta. Tanggal dipilih
 * belakangan di panel detail slot, jadi stepper menampilkan tiga langkah dan
 * langkah "Pilih Tanggal" aktif begitu ada slot yang diketuk.
 */
type Step = "zona" | "peta";

const STEP_LABELS: readonly string[] = ["Pilih Zona", "Pilih Slot", "Pilih Tanggal"];

/* ---------- Helper tanggal (murni, di luar komponen) ---------- */

/**
 * Jadwal Musim 1 (MUSIM_1_DATES: pembukaan 12-13 September 2026, lalu tiap hari
 * Minggu s.d. 1 November 2026) yang belum lewat — HANYA untuk mode fallback saat
 * database belum terhubung. Ini bukan data karangan melainkan cermin seed
 * event_dates. Dipanggil dari useEffect (client-only) supaya tidak menimbulkan
 * hydration mismatch.
 */
function musim1FallbackDates(): EventDateItem[] {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return MUSIM_1_DATES.filter((iso) => iso >= today).map((iso) => ({
    id: `fallback-${iso}`,
    event_date: iso,
  }));
}

/* ---------- Helper zona: geometri & aksen dari domain/layout.ts ---------- */

const LAYOUT_BY_GROUP_ID = new Map<string, LayoutZone>(
  FLOOR_PLAN_ZONES.map((zone) => [zone.svgGroupId, zone]),
);
const LAYOUT_BY_TYPE = new Map<ZoneType, LayoutZone>(
  FLOOR_PLAN_ZONES.map((zone) => [zone.zoneType, zone]),
);

function layoutZoneFor(zone: ZoneWithSlots): LayoutZone | undefined {
  return (
    (zone.svg_group_id ? LAYOUT_BY_GROUP_ID.get(zone.svg_group_id) : undefined) ??
    LAYOUT_BY_TYPE.get(zone.zone_type)
  );
}

/**
 * Kotak target zoom sebuah zona: gabungan seluruh container-nya (zona UMKM
 * punya dua kolom terpisah), atau bounding box slotnya.
 */
function zoneRectFor(zone: ZoneWithSlots): Rect | null {
  const layout = layoutZoneFor(zone);
  return layout ? zoneBoundingRect(layout) : null;
}

function zoneAccentFor(zone: ZoneWithSlots): string {
  return layoutZoneFor(zone)?.accent ?? "#808080";
}

/** Verdict lintas tanggal -> status slot lama, untuk fungsi murni suggestAlternatives. */
function verdictToSlotStatus(verdict: SlotDateVerdict): SlotStatus {
  if (verdict === "available") return "available";
  if (verdict === "pending") return "pending";
  return "confirmed";
}

/* ---------- Chip indikator realtime (mengambang di atas peta) ---------- */

function RealtimeIndicator({ connected }: { connected: boolean }) {
  return (
    <p className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-full border border-line bg-card/90 px-3 py-1.5 text-xs font-medium text-muted shadow-[var(--shadow-sm)] backdrop-blur">
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          connected ? "animate-pulse bg-ok" : "bg-line-strong",
        )}
      />
      {connected ? "Live" : "Statis"}
    </p>
  );
}

/* ---------- Langkah 1: pilih zona (kartu ala pilih studio bioskop) ---------- */

type ZoneCardData = {
  zone: ZoneWithSlots;
  accent: string;
  available: number;
  total: number;
  /** Biaya admin TERENDAH di zona (harga efektif per slot via slotAdminFee). */
  hargaMulai: number;
  /** True bila ada slot dengan harga override berbeda -> tampilkan "mulai Rp X". */
  hargaBeragam: boolean;
};

type ZoneStepProps = {
  cards: ZoneCardData[];
  onPick: (zoneId: string) => void;
};

function ZoneStep({ cards, onPick }: ZoneStepProps) {
  return (
    <div className="rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow-sm)]">
      <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Pilih Zona</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Jadwal {EVENT_INFO.name}: {EVENT_INFO.scheduleText}. Pilih zona dulu, ketuk slotnya di
        peta, lalu tentukan tanggal sewa di panel slot.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {cards.map(({ zone, accent, available, total, hargaMulai, hargaBeragam }) => {
          const penuh = available === 0;
          const labelHarga = hargaBeragam
            ? `mulai ${formatRupiah(hargaMulai)}`
            : formatRupiah(hargaMulai);
          return (
            <button
              key={zone.id}
              type="button"
              disabled={penuh}
              onClick={() => onPick(zone.id)}
              aria-label={
                penuh
                  ? `${zone.name} — penuh di semua tanggal`
                  : `${zone.name}, biaya admin ${labelHarga} per tanggal, ${available} dari ${total} slot tersedia. Buka peta zona ini.`
              }
              className={cn(
                "flex flex-col items-start gap-1 rounded-2xl border p-5 text-left shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
                penuh
                  ? "border-line bg-surface-2"
                  : "border-line bg-card hover:border-accent hover:shadow-[var(--shadow-md)] active:scale-[0.99]",
              )}
            >
              <span className="flex w-full items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-base font-semibold",
                    penuh ? "text-subtle" : "text-ink",
                  )}
                >
                  {zone.name}
                </span>
                {!penuh ? (
                  <span aria-hidden="true" className="text-accent">
                    →
                  </span>
                ) : null}
              </span>
              <span className={cn("text-sm", penuh ? "text-subtle" : "text-muted")}>
                {hargaBeragam ? <span className="mr-1">mulai</span> : null}
                <span
                  className={cn("tabular font-medium", penuh ? "text-subtle" : "text-ink")}
                >
                  {formatRupiah(hargaMulai)}
                </span>
                /tanggal
              </span>
              <span
                className={cn("mt-1.5 text-xs font-semibold", penuh ? "text-danger" : "text-ok")}
              >
                {penuh ? "Penuh di semua tanggal" : `${available} dari ${total} tersedia`}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted">
        Setelah memilih zona, peta terbuka langsung ter-zoom dan terkunci ke zona itu — hanya
        slot zona tersebut yang bisa diketuk. Biaya admin dihitung per tanggal. Mau lihat tata
        letak seluruh area dulu?{" "}
        <Link
          href="/denah"
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          Lihat denah lengkap →
        </Link>
      </p>
    </div>
  );
}

/* ---------- Panel kanan: info + statistik + legenda (belum ada slot dipilih) ---------- */

type VerdictStats = { total: number; byVerdict: Record<SlotDateVerdict, number> };

function InfoPanel({ stats }: { stats: VerdictStats }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow-sm)]">
      <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Tata Letak Lokasi</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Peta terkunci pada zona pilihanmu — hanya slot zona ini yang bisa diketuk. Ketuk slot
        hijau untuk melihat tanggal yang masih kosong; mau pindah zona, kembali lewat tombol
        &ldquo;Pilih Zona&rdquo;.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2 p-4">
          <p className={PANEL_LABEL_CLASS}>Total Slot</p>
          <p className="tabular mt-1 text-3xl font-semibold tracking-[-0.01em] text-ink">
            {stats.total}
          </p>
        </div>
        <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ok">Tersedia</p>
          <p className="tabular mt-1 text-3xl font-semibold tracking-[-0.01em] text-ink">
            {stats.byVerdict.available}
          </p>
        </div>
      </div>

      <p className={cn(PANEL_LABEL_CLASS, "mt-6")}>Legenda Status</p>
      <FloorPlanLegend className="mt-2" counts={stats.byVerdict} />

      <div className="mt-5 border-t border-line pt-5">
        <Button disabled className="w-full">
          Pilih Slot untuk Melanjutkan
        </Button>
      </div>
    </div>
  );
}

/* ---------- Panel kanan: detail slot terpilih + pilih tanggal ---------- */

type SlotDetailPanelProps = {
  slot: SelectedSlotPayload;
  zone: ZoneWithSlots;
  /** Verdict lintas tanggal (slotStatusAcrossDates). */
  verdict: SlotDateVerdict;
  /** Tanggal gelaran aktif mendatang (ISO, urut naik). */
  activeDates: string[];
  /** Status per tanggal untuk slot INI (free/pending/confirmed). */
  statusFor: (iso: string) => DateChipStatus;
  selectedDates: string[];
  onToggleDate: (iso: string) => void;
  suggestions: SlotDetail[];
  isFallback: boolean;
  isVehicleZone: boolean;
  onClose: () => void;
};

function SlotDetailPanel({
  slot,
  zone,
  verdict,
  activeDates,
  statusFor,
  selectedDates,
  onToggleDate,
  suggestions,
  isFallback,
  isVehicleZone,
  onClose,
}: SlotDetailPanelProps) {
  // Harga efektif slot INI: override per-slot (mis. Booth Leasing UMKM 11-20)
  // menang atas tarif dasar zona — satu sumber resolusi di domain/harga.ts.
  const hargaSlot = slotAdminFee(slot, zone);
  const totalBiaya = hitungTotalBiaya(hargaSlot, selectedDates.length);
  const tanggalCsv = selectedDates.join(",");
  const bisaLanjut = selectedDates.length > 0 && !isFallback;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        {verdict === "blocked" ? (
          <Badge tone="slate" dot>
            Diblokir
          </Badge>
        ) : (
          <StatusBadge status={verdict} kind="slot" />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup detail slot"
          className="-mr-2 -mt-2 flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <p className={cn(PANEL_LABEL_CLASS, "mt-4")}>{zone.name}</p>
      <h3 className="mt-1 truncate text-3xl font-semibold tracking-[-0.01em] text-ink">
        {slotDisplayName(slot)}
      </h3>
      {slot.peruntukan ? (
        <div className="mt-2">
          <Badge tone="blue">Peruntukan: {slot.peruntukan}</Badge>
        </div>
      ) : null}

      {verdict === "available" ? (
        <>
          <p className={cn(PANEL_LABEL_CLASS, "mt-5")}>Pilih Tanggal</p>
          {activeDates.length === 0 ? (
            <p className="mt-2 rounded-[var(--radius-sm)] border-l-2 border-warn bg-warn-soft px-3 py-2 text-xs text-ink-2">
              Belum ada tanggal gelaran yang dibuka. Silakan cek kembali beberapa saat lagi.
            </p>
          ) : (
            <>
              <DateChips
                className="mt-2"
                dates={activeDates}
                statusFor={statusFor}
                selected={selectedDates}
                onToggle={onToggleDate}
              />
              <p className="mt-2 text-xs text-muted">
                Bisa pilih lebih dari satu tanggal. Tanggal berlabel status sudah dipesan penyewa
                lain untuk slot ini.
              </p>
            </>
          )}

          <div className="mt-5 space-y-2 border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted">Biaya admin / tanggal</span>
              <span className="tabular text-sm font-medium text-ink">
                {formatRupiah(hargaSlot)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted">
                Total ({selectedDates.length} tanggal)
              </span>
              <span className="tabular text-2xl font-semibold tracking-[-0.01em] text-ink">
                {formatRupiah(totalBiaya)}
              </span>
            </div>
          </div>

          {isFallback ? (
            <p className="mt-5 rounded-[var(--radius-sm)] border-l-2 border-warn bg-warn-soft px-3 py-2 text-xs text-ink-2">
              Database belum terhubung &mdash; denah ini contoh, pemesanan belum bisa diproses.
            </p>
          ) : (
            <div className="mt-6 space-y-2.5">
              {bisaLanjut ? (
                <Pressable>
                  <Link
                    href={`/booking/${slot.id}?tanggal=${encodeURIComponent(tanggalCsv)}`}
                    className={cn(buttonClass("primary", "md"), "w-full")}
                  >
                    Lanjutkan Pemesanan
                  </Link>
                </Pressable>
              ) : (
                <Button disabled className="w-full">
                  Lanjutkan Pemesanan
                </Button>
              )}
              {selectedDates.length === 0 ? (
                <p className="text-center text-xs text-muted" aria-live="polite">
                  Pilih minimal satu tanggal untuk melanjutkan.
                </p>
              ) : null}
              {isVehicleZone ? (
                <Link href={`/beli/${slot.id}`} className={cn(buttonClass("ghost", "md"), "w-full")}>
                  Beli Unit di Slot Ini
                </Link>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <div className="mt-5 space-y-2">
          <p className="text-sm text-muted">
            {verdict === "blocked"
              ? "Slot ini sedang diblokir panitia untuk semua tanggal."
              : verdict === "pending"
                ? "Slot ini sedang menunggu pembayaran di semua tanggal gelaran."
                : "Slot ini sudah penuh di semua tanggal gelaran."}{" "}
            Slot lain yang masih kosong:
          </p>
          <SlotSuggestions suggestions={suggestions} />
        </div>
      )}
    </>
  );
}

/* ---------- Komponen utama ---------- */

/**
 * Peta lokasi interaktif model PER TANGGAL, alur "slot dulu, tanggal belakangan"
 * (ala pilih studio bioskop, urutan dibalik atas permintaan pemilik):
 *
 *   1. PILIH ZONA   — kartu zona dengan biaya/tanggal & hitungan slot yang masih
 *                     punya tanggal kosong (slotStatusAcrossDates);
 *   2. PETA         — terbuka langsung ter-zoom DAN TERKUNCI ke zona terpilih:
 *                     tanpa pan/pinch/wheel, hanya slot zona itu yang bisa
 *                     diketuk (zona lain diredupkan), slot diwarnai verdict
 *                     LINTAS tanggal (hijau = masih ada tanggal kosong);
 *   3. PANEL SLOT   — ketuk slot hijau: chip tanggal per slot (yang terisi
 *                     dinonaktifkan), total = biaya admin x jumlah tanggal.
 *
 * Denah lengkap yang bebas dijelajahi (tanpa pemesanan) ada di halaman /denah.
 * Peta selalu ter-mount (langkah 2 hanya disembunyikan dengan display:none)
 * supaya zoom otomatis tinggal dianimasikan saat langkahnya terbuka. Tersinkron
 * realtime dengan tabel slots (blokir panitia) dan booking_dates (okupansi per
 * tanggal).
 */
export function FloorPlanBoard({
  zones: initialZones,
  eventDates,
  occupancy: initialOccupancy,
  isFallback = false,
  className,
}: FloorPlanBoardProps) {
  const { zones, occupancy, connected } = useRealtimeSlots(initialZones, initialOccupancy);

  const [step, setStep] = useState<Step>("zona");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  /** Tanggal terpilih untuk slot yang sedang dibuka di panel (bukan global). */
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [fallbackDates, setFallbackDates] = useState<EventDateItem[]>([]);

  // Peta booking SELALU terkunci: navigasi manual (wheel/drag/pinch) mati,
  // pengunjung tidak bisa menggeser ke slot zona lain. Denah bebas jelajah
  // tersedia di halaman /denah (hanya melihat, tanpa pemesanan).
  const { containerRef, contentRef, containerHandlers, reset, zoomToRect } = useMapViewport({
    locked: true,
  });

  // Mode fallback tanpa event_dates: pakai jadwal Musim 1 yang belum lewat
  // (client-only, lihat musim1FallbackDates) supaya alurnya tetap bisa dicoba.
  useEffect(() => {
    if (!isFallback || eventDates.length > 0) return;
    setFallbackDates(musim1FallbackDates());
  }, [isFallback, eventDates.length]);

  const dateList = eventDates.length > 0 ? eventDates : fallbackDates;
  const activeDates = useMemo(() => dateList.map((d) => d.event_date), [dateList]);

  /* ---------- Verdict ketersediaan per slot LINTAS tanggal aktif ---------- */

  const verdicts = useMemo(() => {
    const map = new Map<string, SlotDateVerdict>();
    for (const zone of zones) {
      for (const slot of zone.slots) {
        map.set(
          slot.id,
          slotStatusAcrossDates({
            slot,
            zoneType: zone.zone_type,
            activeDates,
            occupancy,
          }),
        );
      }
    }
    return map;
  }, [zones, activeDates, occupancy]);

  // Statistik live per verdict — slot pada zona bookable saja.
  const stats = useMemo<VerdictStats>(() => {
    const byVerdict: Record<SlotDateVerdict, number> = {
      available: 0,
      pending: 0,
      confirmed: 0,
      blocked: 0,
    };
    let total = 0;
    for (const zone of zones) {
      if (!isBookableZoneType(zone.zone_type)) continue;
      for (const slot of zone.slots) {
        total += 1;
        const verdict =
          verdicts.get(slot.id) ?? (slot.status === "available" ? "available" : "blocked");
        byVerdict[verdict] += 1;
      }
    }
    return { total, byVerdict };
  }, [zones, verdicts]);

  // Kartu zona langkah 1: zona bookable saja, urut display_order (sudah dari server).
  const zoneCards = useMemo<ZoneCardData[]>(
    () =>
      zones
        .filter((zone) => isBookableZoneType(zone.zone_type))
        .map((zone) => {
          let available = 0;
          for (const slot of zone.slots) {
            if ((verdicts.get(slot.id) ?? "available") === "available") available += 1;
          }
          return {
            zone,
            accent: zoneAccentFor(zone),
            available,
            total: zone.slots.length,
            // Zona dengan override per-slot (mis. UMKM Booth Leasing/Otomotif)
            // ditampilkan sebagai "mulai Rp X" dari harga slot terendah.
            hargaMulai: zoneMinAdminFee(zone, zone.slots),
            hargaBeragam: zoneHasVariedFees(zone, zone.slots),
          };
        }),
    [zones, verdicts],
  );

  /* ---------- Navigasi langkah ---------- */

  const pickZone = useCallback((id: string) => {
    setZoneId(id);
    setSelectedSlotId(null);
    setSelectedDates([]);
    setStep("peta");
  }, []);

  const backToZona = useCallback(() => {
    setSelectedSlotId(null);
    setSelectedDates([]);
    reset();
    setStep("zona");
  }, [reset]);

  const selectedZone = useMemo(
    () => (zoneId ? zones.find((zone) => zone.id === zoneId) ?? null : null),
    [zones, zoneId],
  );

  // Rect target zoom stabil: container layout adalah objek modul yang tetap.
  const zoomTargetRect = useMemo<Rect | null>(
    () => (selectedZone ? zoneRectFor(selectedZone) : null),
    [selectedZone],
  );

  // Pembatas peta terkunci: hanya slot milik zona terpilih (baris DB) yang bisa
  // diklik; slot & container zona lain diredupkan oleh FloorPlan.
  const activeZoneFilter = useMemo<ActiveZoneFilter | null>(() => {
    if (!selectedZone) return null;
    return {
      slotIds: new Set(selectedZone.slots.map((slot) => slot.id)),
      svgGroupId: layoutZoneFor(selectedZone)?.svgGroupId ?? selectedZone.svg_group_id,
    };
  }, [selectedZone]);

  // Saat langkah peta terbuka: animasikan zoom ke zona terpilih. rAF memastikan
  // container sudah keluar dari display:none sebelum ukurannya dibaca. Karena
  // navigasi manual terkunci, ukuran jendela berubah = pas-kan ulang zonanya.
  useEffect(() => {
    if (step !== "peta" || !zoomTargetRect) return;
    const raf = requestAnimationFrame(() => zoomToRect(zoomTargetRect, { animate: true }));
    const handleResize = () => zoomToRect(zoomTargetRect, { animate: false });
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
    };
  }, [step, zoomTargetRect, zoomToRect]);

  /* ---------- Pilihan slot + tanggal per slot ---------- */

  const handleSelectSlot = useCallback(
    (slot: SelectedSlotPayload) => {
      // Denah sudah menonaktifkan klik zona non-bookable, slot diblokir, dan
      // slot di luar zona terpilih; ini lapis kedua.
      if (!isBookableZoneType(slot.zoneType)) return;
      if (zoneId !== null && slot.zone_id !== zoneId) return;
      setSelectedSlotId(slot.id);
      // Preselect satu tanggal bebas TERDEKAT — lebih ramah daripada mulai kosong.
      const free = freeDatesForSlot({ slotId: slot.id, activeDates, occupancy });
      setSelectedDates(free.slice(0, 1));
    },
    [zoneId, activeDates, occupancy],
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedSlotId(null);
    setSelectedDates([]);
  }, []);

  const toggleDate = useCallback((iso: string) => {
    setSelectedDates((current) =>
      current.includes(iso) ? current.filter((d) => d !== iso) : [...current, iso].sort(),
    );
  }, []);

  // Realtime: kalau tanggal terpilih keburu diambil orang lain, buang dari pilihan.
  useEffect(() => {
    if (!selectedSlotId) return;
    const free = new Set(freeDatesForSlot({ slotId: selectedSlotId, activeDates, occupancy }));
    setSelectedDates((current) => {
      const valid = current.filter((iso) => free.has(iso));
      return valid.length === current.length ? current : valid;
    });
  }, [selectedSlotId, activeDates, occupancy]);

  const selected = useMemo(() => {
    if (!selectedSlotId) return null;
    for (const zone of zones) {
      const slot = zone.slots.find((item) => item.id === selectedSlotId);
      if (slot) return { slot: { ...slot, zoneName: zone.name, zoneType: zone.zone_type }, zone };
    }
    return null;
  }, [zones, selectedSlotId]);

  const selectedVerdict: SlotDateVerdict = selected
    ? verdicts.get(selected.slot.id) ?? "available"
    : "available";

  /** Status per tanggal untuk slot yang sedang dibuka (dipakai chip panel). */
  const statusForSelectedSlot = useCallback(
    (iso: string): DateChipStatus =>
      selectedSlotId ? dateStatusForSlot(selectedSlotId, iso, occupancy) : "free",
    [selectedSlotId, occupancy],
  );

  // Daftar slot untuk fungsi murni suggestAlternatives — statusnya di-remap dari
  // verdict lintas tanggal supaya sarannya masih punya tanggal kosong.
  const allSlotsForSuggestion = useMemo<SlotDetail[]>(
    () =>
      zones.flatMap((zone) =>
        zone.slots.map((slot) => ({
          ...slot,
          status: verdictToSlotStatus(verdicts.get(slot.id) ?? "available"),
          zone,
        })),
      ),
    [zones, verdicts],
  );

  const suggestions = useMemo<SlotDetail[]>(() => {
    if (!selected || selectedVerdict === "available") return [];
    return suggestAlternatives({
      target: {
        ...selected.slot,
        status: verdictToSlotStatus(selectedVerdict),
        zone: selected.zone,
      },
      allSlots: allSlotsForSuggestion,
      limit: SUGGESTION_LIMIT,
    });
  }, [selected, selectedVerdict, allSlotsForSuggestion]);

  const isVehicleZone = selected !== null && isVehicleZoneType(selected.zone.zone_type);

  // Stepper: langkah "Pilih Tanggal" aktif begitu ada slot terbuka di panel.
  const stepIndex = step === "zona" ? 0 : selected === null ? 1 : 2;

  // Ringkasan zona terpilih untuk header peta.
  const selectedZoneCard = useMemo(
    () => (zoneId ? zoneCards.find((card) => card.zone.id === zoneId) ?? null : null),
    [zoneCards, zoneId],
  );

  /* ---------- Render ---------- */

  return (
    <div className={cn("space-y-1", className)}>
      <Stepper steps={[...STEP_LABELS]} current={stepIndex} />

      {step === "zona" ? (
        <FadeUp>
          <ZoneStep cards={zoneCards} onPick={pickZone} />
        </FadeUp>
      ) : null}

      {/* Langkah 2 selalu ter-mount (hidden saat belum aktif) — lihat komentar komponen. */}
      <div className={step === "peta" ? "space-y-3" : "hidden"}>
        {/* Header kecil: kembali, zona + ketersediaan ringkas, reset zoom. */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-[var(--shadow-sm)]">
          <Button variant="secondary" size="sm" onClick={backToZona}>
            <span aria-hidden="true">←</span> Pilih Zona
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {selectedZone?.name ?? "Semua zona"}
            </p>
            <p className="truncate text-xs text-muted">
              {selectedZoneCard
                ? `${selectedZoneCard.available} dari ${selectedZoneCard.total} slot masih punya tanggal kosong`
                : "Ketuk slot untuk memilih tanggal"}
            </p>
          </div>
          {/* Denah lengkap dibuka di halaman terpisah yang hanya untuk melihat —
              peta booking ini tetap terkunci pada zona terpilih. */}
          <Link href="/denah" className={buttonClass("ghost", "sm")}>
            Lihat Denah Lengkap
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          {/* ---------- Kartu peta: kanvas TETAP TERANG di atas tema gelap ---------- */}
          <div className="relative overflow-hidden rounded-2xl border border-line bg-map-canvas shadow-[var(--shadow-sm)]">
            <div
              ref={containerRef}
              {...containerHandlers}
              className="relative h-[26rem] w-full select-none sm:h-[34rem] lg:h-[calc(100vh-8rem)] lg:max-h-[50rem] lg:min-h-[36rem]"
            >
              <div ref={contentRef} className="absolute inset-0">
                <FloorPlan
                  zones={zones}
                  selectedSlotId={selectedSlotId}
                  onSelectSlot={handleSelectSlot}
                  verdicts={verdicts}
                  activeZone={activeZoneFilter}
                />
              </div>
            </div>

            <RealtimeIndicator connected={connected} />

            {/*
              Tanpa JavaScript, denah interaktif di atas tidak bisa dioperasikan.
              public/denah.svg adalah denah statis dengan geometri yang sama (dihasilkan
              tools/generate-denah-svg.py dari koordinat yang sama dengan domain/layout.ts),
              jadi pengunjung tetap bisa melihat tata letak lokasi. Statusnya tidak live.
            */}
            <noscript>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/denah.svg"
                alt="Denah lokasi pameran: tenda dealer mobil baru, area pameran mobil bekas, tenda motor baru, area motor bekas, tenda UMKM, tenda otomotif & leasing, warung, dan fasilitas umum."
                className="mx-auto block w-full max-w-3xl"
              />
              {/* Teks gelap: paragraf ini tampil di atas kanvas peta yang terang. */}
              <p className="my-2 text-center text-xs text-app opacity-70">
                Denah statis &mdash; aktifkan JavaScript untuk status slot terkini dan pemesanan.
              </p>
            </noscript>
          </div>

          {/* ---------- Panel kanan (di layar kecil: turun ke bawah) ---------- */}
          <aside className="min-w-0">
            {selected === null ? (
              <InfoPanel stats={stats} />
            ) : (
              <>
                {/* Di layar kecil panel detail jadi lembar bawah (bottom sheet). */}
                <SheetIn
                  key={selected.slot.id}
                  className="fixed inset-x-0 bottom-0 z-40 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-line bg-card p-5 shadow-[var(--shadow-lg)] lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:rounded-2xl lg:border lg:p-6 lg:shadow-[var(--shadow-sm)]"
                >
                  <SlotDetailPanel
                    slot={selected.slot}
                    zone={selected.zone}
                    verdict={selectedVerdict}
                    activeDates={activeDates}
                    statusFor={statusForSelectedSlot}
                    selectedDates={selectedDates}
                    onToggleDate={toggleDate}
                    suggestions={suggestions}
                    isFallback={isFallback}
                    isVehicleZone={isVehicleZone}
                    onClose={handleCloseDetail}
                  />
                </SheetIn>
                {/* Ruang kosong supaya konten tidak tertutup lembar bawah di layar kecil. */}
                <div aria-hidden="true" className="h-60 lg:hidden" />
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
