"use client";

import { useMemo, type KeyboardEvent } from "react";

import { SLOT_STATUS_STYLE } from "@/lib/domain/constants";
import { SLOT_LEGEND_LABEL } from "@/lib/domain/labels";
import {
  DECOR_STYLE,
  FLOOR_PLAN_ANNOTATIONS,
  FLOOR_PLAN_DECOR,
  FLOOR_PLAN_FRAME,
  FLOOR_PLAN_VIEWBOX,
  FLOOR_PLAN_ZONES,
  slotFontSize,
  wrapLabel,
  type DecorItem,
  type LabelOrientation,
  type LayoutSlot,
  type LayoutZone,
  type Rect,
} from "@/lib/domain/layout";
import type { SlotRow, SlotStatus, ZoneType, ZoneWithSlots } from "@/lib/types/database";
import { slotDisplayName } from "@/lib/utils";

/** Baris slot dari database + identitas zonanya, dikirim balik lewat onSelectSlot. */
export type SelectedSlotPayload = SlotRow & { zoneName: string; zoneType: ZoneType };

export type FloorPlanProps = {
  zones: ZoneWithSlots[];
  selectedSlotId?: string | null;
  onSelectSlot?: (slot: SelectedSlotPayload) => void;
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

/* ---------- Sub-komponen: dekor (taman & pagar), tidak bisa diklik ---------- */

function Decor({ item }: { item: DecorItem }) {
  const style = DECOR_STYLE[item.kind];
  const showLabel = item.label.length > 0 && item.width >= 40 && item.height >= 30;
  const orientation: LabelOrientation = item.height > item.width * 1.6 ? "vertical" : "horizontal";
  const fitted = showLabel ? fitLabel(item.label, item, orientation) : null;

  return (
    <g aria-hidden="true" style={{ pointerEvents: "none" }}>
      <rect
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        rx={item.kind === "pagar" ? 3 : 6}
        fill={style.fill}
        stroke={style.stroke ?? "none"}
        strokeWidth={style.stroke ? 1 : 0}
      />
      {fitted ? (
        <BoxLabel
          rect={item}
          lines={fitted.lines}
          fontSize={Math.min(fitted.fontSize, 12)}
          fill="#4b7f52"
          orientation={orientation}
          opacity={0.85}
        />
      ) : null}
    </g>
  );
}

/* ---------- Sub-komponen: container zona + pita judul ---------- */

type ZoneContainerProps = {
  zone: LayoutZone;
  available: number;
  total: number;
};

function ZoneContainer({ zone, available, total }: ZoneContainerProps) {
  const container = zone.container;
  if (!container) return null;

  const bandSize = 24;
  const isVertical = container.labelOrientation === "vertical";
  const stat = `${available}/${total} tersedia`;

  return (
    <g aria-hidden="true" style={{ pointerEvents: "none" }}>
      <rect
        x={container.x}
        y={container.y}
        width={container.width}
        height={container.height}
        rx={10}
        fill="#ffffff"
        stroke="#cbd5e1"
        strokeWidth={1}
      />
      {/* Garis tepi tebal berwarna aksen zona, seperti denah aslinya. */}
      <rect
        x={container.x + 2}
        y={container.y + 2}
        width={container.width - 4}
        height={container.height - 4}
        rx={8}
        fill="none"
        stroke={zone.accent}
        strokeWidth={2}
        opacity={0.55}
      />

      {isVertical ? (
        <>
          <rect
            x={container.x}
            y={container.y}
            width={bandSize}
            height={container.height}
            rx={10}
            fill={zone.accent}
          />
          <text
            x={container.x + bandSize / 2}
            y={container.y + container.height / 2}
            fill="#ffffff"
            fontSize={12}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(-90 ${container.x + bandSize / 2} ${container.y + container.height / 2})`}
          >
            {zone.name}
          </text>
          <text
            x={container.x + bandSize / 2 - (container.height / 2 - 8)}
            y={container.y + container.height / 2}
            fill="#ffffff"
            fontSize={10}
            fontWeight={600}
            textAnchor="start"
            dominantBaseline="middle"
            opacity={0.9}
            transform={`rotate(-90 ${container.x + bandSize / 2} ${container.y + container.height / 2})`}
          >
            {stat}
          </text>
        </>
      ) : (
        <>
          <rect
            x={container.x}
            y={container.y}
            width={container.width}
            height={bandSize}
            rx={10}
            fill={zone.accent}
          />
          <rect
            x={container.x}
            y={container.y + bandSize - 10}
            width={container.width}
            height={10}
            fill={zone.accent}
          />
          <text
            x={container.x + 10}
            y={container.y + bandSize / 2 + 1}
            fill="#ffffff"
            fontSize={12}
            fontWeight={700}
            textAnchor="start"
            dominantBaseline="middle"
          >
            {zone.name}
          </text>
          <text
            x={container.x + container.width - 10}
            y={container.y + bandSize / 2 + 1}
            fill="#ffffff"
            fontSize={10}
            fontWeight={600}
            textAnchor="end"
            dominantBaseline="middle"
            opacity={0.9}
          >
            {stat}
          </text>
        </>
      )}
    </g>
  );
}

/* ---------- Sub-komponen: anotasi arah (MASUK / KELUAR) ---------- */

function DirectionAnnotation({ x, y, text }: { x: number; y: number; text: string }) {
  const isKeluar = text.trim().toUpperCase().startsWith("KELUAR");
  const tx = x - 30;
  const points = isKeluar
    ? `${tx - 5},${y - 1} ${tx + 5},${y - 1} ${tx},${y - 9}`
    : `${tx - 5},${y - 9} ${tx + 5},${y - 9} ${tx},${y - 1}`;

  return (
    <g aria-hidden="true" style={{ pointerEvents: "none" }}>
      <polygon points={points} fill="#334155" />
      <text
        x={x}
        y={y}
        fill="#334155"
        fontSize={11}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
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
};

function SlotShape({ layoutSlot, row, zoneType, zoneName, selected, onSelectSlot }: SlotShapeProps) {
  const isFacility = zoneType === "facility";
  const status: SlotStatus | "facility" = isFacility ? "facility" : (row?.status ?? "available");
  const style = SLOT_STATUS_STYLE[status];
  const interactive = !isFacility && row !== undefined && onSelectSlot !== undefined;

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

  const ariaLabel = interactive
    ? `${zoneName}, ${displayName}, ${SLOT_LEGEND_LABEL[status]}. Tekan Enter untuk memilih slot ini.`
    : undefined;

  const fitted = isNumberOnly ? null : fitLabel(text, layoutSlot, layoutSlot.labelOrientation);

  return (
    <g
      id={layoutSlot.svgElementId}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      aria-pressed={interactive ? selected : undefined}
      aria-hidden={interactive ? undefined : true}
      onClick={interactive ? handleSelect : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      className={
        interactive
          ? "cursor-pointer transition-opacity hover:opacity-75"
          : "cursor-default"
      }
    >
      <rect
        x={layoutSlot.x}
        y={layoutSlot.y}
        width={layoutSlot.width}
        height={layoutSlot.height}
        rx={4}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={selected ? 2 : 1}
      />
      {selected ? (
        <rect
          x={layoutSlot.x - 3}
          y={layoutSlot.y - 3}
          width={layoutSlot.width + 6}
          height={layoutSlot.height + 6}
          rx={7}
          fill="none"
          stroke="#0f172a"
          strokeWidth={2}
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
          dominantBaseline="middle"
          style={{ pointerEvents: "none" }}
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

export function FloorPlan({ zones, selectedSlotId, onSelectSlot }: FloorPlanProps) {
  // Satu Map untuk semua slot: lookup O(1) saat menggambar 104 kotak.
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

  const zoneStats = useMemo(() => {
    const stats = new Map<string, { available: number; total: number }>();
    for (const zone of FLOOR_PLAN_ZONES) {
      let available = 0;
      for (const slot of zone.slots) {
        const row = slotIndex.get(slot.svgElementId);
        if (!row || row.status === "available") available += 1;
      }
      stats.set(zone.svgGroupId, { available, total: zone.slots.length });
    }
    return stats;
  }, [slotIndex]);

  return (
    <svg
      role="img"
      viewBox={`0 0 ${FLOOR_PLAN_VIEWBOX.width} ${FLOOR_PLAN_VIEWBOX.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full"
    >
      <title>Denah lokasi pameran</title>
      <desc>
        Denah interaktif area pameran: tenda mobil baru, area pameran mobil, area pameran mobil dan
        motor, area UMKM, deretan warung, serta fasilitas umum. Kotak hijau berarti slot tersedia,
        kuning menunggu pembayaran, merah sudah terisi, abu-abu fasilitas yang tidak disewakan.
      </desc>

      {/* (a) Bingkai lokasi */}
      <rect
        x={FLOOR_PLAN_FRAME.x}
        y={FLOOR_PLAN_FRAME.y}
        width={FLOOR_PLAN_FRAME.width}
        height={FLOOR_PLAN_FRAME.height}
        rx={8}
        fill="none"
        stroke="#1e293b"
        strokeWidth={2}
      />

      {/* (b) Dekor: taman & pagar */}
      {FLOOR_PLAN_DECOR.map((item) => (
        <Decor key={item.id} item={item} />
      ))}

      {/* (c) Container zona + pita judul */}
      {FLOOR_PLAN_ZONES.map((zone) => {
        const stat = zoneStats.get(zone.svgGroupId) ?? { available: 0, total: zone.slots.length };
        return (
          <ZoneContainer
            key={`container-${zone.svgGroupId}`}
            zone={zone}
            available={stat.available}
            total={stat.total}
          />
        );
      })}

      {/* (d) Slot */}
      {FLOOR_PLAN_ZONES.map((zone) => (
        <g key={zone.svgGroupId} id={zone.svgGroupId}>
          {zone.slots.map((layoutSlot) => {
            const row = slotIndex.get(layoutSlot.svgElementId);
            return (
              <SlotShape
                key={layoutSlot.svgElementId}
                layoutSlot={layoutSlot}
                row={row}
                zoneType={zone.zoneType}
                zoneName={zone.name}
                selected={Boolean(row && selectedSlotId && row.id === selectedSlotId)}
                onSelectSlot={onSelectSlot}
              />
            );
          })}
        </g>
      ))}

      {/* (e) Anotasi teks */}
      {FLOOR_PLAN_ZONES.flatMap((zone) =>
        (zone.annotations ?? []).map((annotation) => (
          <DirectionAnnotation
            key={`${zone.svgGroupId}-${annotation.text}`}
            x={annotation.x}
            y={annotation.y}
            text={annotation.text}
          />
        )),
      )}
      {FLOOR_PLAN_ANNOTATIONS.map((annotation) => (
        <text
          key={annotation.text}
          x={annotation.x}
          y={annotation.y}
          fill="#1e293b"
          fontSize={12}
          fontWeight={annotation.bold ? 700 : 400}
          textAnchor="middle"
          dominantBaseline="middle"
          aria-hidden="true"
          style={{ pointerEvents: "none" }}
        >
          {annotation.text}
        </text>
      ))}
    </svg>
  );
}
