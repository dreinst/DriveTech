"use client";

import { useMemo, type CSSProperties, type KeyboardEvent } from "react";

import { isBookableZoneType, SLOT_SELECTED_STYLE, SLOT_STATUS_STYLE } from "@/lib/domain/constants";
import type { SlotDateVerdict } from "@/lib/domain/ketersediaan";
import { SLOT_LEGEND_LABEL } from "@/lib/domain/labels";
import {
  DECOR_STYLE,
  FLOOR_PLAN_ANNOTATIONS,
  FLOOR_PLAN_DECOR,
  FLOOR_PLAN_OUTLINE,
  FLOOR_PLAN_VIEWBOX,
  FLOOR_PLAN_ZONES,
  slotFontSize,
  wrapLabel,
  type DecorItem,
  type LabelOrientation,
  type LayoutSlot,
  type Rect,
} from "@/lib/domain/layout";
import type { SlotRow, SlotStatus, ZoneType, ZoneWithSlots } from "@/lib/types/database";
import { slotDisplayName } from "@/lib/utils";

/** Baris slot dari database + identitas zonanya, dikirim balik lewat onSelectSlot. */
export type SelectedSlotPayload = SlotRow & { zoneName: string; zoneType: ZoneType };

/**
 * Pembatas "hanya zona ini yang aktif" untuk alur booking per zona.
 * Keanggotaan slot ditentukan dari BARIS DATABASE (slotIds), bukan grup layout,
 * supaya pemisahan UMKM (1-10, 21-30) vs Booth Leasing & Brand (11-20) yang
 * berbagi kolom fisik tetap benar. svgGroupId dipakai sebagai fallback untuk
 * slot layout tanpa baris DB dan untuk meredupkan container zona lain.
 */
export type ActiveZoneFilter = {
  slotIds: ReadonlySet<string>;
  svgGroupId: string | null;
};

export type FloorPlanProps = {
  zones: ZoneWithSlots[];
  selectedSlotId?: string | null;
  onSelectSlot?: (slot: SelectedSlotPayload) => void;
  /**
   * Kalau diisi, HANYA slot milik zona ini yang bisa diklik/di-fokus; slot dan
   * container zona lain diredupkan dan disembunyikan dari screen reader.
   * null/undefined = semua zona bookable aktif (perilaku lama, mis. halaman
   * denah lengkap yang read-only).
   */
  activeZone?: ActiveZoneFilter | null;
  /**
   * Skala zoom viewport saat denah dibesarkan (1 = tanpa zoom). Dipakai untuk
   * kompensasi ketebalan garis slot supaya tidak menebal berlebihan saat zoom.
   */
  interactionScale?: number;
  /**
   * Verdict ketersediaan per slot id untuk TANGGAL TERPILIH (hasil
   * slotStatusForDates di domain/ketersediaan.ts). Kalau diisi, warna slot
   * mengikuti verdict ini — bukan slots.status mentah; "blocked" digambar
   * netral (Diblokir panitia) dan tidak bisa diklik. Tanpa prop ini denah
   * jatuh ke perilaku lama berbasis slots.status.
   */
  verdicts?: ReadonlyMap<string, SlotDateVerdict>;
};

/* ---------- Helper teks (murni, di luar komponen) ---------- */

const LINE_HEIGHT_EM = 1.05;
/** Perkiraan lebar rata-rata karakter terhadap font-size, untuk memperkirakan muat/tidak. */
const CHAR_WIDTH_RATIO = 0.56;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function maxCharsFor(lengthAvailable: number, fontSize: number): number {
  return Math.max(4, Math.floor((lengthAvailable * 0.92) / (fontSize * CHAR_WIDTH_RATIO)));
}

/**
 * Cari ukuran font & penggalan baris agar label muat di dalam kotak.
 * "along" = sisi searah tulisan, "across" = sisi tempat baris menumpuk.
 */
