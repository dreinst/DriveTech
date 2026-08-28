import type { Metadata } from "next";
import Link from "next/link";

import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { DetailList, detailKeTeks } from "@/components/admin/DetailList";
import { ExportCsvButton, type ExportCsvRow } from "@/components/admin/ExportCsvButton";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BOOKING_STATUS_LABEL, TENANT_TYPE_LABEL } from "@/lib/domain/labels";
import { listBookings, listTenants, type TenantListItem } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/services/auth";
import type { BookingDetail } from "@/lib/types/database";
import { formatTanggal, slotDisplayName } from "@/lib/utils";

// Data tenant selalu diambil segar; jangan dirender saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Daftar Tenant",
  description: "Daftar penyewa slot pameran beserta slot dan status bookingnya.",
};

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

function ambilParam(sp: SearchParams, key: string): string {
  const nilai = sp[key];
  if (Array.isArray(nilai)) return (nilai[0] ?? "").trim();
  return (nilai ?? "").trim();
}

/** Booking aktif lebih dulu, lalu yang terbaru. */
function urutkanBooking(a: BookingDetail, b: BookingDetail): number {
  const bobot = (booking: BookingDetail): number => (booking.status === "cancelled" ? 1 : 0);
  if (bobot(a) !== bobot(b)) return bobot(a) - bobot(b);
  return (b.created_at ?? "").localeCompare(a.created_at ?? "");
}

function cocokPencarian(tenant: TenantListItem, kataKunci: string): boolean {
  if (kataKunci.length === 0) return true;
  const jerami = [tenant.name, tenant.phone ?? "", tenant.email ?? ""].join(" ").toLowerCase();
  // Nomor HP sering ditulis dengan spasi/strip — samakan dulu sebelum dicocokkan.
  const angkaSaja = (teks: string): string => teks.replace(/[^0-9]/g, "");
  const kunciAngka = angkaSaja(kataKunci);
  if (kunciAngka.length >= 3 && angkaSaja(tenant.phone ?? "").includes(kunciAngka)) return true;
  return jerami.includes(kataKunci);
}

