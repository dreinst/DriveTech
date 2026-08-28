import type { Metadata } from "next";

import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { LeasingUpdateForm } from "@/components/admin/LeasingUpdateForm";
import { PartnerForm } from "@/components/admin/PartnerForm";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LEASING_STATUS_LABEL } from "@/lib/domain/labels";
import { listLeasingApplications, listPartners, type AdminLeasingItem } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/services/auth";
import type { LeasingPartnerRow, LeasingStatus } from "@/lib/types/database";
import { formatRupiah, formatTanggalWaktu, slotDisplayName } from "@/lib/utils";

// Data pengajuan leasing dibaca langsung dari database, jangan dirender saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leasing & Komisi",
  description: "Kelola pengajuan pembiayaan pengunjung, komisi platform, dan daftar mitra leasing.",
};

const STATUS_URUT: readonly LeasingStatus[] = [
  "submitted",
  "verifying",
  "approved",
  "rejected",
  "completed",
];

const KOLOM_PENGAJUAN = [
  "Kode Transaksi",
  "Pembeli",
  "Unit",
  "Slot / Tenant Asal",
  "Mitra Leasing",
  "DP",
  "Tenor",
  "Status",
  "Komisi",
  "Aksi",
];

const KOLOM_MITRA = ["Nama", "Kontak", "Rate Komisi", "Status", "Aksi"];

