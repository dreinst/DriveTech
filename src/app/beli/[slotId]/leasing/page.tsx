import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LeasingForm } from "@/components/forms/LeasingForm";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stepper } from "@/components/ui/Stepper";
import { PURCHASE_PAYMENT_METHOD_LABEL } from "@/lib/domain/labels";
import { listActivePartners } from "@/lib/services/leasing";
import { getPurchaseDetail } from "@/lib/services/purchase";
import { formatRupiah, slotDisplayName } from "@/lib/utils";

/*
 * Segmen dinamis bernama [slotId] karena Next.js hanya mengizinkan SATU nama slug
 * per posisi segmen (lihat catatan di src/app/beli/[slotId]/page.tsx).
 * Di halaman ini nilainya adalah ID TRANSAKSI PEMBELIAN, sesuai rute kontrak
 * /beli/[transactionId]/...
 */

// Data transaksi & daftar mitra dibaca saat permintaan, bukan saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pengajuan Leasing",
  description: "Pilih mitra leasing, isi uang muka dan tenor untuk pembelian kredit.",
};

const LANGKAH = ["Data Pembeli", "Metode Pembayaran", "Selesai"];

/** Postgres menolak id yang bukan uuid; perlakukan seperti 404. */
const INVALID_UUID = "22P02";

function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export default async function PengajuanLeasingPage({
  params,
}: {
  params: Promise<{ slotId: string }>;
}) {
  const { slotId: transactionId } = await params;
  const result = await getPurchaseDetail(transactionId);

  if (!result.ok) {
    if (result.code === "NOT_FOUND" || result.code === INVALID_UUID) notFound();
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader
          title="Pengajuan Leasing"
          backHref="/"
          backLabel="Kembali ke denah"
          description="Data transaksi tidak bisa dimuat."
        />
        <Alert tone="error" title="Gagal memuat transaksi">
          {result.error}
        </Alert>
      </div>
    );
  }

  const purchase = result.data;
  const statusHref = `/beli/${purchase.id}/status`;

  // Bukan pembelian kredit: tidak ada yang perlu diajukan ke mitra leasing.
  if (purchase.payment_method !== "credit") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <PageHeader
          title="Pengajuan Leasing"
          backHref="/"
          backLabel="Kembali ke denah"
          description={`Transaksi ${purchase.transaction_code}`}
        />
        <Alert tone="info" title="Transaksi ini bukan pembelian kredit">
          <p>
            Metode pembayaran yang Anda pilih adalah{" "}
            {PURCHASE_PAYMENT_METHOD_LABEL[purchase.payment_method]}, jadi tidak perlu pengajuan ke
            mitra leasing. Pembayaran diselesaikan langsung dengan tenant di lokasi.
          </p>
        </Alert>
        <Link href={statusHref} className={buttonClass("primary", "md")}>
          Lihat status transaksi
        </Link>
      </div>
    );
  }

  // Sudah pernah diajukan: langsung ke halaman status (redirect melempar NEXT_REDIRECT).
  if (purchase.leasing !== null) {
    redirect(statusHref);
  }

  const partnersResult = await listActivePartners();
  const partners = partnersResult.ok ? partnersResult.data : [];
  const namaSlot = slotDisplayName(purchase.slot);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Pengajuan Pembiayaan"
        backHref="/"
        backLabel="Kembali ke denah"
        description="Pilih mitra leasing, tentukan uang muka dan tenor. Data Anda diteruskan ke mitra untuk diverifikasi."
      />

      <Stepper steps={LANGKAH} current={1} />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Ringkasan transaksi</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <dl className="divide-y divide-slate-100">
              <Baris label="Kode transaksi">
                <span className="font-mono">{purchase.transaction_code}</span>
              </Baris>
              <Baris label="Pembeli">{purchase.buyer_name}</Baris>
              <Baris label="Lapak penjual">
                {namaSlot} — {purchase.slot.zone.name}
              </Baris>
              <Baris label="Unit diminati">
                {purchase.unit_description ?? "Belum dirinci"}
              </Baris>
              <Baris label="Perkiraan harga">
                {purchase.unit_price === null ? "Belum dicatat" : formatRupiah(purchase.unit_price)}
              </Baris>
            </dl>
          </CardContent>
        </Card>

        {!partnersResult.ok ? (
          <Alert tone="error" title="Gagal memuat mitra leasing">
            {partnersResult.error}
          </Alert>
        ) : null}

        {partnersResult.ok && partners.length === 0 ? (
          <EmptyState
            title="Belum ada mitra leasing aktif"
            description="Saat ini panitia belum mengaktifkan mitra pembiayaan. Silakan hubungi sekretariat pameran atau tanyakan langsung ke tenant penjual."
            action={
              <Link href={statusHref} className={buttonClass("secondary", "md")}>
                Lihat status transaksi
              </Link>
            }
          />
        ) : null}

        {partners.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Formulir pengajuan</CardTitle>
            </CardHeader>
            <CardContent>
              <LeasingForm
                purchaseId={purchase.id}
                partners={partners}
                unitPrice={purchase.unit_price}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
