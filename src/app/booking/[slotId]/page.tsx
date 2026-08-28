import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LANGKAH_BOOKING } from "@/app/booking/_components/langkah";
import { RingkasanSlot } from "@/app/booking/_components/Ringkasan";
import { parseTanggalCsv } from "@/app/booking/_components/tanggal";
import { SlotSuggestions } from "@/components/denah/SlotSuggestions";
import { BookingForm } from "@/components/forms/BookingForm";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stepper } from "@/components/ui/Stepper";
import { EVENT_INFO, isBookableZoneType } from "@/lib/domain/constants";
import { slotAdminFee } from "@/lib/domain/harga";
import { ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import {
  getActiveEventDates,
  getSlotDetail,
  getSlotOccupancy,
  suggestAlternatives,
} from "@/lib/services/slots";
import type { BookingStatus, SlotDetail } from "@/lib/types/database";
import { formatRupiah, formatTanggal, slotDisplayName } from "@/lib/utils";

/*
 * CATATAN RUTE — Next.js melarang dua nama slug berbeda pada posisi segmen yang
 * sama ("You cannot use different slug names for the same dynamic path"), jadi
 * /booking/[slotId] dan /booking/[bookingId]/bayar tidak bisa hidup berdampingan
 * sebagai dua folder. Seluruh alur booking memakai satu segmen [slotId]:
 *   /booking/<slotId>              -> halaman ini (pilih tanggal + info tenant)
 *   /booking/<bookingId>/bayar     -> halaman pembayaran
 *   /booking/<bookingId>/status    -> halaman status
 * URL yang dihasilkan persis sama dengan kontrak; hanya nama parameternya yang
 * dipakai ulang. Di halaman bayar & status, params.slotId berisi ID BOOKING.
 */

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slotId: string }>;
  /** ?tanggal=2026-08-29,2026-08-30 (CSV ISO) — pilihan dari denah/peta. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Kode error PostgREST saat ID yang dikirim bukan UUID yang sah. */
const INVALID_UUID = "22P02";

/** Container standar halaman alur booking. */
const WRAP = "mx-auto w-full max-w-3xl px-4 py-8 sm:px-6";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slotId } = await params;
  const result = await getSlotDetail(slotId);
  if (!result.ok) return { title: "Booking Slot" };

  const slot = result.data;
  return {
    title: `Booking ${slotDisplayName(slot)} — ${slot.zone.name}`,
    description: `Sewa ${slotDisplayName(slot)} di ${slot.zone.name} (${
      ZONE_TYPE_LABEL[slot.zone.zone_type]
    }). Biaya admin ${formatRupiah(slotAdminFee(slot, slot.zone))} per tanggal — ${EVENT_INFO.scheduleText}.`,
  };
}

/** Blok saran slot lain + tombol kembali ke denah (dipakai beberapa cabang). */
async function BlokSaran({ slotId }: { slotId: string }) {
  const saran = await suggestAlternatives(slotId, 6);
  return (
    <>
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Saran slot lain yang masih kosong</h2>
        <div className="mt-2">
          {saran.ok ? (
            <SlotSuggestions suggestions={saran.data} />
          ) : (
            <Alert tone="warning">{saran.error}</Alert>
          )}
        </div>
      </div>
      <div className="mt-5">
        <Link href="/#denah" className={buttonClass("secondary", "md")}>
          Lihat denah lengkap
        </Link>
      </div>
    </>
  );
}

