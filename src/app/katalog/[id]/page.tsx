import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EVENT_INFO, TRANSMISSION_LABEL, type TransmissionOption } from "@/lib/domain/constants";
import { ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import { getCatalogItem } from "@/lib/services/catalog";
import { formatRupiah, formatTanggal, slotDisplayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getCatalogItem(id);
  if (!result.ok) return { title: "Kendaraan Tidak Ditemukan" };
  return {
    title: result.data.vehicle_name,
    description: `${result.data.vehicle_name} — ${formatRupiah(result.data.price)}, ${slotDisplayName(result.data.slot)} di ${EVENT_INFO.name}.`,
  };
}

function labelTransmisi(nilai: string | null): string | null {
  if (!nilai) return null;
  return TRANSMISSION_LABEL[nilai as TransmissionOption] ?? nilai;
}

export default async function DetailKendaraanPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getCatalogItem(id);
  if (!result.ok) notFound();
  const item = result.data;

  const spesifikasi: Array<{ label: string; nilai: string | null }> = [
    { label: "Jenis", nilai: item.vehicle_kind === "motor" ? "Motor" : "Mobil" },
    { label: "Nomor plat", nilai: item.plate_number },
    { label: "Tahun", nilai: item.year !== null ? String(item.year) : null },
    {
      label: "Kilometer",
      nilai: item.mileage_km !== null ? `${item.mileage_km.toLocaleString("id-ID")} km` : null,
    },
    { label: "Transmisi", nilai: labelTransmisi(item.transmission) },
    { label: "Warna", nilai: item.color },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader
        title={item.vehicle_name}
        backHref="/katalog"
        backLabel="Kembali ke katalog"
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* ---------- Foto besar ---------- */}
        <div className="overflow-hidden rounded-[var(--radius)] border border-line bg-surface-3 shadow-[var(--shadow-sm)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL storage publik, dimensi bebas */}
          <img
            src={item.photo_url}
            alt={item.vehicle_name}
            className="aspect-[4/3] h-auto w-full object-cover"
          />
        </div>

        {/* ---------- Panel info ---------- */}
        <div className="space-y-5">
          <div className="rounded-[var(--radius)] border border-line bg-card p-5 shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">{ZONE_TYPE_LABEL[item.slot.zone.zone_type]}</Badge>
              {item.year ? <Badge>{item.year}</Badge> : null}
            </div>
            <p className="tabular mt-3 text-3xl font-bold tracking-[-0.01em] text-accent">
              {formatRupiah(item.price)}
            </p>

            <dl className="mt-4 space-y-2.5 border-t border-line pt-4">
              {spesifikasi
                .filter((baris) => baris.nilai !== null)
                .map((baris) => (
                  <div key={baris.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-sm text-muted">{baris.label}</dt>
                    <dd className="text-right text-sm font-medium text-ink">{baris.nilai}</dd>
                  </div>
                ))}
            </dl>
          </div>

          {/* ---------- Lokasi & jadwal hadir ---------- */}
          <div className="rounded-[var(--radius)] border border-line bg-card p-5 shadow-[var(--shadow-sm)]">
            <p className="text-sm font-semibold text-ink">Temui unit ini di pameran</p>
            <p className="mt-1.5 text-sm text-muted">
              Parkir di <strong className="text-ink">{slotDisplayName(item.slot)}</strong> —{" "}
              {item.slot.zone.name}, {EVENT_INFO.location}.
            </p>
            {item.dates.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {item.dates.map((tanggal) => (
                  <li key={tanggal}>
                    <Badge tone="green">{formatTanggal(tanggal)}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {/* Tautan ke alur /beli (temuan audit: katalog tidak tertaut ke /beli) —
                  mencatat minat pembelian unit dari penyewa slot ini, termasuk opsi kredit. */}
              <Link href={`/beli/${item.slot.id}`} className={buttonClass("primary", "sm")}>
                Ajukan pembelian unit ini
              </Link>
              <Link href="/#denah" className={buttonClass("secondary", "sm")}>
                Lihat denah lokasi
              </Link>
            </div>
          </div>

          <Alert tone="info" title="Pembelian dilakukan di lokasi">
            Transaksi dan negosiasi berlangsung langsung dengan penjual di slotnya —
            datang pada tanggal di atas, atau hubungi panitia di {EVENT_INFO.contact}.
          </Alert>
        </div>
      </div>

      {item.description ? (
        <div className="mt-6 rounded-[var(--radius)] border border-line bg-card p-5 shadow-[var(--shadow-sm)]">
          <p className="text-sm font-semibold text-ink">Deskripsi unit</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
            {item.description}
          </p>
        </div>
      ) : null}
    </div>
  );
}
