import type { Metadata } from "next";

import { EventDateAddForm, EventDateToggle } from "@/components/admin/EventDateForms";
import { ZoneFeeForm } from "@/components/admin/ZoneFeeForm";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EVENT_INFO, isBookableZoneType, QRIS_INFO } from "@/lib/domain/constants";
import { ADMIN_ROLE_LABEL, ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import { listEventDates, listZonesAdmin } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/services/auth";
import type { EventDateRow } from "@/lib/types/database";
import { formatRupiah, formatTanggal } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pengaturan",
  description: "Tanggal gelaran, biaya admin per zona, info event, dan akun admin.",
};

/** Satu baris label-nilai untuk kartu read-only. */
function BarisInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

/** "2026-08-27" hari ini pada zona waktu Asia/Jakarta. */
function hariIniWib(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Nama hari ("Sabtu") sebuah tanggal "YYYY-MM-DD", dibaca sebagai UTC. */
const hariFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "UTC" });

function namaHari(tanggal: string): string {
  const date = new Date(`${tanggal}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : hariFormatter.format(date);
}

function adalahAkhirPekan(tanggal: string): boolean {
  const date = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

export default async function AdminPengaturanPage() {
  const admin = await requireAdmin();
  const [zonesResult, datesResult] = await Promise.all([listZonesAdmin(), listEventDates()]);

  const zonaBookable = zonesResult.ok
    ? zonesResult.data.filter((zona) => isBookableZoneType(zona.zone_type))
    : [];

  // Hanya tanggal mendatang yang dikelola di sini; tanggal lampau tidak relevan lagi.
  const today = hariIniWib();
  const tanggalMendatang: EventDateRow[] = datesResult.ok
    ? datesResult.data.filter((row) => row.event_date >= today)
    : [];
  const jumlahAktif = tanggalMendatang.filter((row) => row.is_active).length;

  const namaAdmin = admin.full_name?.trim() || admin.email;
  const inisial = namaAdmin.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="space-y-8">
      <header className="min-w-0 space-y-2">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Pengaturan</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Tanggal gelaran, biaya admin per zona, informasi event, rekening panitia, dan akun yang
          sedang masuk.
        </p>
      </header>

      {/* ---------- (a) Tanggal event (model per tanggal) ---------- */}
      <Card>
        <div className="border-b border-line px-6 py-5">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Tanggal Event</h2>
          <p className="mt-0.5 text-sm text-muted">
            Pemesan hanya bisa memilih tanggal yang <strong className="font-medium">aktif</strong> di
            daftar ini. Menonaktifkan tanggal menutup pemesanan baru tanpa membatalkan booking yang
            sudah ada.
          </p>
        </div>

        {!datesResult.ok ? (
          <div className="px-6 py-5">
            <Alert tone="error" title="Daftar tanggal belum bisa dimuat">
              {datesResult.error}
            </Alert>
          </div>
        ) : tanggalMendatang.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted">
            Belum ada tanggal gelaran mendatang. Tambahkan lewat form di bawah, atau jalankan
            supabase/seed.sql untuk mengisi akhir pekan 8 minggu ke depan.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {tanggalMendatang.map((row) => {
              const hari = namaHari(row.event_date);
              const labelTanggal = `${hari}, ${formatTanggal(row.event_date)}`;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {hari}, <span className="tabular">{formatTanggal(row.event_date)}</span>
                    </p>
                    {!adalahAkhirPekan(row.event_date) ? (
                      <p className="mt-0.5 text-xs text-subtle">Di luar jadwal reguler Sabtu &amp; Minggu</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={row.is_active ? "green" : "slate"} dot>
                      {row.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                    <EventDateToggle id={row.id} active={row.is_active} dateLabel={labelTanggal} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-line px-6 py-5">
          <p className="mb-3 text-xs text-muted">
            {datesResult.ok
              ? `${jumlahAktif} dari ${tanggalMendatang.length} tanggal mendatang berstatus aktif.`
              : null}
          </p>
          <EventDateAddForm />
        </div>
      </Card>

      {/* ---------- (b) Biaya admin per zona ---------- */}
      <Card>
        <div className="border-b border-line px-6 py-5">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Biaya Admin per Zona</h2>
          <p className="mt-0.5 text-sm text-muted">
            Tarif berlaku <strong className="font-medium">per tanggal</strong>: total tagihan booking
            = biaya admin zona × jumlah tanggal yang dipilih.
          </p>
          <p className="mt-1.5 text-xs text-subtle">
            Catatan: slot UMKM nomor 11&ndash;20 memakai harga khusus per slot (Booth
            Leasing/Booth Otomotif, Rp&nbsp;500.000 per tanggal) yang diatur lewat
            database/migrasi &mdash; tarif zona UMKM di bawah tidak menimpanya.
          </p>
        </div>

        {!zonesResult.ok ? (
          <div className="px-6 py-5">
            <Alert tone="error" title="Daftar zona belum bisa dimuat">
              {zonesResult.error}
            </Alert>
          </div>
        ) : zonaBookable.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted">
            Belum ada zona yang disewakan. Jalankan supabase/seed.sql lebih dulu.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {zonaBookable.map((zona) => (
              <li
                key={zona.id}
                className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{zona.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {ZONE_TYPE_LABEL[zona.zone_type]} · saat ini{" "}
                    <span className="tabular font-medium text-ink">
                      {formatRupiah(zona.admin_fee)}
                    </span>{" "}
                    per tanggal
                  </p>
                </div>
                <div className="sm:w-80 sm:shrink-0">
                  <ZoneFeeForm
                    zoneId={zona.id}
                    zoneName={zona.name}
                    defaultFee={zona.admin_fee}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------- (c) Info event & rekening panitia (read-only) ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Info Event</h2>
          <dl className="mt-3 divide-y divide-line">
            <BarisInfo label="Nama Event" value={EVENT_INFO.name} />
            <BarisInfo label="Lokasi" value={EVENT_INFO.location} />
            <BarisInfo label="Jadwal" value={EVENT_INFO.scheduleText} />
            <BarisInfo label="Penyelenggara" value={EVENT_INFO.organizer} />
            {EVENT_INFO.contacts.map((kontak) => (
              <BarisInfo key={kontak.phone} label={`Kontak ${kontak.label}`} value={kontak.phone} />
            ))}
          </dl>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold tracking-tight text-ink">QRIS Panitia</h2>
          <p className="mt-1 text-xs text-muted">
            Satu-satunya metode bayar biaya admin. QRIS statis: nominal diisi penyewa, jadi
            cocokkan nominal &amp; waktu pada bukti dengan waktu kirim di halaman Pemesanan.
          </p>
          <div className="mt-3 flex items-start gap-4">
            <a
              href={QRIS_INFO.imagePath}
              target="_blank"
              rel="noopener noreferrer"
              title="Buka gambar QRIS ukuran penuh"
              className="shrink-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- gambar statis di public/ */}
              <img
                src={QRIS_INFO.imagePath}
                alt={`Kode QRIS ${QRIS_INFO.merchantName}`}
                width={96}
                height={135}
                className="h-auto w-24 rounded-[var(--radius-sm)] border border-line bg-white"
              />
            </a>
            <dl className="min-w-0 flex-1 divide-y divide-line">
              <BarisInfo label="Merchant" value={QRIS_INFO.merchantName} />
              <BarisInfo label="NMID" value={QRIS_INFO.nmid} />
              <BarisInfo label="Terminal" value={QRIS_INFO.terminal} />
            </dl>
          </div>
        </Card>
      </div>

      <p className="text-xs text-subtle">
        Info event, kontak, dan QRIS panitia diubah di{" "}
        <code className="rounded bg-surface-3 px-1 py-0.5 font-mono">src/lib/domain/constants.ts</code>{" "}
        (gambar QRIS di{" "}
        <code className="rounded bg-surface-3 px-1 py-0.5 font-mono">public/qris-drivetech.jpg</code>
        ; tahap berikutnya: dipindah ke database).
      </p>

      {/* ---------- (d) Akun admin ---------- */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Akun Admin</h2>
        <div className="mt-4 flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-3 text-base font-semibold text-ink"
          >
            {inisial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{namaAdmin}</p>
            <p className="truncate text-xs text-muted">{admin.email}</p>
          </div>
          <div className="ml-auto shrink-0">
            <Badge tone={admin.role === "admin" ? "blue" : "slate"} dot>
              {ADMIN_ROLE_LABEL[admin.role]}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