export default async function BookingSlotPage({ params, searchParams }: PageProps) {
  const [{ slotId }, sp] = await Promise.all([params, searchParams]);
  const result = await getSlotDetail(slotId);

  if (!result.ok) {
    if (result.code === "NOT_FOUND" || result.code === INVALID_UUID) notFound();
    return (
      <div className={WRAP}>
        <PageHeader title="Pemesanan Slot" backHref="/" backLabel="Kembali ke denah" />
        <Alert tone="error" title="Data slot belum bisa dimuat">
          {result.error}
        </Alert>
      </div>
    );
  }

  const slot: SlotDetail = result.data;
  // Harga efektif slot: override per-slot (mis. Booth Leasing) ?? tarif zona.
  const hargaSlot = slotAdminFee(slot, slot.zone);
  const zonaBookable = isBookableZoneType(slot.zone.zone_type);

  /* ---------- Zona tidak dibuka untuk booking (warung & fasilitas) ---------- */
  if (!zonaBookable) {
    const isWarung = slot.zone.zone_type === "warung";
    return (
      <div className={WRAP}>
        <PageHeader
          title={`${slot.zone.name} · ${slotDisplayName(slot)}`}
          description={ZONE_TYPE_LABEL[slot.zone.zone_type]}
          backHref="/"
          backLabel="Kembali ke denah"
        />

        {isWarung ? (
          <Alert tone="info" title="Belum bisa dibooking online">
            Zona warung belum dibuka untuk booking online. Hubungi panitia langsung di{" "}
            <a href={`tel:${EVENT_INFO.contact.replace(/[^0-9+]/g, "")}`}>{EVENT_INFO.contact}</a>.
          </Alert>
        ) : (
          <Alert tone="warning" title="Slot ini tidak disewakan">
            <strong>{slotDisplayName(slot)}</strong> adalah fasilitas umum pameran, bukan slot
            tenant. Silakan pilih slot pada zona yang disewakan.
          </Alert>
        )}

        <div className="mt-5">
          <Link href="/#denah" className={buttonClass("secondary", "md")}>
            Kembali ke denah
          </Link>
        </div>
      </div>
    );
  }

  /* ---------- Diblokir panitia (makna baru slots.status != available) ---------- */
  if (slot.status !== "available") {
    return (
      <div className={WRAP}>
        <PageHeader
          title={`${slot.zone.name} · ${slotDisplayName(slot)}`}
          description={ZONE_TYPE_LABEL[slot.zone.zone_type]}
          backHref="/"
          backLabel="Kembali ke denah"
        />

        <Alert tone="error" title="Slot ini sedang diblokir panitia">
          <strong>{slotDisplayName(slot)}</strong> tidak bisa dibooking untuk semua tanggal
          gelaran. Silakan pilih slot lain atau hubungi panitia di {EVENT_INFO.contact}.
        </Alert>

        <BlokSaran slotId={slotId} />
      </div>
    );
  }

  /* ---------- Tanggal gelaran + okupansi slot ini (model per tanggal) ---------- */
  const [datesResult, occResult] = await Promise.all([
    getActiveEventDates(),
    getSlotOccupancy(slot.id),
  ]);
  if (!datesResult.ok || !occResult.ok) {
    const pesan = !datesResult.ok ? datesResult.error : occResult.ok ? "" : occResult.error;
    return (
      <div className={WRAP}>
        <PageHeader title="Pemesanan Slot" backHref="/" backLabel="Kembali ke denah" />
        <Alert tone="error" title="Tanggal gelaran belum bisa dimuat">
          {pesan}
        </Alert>
      </div>
    );
  }

  const eventDates = datesResult.data.map((d) => d.event_date);

  // Tanggal yang sudah dipegang booking aktif lain untuk slot INI
  // (confirmed menang atas pending_payment kalau dua-duanya pernah tercatat).
  const takenDates: Record<string, BookingStatus> = {};
  for (const row of occResult.data) {
    if (row.status === "confirmed" || takenDates[row.event_date] === undefined) {
      takenDates[row.event_date] = row.status;
    }
  }
  const tanggalBebas = eventDates.filter((t) => takenDates[t] === undefined);

  /* ---------- Belum ada tanggal gelaran yang dibuka ---------- */
  if (eventDates.length === 0) {
    return (
      <div className={WRAP}>
        <PageHeader
          title="Pemesanan Slot"
          description={`${slot.zone.name} • ${slotDisplayName(slot)}`}
          backHref="/#denah"
          backLabel="Kembali ke denah"
        />
        <Alert tone="info" title="Belum ada tanggal gelaran yang dibuka">
          Panitia belum membuka tanggal gelaran berikutnya (jadwal: {EVENT_INFO.scheduleText}).
          Silakan cek kembali nanti atau hubungi panitia di {EVENT_INFO.contact}.
        </Alert>
        <div className="mt-5">
          <Link href="/#denah" className={buttonClass("secondary", "md")}>
            Kembali ke denah
          </Link>
        </div>
      </div>
    );
  }

  /* ---------- Slot penuh di semua tanggal mendatang ---------- */
  if (tanggalBebas.length === 0) {
    return (
      <div className={WRAP}>
        <PageHeader
          title={`${slot.zone.name} · ${slotDisplayName(slot)}`}
          description={ZONE_TYPE_LABEL[slot.zone.zone_type]}
          backHref="/"
          backLabel="Kembali ke denah"
        />

        <Alert tone="error" title="Slot ini sudah terisi di semua tanggal">
          <strong>{slotDisplayName(slot)}</strong> sudah dipesan untuk seluruh tanggal gelaran
          mendatang. Silakan pilih slot lain.
        </Alert>

        <BlokSaran slotId={slotId} />
      </div>
    );
  }

  /* ---------- Pilihan tanggal dari URL (?tanggal=csv) ---------- */
  const diminta = parseTanggalCsv(sp.tanggal);
  const tidakTersedia = diminta.filter(
    (t) => !eventDates.includes(t) || takenDates[t] !== undefined,
  );
  let initialDates = diminta.filter(
    (t) => eventDates.includes(t) && takenDates[t] === undefined,
  );
  // Default: satu tanggal aktif terdekat yang masih bebas untuk slot ini.
  if (initialDates.length === 0) initialDates = tanggalBebas.slice(0, 1);

  const saranBentrok = tidakTersedia.length > 0 ? await suggestAlternatives(slotId, 4) : null;

  /* ---------- Slot tersedia: ringkasan + pilih tanggal + form tenant ---------- */
  return (
    <div className={WRAP}>
      <PageHeader
        title="Pemesanan Slot"
        description={`${slot.zone.name} • ${slotDisplayName(slot)}`}
        backHref="/#denah"
        backLabel="Kembali ke denah"
      />

      <Stepper steps={[...LANGKAH_BOOKING]} current={1} />

      {tidakTersedia.length > 0 ? (
        <div className="anim-rise mb-4 space-y-3">
          <Alert tone="warning" title="Sebagian tanggal pilihan Anda tidak tersedia">
            Tanggal {tidakTersedia.map((t) => formatTanggal(t)).join(", ")} sudah terisi atau
            tidak lagi dibuka untuk slot ini. Pilih tanggal lain di bawah, atau lihat saran slot
            berikut.
          </Alert>
          {saranBentrok?.ok && saranBentrok.data.length > 0 ? (
            <SlotSuggestions suggestions={saranBentrok.data} />
          ) : null}
        </div>
      ) : null}

      {/* Kartu ringkasan slot ala mockup: badge, nama slot besar, harga per tanggal. */}
      <div className="anim-fade-up">
        <Card className="shadow-[var(--shadow-md)]">
          <CardContent className="sm:py-6">
            <RingkasanSlot slot={slot} />
            {slot.peruntukan ? (
              <div className="mt-3">
                <Badge tone="blue">Peruntukan: {slot.peruntukan}</Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Tanggal &amp; Info Tenant</CardTitle>
          <CardDescription>
            Pilih tanggal sewa lalu isi data Anda untuk mengunci slot ini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BookingForm
            slot={slot}
            eventDates={eventDates}
            takenDates={takenDates}
            initialDates={initialDates}
          />
        </CardContent>
      </Card>

      <p className="mt-3 text-[0.8125rem] text-subtle">
        Slot dikunci untuk tanggal terpilih sampai biaya admin (
        {formatRupiah(hargaSlot)} / tanggal) diverifikasi panitia.
      </p>
    </div>
  );
}
