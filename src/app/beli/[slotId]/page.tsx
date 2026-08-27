import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PurchaseForm } from "@/components/forms/PurchaseForm";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Stepper } from "@/components/ui/Stepper";
import { TENANT_TYPE_LABEL, ZONE_TYPE_LABEL } from "@/lib/domain/labels";
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

/** Postgres menolak id yang bukan uuid; perlakukan seperti 404. */
const INVALID_UUID = "22P02";

/** Baris keterangan sederhana untuk kartu ringkasan lapak. */
function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

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
            {namaSlot} adalah fasilitas umum pameran, bukan lapak tenant. Tidak ada unit yang
            dijual di sini. Silakan pilih lapak pada zona pameran mobil, mobil &amp; motor, atau
            mobil baru.
          </p>
        </Alert>
        <Link href="/" className={buttonClass("secondary", "md")}>
          Lihat denah lokasi
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
            Lapak {namaSlot} di {slot.zone.name} masih kosong, jadi belum ada unit yang dipajang
            untuk dibeli. Pilih lapak lain yang sudah terisi pada denah, atau booking lapak ini
            kalau Anda sendiri ingin berjualan di pameran.
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
        description="Isi data Anda dan pilih metode pembayaran. Untuk kredit, pengajuan diteruskan ke mitra leasing rekanan pameran."
      />

      <Stepper steps={LANGKAH} current={0} />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Lapak penjual</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <dl className="divide-y divide-slate-100">
              <Baris label="Nomor lapak">{namaSlot}</Baris>
              <Baris label="Zona">{slot.zone.name}</Baris>
              <Baris label="Jenis lapak">{ZONE_TYPE_LABEL[slot.zone.zone_type]}</Baris>
              <Baris label="Tenant penjual">
                {penyewa ? (
                  <span>
                    {penyewa.tenant.name}
                    <span className="ml-1 font-normal text-slate-500">
                      ({TENANT_TYPE_LABEL[penyewa.tenant.tenant_type]})
                    </span>
                  </span>
                ) : (
                  <span className="font-normal text-slate-500">Belum tercatat</span>
                )}
              </Baris>
              <Baris label="Status lapak">
                <StatusBadge status={slot.status} kind="slot" />
              </Baris>
            </dl>
          </CardContent>
        </Card>

        <Alert tone="info" title="Cara kerja pembelian di pameran ini">
          <p>
            Panitia hanya mencatat minat beli Anda lalu meneruskannya ke tenant pemilik lapak.
            Serah terima unit, pengecekan kondisi, dan pembayaran dilakukan langsung antara Anda
            dan tenant di lokasi. Khusus metode kredit, panitia membantu meneruskan pengajuan ke
            mitra leasing.
          </p>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Data pembeli</CardTitle>
          </CardHeader>
          <CardContent>
            <PurchaseForm slotId={slot.id} namaLapak={namaLapak} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
