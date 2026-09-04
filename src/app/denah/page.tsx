import type { Metadata } from "next";
import Link from "next/link";

import { DenahViewer } from "@/components/denah/DenahViewer";
import { FloorPlanLegend } from "@/components/denah/FloorPlanLegend";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EVENT_INFO, isBookableZoneType } from "@/lib/domain/constants";
import { fallbackZonesFromLayout } from "@/lib/domain/fallback";
import { slotStatusAcrossDates, type SlotDateVerdict } from "@/lib/domain/ketersediaan";
import { getFloorPlan } from "@/lib/services/slots";
import type { ZoneWithSlots } from "@/lib/types/database";

// Status slot harus terbaru tiap kunjungan — jangan dirender saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Denah Lokasi",
  description: `Denah lengkap area ${EVENT_INFO.name} (Layout v2): Area A mobil baru, Area B area pameran mobil bekas, Area C tenda motor baru & area motor bekas, Area D tenda UMKM serta tenda otomotif & leasing, deretan warung, dan fasilitas umum. Hanya untuk dilihat — pemesanan slot lewat alur per zona di beranda.`,
};

/**
 * Halaman denah LENGKAP untuk khalayak umum: seluruh tata letak dan urutan slot
 * bisa dijelajahi bebas (zoom/geser), tetapi TIDAK ada slot yang bisa dipesan
 * dari sini. Pemesanan hanya lewat alur "Pesan Slot" di beranda, yang petanya
 * terkunci pada zona terpilih.
 */
export default async function DenahPage() {
  const result = await getFloorPlan();
  const data = result.ok ? result.data : null;

  const hasZones = data !== null && data.zones.length > 0;
  const zones: ZoneWithSlots[] = hasZones && data ? data.zones : fallbackZonesFromLayout();
  const isFallback = !hasZones;

  const eventDates = data?.eventDates ?? [];
  const occupancy = data?.occupancy ?? [];
  const activeDates = eventDates.map((d) => d.event_date);

  // Hitungan legenda: verdict lintas tanggal pada zona bookable saja —
  // logika yang sama dengan panel statistik peta booking di beranda.
  const counts: Record<SlotDateVerdict, number> = {
    available: 0,
    pending: 0,
    confirmed: 0,
    blocked: 0,
  };
  let totalSlot = 0;
  for (const zone of zones) {
    if (!isBookableZoneType(zone.zone_type)) continue;
    for (const slot of zone.slots) {
      totalSlot += 1;
      counts[slotStatusAcrossDates({ slot, zoneType: zone.zone_type, activeDates, occupancy })] += 1;
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Denah Lokasi"
        description={`Tata letak lengkap ${EVENT_INFO.name}, ${EVENT_INFO.location}: Area A mobil baru, Area B area pameran mobil bekas, Area C tenda motor baru & area motor bekas, Area D tenda UMKM serta tenda otomotif & leasing, deretan warung, dan fasilitas umum (VIP lounge, tenda VIP, area wahana, toilet, musholah, dll). Gulir untuk zoom, seret untuk menggeser. Halaman ini hanya untuk melihat — pemesanan dilakukan per zona lewat tombol Pesan Slot.`}
        backHref="/"
        backLabel="Beranda"
        action={
          <Link href="/#denah" className={buttonClass("primary", "sm")}>
            Pesan Slot
          </Link>
        }
      />

      {isFallback ? (
        <div className="mb-4">
          <Alert tone="info">
            Data zona belum termuat dari database — denah di bawah memakai tata letak bawaan dan
            status slotnya bukan status terkini.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <DenahViewer zones={zones} activeDates={activeDates} occupancy={occupancy} />

        <aside className="min-w-0 rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow-sm)]">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">Legenda Status</h2>
          <p className="mt-1 text-sm text-muted">
            {totalSlot} slot pada zona yang disewakan online.
          </p>
          <FloorPlanLegend className="mt-4" counts={counts} />

          <div className="mt-5 border-t border-line pt-5">
            <p className="text-xs leading-relaxed text-muted">
              Slot di halaman ini tidak bisa diketuk. Untuk memesan, pilih zona dulu di beranda —
              peta pemesanan akan terkunci pada zona pilihanmu.
            </p>
            <Link href="/#denah" className={`${buttonClass("primary", "md")} mt-3 w-full`}>
              Mulai Pesan Slot
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