/** Kartu angka ringkas untuk baris ringkasan di atas halaman. */
function Ringkas({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-card p-4 shadow-[var(--shadow-sm)]">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

/** Jumlahkan komisi dari daftar pengajuan yang lolos saringan. */
function jumlahKomisi(rows: AdminLeasingItem[], lolos: (row: AdminLeasingItem) => boolean): number {
  return rows
    .filter(lolos)
    .reduce((total, row) => total + (row.commission_amount ?? 0), 0);
}

export default async function AdminLeasingPage() {
  await requireAdmin();

  const [pengajuanResult, mitraResult] = await Promise.all([
    listLeasingApplications(),
    listPartners(),
  ]);

  const pengajuan: AdminLeasingItem[] = pengajuanResult.ok ? pengajuanResult.data : [];
  const mitra: LeasingPartnerRow[] = mitraResult.ok ? mitraResult.data : [];

  const komisiTerkumpul = jumlahKomisi(pengajuan, (row) => row.commission_paid === true);
  const komisiBelumDibayar = jumlahKomisi(
    pengajuan,
    (row) => row.commission_paid !== true && row.status !== "rejected",
  );
  const jumlahPerStatus = STATUS_URUT.map((status) => ({
    status,
    jumlah: pengajuan.filter((row) => row.status === status).length,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Leasing</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Pantau pengajuan pembiayaan pengunjung dan komisi platform.
          </p>
        </div>
        <AutoRefresh />
      </header>

      {!pengajuanResult.ok ? (
        <Alert tone="error" title="Data pengajuan leasing belum bisa dimuat">
          {pengajuanResult.error}
        </Alert>
      ) : null}
      {!mitraResult.ok ? (
        <Alert tone="error" title="Data mitra leasing belum bisa dimuat">
          {mitraResult.error}
        </Alert>
      ) : null}

      {/* Ringkasan */}
      <section className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Ringkas
            label="Komisi terkumpul"
            value={formatRupiah(komisiTerkumpul)}
            hint="Sudah dibayar mitra."
          />
          <Ringkas
            label="Komisi belum dibayar"
            value={formatRupiah(komisiBelumDibayar)}
            hint="Pengajuan aktif yang komisinya belum lunas."
          />
          <Ringkas
            label="Total pengajuan"
            value={String(pengajuan.length)}
            hint={`${mitra.filter((row) => row.is_active).length} mitra aktif dari ${mitra.length} mitra.`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {jumlahPerStatus.map((item) => (
            <span
              key={item.status}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-xs text-muted"
            >
              {LEASING_STATUS_LABEL[item.status]}
              <strong className="tabular font-semibold text-ink">{item.jumlah}</strong>
            </span>
          ))}
        </div>
      </section>

      {/* (a) Pengajuan leasing */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Pengajuan Leasing</CardTitle>
            <CardDescription>
              Perbarui status, catat komisi, dan tandai komisi yang sudah dibayar mitra.
            </CardDescription>
          </CardHeader>

          {pengajuan.length === 0 ? (
            <CardContent>
              <EmptyState
                title="Belum ada pengajuan leasing"
                description="Pengajuan muncul saat pengunjung memilih metode kredit di halaman pembelian unit."
              />
            </CardContent>
          ) : (
            <div className="overflow-x-auto rounded-b-[var(--radius)]">
              <table className="w-full min-w-[76rem] border-collapse text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-subtle">
                  <tr>
                    {KOLOM_PENGAJUAN.map((kolom) => (
                      <th key={kolom} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">
                        {kolom}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pengajuan.map((row) => {
                    const purchase = row.purchase;
                    const slot = purchase?.slot ?? null;
                    const hargaUnit = purchase?.unit_price ?? null;
                    const lunas = row.commission_paid === true;

                    return (
                      <tr key={row.id} className="align-top hover:bg-surface-2">
                        <td className="px-3 py-3">
                          <p className="font-mono text-xs font-semibold text-ink">
                            {purchase?.transaction_code ?? "—"}
                          </p>
                          <p className="mt-0.5 text-xs text-subtle">
                            {formatTanggalWaktu(row.created_at)}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <p className="font-medium text-ink">{purchase?.buyer_name ?? "—"}</p>
                          <p className="text-xs text-muted">{purchase?.buyer_phone ?? "—"}</p>
                        </td>

                        <td className="px-3 py-3">
                          <p className="max-w-[16rem] text-muted">
                            {purchase?.unit_description ?? "—"}
                          </p>
                          <p className="tabular text-xs font-medium text-ink">
                            {hargaUnit === null ? "Harga belum dicatat" : formatRupiah(hargaUnit)}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <p className="font-medium text-ink">
                            {slot ? slotDisplayName(slot) : "—"}
                          </p>
                          <p className="text-xs text-muted">{slot?.zone.name ?? "—"}</p>
                        </td>

                        <td className="px-3 py-3">
                          <p className="font-medium text-ink">{row.partner?.name ?? "—"}</p>
                          <p className="text-xs text-muted">{row.partner?.contact ?? "—"}</p>
                        </td>

                        <td className="tabular whitespace-nowrap px-3 py-3 text-muted">
                          {formatRupiah(row.dp_amount)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3 text-muted">
                          {typeof row.tenor_bulan === "number" ? `${row.tenor_bulan} bulan` : "—"}
                        </td>

                        <td className="px-3 py-3">
                          <StatusBadge status={row.status} kind="leasing" />
                        </td>

                        <td className="px-3 py-3">
                          <p className="tabular whitespace-nowrap font-medium text-ink">
                            {formatRupiah(row.commission_amount)}
                          </p>
                          <div className="mt-1">
                            <Badge tone={lunas ? "green" : "amber"}>{lunas ? "Lunas" : "Belum"}</Badge>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <LeasingUpdateForm
                            id={row.id}
                            status={row.status}
                            commissionAmount={row.commission_amount}
                            commissionPaid={lunas}
                            notes={row.notes}
                            unitPrice={hargaUnit}
                            commissionRate={row.partner?.commission_rate ?? null}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* (b) Mitra leasing */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Mitra Leasing</CardTitle>
            <CardDescription>
              Hanya mitra aktif yang tampil pada pilihan pengunjung.
            </CardDescription>
          </CardHeader>

          {mitra.length === 0 ? (
            <CardContent>
              <EmptyState
                title="Belum ada mitra leasing"
                description="Tambahkan mitra lewat formulir di samping."
              />
            </CardContent>
          ) : (
            <div className="overflow-x-auto rounded-b-[var(--radius)]">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase tracking-wide text-subtle">
                  <tr>
                    {KOLOM_MITRA.map((kolom) => (
                      <th key={kolom} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">
                        {kolom}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mitra.map((partner) => (
                    <tr key={partner.id} className="align-top hover:bg-surface-2">
                      <td className="px-3 py-3 font-medium text-ink">{partner.name}</td>
                      <td className="px-3 py-3 text-muted">{partner.contact ?? "—"}</td>
                      <td className="tabular whitespace-nowrap px-3 py-3 text-muted">
                        {typeof partner.commission_rate === "number"
                          ? `${partner.commission_rate}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={partner.is_active ? "green" : "slate"}>
                          {partner.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <PartnerForm partner={partner} variant="inline" summaryLabel="Ubah" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tambah Mitra</CardTitle>
            <CardDescription>Daftarkan perusahaan pembiayaan baru.</CardDescription>
          </CardHeader>
          <CardContent>
            <PartnerForm />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
