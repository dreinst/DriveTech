import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PurchaseForm } from "@/components/forms/PurchaseForm";
import { FadeUp } from "@/components/motion/motion";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Stepper } from "@/components/ui/Stepper";
import { EVENT_INFO } from "@/lib/domain/constants";
import { TENANT_TYPE_LABEL } from "@/lib/domain/labels";
import { getSlotDetail, getSlotTenant } from "@/lib/services/slots";
import { slotDisplayName } from "@/lib/utils";

/*
 * Segmen dinamis bernama [slotId] karena Next.js hanya mengizinkan SATU nama slug
 * per posisi segmen: "/beli/[slotId]" dan "/beli/[transactionId]/leasing" akan
 * menggagalkan build. Bentuk URL-nya tetap persis seperti kontrak. Di halaman ini
 * nilainya memang ID SLOT; di segmen leasing & status nilainya ID TRANSAKSI.
 * Konvensi ini sama dengan alur booking milik agen G.
 */

// Status slot dibaca langsung dari database, jangan dirender saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Beli Unit",
  description: "Ajukan pembelian unit dari tenant pameran: tunai, transfer, atau kredit leasing.",
};

const LANGKAH = ["Data Pembeli", "Metode Pembayaran", "Selesai"];

/* "Setiap hari Minggu..." -> "setiap hari Minggu..." agar pas di tengah kalimat
   (nama hari tetap kapital sesuai ejaan). */
const jadwalDiTengahKalimat =
  EVENT_INFO.scheduleText.charAt(0).toLowerCase() + EVENT_INFO.scheduleText.slice(1);

/** Postgres menolak id yang bukan uuid; perlakukan seperti 404. */
const INVALID_UUID = "22P02";

export default async function BeliUnitPage({
  params,
}: {
  params: Promise<{ slotId: string }>;
}) {
  const { slotId } = await params;
  const result = await getSlotDetail(slotId);

  if (!result.ok) {
    if (result.code === "NOT_FOUND" || result.code === INVALID_UUID) notFound();
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader
          title="Beli Unit"
          backHref="/"
          backLabel="Kembali ke denah"
          description="Data lapak tidak bisa dimuat."
        />
        <Alert tone="error" title="Gagal memuat data lapak">
          {result.error}
        </Alert>
      </div>
    );
  }

  const slot = result.data;
  const namaSlot = slotDisplayName(slot);
  const namaLapak = `${namaSlot} — ${slot.zone.name}`;

  // Pembeli membeli unit "dari salah satu tenant" (bagian 1 arsitektur), jadi
  // penyewa lapaknya ditampilkan. Gagal memuat tenant tidak boleh menggagalkan halaman.
  const tenantResult = await getSlotTenant(slot.id);
  const penyewa = tenantResult.ok ? tenantResult.data : null;

  if (slot.zone.zone_type === "facility") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <PageHeader
          title={namaSlot}
          backHref="/"
          backLabel="Kembali ke denah"
          description={slot.zone.name}
        />
        <Alert tone="info" title="Fasilitas tidak menjual unit">
          <p>
            {namaSlot} adalah fasilitas umum pameran — tidak ada unit yang dijual di sini.
          </p>
        </Alert>
        <Link href="/" className={buttonClass("secondary", "md")}>
          Lihat denah lokasi
        </Link>
      </div>
    );
  }

  // Kebijakan: warung kuliner tidak masuk alur pembelian unit.
  if (slot.zone.zone_type === "warung") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <PageHeader
          title={namaSlot}
          backHref="/"
          backLabel="Kembali ke denah"
          description={slot.zone.name}
        />
        <Alert tone="info" title="Pembelian unit tidak berlaku untuk warung">
          <p>
            {namaSlot} adalah warung kuliner. Unit kendaraan dijual di zona mobil baru, mobil
            bekas, serta mobil &amp; motor bekas pada denah.
          </p>
        </Alert>
        <Link href="/" className={buttonClass("secondary", "md")}>
          Kembali ke denah
        </Link>
      </div>
    );
  }

  if (slot.status === "available") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <PageHeader
          title={namaSlot}
          backHref="/"
          backLabel="Kembali ke denah"
          description={slot.zone.name}
        />
        <Alert tone="warning" title="Slot ini belum ada tenant-nya">
          <p>
            Lapak {namaSlot} masih kosong, jadi belum ada unit yang dipajang untuk dibeli. Pilih
            lapak terisi lain di denah, atau booking lapak ini kalau Anda ingin berjualan.
          </p>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className={buttonClass("primary", "md")}>
            Kembali ke denah
          </Link>
          <Link href={`/booking/${slot.id}`} className={buttonClass("secondary", "md")}>
            Booking lapak ini
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Beli Unit dari Tenant"
        backHref="/"
        backLabel="Kembali ke denah"
        description={`Panitia hanya mencatat minat Anda — pengecekan unit dan pembayaran dilakukan langsung dengan tenant di lokasi, ${jadwalDiTengahKalimat}.`}
      />

      <Stepper steps={LANGKAH} current={0} />

      <div className="space-y-4">
        {/* Kartu ringkasan lapak: nama slot besar + tenant penjual (pola kartu mockup). */}
        <FadeUp>
          <Card className="shadow-[var(--shadow-md)]">
            <CardContent>
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                <div className="min-w-0">
                  <StatusBadge status={slot.status} kind="slot" />
                  <p className="mt-2.5 text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
                    {namaSlot}
                  </p>
                  <p className="mt-1 text-sm text-muted">Zona: {slot.zone.name}</p>
                </div>
                <div className="min-w-0 sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
                    Tenant Penjual
                  </p>
                  {penyewa ? (
                    <>
                      <p className="mt-1.5 text-lg font-semibold tracking-tight text-ink">
                        {penyewa.tenant.name}
                      </p>
                      <p className="mt-0.5 text-[0.8125rem] text-muted">
                        {TENANT_TYPE_LABEL[penyewa.tenant.tenant_type]}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted">Belum tercatat</p>
                  )}
                </div>
              </div>
              {slot.zone.description ? (
                <p className="mt-5 border-t border-line pt-4 text-sm leading-relaxed text-muted">
                  {slot.zone.description}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </FadeUp>

        <FadeUp delay={0.06}>
          <Card>
            <CardHeader>
              <CardTitle>Data Pembeli</CardTitle>
              <CardDescription>
                Data ini diteruskan panitia ke tenant penjual sebagai catatan minat pembelian.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PurchaseForm slotId={slot.id} namaLapak={namaLapak} />
            </CardContent>
          </Card>
        </FadeUp>
      </div>
    </div>
  );
}
