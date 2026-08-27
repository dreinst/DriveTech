import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LANGKAH_BOOKING } from "@/app/booking/_components/langkah";
import { RingkasanSlot } from "@/app/booking/_components/Ringkasan";
import { SlotSuggestions } from "@/components/denah/SlotSuggestions";
import { BookingForm } from "@/components/forms/BookingForm";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stepper } from "@/components/ui/Stepper";
import { SLOT_STATUS_LABEL, ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import { getSlotDetail, suggestAlternatives } from "@/lib/services/slots";
import { formatRupiah, slotDisplayName } from "@/lib/utils";

/*
 * CATATAN RUTE — Next.js melarang dua nama slug berbeda pada posisi segmen yang
 * sama ("You cannot use different slug names for the same dynamic path"), jadi
 * /booking/[slotId] dan /booking/[bookingId]/bayar tidak bisa hidup berdampingan
 * sebagai dua folder. Seluruh alur booking memakai satu segmen [slotId]:
 *   /booking/<slotId>              -> halaman ini (form penyewa)
 *   /booking/<bookingId>/bayar     -> halaman pembayaran
 *   /booking/<bookingId>/status    -> halaman status
 * URL yang dihasilkan persis sama dengan kontrak; hanya nama parameternya yang
 * dipakai ulang. Di halaman bayar & status, params.slotId berisi ID BOOKING.
 */

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slotId: string }> };

/** Kode error PostgREST saat ID yang dikirim bukan UUID yang sah. */
const INVALID_UUID = "22P02";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slotId } = await params;
  const result = await getSlotDetail(slotId);
  if (!result.ok) return { title: "Booking Slot" };

  const slot = result.data;
  return {
    title: `Booking ${slotDisplayName(slot)} — ${slot.zone.name}`,
    description: `Sewa ${slotDisplayName(slot)} di ${slot.zone.name} (${
      ZONE_TYPE_LABEL[slot.zone.zone_type]
    }). Biaya admin ${formatRupiah(slot.zone.admin_fee)}.`,
  };
}

export default async function BookingSlotPage({ params }: PageProps) {
  const { slotId } = await params;
  const result = await getSlotDetail(slotId);

  if (!result.ok) {
    if (result.code === "NOT_FOUND" || result.code === INVALID_UUID) notFound();
    return (
      <div className="mx-auto w-full max-w-2xl">
        <PageHeader title="Booking Slot" backHref="/" backLabel="Kembali ke denah" />
        <Alert tone="error" title="Data slot belum bisa dimuat">
          {result.error}
        </Alert>
      </div>
    );
  }

  const slot = result.data;
  const isFasilitas = slot.zone.zone_type === "facility";
  const bisaDibooking = !isFasilitas && slot.status === "available";

  /* ---------- Slot tidak bisa dibooking: tampilkan saran, JANGAN auto-assign ---------- */
  if (!bisaDibooking) {
    const saran = await suggestAlternatives(slotId, 6);
    const daftarSaran = saran.ok ? saran.data : [];

    return (
      <div className="mx-auto w-full max-w-2xl">
        <PageHeader
          title={`${slot.zone.name} · ${slotDisplayName(slot)}`}
          description={ZONE_TYPE_LABEL[slot.zone.zone_type]}
          backHref="/"
          backLabel="Kembali ke denah"
        />

        {isFasilitas ? (
          <Alert tone="warning" title="Slot ini tidak disewakan">
            <strong>{slotDisplayName(slot)}</strong> adalah fasilitas umum pameran, bukan slot
            tenant. Silakan pilih slot pada zona yang disewakan.
          </Alert>
        ) : (
          <Alert tone="error" title="Slot ini sudah tidak tersedia">
            Status <strong>{slotDisplayName(slot)}</strong> saat ini{" "}
            <strong>{SLOT_STATUS_LABEL[slot.status]}</strong>. Slot sudah dipesan penyewa lain.
          </Alert>
        )}

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Saran slot lain</CardTitle>
            <CardDescription>
              Slot kosong terdekat di zona yang sama, lalu zona lain dengan tipe serupa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {saran.ok ? (
              <SlotSuggestions suggestions={daftarSaran} />
            ) : (
              <Alert tone="warning">{saran.error}</Alert>
            )}
          </CardContent>
        </Card>

        <div className="mt-4">
          <Link href="/#denah" className={buttonClass("secondary", "md")}>
            Lihat denah lengkap
          </Link>
        </div>
      </div>
    );
  }

  /* ---------- Slot tersedia: form data penyewa ---------- */
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Data Penyewa"
        description="Langkah 1 dari 3. Isi data Anda untuk mengunci slot ini."
        backHref="/"
        backLabel="Kembali ke denah"
      />

      <Stepper steps={[...LANGKAH_BOOKING]} current={0} />

      <Card>
        <CardHeader>
          <CardTitle>Slot yang dipilih</CardTitle>
          <CardDescription>Periksa kembali sebelum melanjutkan.</CardDescription>
        </CardHeader>
        <CardContent>
          <RingkasanSlot slot={slot} tampilkanStatus />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Formulir penyewa</CardTitle>
          <CardDescription>
            Tanda <span className="text-red-600">*</span> wajib diisi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BookingForm slot={slot} />
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        Dengan mengirim formulir ini Anda menyetujui slot dikunci sementara sampai biaya admin
        sebesar {formatRupiah(slot.zone.admin_fee)} diverifikasi panitia.
      </p>
    </div>
  );
}
