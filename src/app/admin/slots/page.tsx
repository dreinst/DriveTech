import type { Metadata } from "next";
import Link from "next/link";

import { SlotStatusForm } from "@/components/admin/SlotStatusForm";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SLOT_STATUS_LABEL, ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import { listBookings, listSlots } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/services/auth";
import type { BookingDetail, SlotDetail, SlotStatus, ZoneRow } from "@/lib/types/database";
import { slotDisplayName } from "@/lib/utils";

// Selalu tampilkan status slot terbaru; jangan dirender saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kelola Slot",
  description: "Pantau dan override status slot pameran secara manual.",
};

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

const STATUS_TERSEDIA: readonly SlotStatus[] = ["available", "pending", "confirmed"];

/** Ambil satu nilai query string (array diambil elemen pertamanya). */
function ambilParam(sp: SearchParams, key: string): string {
  const nilai = sp[key];
  if (Array.isArray(nilai)) return (nilai[0] ?? "").trim();
  return (nilai ?? "").trim();
}

function hitungStatus(rows: SlotDetail[], status: SlotStatus): number {
  return rows.filter((slot) => slot.status === status).length;
}

export default async function AdminSlotsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;

  const zonaParam = ambilParam(sp, "zona");
  const statusParam = ambilParam(sp, "status");

  // Query pertama tanpa filter: dipakai untuk opsi zona & total keseluruhan.
  const semuaResult = await listSlots();

  if (!semuaResult.ok) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Kelola Slot"
          description="Override status slot secara manual bila pembayaran diterima di luar sistem."
        />
        <Alert tone="error" title="Daftar slot belum bisa dimuat">
          {semuaResult.error}
        </Alert>
      </div>
    );
  }

  const semuaSlot = semuaResult.data;

  // Daftar zona unik dari slot (urut display_order seperti di denah).
  const petaZona = new Map<string, ZoneRow>();
  for (const slot of semuaSlot) {
    if (!petaZona.has(slot.zone.id)) petaZona.set(slot.zone.id, slot.zone);
  }
  const daftarZona = Array.from(petaZona.values()).sort(
    (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, "id-ID"),
  );

  // Filter zona menerima id uuid maupun svg_group_id (mis. "zone-umkm").
  const zonaTerpilih =
    zonaParam.length > 0
      ? (daftarZona.find((zona) => zona.id === zonaParam || zona.svg_group_id === zonaParam) ?? null)
      : null;
  const statusTerpilih = STATUS_TERSEDIA.find((status) => status === statusParam) ?? null;
  const adaFilter = zonaTerpilih !== null || statusTerpilih !== null;
  const filterTakDikenal =
    (zonaParam.length > 0 && zonaTerpilih === null) ||
    (statusParam.length > 0 && statusTerpilih === null);

  const daftarResult = adaFilter
    ? await listSlots({
        zoneId: zonaTerpilih?.id,
        status: statusTerpilih ?? undefined,
      })
    : semuaResult;

  const daftar = daftarResult.ok ? daftarResult.data : [];

  // Booking aktif per slot (pending_payment / confirmed). Terbaru menang.
  const bookingResult = await listBookings();
  const bookingPerSlot = new Map<string, BookingDetail>();
  if (bookingResult.ok) {
    for (const booking of bookingResult.data) {
      if (booking.status === "cancelled") continue;
      if (!bookingPerSlot.has(booking.slot_id)) bookingPerSlot.set(booking.slot_id, booking);
    }
  }

  const ringkasan = [
    { label: "Slot ditampilkan", nilai: daftar.length, kelas: "text-slate-900" },
    { label: SLOT_STATUS_LABEL.available, nilai: hitungStatus(daftar, "available"), kelas: "text-green-700" },
    { label: SLOT_STATUS_LABEL.pending, nilai: hitungStatus(daftar, "pending"), kelas: "text-amber-700" },
    { label: SLOT_STATUS_LABEL.confirmed, nilai: hitungStatus(daftar, "confirmed"), kelas: "text-red-700" },
  ];

  const jumlahFasilitas = daftar.filter((slot) => slot.zone.zone_type === "facility").length;
  const nilaiZonaTerpilih = zonaTerpilih ? (zonaTerpilih.svg_group_id ?? zonaTerpilih.id) : "";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kelola Slot"
        description="Override status slot secara manual, misalnya saat pembayaran diterima langsung di sekretariat."
        action={
          <Link href="/admin/bookings" className={buttonClass("secondary", "sm")}>
            Ke daftar booking
          </Link>
        }
      />

      {/* ---------- Baris filter ---------- */}
      <form
        method="get"
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        <Field label="Zona" htmlFor="filter-zona">
          <Select id="filter-zona" name="zona" defaultValue={nilaiZonaTerpilih}>
            <option value="">Semua zona</option>
            {daftarZona.map((zona) => (
              <option key={zona.id} value={zona.svg_group_id ?? zona.id}>
                {zona.name} ({ZONE_TYPE_LABEL[zona.zone_type]})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Status" htmlFor="filter-status">
          <Select id="filter-status" name="status" defaultValue={statusTerpilih ?? ""}>
            <option value="">Semua status</option>
            {STATUS_TERSEDIA.map((status) => (
              <option key={status} value={status}>
                {SLOT_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-wrap items-center gap-2 sm:pb-0.5">
          <Button type="submit" size="sm">
            Terapkan
          </Button>
          <Link href="/admin/slots" className={buttonClass("ghost", "sm")}>
            Reset filter
          </Link>
        </div>
      </form>

      {filterTakDikenal ? (
        <Alert tone="warning" title="Filter tidak dikenali">
          Nilai filter pada alamat halaman tidak cocok dengan zona atau status mana pun, jadi
          diabaikan.
        </Alert>
      ) : null}

      {!daftarResult.ok ? (
        <Alert tone="error" title="Daftar slot terfilter gagal dimuat">
          {daftarResult.error}
        </Alert>
      ) : null}

      {!bookingResult.ok ? (
        <Alert tone="warning" title="Data booking tidak bisa dimuat">
          {bookingResult.error} Kolom &ldquo;Booking aktif&rdquo; ditampilkan kosong.
        </Alert>
      ) : null}

      {/* ---------- Ringkasan hitungan ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ringkasan.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className={`mt-0.5 text-xl font-semibold tabular ${item.kelas}`}>{item.nilai}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        {adaFilter
          ? `Menampilkan ${daftar.length} dari ${semuaSlot.length} slot terdaftar.`
          : `Total ${semuaSlot.length} slot terdaftar di denah.`}
        {jumlahFasilitas > 0
          ? ` Termasuk ${jumlahFasilitas} kotak fasilitas umum yang tidak disewakan.`
          : ""}
      </p>

      {/* ---------- Tabel slot ---------- */}
      {daftar.length === 0 ? (
        <EmptyState
          title="Tidak ada slot yang cocok"
          description="Ubah atau kosongkan filter untuk melihat slot lain."
          action={
            <Link href="/admin/slots" className={buttonClass("secondary", "sm")}>
              Reset filter
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <th scope="col" className="px-3 py-2.5">Zona</th>
                <th scope="col" className="px-3 py-2.5">Slot</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
                <th scope="col" className="px-3 py-2.5">Booking aktif</th>
                <th scope="col" className="px-3 py-2.5">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {daftar.map((slot) => {
                const fasilitas = slot.zone.zone_type === "facility";
                const booking = bookingPerSlot.get(slot.id) ?? null;
                const nama = slotDisplayName(slot);

                return (
                  <tr key={slot.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-900">{slot.zone.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {ZONE_TYPE_LABEL[slot.zone.zone_type]}
                      </p>
                    </td>

                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-900">{nama}</p>
                      {slot.svg_element_id ? (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                          {slot.svg_element_id}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={slot.status} kind="slot" />
                        {fasilitas ? <Badge tone="slate">Fasilitas</Badge> : null}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      {booking ? (
                        <div className="space-y-1">
                          <Link
                            href={`/admin/bookings?q=${encodeURIComponent(booking.booking_code)}`}
                            className="font-mono text-xs font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-600"
                          >
                            {booking.booking_code}
                          </Link>
                          <p className="text-xs text-slate-600">{booking.tenant.name}</p>
                          <StatusBadge status={booking.status} kind="booking" />
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">&mdash;</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      {fasilitas ? (
                        <span className="text-xs text-slate-400">Tidak disewakan</span>
                      ) : (
                        <SlotStatusForm
                          slotId={slot.id}
                          status={slot.status}
                          hasActiveBooking={booking !== null}
                          slotName={`${nama} — ${slot.zone.name}`}
                          bookingCode={booking?.booking_code ?? null}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Perubahan status di sini langsung memengaruhi denah publik. Status
        &ldquo;{SLOT_STATUS_LABEL.available}&rdquo; membuat slot bisa dipesan orang lain, sedangkan
        data booking yang sudah ada tidak ikut dibatalkan &mdash; batalkan bookingnya dari halaman
        booking bila perlu.
      </p>
    </div>
  );
}