export default async function AdminTenantsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const q = ambilParam(sp, "q");
  const kataKunci = q.toLowerCase();

  const tenantResult = await listTenants();

  if (!tenantResult.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Tenant</h1>
        <Alert tone="error" title="Daftar tenant belum bisa dimuat">
          {tenantResult.error}
        </Alert>
      </div>
    );
  }

  const semuaTenant = tenantResult.data;
  const tenants = semuaTenant.filter((tenant) => cocokPencarian(tenant, kataKunci));

  // Booking dipakai untuk kolom "Slot yang disewa" dan "Status booking".
  const bookingResult = await listBookings();
  const bookingPerTenant = new Map<string, BookingDetail[]>();
  if (bookingResult.ok) {
    for (const booking of bookingResult.data) {
      const daftar = bookingPerTenant.get(booking.tenant_id);
      if (daftar) daftar.push(booking);
      else bookingPerTenant.set(booking.tenant_id, [booking]);
    }
    for (const daftar of bookingPerTenant.values()) daftar.sort(urutkanBooking);
  }

  const barisCsv: ExportCsvRow[] = tenants.map((tenant) => {
    const bookings = bookingPerTenant.get(tenant.id) ?? [];
    return {
      Nama: tenant.name,
      Tipe: TENANT_TYPE_LABEL[tenant.tenant_type],
      "No. HP": tenant.phone ?? "",
      Email: tenant.email ?? "",
      "Jumlah Booking Aktif": tenant.bookingCount,
      "Slot Disewa": bookings
        .map((booking) => `${slotDisplayName(booking.slot)} (${booking.slot.zone.name})`)
        .join(" | "),
      "Status Booking": bookings
        .map((booking) => `${booking.booking_code}: ${BOOKING_STATUS_LABEL[booking.status]}`)
        .join(" | "),
      Detail: detailKeTeks(tenant.detail),
      "Tanggal Daftar": formatTanggal(tenant.created_at),
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Tenant</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Semua penyewa slot yang pernah melakukan booking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AutoRefresh />
          <ExportCsvButton filename="daftar-tenant-pameran.csv" rows={barisCsv} />
        </div>
      </header>

      {/* ---------- Pencarian ---------- */}
      <form
        method="get"
        className="grid gap-3 rounded-[var(--radius)] border border-line bg-card p-4 shadow-[var(--shadow-sm)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      >
        <Field
          label="Cari tenant"
          htmlFor="cari-tenant"
          hint="Cocokkan dengan nama, nomor HP, atau email tenant."
        >
          <Input
            id="cari-tenant"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Contoh: Budi atau 0812"
            autoComplete="off"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2 sm:pb-0.5">
          <Button type="submit" size="sm">
            Cari
          </Button>
          <Link href="/admin/tenants" className={buttonClass("ghost", "sm")}>
            Reset
          </Link>
        </div>
      </form>

      {!bookingResult.ok ? (
        <Alert tone="warning" title="Data booking tidak bisa dimuat">
          {bookingResult.error} Kolom slot dan status booking ditampilkan kosong.
        </Alert>
      ) : null}

      <p className="text-xs text-muted">
        {q.length > 0
          ? `Menampilkan ${tenants.length} dari ${semuaTenant.length} tenant untuk pencarian "${q}".`
          : `Total ${semuaTenant.length} tenant terdaftar.`}
      </p>

      {/* ---------- Tabel tenant ---------- */}
      {tenants.length === 0 ? (
        <EmptyState
          title={q.length > 0 ? "Tenant tidak ditemukan" : "Belum ada tenant"}
          description={
            q.length > 0
              ? "Coba kata kunci lain, atau kosongkan pencarian untuk melihat semua tenant."
              : "Tenant akan muncul di sini setelah ada pengunjung yang membooking slot dari denah publik."
          }
          action={
            q.length > 0 ? (
              <Link href="/admin/tenants" className={buttonClass("secondary", "sm")}>
                Tampilkan semua tenant
              </Link>
            ) : (
              <Link href="/admin/slots" className={buttonClass("secondary", "sm")}>
                Lihat daftar slot
              </Link>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-card shadow-[var(--shadow-sm)]">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium tracking-wide text-subtle uppercase">
                <th scope="col" className="px-3 py-2.5">Nama</th>
                <th scope="col" className="px-3 py-2.5">Tipe</th>
                <th scope="col" className="px-3 py-2.5">Kontak</th>
                <th scope="col" className="px-3 py-2.5">Slot yang disewa</th>
                <th scope="col" className="px-3 py-2.5">Status booking</th>
                <th scope="col" className="px-3 py-2.5">Detail</th>
                <th scope="col" className="px-3 py-2.5">Tanggal daftar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tenants.map((tenant) => {
                const bookings = bookingPerTenant.get(tenant.id) ?? [];

                return (
                  <tr key={tenant.id} className="align-top hover:bg-surface-2">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ink">{tenant.name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {tenant.bookingCount} booking aktif
                      </p>
                    </td>

                    <td className="px-3 py-2.5 text-muted">
                      {TENANT_TYPE_LABEL[tenant.tenant_type]}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="space-y-0.5 text-xs">
                        {tenant.phone ? (
                          <p>
                            <a
                              href={`tel:${tenant.phone.replace(/\s+/g, "")}`}
                              className="text-ink underline underline-offset-2 hover:text-accent"
                            >
                              {tenant.phone}
                            </a>
                          </p>
                        ) : (
                          <p className="text-subtle">Tanpa nomor HP</p>
                        )}
                        {tenant.email ? (
                          <p>
                            <a
                              href={`mailto:${tenant.email}`}
                              className="break-all text-muted underline underline-offset-2 hover:text-accent"
                            >
                              {tenant.email}
                            </a>
                          </p>
                        ) : (
                          <p className="text-subtle">Tanpa email</p>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      {bookings.length === 0 ? (
                        <span className="text-xs text-subtle">&mdash;</span>
                      ) : (
                        <ul className="space-y-1.5">
                          {bookings.map((booking) => (
                            <li key={`slot-${booking.id}`} className="text-xs">
                              <span className="font-medium text-ink">
                                {slotDisplayName(booking.slot)}
                              </span>
                              <span className="text-muted"> &middot; {booking.slot.zone.name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      {bookings.length === 0 ? (
                        <span className="text-xs text-subtle">&mdash;</span>
                      ) : (
                        <ul className="space-y-1.5">
                          {bookings.map((booking) => (
                            <li key={`status-${booking.id}`} className="space-y-0.5">
                              <StatusBadge status={booking.status} kind="booking" />
                              <p className="font-mono text-[11px] text-subtle">
                                {booking.booking_code}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <DetailList data={tenant.detail} className="max-w-[16rem]" />
                    </td>

                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted">
                      {formatTanggal(tenant.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
