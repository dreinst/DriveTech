import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClass } from "@/components/ui/Button";
import {
  EVENT_INFO,
  VEHICLE_KIND_LABEL,
  VEHICLE_ZONE_TYPES,
  type VehicleKind,
} from "@/lib/domain/constants";
import { ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import { listCatalog } from "@/lib/services/catalog";
import type { CatalogItem, ZoneType } from "@/lib/types/database";
import { cn, formatRupiah, formatTanggal, slotDisplayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Katalog Kendaraan",
  description:
    "Lihat mobil & motor yang dijual di pameran per tanggal — lengkap dengan harga, plat, dan lokasi slot parkirnya.",
};

type PageProps = {
  searchParams: Promise<{
    tanggal?: string | string[];
    zona?: string | string[];
    jenis?: string | string[];
  }>;
};

function satu(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** "12 Sep" untuk chip tanggal. */
const chipTanggalFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
});

function formatChipTanggal(tanggal: string): string {
  return chipTanggalFormatter.format(new Date(`${tanggal}T00:00:00`));
}

export default async function KatalogPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tanggal = satu(params.tanggal);
  const zonaParam = satu(params.zona);
  const zona = (VEHICLE_ZONE_TYPES as readonly string[]).includes(zonaParam ?? "")
    ? (zonaParam as ZoneType)
    : undefined;
  const jenisParam = satu(params.jenis);
  const jenis =
    jenisParam === "mobil" || jenisParam === "motor" ? (jenisParam as VehicleKind) : undefined;

  const result = await listCatalog(tanggal, jenis);
  const data = result.ok ? result.data : { dates: [], selectedDate: null, items: [] };
  const items = zona ? data.items.filter((i) => i.slot.zone.zone_type === zona) : data.items;

  const hrefKatalog = (t?: string | null, z?: ZoneType, j?: VehicleKind) => {
    const query = new URLSearchParams();
    if (t) query.set("tanggal", t);
    if (z) query.set("zona", z);
    if (j) query.set("jenis", j);
    const qs = query.toString();
    return qs.length > 0 ? `/katalog?${qs}` : "/katalog";
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <PageHeader
          title="Katalog Kendaraan"
          description={`Mobil & motor yang dijual di ${EVENT_INFO.name}, ${EVENT_INFO.location}. Pilih tanggal untuk melihat unit yang hadir hari itu — pembelian dilakukan langsung di lokasi pameran.`}
        />

        {!result.ok && result.code !== "NO_CONFIG" ? (
          <Alert tone="error" title="Katalog belum bisa dimuat">
            {result.error}
          </Alert>
        ) : null}

        {/* ---------- Chip tanggal gelaran ---------- */}
        {data.dates.length > 0 ? (
          <nav aria-label="Pilih tanggal gelaran" className="mb-4">
            <ul className="flex flex-wrap gap-2">
              {data.dates.map((t) => {
                const aktif = t === data.selectedDate;
                return (
                  <li key={t}>
                    <Link
                      href={hrefKatalog(t, zona, jenis)}
                      aria-current={aktif ? "date" : undefined}
                      className={cn(
                        "inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors duration-150",
                        aktif
                          ? "border-accent bg-accent text-app"
                          : "border-line bg-card text-muted hover:border-accent hover:text-ink",
                      )}
                    >
                      {formatChipTanggal(t)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        {/* ---------- Filter jenis (mobil/motor) + zona ---------- */}
        {data.dates.length > 0 ? (
          <nav aria-label="Filter kendaraan" className="mb-6 space-y-2">
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link
                  href={hrefKatalog(data.selectedDate, zona)}
                  className={cn(
                    "inline-flex min-h-8 items-center rounded-full border px-3.5 text-xs font-semibold transition-colors duration-150",
                    !jenis
                      ? "border-ink bg-ink text-app"
                      : "border-line bg-card text-muted hover:border-ink hover:text-ink",
                  )}
                >
                  Semua Jenis
                </Link>
              </li>
              {(Object.keys(VEHICLE_KIND_LABEL) as VehicleKind[]).map((j) => (
                <li key={j}>
                  <Link
                    href={hrefKatalog(data.selectedDate, zona, j)}
                    className={cn(
                      "inline-flex min-h-8 items-center rounded-full border px-3.5 text-xs font-semibold transition-colors duration-150",
                      jenis === j
                        ? "border-ink bg-ink text-app"
                        : "border-line bg-card text-muted hover:border-ink hover:text-ink",
                    )}
                  >
                    {VEHICLE_KIND_LABEL[j]}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link
                  href={hrefKatalog(data.selectedDate, undefined, jenis)}
                  className={cn(
                    "inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium transition-colors duration-150",
                    !zona ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  Semua Zona
                </Link>
              </li>
              {VEHICLE_ZONE_TYPES.map((z) => (
                <li key={z}>
                  <Link
                    href={hrefKatalog(data.selectedDate, z, jenis)}
                    className={cn(
                      "inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium transition-colors duration-150",
                      zona === z ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
                    )}
                  >
                    {ZONE_TYPE_LABEL[z]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {/* ---------- Grid kartu kendaraan ---------- */}
        {items.length === 0 ? (
          <EmptyState
            title="Belum ada kendaraan di katalog untuk tanggal ini"
            description={
              data.selectedDate
                ? `Unit akan muncul di sini setelah penyewa slot terkonfirmasi untuk ${formatTanggal(data.selectedDate)}. Coba cek tanggal lain.`
                : "Jadwal gelaran berikutnya belum tersedia."
            }
            action={
              <Link href="/#denah" className={buttonClass("secondary", "sm")}>
                Lihat denah pameran
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.id}>
                <KartuKendaraan item={item} />
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

/** Kartu marketplace: foto besar, harga menonjol, plat & lokasi slot. */
function KartuKendaraan({ item }: { item: CatalogItem }) {
  return (
    <Link
      href={`/katalog/${item.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-line bg-card shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--shadow-md)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL storage publik, dimensi bebas */}
        <img
          src={item.photo_url}
          alt={item.vehicle_name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute left-3 top-3 flex gap-1.5">
          <Badge tone="blue">{ZONE_TYPE_LABEL[item.slot.zone.zone_type]}</Badge>
          {item.vehicle_kind === "motor" ? <Badge tone="amber">Motor</Badge> : null}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="truncate text-sm font-semibold text-ink">
          {item.vehicle_name}
          {item.year ? <span className="font-normal text-muted"> · {item.year}</span> : null}
        </p>
        <p className="tabular text-lg font-bold tracking-[-0.01em] text-accent">
          {formatRupiah(item.price)}
        </p>
        <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted">
          <span className="tabular font-mono uppercase">{item.plate_number}</span>
          <span aria-hidden="true">•</span>
          <span>
            {slotDisplayName(item.slot)} — {item.slot.zone.name}
          </span>
        </p>
      </div>
    </Link>
  );
}
