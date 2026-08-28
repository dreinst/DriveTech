import { notFound, redirect } from "next/navigation";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSlotBySvgId } from "@/lib/services/slots";

/*
 * Rute jembatan denah statis -> form booking.
 *
 * `public/denah.svg` membungkus setiap slot bookable dengan
 * <a href="/booking/by-svg/<svg_element_id>">, sehingga file SVG yang dibuka
 * langsung pun bisa diklik. Rute ini menerjemahkan id elemen SVG (mis.
 * "slot-umkm-07") menjadi uuid slot di database lalu redirect ke alur biasa:
 * /booking/<slot.id>. Id yang tidak dikenal -> 404.
 */

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ svgId: string }>;
};

export default async function BookingBySvgPage({ params }: PageProps) {
  const { svgId } = await params;
  const result = await getSlotBySvgId(svgId);

  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    // NO_CONFIG / gangguan database: tampilkan pesan, jangan 404 menyesatkan.
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader title="Pemesanan Slot" backHref="/" backLabel="Kembali ke denah" />
        <Alert tone="error" title="Data slot belum bisa dimuat">
          {result.error}
        </Alert>
      </div>
    );
  }

  redirect(`/booking/${result.data.id}`);
}
