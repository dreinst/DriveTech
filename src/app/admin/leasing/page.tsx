import type { Metadata } from "next";

import { LeasingUpdateForm } from "@/components/admin/LeasingUpdateForm";
import { PartnerForm } from "@/components/admin/PartnerForm";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <Card>
      <CardContent className="space-y-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-lg font-semibold text-slate-900">{value}</p>
        {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
      </CardContent>
    </Card>
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
    <div className="space-y-5">
      <PageHeader
        title="Leasing & Komisi"
        description="Pantau pengajuan pembiayaan pengunjung, catat komisi platform, dan kelola mitra leasing."
        backHref="/admin"
        backLabel="Kembali ke dasbor"
      />

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
            hint="Sudah ditandai dibayar mitra."
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
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Pengajuan per status
          </span>
          {jumlahPerStatus.map((item) => (
            <span
              key={item.status}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
            >
              {LEASING_STATUS_LABEL[item.status]}
              <strong className="font-semibold text-slate-900">{item.jumlah}</strong>
            </span>
          ))}
        </div>
      </section>

      {/* (a) Pengajuan leasing */}
      <section className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>Pengajuan Leasing</CardTitle>
            <CardDescription>
              Perbarui status pengajuan, catat nominal komisi platform, dan tandai komisi yang sudah
              dibayarkan mitra.
            </CardDescription>
          </CardHeader>

          {pengajuan.length === 0 ? (
            <CardContent>
              <EmptyState
                title="Belum ada pengajuan leasing"
                description="Pengajuan muncul otomatis ketika pengunjung memilih metode kredit pada halaman pembelian unit."
              />
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[76rem] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {KOLOM_PENGAJUAN.map((kolom) => (
                      <th key={kolom} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">
                        {kolom}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pengajuan.map((row) => {
                    const purchase = row.purchase;
                    const slot = purchase?.slot ?? null;
                    const hargaUnit = purchase?.unit_price ?? null;
                    const lunas = row.commission_paid === true;

                    return (
                      <tr key={row.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-3 py-3">
                          <p className="font-mono text-xs font-semibold text-slate-900">
                            {purchase?.transaction_code ?? "—"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {formatTanggalWaktu(row.created_at)}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">{purchase?.buyer_name ?? "—"}</p>
                          <p className="text-xs text-slate-500">{purchase?.buyer_phone ?? "—"}</p>
                        </td>

                        <td className="px-3 py-3">
                          <p className="max-w-[16rem] text-slate-700">
                            {purchase?.unit_description ?? "—"}
                          </p>
                          <p className="text-xs font-medium text-slate-900">
                            {hargaUnit === null ? "Harga belum dicatat" : formatRupiah(hargaUnit)}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">
                            {slot ? slotDisplayName(slot) : "—"}
                          </p>
                          <p className="text-xs text-slate-500">{slot?.zone.name ?? "—"}</p>
                        </td>

                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">{row.partner?.name ?? "—"}</p>
                          <p className="text-xs text-slate-500">{row.partner?.contact ?? "—"}</p>
                        </td>

                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                          {formatRupiah(row.dp_amount)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                          {typeof row.tenor_bulan === "number" ? `${row.tenor_bulan} bulan` : "—"}
                        </td>

                        <td className="px-3 py-3">
                          <StatusBadge status={row.status} kind="leasing" />
                        </td>

                        <td className="px-3 py-3">
                          <p className="whitespace-nowrap font-medium text-slate-900">
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
              Hanya mitra berstatus aktif yang muncul pada pilihan pengunjung di halaman pengajuan.
            </CardDescription>
          </CardHeader>

          {mitra.length === 0 ? (
            <CardContent>
              <EmptyState
                title="Belum ada mitra leasing"
                description="Tambahkan mitra lewat formulir di samping agar pengunjung bisa memilihnya."
              />
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {KOLOM_MITRA.map((kolom) => (
                      <th key={kolom} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">
                        {kolom}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mitra.map((partner) => (
                    <tr key={partner.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-3 py-3 font-medium text-slate-900">{partner.name}</td>
                      <td className="px-3 py-3 text-slate-600">{partner.contact ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">
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
            <CardDescription>Daftarkan perusahaan pembiayaan baru beserta rate komisinya.</CardDescription>
          </CardHeader>
          <CardContent>
            <PartnerForm />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
