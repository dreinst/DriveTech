import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { FadeUp } from "@/components/motion/motion";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Stepper } from "@/components/ui/Stepper";
import {
  LEASING_STATUS_LABEL,
  PURCHASE_PAYMENT_METHOD_LABEL,
  TENANT_TYPE_LABEL,
} from "@/lib/domain/labels";
import { hitungAngsuran, SIMULASI_BUNGA_FLAT_TAHUNAN } from "@/lib/domain/simulasi";
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

/** Baris label-nilai di dalam kartu rincian. */
function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{children}</dd>
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
        description="Tunjukkan kode transaksi ini ke tenant atau panitia saat di lokasi."
      />

      <Stepper steps={LANGKAH} current={2} />

      <div className="space-y-4">
        {/* Elemen dominan halaman: kode transaksi (kartu hero pola mockup). */}
        <FadeUp>
          <Card className="shadow-[var(--shadow-md)]">
            <CardContent>
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
                    Kode Transaksi
                  </p>
                  <p className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                    {purchase.transaction_code}
                  </p>
                  <p className="mt-1.5 text-xs text-subtle">
                    Dibuat {formatTanggalWaktu(purchase.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={purchase.status} kind="purchase" />
                  <CopyCodeButton code={purchase.transaction_code} />
                </div>
              </div>
            </CardContent>
          </Card>
        </FadeUp>

        {!isKredit ? (
          <Alert tone="info" title="Pembayaran langsung ke tenant">
            <p>
              Tunjukkan kode ini di lapak {namaSlot} ({purchase.slot.zone.name}) — pembayaran{" "}
              {purchase.payment_method === "cash" ? "tunai" : "transfer"} dilakukan langsung ke
              tenant di lokasi.
            </p>
          </Alert>
        ) : null}

        {isKredit && !leasing ? (
          <div className="space-y-3">
            <Alert tone="warning" title="Pengajuan leasing belum dikirim">
              <p>
                Mitra leasing, uang muka, dan tenor belum dipilih. Lanjutkan pengajuan supaya
                panitia bisa meneruskan data Anda.
              </p>
            </Alert>
            <Link href={`/beli/${purchase.id}/leasing`} className={buttonClass("primary", "md")}>
              Lanjutkan pengajuan leasing
            </Link>
          </div>
        ) : null}

        {isKredit && leasing ? (
          <Card>
            <CardHeader>
              <CardTitle>Status Pengajuan Pembiayaan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={leasing.status} kind="leasing" />
                <span className="text-xs text-muted">
                  Diperbarui {formatTanggalWaktu(leasing.updated_at)}
                </span>
              </div>

              {/* Timeline vertikal proses leasing. */}
              <ol className="space-y-0">
                {alur.map((tahap, index) => {
                  const selesai = index < indeksAktif;
                  const aktif = index === indeksAktif;
                  const ditolak = tahap === "rejected";
                  const bulatClass = ditolak
                    ? "border-danger bg-danger text-white"
                    : selesai
                      ? "border-ok bg-ok text-white"
                      : aktif
                        ? "border-accent bg-card text-accent ring-4 ring-accent-soft"
                        : "border-line-strong bg-card text-subtle";
                  const judulClass =
                    aktif && ditolak
                      ? "text-danger"
                      : selesai || aktif
                        ? "text-ink"
                        : "text-subtle";

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
                            className={`w-px flex-1 ${selesai ? "bg-ok" : "bg-line"}`}
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                      <div className={index === alur.length - 1 ? "pb-0" : "pb-5"}>
                        <p className={`text-sm font-semibold ${judulClass}`}>
                          {LEASING_STATUS_LABEL[tahap]}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">
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

              {/* Catatan: commission_amount & commission_rate SENGAJA tidak ditampilkan ke pembeli. */}
              <dl className="divide-y divide-line border-t border-line">
                <Baris label="Mitra leasing">{leasing.partner.name}</Baris>
                <Baris label="Kontak mitra">{leasing.partner.contact ?? "-"}</Baris>
                <Baris label="Uang muka (DP)">
                  <span className="tabular">{formatRupiah(leasing.dp_amount)}</span>
                </Baris>
                <Baris label="Tenor">
                  <span className="tabular">
                    {leasing.tenor_bulan === null ? "-" : `${leasing.tenor_bulan} bulan`}
                  </span>
                </Baris>
                <Baris label={`Estimasi angsuran (${bungaPersen}% flat/tahun)`}>
                  {simulasi && simulasi.valid ? (
                    <span className="tabular font-semibold text-accent">
                      {formatRupiah(simulasi.angsuranPerBulan)} / bulan
                    </span>
                  ) : (
                    "Belum bisa dihitung"
                  )}
                </Baris>
              </dl>
              <p className="text-xs leading-relaxed text-muted">
                Estimasi tidak mengikat — DP, tenor, bunga, dan biaya final ditentukan mitra
                leasing setelah verifikasi.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Rincian Transaksi</CardTitle>
          </CardHeader>
          <CardContent className="py-2 sm:py-2.5">
            <dl className="divide-y divide-line">
              <Baris label="Pembeli">{purchase.buyer_name}</Baris>
              <Baris label="Nomor HP">{purchase.buyer_phone ?? "-"}</Baris>
              <Baris label="Lapak penjual">
                {namaSlot} — {purchase.slot.zone.name}
              </Baris>
              <Baris label="Tenant penjual">
                {penyewa ? (
                  <span>
                    {penyewa.tenant.name}
                    <span className="ml-1 font-normal text-muted">
                      ({TENANT_TYPE_LABEL[penyewa.tenant.tenant_type]})
                    </span>
                  </span>
                ) : (
                  <span className="font-normal text-muted">Belum tercatat</span>
                )}
              </Baris>
              <Baris label="Unit diminati">{purchase.unit_description ?? "Belum dirinci"}</Baris>
              <Baris label="Perkiraan harga">
                <span className="tabular">
                  {purchase.unit_price === null
                    ? "Belum dicatat"
                    : formatRupiah(purchase.unit_price)}
                </span>
              </Baris>
              <Baris label="Metode pembayaran">
                {PURCHASE_PAYMENT_METHOD_LABEL[purchase.payment_method]}
              </Baris>
              {purchase.notes ? <Baris label="Catatan Anda">{purchase.notes}</Baris> : null}
            </dl>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Link href="/" className={buttonClass("secondary", "md")}>
            Kembali ke denah
          </Link>
        </div>
      </div>
    </div>
  );
}
