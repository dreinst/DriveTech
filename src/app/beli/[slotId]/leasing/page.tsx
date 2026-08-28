import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LeasingForm } from "@/components/forms/LeasingForm";
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

/** Baris label-nilai di dalam kartu ringkasan. */
function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{children}</dd>
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
            Metode pembayaran Anda {PURCHASE_PAYMENT_METHOD_LABEL[purchase.payment_method]} —
            pembayaran diselesaikan langsung dengan tenant di lokasi, tanpa pengajuan leasing.
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
        description="Pilih mitra leasing lalu tentukan uang muka dan tenor."
      />

      <Stepper steps={LANGKAH} current={1} />

      <div className="space-y-4">
        {/* Kartu ringkasan transaksi: kode besar + perkiraan harga (pola kartu mockup). */}
        <FadeUp>
          <Card className="shadow-[var(--shadow-md)]">
            <CardContent>
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
                    Kode Transaksi
                  </p>
                  <p className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-ink">
                    {purchase.transaction_code}
                  </p>
                  <p className="mt-1 text-sm text-muted">{purchase.buyer_name}</p>
                </div>
                <div className="min-w-0 sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
                    Perkiraan Harga Unit
                  </p>
                  {purchase.unit_price === null ? (
                    <p className="mt-1.5 text-sm text-muted">Belum dicatat</p>
                  ) : (
                    <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight text-ink">
                      {formatRupiah(purchase.unit_price)}
                    </p>
                  )}
                </div>
              </div>
              <dl className="mt-5 divide-y divide-line border-t border-line">
                <Baris label="Lapak penjual">
                  {namaSlot} — {purchase.slot.zone.name}
                </Baris>
                <Baris label="Unit diminati">{purchase.unit_description ?? "Belum dirinci"}</Baris>
              </dl>
            </CardContent>
          </Card>
        </FadeUp>

        {!partnersResult.ok ? (
          <Alert tone="error" title="Gagal memuat mitra leasing">
            {partnersResult.error}
          </Alert>
        ) : null}

        {partnersResult.ok && partners.length === 0 ? (
          <EmptyState
            title="Belum ada mitra leasing aktif"
            description="Hubungi sekretariat pameran atau tanyakan langsung ke tenant penjual."
            action={
              <Link href={statusHref} className={buttonClass("secondary", "md")}>
                Lihat status transaksi
              </Link>
            }
          />
        ) : null}

        {partners.length > 0 ? (
          <FadeUp delay={0.06}>
            <Card>
              <CardHeader>
                <CardTitle>Formulir Pengajuan</CardTitle>
                <CardDescription>
                  Pilih mitra, lalu tentukan uang muka dan tenor sesuai kemampuan Anda.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LeasingForm
                  purchaseId={purchase.id}
                  partners={partners}
                  unitPrice={purchase.unit_price}
                />
              </CardContent>
            </Card>
          </FadeUp>
        ) : null}
      </div>
    </div>
  );
}
