import type { Metadata } from "next";

import { FormAksi } from "@/components/admin/FormAksi";
import { StatCard } from "@/components/admin/StatCard";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { hapusPenarikanAction, tambahPenarikanAction } from "@/lib/actions/alat";
import { requireSuperadmin } from "@/lib/services/auth";
import { ringkasanSaldo } from "@/lib/services/penarikan";
import { tanggalHariIniJakarta } from "@/lib/services/slots";
import { formatRupiah, formatTanggal } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Penarikan Saldo",
  description: "Uang masuk dari pembayaran terverifikasi dan catatan penarikan saldo QRIS.",
};

/** Satu baris hitungan: label di kiri, rupiah di kanan. */
function Baris({ label, nilai, tebal }: { label: string; nilai: number; tebal?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className={tebal ? "text-sm font-semibold text-ink" : "text-sm text-muted"}>{label}</dt>
      <dd className={`tabular text-sm ${tebal ? "font-semibold text-accent" : "font-medium text-ink"}`}>
        {formatRupiah(nilai)}
      </dd>
    </div>
  );
}

export default async function AdminPenarikanPage() {
  await requireSuperadmin();
  const hasil = await ringkasanSaldo();

  if (!hasil.ok) {
    return (
      <Alert tone="error" title="Data penarikan belum bisa dimuat">
        {hasil.error}
      </Alert>
    );
  }
  const d = hasil.data;
  const masuk = d.tagihan + d.kodeUnik;
  const sisa = masuk - d.ditarik;

  return (
    <div className="space-y-6">
      <header className="min-w-0 space-y-2">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Penarikan Saldo</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Uang masuk dihitung dari pembayaran QRIS yang sudah diverifikasi. Catat di sini setiap
          kali saldo ditarik ke rekening supaya sisa yang belum ditarik selalu terlihat.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Uang masuk"
          value={formatRupiah(masuk)}
          hint={`${d.jumlah} pembayaran terverifikasi`}
        />
        <StatCard
          label="Sudah ditarik"
          value={formatRupiah(d.ditarik)}
          hint={`${d.penarikan.length} kali penarikan`}
        />
        <StatCard
          label="Sisa belum ditarik"
          value={formatRupiah(sisa)}
          tone={sisa < 0 ? "red" : "green"}
          hint={sisa < 0 ? "Catatan penarikan melebihi uang masuk, periksa lagi." : undefined}
        />
      </div>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Rincian uang masuk</h2>
        <dl className="mt-2 divide-y divide-line">
          <Baris label="Tagihan biaya admin" nilai={d.tagihan} />
          <Baris label="Kode unik" nilai={d.kodeUnik} />
          <Baris label="Total masuk" nilai={masuk} tebal />
          <Baris label="Sudah ditarik" nilai={d.ditarik} />
          <Baris label="Sisa belum ditarik" nilai={sisa} tebal />
        </dl>
        {d.tunai > 0 ? (
          <p className="mt-3 text-xs text-muted">
            Di luar hitungan ini ada {formatRupiah(d.tunai)} dari booking manual yang dibayar tunai
            ke panitia, jadi tidak masuk saldo QRIS.
          </p>
        ) : null}
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Catat penarikan</h2>
        <FormAksi action={tambahPenarikanAction} className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Tanggal" htmlFor="tarik-tanggal" required>
            <Input
              id="tarik-tanggal"
              name="tanggal"
              type="date"
              defaultValue={tanggalHariIniJakarta()}
              required
            />
          </Field>
          <Field label="Nominal (rupiah)" htmlFor="tarik-nominal" required>
            <Input
              id="tarik-nominal"
              name="nominal"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              className="tabular"
            />
          </Field>
          <Field label="Catatan" htmlFor="tarik-catatan">
            <Input id="tarik-catatan" name="catatan" maxLength={200} placeholder="Opsional" />
          </Field>
          <div className="sm:col-span-3">
            <SubmitButton pendingText="Mencatat…">Catat penarikan</SubmitButton>
          </div>
        </FormAksi>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Riwayat penarikan</h2>
        </div>
        {d.penarikan.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted">Belum ada penarikan yang dicatat.</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.penarikan.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    <span className="tabular">{formatRupiah(row.nominal)}</span>
                    <span className="font-normal text-muted"> · {formatTanggal(row.tanggal)}</span>
                  </p>
                  <p className="mt-0.5 break-words text-xs text-muted">
                    {row.catatan ? `${row.catatan} · ` : ""}dicatat oleh {row.dicatat_oleh}
                  </p>
                </div>
                <FormAksi
                  action={hapusPenarikanAction}
                  konfirmasi={`Hapus catatan penarikan ${formatRupiah(row.nominal)}?`}
                  className="flex flex-col items-end gap-1"
                >
                  <input type="hidden" name="id" value={row.id} />
                  <SubmitButton variant="danger" size="sm" pendingText="Menghapus…">
                    Hapus
                  </SubmitButton>
                </FormAksi>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
