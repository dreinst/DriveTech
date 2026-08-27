import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Stepper } from "@/components/ui/Stepper";
import { BANK_ACCOUNT } from "@/lib/domain/constants";
import {
  LEASING_STATUS_LABEL,
  PURCHASE_PAYMENT_METHOD_LABEL,
  TENANT_TYPE_LABEL,
} from "@/lib/domain/labels";
import { hitungAngsuran, SIMULASI_BUNGA_FLAT_TAHUNAN, SIMULASI_DISCLAIMER } from "@/lib/domain/simulasi";
import { getPurchaseDetail } from "@/lib/services/purchase";
import { getSlotTenant } from "@/lib/services/slots";
import type { LeasingStatus } from "@/lib/types/database";
import { formatRupiah, formatTanggalWaktu, slotDisplayName } from "@/lib/utils";
import { CopyCodeButton } from "./CopyCodeButton";

/*
 * Segmen dinamis bernama [slotId] karena Next.js hanya mengizinkan SATU nama slug
 * per posisi segmen (lihat catatan di src/app/beli/[slotId]/page.tsx).
 * Di halaman ini nilainya adalah ID TRANSAKSI PEMBELIAN, sesuai rute kontrak
 * /beli/[transactionId]/...
 */

// Status pengajuan berubah kapan saja, jadi selalu dibaca saat permintaan.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Status Pembelian",
  description: "Pantau status transaksi pembelian unit dan pengajuan pembiayaan leasing.",
};

const LANGKAH = ["Data Pembeli", "Metode Pembayaran", "Selesai"];

/** Postgres menolak id yang bukan uuid; perlakukan seperti 404. */
const INVALID_UUID = "22P02";

/** Alur normal pengajuan leasing; "rejected" memakai alur pendek di bawah. */
const ALUR_LEASING: readonly LeasingStatus[] = ["submitted", "verifying", "approved", "completed"];
const ALUR_LEASING_DITOLAK: readonly LeasingStatus[] = ["submitted", "verifying", "rejected"];

const KETERANGAN_LEASING: Record<LeasingStatus, string> = {
  submitted: "Pengajuan Anda tercatat dan sedang disiapkan panitia untuk diteruskan ke mitra.",
  verifying: "Mitra leasing sedang memeriksa data dan kelengkapan dokumen Anda.",
  approved: "Pembiayaan disetujui. Mitra leasing akan menghubungi Anda untuk penandatanganan.",
  rejected: "Pengajuan belum dapat disetujui mitra. Anda masih bisa mencoba mitra lain di lokasi.",
  completed: "Pembiayaan selesai dan unit siap diserahterimakan oleh tenant.",
};

