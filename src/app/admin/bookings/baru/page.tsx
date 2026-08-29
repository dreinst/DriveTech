import type { Metadata } from "next";
import Link from "next/link";

import { AdminBookingForm } from "@/components/admin/AdminBookingForm";
import { Card, CardContent } from "@/components/ui/Card";
import { isBookableZoneType, isVehicleZoneType } from "@/lib/domain/constants";
import { listSlots } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/services/auth";
import { getActiveEventDates } from "@/lib/services/slots";
import { slotDisplayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Booking Manual",
  description: "Buat booking atas nama tenant yang mendaftar offline.",
};

export default async function AdminBookingBaruPage() {
  await requireAdmin();

  const [slotsResult, datesResult] = await Promise.all([
    listSlots({ status: "available" }),
    getActiveEventDates(),
  ]);

  // Hanya slot bookable NON-kendaraan (UMKM & Booth) — zona kendaraan butuh foto
  // unit untuk katalog, jadi didaftarkan lewat form publik.
  const slots = (slotsResult.ok ? slotsResult.data : [])
    .filter(
      (slot) =>
        isBookableZoneType(slot.zone.zone_type) && !isVehicleZoneType(slot.zone.zone_type),
    )
    .map((slot) => ({
      id: slot.id,
      label: slotDisplayName(slot),
      zoneName: slot.zone.name,
    }));

  const dates = (datesResult.ok ? datesResult.data : []).map((d) => d.event_date);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">
            Booking Manual
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Buat booking atas nama tenant yang mendaftar langsung ke panitia (offline/telepon).
            Batas booking pending per nomor tidak berlaku di sini.
          </p>
        </div>
        <Link
          href="/admin/bookings"
          className="inline-flex h-11 items-center rounded-full border border-line bg-card px-4 text-sm font-medium text-muted hover:border-line-strong hover:text-ink"
        >
          ← Kembali ke pemesanan
        </Link>
      </header>

      <Card>
        <CardContent>
          <AdminBookingForm slots={slots} dates={dates} />
        </CardContent>
      </Card>
    </div>
  );
}