function fitLabel(
  text: string,
  rect: Rect,
  orientation: LabelOrientation,
): { fontSize: number; lines: string[] } {
  const along = orientation === "vertical" ? rect.height : rect.width;
  const across = orientation === "vertical" ? rect.width : rect.height;

  let fontSize = clamp(Math.round(Math.min(across * 0.28, along * 0.1, 16)), 9, 16);
  let lines = wrapLabel(text, maxCharsFor(along, fontSize));

  const maxLines = Math.max(1, Math.floor((across * 0.9) / (fontSize * LINE_HEIGHT_EM)));
  if (lines.length > maxLines) {
    fontSize = clamp(Math.floor((across * 0.9) / (lines.length * LINE_HEIGHT_EM)), 7, fontSize);
    lines = wrapLabel(text, maxCharsFor(along, fontSize));
  }

  return { fontSize, lines };
}

function centerOf(rect: Rect): { cx: number; cy: number } {
  return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 };
}

/* ---------- Sub-komponen: teks multi-baris di tengah kotak ---------- */

type BoxLabelProps = {
  rect: Rect;
  lines: string[];
  fontSize: number;
  fill: string;
  orientation: LabelOrientation;
  opacity?: number;
};

function BoxLabel({ rect, lines, fontSize, fill, orientation, opacity }: BoxLabelProps) {
  if (lines.length === 0) return null;
  const { cx, cy } = centerOf(rect);
  const firstDy = -(((lines.length - 1) * LINE_HEIGHT_EM) / 2);

  return (
    <text
      x={cx}
      y={cy}
      fill={fill}
      fontSize={fontSize}
      fontWeight={600}
      textAnchor="middle"
      dominantBaseline="middle"
      opacity={opacity}
      transform={orientation === "vertical" ? `rotate(-90 ${cx} ${cy})` : undefined}
      style={{ pointerEvents: "none" }}
    >
      {lines.map((line, i) => (
        <tspan key={`${line}-${i}`} x={cx} dy={`${i === 0 ? firstDy : LINE_HEIGHT_EM}em`}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/* ---------- Sub-komponen: dekor (taman, bangunan, gerbang), tidak bisa diklik ---------- */

function Decor({ item }: { item: DecorItem }) {
  const style = DECOR_STYLE[item.kind];
  const { cx, cy } = centerOf(item);
  return (
    <rect
      aria-hidden="true"
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height}
      fill={style.fill}
      stroke={style.stroke ?? "none"}
      strokeWidth={style.stroke ? 5 : 0}
      transform={item.rotate ? `rotate(${item.rotate} ${cx} ${cy})` : undefined}
      style={{ pointerEvents: "none" }}
    />
  );
}

/* ---------- Sub-komponen: label area (kotak hitam, teks putih) ---------- */

function AreaTag({ x, y, text }: { x: number; y: number; text: string }) {
  const width = text.length * 8.2 + 14;
  return (
    <g aria-hidden="true" style={{ pointerEvents: "none" }}>
      <rect x={x} y={y} width={width} height={22} fill="#0a0a0a" />
      <text
        x={x + width / 2}
        y={y + 12}
        fill="#ffffff"
        fontSize={14}
        fontWeight={700}
        fontStyle="italic"
        letterSpacing={1}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {text}
      </text>
    </g>
  );
}

/* ---------- Sub-komponen: satu kotak slot ---------- */

type SlotShapeProps = {
  layoutSlot: LayoutSlot;
  row: SelectedSlotPayload | undefined;
  zoneType: ZoneType;
  zoneName: string;
  selected: boolean;
  onSelectSlot?: (slot: SelectedSlotPayload) => void;
  /** Pembagi ketebalan garis saat denah di-zoom (1 = tanpa kompensasi). */
  strokeScale: number;
  /** Verdict per-tanggal slot ini; undefined = pakai slots.status mentah. */
  verdict?: SlotDateVerdict;
  /** False = di luar zona aktif saat peta terkunci: redup, tak bisa diklik. */
  inActiveZone: boolean;
};

function SlotShape({
  layoutSlot,
  row,
  zoneType,
  zoneName,
  selected,
  onSelectSlot,
  strokeScale,
  verdict,
  inActiveZone,
}: SlotShapeProps) {
  // Zona non-bookable (facility + warung) digambar netral abu & tidak bisa diklik.
  const bookable = isBookableZoneType(zoneType);
  // Model per tanggal: slot yang diblokir panitia (slots.status != available)
  // digambar netral seperti fasilitas dan tidak bisa diklik.
  const blocked = bookable && verdict === "blocked";
  let status: SlotStatus | "facility";
  if (!bookable || verdict === "blocked") {
    status = "facility";
  } else if (verdict !== undefined) {
    status = verdict;
  } else {
    status = row?.status ?? "available";
  }
  // Slot yang sedang dipilih memakai gaya "Pilihan Anda" (oranye).
  const style = selected && bookable ? SLOT_SELECTED_STYLE : SLOT_STATUS_STYLE[status];
  const interactive =
    inActiveZone && bookable && !blocked && row !== undefined && onSelectSlot !== undefined;

  // Label: pakai nama dari database kalau ada, kalau tidak pakai label geometri.
  const text = row?.slot_label ?? layoutSlot.label;
  const isNumberOnly = /^\d+$/.test(text);

  const handleSelect = () => {
    if (row && onSelectSlot) onSelectSlot(row);
  };

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleSelect();
  };

  const displayName = row
    ? slotDisplayName(row)
    : slotDisplayName({ slot_number: layoutSlot.slotNumber, slot_label: layoutSlot.label });

  // Slot non-bookable / diblokir tetap punya nama terbaca screen reader (tanpa peran tombol).
  const nonInteractiveLabel = blocked
    ? `${zoneName}, ${displayName} — Diblokir panitia, tidak dapat dipesan`
    : !bookable
      ? zoneType === "warung"
        ? `${displayName} — belum dibuka untuk booking online`
        : `${displayName} — fasilitas umum, tidak disewakan`
      : null;

  // Di luar zona aktif: sembunyikan dari screen reader sekalian — saat peta
  // terkunci per zona, hanya slot zona itu yang relevan untuk dinavigasi.
  const ariaLabel = !inActiveZone
    ? undefined
    : interactive
      ? `${zoneName}, ${displayName}, ${SLOT_LEGEND_LABEL[status]}. Tekan Enter untuk memilih slot ini.`
      : nonInteractiveLabel ?? undefined;

  const fitted = isNumberOnly ? null : fitLabel(text, layoutSlot, layoutSlot.labelOrientation);
  // Lapak miring (Area G): kotaknya diputar mengelilingi titik tengah,
  // teks nomor tetap tegak supaya terbaca.
  const slotTransform = layoutSlot.rotate
    ? `rotate(${layoutSlot.rotate} ${layoutSlot.x + layoutSlot.width / 2} ${layoutSlot.y + layoutSlot.height / 2})`
    : undefined;

  return (
    <g
      id={layoutSlot.svgElementId}
      // Tautan SVG -> form booking: id unik slot (uuid baris DB) + URL formnya,
      // supaya alat luar (script, test, ekstensi) bisa menyambungkan kotak denah
      // ke form bookingnya. Tanpa baris DB, kedua atribut tidak dipasang.
      data-slot-uuid={row?.id}
      data-form-url={row ? `/booking/${row.id}` : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      aria-pressed={interactive ? selected : undefined}
      aria-hidden={ariaLabel ? undefined : true}
      onClick={interactive ? handleSelect : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      className={interactive ? "group cursor-pointer" : "cursor-default"}
      opacity={inActiveZone ? undefined : 0.35}
      style={interactive ? undefined : { pointerEvents: "none" }}
    >
      <rect
        x={layoutSlot.x}
        y={layoutSlot.y}
        width={layoutSlot.width}
        height={layoutSlot.height}
        transform={slotTransform}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={(selected ? 2.25 : 1) / strokeScale}
        className={
          interactive
            ? "transition-[stroke-width] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:[stroke-width:var(--slot-hover-sw)]"
            : undefined
        }
        style={
          interactive
            ? ({ "--slot-hover-sw": `${(selected ? 2.75 : 2.5) / strokeScale}px` } as CSSProperties)
            : undefined
        }
      />
      {selected ? (
        <rect
          x={layoutSlot.x - 3}
          y={layoutSlot.y - 3}
          width={layoutSlot.width + 6}
          height={layoutSlot.height + 6}
          transform={slotTransform}
          fill="none"
          stroke={SLOT_SELECTED_STYLE.stroke}
          strokeWidth={2 / strokeScale}
          opacity={0.35}
          style={{ pointerEvents: "none" }}
        />
      ) : null}

      {isNumberOnly ? (
        <text
          x={layoutSlot.x + layoutSlot.width / 2}
          y={layoutSlot.y + layoutSlot.height / 2}
          fill={style.text}
          fontSize={slotFontSize(layoutSlot)}
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ pointerEvents: "none", fontFamily: "var(--font-display)" }}
        >
          {text}
        </text>
      ) : (
        <BoxLabel
          rect={layoutSlot}
          lines={fitted ? fitted.lines : []}
          fontSize={fitted ? fitted.fontSize : 10}
          fill={style.text}
          orientation={layoutSlot.labelOrientation}
        />
      )}
    </g>
  );
}

/* ---------- Komponen utama ---------- */

export function FloorPlan({
  zones,
  selectedSlotId,
  onSelectSlot,
  interactionScale,
  verdicts,
  activeZone,
}: FloorPlanProps) {
  const strokeScale = Math.max(interactionScale ?? 1, 1);
  // Satu Map untuk semua slot: lookup O(1) saat menggambar 178 kotak.
  const slotIndex = useMemo(() => {
    const map = new Map<string, SelectedSlotPayload>();
    for (const zone of zones) {
      for (const slot of zone.slots) {
        if (!slot.svg_element_id) continue;
        map.set(slot.svg_element_id, {
          ...slot,
          zoneName: zone.name,
          zoneType: zone.zone_type,
        });
      }
    }
    return map;
  }, [zones]);

  return (
    <svg
      role="img"
      viewBox={`0 0 ${FLOOR_PLAN_VIEWBOX.width} ${FLOOR_PLAN_VIEWBOX.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
    >
      <title>Denah lokasi pameran</title>
      <desc>
        Denah interaktif Drive Tech di Kampung Tentara, Singosari: Area A mobil baru, Area B, C,
        dan D mobil bekas serta otomotif, Area E motor baru dan motor bekas, Area F, G, dan H UMKM,
        deretan warung, dan fasilitas umum. Kotak putih berarti lapak tersedia, oranye muda
        menunggu pembayaran, hitam sudah terisi, krem adalah fasilitas dan warung yang tidak
        disewakan online.
      </desc>

      {/* (a) Batas lokasi */}
      <path d={FLOOR_PLAN_OUTLINE} fill="#ffffff" stroke="#0a0a0a" strokeWidth={2.5} />

      {/* (b) Dekor: taman, bangunan, gerbang */}
      {FLOOR_PLAN_DECOR.map((item) => (
        <Decor key={item.id} item={item} />
      ))}

      {/* (d) Slot */}
      {FLOOR_PLAN_ZONES.map((zone) => (
        <g key={zone.svgGroupId} id={zone.svgGroupId}>
          {zone.slots.map((layoutSlot) => {
            const row = slotIndex.get(layoutSlot.svgElementId);
            // Keanggotaan zona aktif dari baris DB; slot tanpa baris DB jatuh
            // ke perbandingan grup layout (mode fallback tanpa database).
            const inActiveZone = !activeZone
              ? true
              : row
                ? activeZone.slotIds.has(row.id)
                : zone.svgGroupId === activeZone.svgGroupId;
            return (
              <SlotShape
                key={layoutSlot.svgElementId}
                layoutSlot={layoutSlot}
                row={row}
                zoneType={zone.zoneType}
                zoneName={zone.name}
                selected={Boolean(row && selectedSlotId && row.id === selectedSlotId)}
                onSelectSlot={onSelectSlot}
                strokeScale={strokeScale}
                verdict={row ? verdicts?.get(row.id) : undefined}
                inActiveZone={inActiveZone}
              />
            );
          })}
        </g>
      ))}

      {/* (e) Label area */}
      {FLOOR_PLAN_ANNOTATIONS.map((annotation) => (
        <AreaTag key={annotation.text} {...annotation} />
      ))}
    </svg>
  );
}