function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export default async function StatusPembelianPage({
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
          title="Status Pembelian"
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
  const leasing = purchase.leasing;
  const namaSlot = slotDisplayName(purchase.slot);
  const tenantResult = await getSlotTenant(purchase.slot.id);
  // Nama tenant hanya pelengkap; kegagalan memuatnya tidak boleh menggagalkan halaman.
  const penyewa = tenantResult.ok ? tenantResult.data : null;
  const isKredit = purchase.payment_method === "credit";

  const alur = leasing?.status === "rejected" ? ALUR_LEASING_DITOLAK : ALUR_LEASING;
  const indeksAktif = leasing ? alur.indexOf(leasing.status) : -1;

  const simulasi = leasing
    ? hitungAngsuran({
        harga: purchase.unit_price,
        dp: leasing.dp_amount,
        tenorBulan: leasing.tenor_bulan,
      })
    : null;
  const bungaPersen = Math.round(SIMULASI_BUNGA_FLAT_TAHUNAN * 1000) / 10;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Status Pembelian Unit"
        backHref="/"
        backLabel="Kembali ke denah"
        description="Simpan kode transaksi di bawah dan tunjukkan ke tenant atau panitia saat di lokasi."
      />

      <Stepper steps={LANGKAH} current={2} />

      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Kode transaksi</p>
                <p className="font-mono text-xl font-semibold tracking-tight text-slate-900">
                  {purchase.transaction_code}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={purchase.status} kind="purchase" />
                <CopyCodeButton code={purchase.transaction_code} />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Dibuat {formatTanggalWaktu(purchase.created_at)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rincian pembelian</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <dl className="divide-y divide-slate-100">
              <Baris label="Nama pembeli">{purchase.buyer_name}</Baris>
              <Baris label="Nomor HP">{purchase.buyer_phone ?? "-"}</Baris>
              <Baris label="Lapak penjual">
                {namaSlot} — {purchase.slot.zone.name}
              </Baris>
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
              <Baris label="Unit diminati">{purchase.unit_description ?? "Belum dirinci"}</Baris>
              <Baris label="Perkiraan harga">
                {purchase.unit_price === null ? "Belum dicatat" : formatRupiah(purchase.unit_price)}
              </Baris>
              <Baris label="Metode pembayaran">
                {PURCHASE_PAYMENT_METHOD_LABEL[purchase.payment_method]}
              </Baris>
              {purchase.notes ? <Baris label="Catatan Anda">{purchase.notes}</Baris> : null}
            </dl>
          </CardContent>
        </Card>

        {!isKredit ? (
          <Card>
            <CardHeader>
              <CardTitle>Cara menyelesaikan pembayaran</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ol className="space-y-2 text-sm text-slate-600">
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    1
                  </span>
                  <span>
                    Datang ke lapak <strong className="text-slate-900">{namaSlot}</strong> di{" "}
                    {purchase.slot.zone.name} dan sebutkan kode transaksi{" "}
                    <span className="font-mono font-semibold text-slate-900">
                      {purchase.transaction_code}
                    </span>
                    .
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    2
                  </span>
                  <span>
                    Periksa unit bersama tenant, sepakati harga akhir, lalu bayar{" "}
                    {purchase.payment_method === "cash"
                      ? "tunai langsung ke tenant"
                      : "lewat transfer ke rekening tenant"}
                    .
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    3
                  </span>
                  <span>
                    Minta kuitansi dan dokumen kendaraan (STNK, BPKB, faktur) saat serah terima.
                    Panitia siap membantu bila ada kendala.
                  </span>
                </li>
              </ol>

              <Alert tone="warning" title="Pembayaran unit dilakukan ke tenant, bukan ke panitia">
                <p>
                  Panitia tidak menerima pembayaran unit. Rekening panitia di bawah hanya contoh
                  rekening resmi penyelenggara yang dipakai untuk biaya administrasi lapak tenant.
                  Jangan mentransfer harga unit ke rekening ini.
                </p>
              </Alert>

              <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/60 px-3.5">
                <Baris label="Bank (contoh, milik panitia)">{BANK_ACCOUNT.bankName}</Baris>
                <Baris label="Nomor rekening">
                  <span className="font-mono">{BANK_ACCOUNT.accountNumber}</span>
                </Baris>
                <Baris label="Atas nama">{BANK_ACCOUNT.accountName}</Baris>
              </dl>
            </CardContent>
          </Card>
        ) : null}

        {isKredit && !leasing ? (
          <Card>
            <CardHeader>
              <CardTitle>Pengajuan leasing belum dikirim</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert tone="warning" title="Satu langkah lagi">
                <p>
                  Anda memilih pembelian kredit, tetapi mitra leasing beserta uang muka dan tenor
                  belum dipilih. Lanjutkan pengajuan supaya panitia bisa meneruskan data Anda.
                </p>
              </Alert>
              <Link href={`/beli/${purchase.id}/leasing`} className={buttonClass("primary", "md")}>
                Lanjutkan pengajuan leasing
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {isKredit && leasing ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Status pengajuan pembiayaan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={leasing.status} kind="leasing" />
                  <span className="text-xs text-slate-500">
                    Diperbarui {formatTanggalWaktu(leasing.updated_at)}
                  </span>
                </div>

                <ol className="space-y-0">
                  {alur.map((tahap, index) => {
                    const selesai = index < indeksAktif;
                    const aktif = index === indeksAktif;
                    const ditolak = tahap === "rejected";
                    const bulatClass = ditolak
                      ? "border-red-600 bg-red-600 text-white"
                      : selesai
                        ? "border-slate-900 bg-slate-900 text-white"
                        : aktif
                          ? "border-slate-900 bg-white text-slate-900"
                          : "border-slate-300 bg-white text-slate-400";
                    const judulClass =
                      selesai || aktif ? "text-slate-900" : "text-slate-400";

                    return (
                      <li key={tahap} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${bulatClass}`}
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>
                          {index < alur.length - 1 ? (
                            <span
                              className={`w-px flex-1 ${selesai ? "bg-slate-900" : "bg-slate-200"}`}
                              aria-hidden="true"
                            />
                          ) : null}
                        </div>
                        <div className={index === alur.length - 1 ? "pb-0" : "pb-4"}>
                          <p className={`text-sm font-semibold ${judulClass}`}>
                            {LEASING_STATUS_LABEL[tahap]}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                            {KETERANGAN_LEASING[tahap]}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {leasing.notes ? (
                  <Alert tone="info" title="Catatan dari panitia / mitra">
                    <p>{leasing.notes}</p>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rincian pembiayaan</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                {/* Catatan: commission_amount & commission_rate SENGAJA tidak ditampilkan ke pembeli. */}
                <dl className="divide-y divide-slate-100">
                  <Baris label="Mitra leasing">{leasing.partner.name}</Baris>
                  <Baris label="Kontak mitra">{leasing.partner.contact ?? "-"}</Baris>
                  <Baris label="Uang muka (DP)">{formatRupiah(leasing.dp_amount)}</Baris>
                  <Baris label="Tenor">
                    {leasing.tenor_bulan === null ? "-" : `${leasing.tenor_bulan} bulan`}
                  </Baris>
                  <Baris label={`Estimasi angsuran (bunga ${bungaPersen}% flat/tahun)`}>
                    {simulasi && simulasi.valid
                      ? `${formatRupiah(simulasi.angsuranPerBulan)} / bulan`
                      : "Belum bisa dihitung"}
                  </Baris>
                </dl>
                <p className="border-t border-slate-100 py-3 text-xs leading-relaxed text-slate-500">
                  {SIMULASI_DISCLAIMER}
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link href="/" className={buttonClass("secondary", "md")}>
            Kembali ke denah
          </Link>
        </div>
      </div>
    </div>
  );
}
