import type { Metadata } from "next";
import Link from "next/link";

import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { ringkasTanggal } from "@/components/admin/BookingDateChips";
import { SlotStatusForm } from "@/components/admin/SlotStatusForm";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Select } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import { listBookings, listSlots } from "@/lib/services/admin";
import { requireAdmin } from "@/lib/services/auth";
import type { BookingDetail, SlotDetail, ZoneRow } from "@/lib/types/database";
import { slotDisplayName } from "@/lib/utils";

// Selalu tampilkan status slot terbaru; jangan dirender saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inventaris Slot",
  description: "Blokir atau buka slot untuk semua tanggal gelaran.",
};

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

/**
 * Model per tanggal: slots.status = 'available' berarti slot normal (mengikuti
 * okupansi per tanggal); nilai lain berarti DIBLOKIR PANITIA untuk semua
 * tanggal. Filter halaman ini karenanya hanya dua: tersedia vs diblokir.
 */
type FilterStatus = "available" | "blocked";

const FILTER_STATUS: ReadonlyArray<{ value: FilterStatus; label: string }> = [
  { value: "available", label: "Tersedia" },
  { value: "blocked", label: "Diblokir" },
];

/** Ambil satu nilai query string (array diambil elemen pertamanya). */
function ambilParam(sp: SearchParams, key: string): string {
  const nilai = sp[key];
  if (Array.isArray(nilai)) return (nilai[0] ?? "").trim();
  return (nilai ?? "").trim();
}

function terblokir(slot: SlotDetail): boolean {
  return slot.status !== "available";
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
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Inventaris</h1>
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
  const statusTerpilih =
    FILTER_STATUS.find((item) => item.value === statusParam)?.value ?? null;
  const adaFilter = zonaTerpilih !== null || statusTerpilih !== null;
  const filterTakDikenal =
    (zonaParam.length > 0 && zonaTerpilih === null) ||
    (statusParam.length > 0 && statusTerpilih === null);

  // "Diblokir" mencakup semua nilai enum selain 'available', jadi filternya
  // dikerjakan di memori — bukan lewat eq() satu nilai.
  const zonaResult = zonaTerpilih ? await listSlots({ zoneId: zonaTerpilih.id }) : semuaResult;
  const daftar = (zonaResult.ok ? zonaResult.data : []).filter((slot) => {
    if (statusTerpilih === "available") return !terblokir(slot);
    if (statusTerpilih === "blocked") return terblokir(slot);
    return true;
  });

  // Booking aktif per slot (pending_payment / confirmed) — model per tanggal:
  // satu slot bisa punya beberapa booking aktif di tanggal yang berbeda.
  const bookingResult = await listBookings();
  const bookingPerSlot = new Map<string, BookingDetail[]>();
  if (bookingResult.ok) {
    for (const booking of bookingResult.data) {
      if (booking.status === "cancelled") continue;
      const milik = bookingPerSlot.get(booking.slot_id);
      if (milik) milik.push(booking);
      else bookingPerSlot.set(booking.slot_id, [booking]);
    }
  }

  const jumlahDiblokir = daftar.filter(terblokir).length;
  const jumlahFasilitas = daftar.filter((slot) => slot.zone.zone_type === "facility").length;

  const ringkasan = [
    { label: "Slot ditampilkan", nilai: daftar.length, kelas: "text-ink" },
    { label: "Tersedia", nilai: daftar.length - jumlahDiblokir, kelas: "text-ok" },
    { label: "Diblokir", nilai: jumlahDiblokir, kelas: "text-danger" },
    { label: "Fasilitas", nilai: jumlahFasilitas, kelas: "text-muted" },
  ];

  const nilaiZonaTerpilih = zonaTerpilih ? (zonaTerpilih.svg_group_id ?? zonaTerpilih.id) : "";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">
            Inventaris
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Blokir atau buka slot untuk <strong className="font-medium">semua tanggal</strong>{" "}
            gelaran — ketersediaan per tanggal sendiri mengikuti booking di denah.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AutoRefresh />
          <Link href="/admin/bookings" className={buttonClass("secondary", "sm")}>
            Ke daftar pemesanan
          </Link>
        </div>
      </header>

      {/* ---------- Baris filter ---------- */}
      <form
        method="get"
        className="grid gap-3 rounded-[var(--radius)] border border-line bg-card p-4 shadow-[var(--shadow-sm)] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
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
            {FILTER_STATUS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
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

      {!zonaResult.ok ? (
        <Alert tone="error" title="Daftar slot terfilter gagal dimuat">
          {zonaResult.error}
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
          <div key={item.label} className="rounded-[var(--radius)] border border-line bg-card p-3 shadow-[var(--shadow-sm)]">
            <p className="text-xs text-muted">{item.label}</p>
            <p className={`mt-0.5 text-xl font-semibold tabular ${item.kelas}`}>{item.nilai}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted">
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
        <div className="overflow-x-auto rounded-[var(--radius)] border border-line bg-card shadow-[var(--shadow-sm)]">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium tracking-wide text-subtle uppercase">
                <th scope="col" className="px-3 py-2.5">Zona</th>
                <th scope="col" className="px-3 py-2.5">Slot</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
                <th scope="col" className="px-3 py-2.5">Booking aktif</th>
                <th scope="col" className="px-3 py-2.5">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {daftar.map((slot) => {
                const fasilitas = slot.zone.zone_type === "facility";
                const bookings = bookingPerSlot.get(slot.id) ?? [];
                const bookingUtama = bookings[0] ?? null;
                const nama = slotDisplayName(slot);

                return (
                  <tr key={slot.id} className="align-top hover:bg-surface-2">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ink">{slot.zone.name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {ZONE_TYPE_LABEL[slot.zone.zone_type]}
                      </p>
                    </td>

                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ink">{nama}</p>
                      {slot.svg_element_id ? (
                        <p className="mt-0.5 font-mono text-[11px] text-subtle">
                          {slot.svg_element_id}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {terblokir(slot) ? (
                          <Badge tone="slate" dot>Diblokir</Badge>
                        ) : (
                          <Badge tone="green" dot>Tersedia</Badge>
                        )}
                        {fasilitas ? <Badge tone="slate">Fasilitas</Badge> : null}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      {bookingUtama ? (
                        <div className="space-y-1">
                          <Link
                            href={`/admin/bookings?q=${encodeURIComponent(bookingUtama.booking_code)}`}
                            className="font-mono text-xs font-semibold text-ink underline underline-offset-2 hover:text-accent"
                          >
                            {bookingUtama.booking_code}
                          </Link>
                          <p className="text-xs text-muted">{bookingUtama.tenant.name}</p>
                          <p className="whitespace-nowrap text-xs text-subtle">
                            {ringkasTanggal(bookingUtama.dates, 2)}
                          </p>
                          <StatusBadge status={bookingUtama.status} kind="booking" />
                          {bookings.length > 1 ? (
                            <p className="text-xs text-subtle">
                              +{bookings.length - 1} booking lain di tanggal berbeda
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-subtle">&mdash;</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      {fasilitas ? (
                        <span className="text-xs text-subtle">Tidak disewakan</span>
                      ) : (
                        <SlotStatusForm
                          slotId={slot.id}
                          status={slot.status}
                          hasActiveBooking={bookingUtama !== null}
                          slotName={`${nama} — ${slot.zone.name}`}
                          bookingCode={bookingUtama?.booking_code ?? null}
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

      <p className="text-xs text-muted">
        Status di sini bukan status booking: &ldquo;Tersedia&rdquo; berarti slot normal dan bisa
        dipesan pada tanggal yang masih kosong, sedangkan &ldquo;Diblokir&rdquo; menutup slot dari
        pemesanan untuk semua tanggal tanpa membatalkan booking yang sudah ada.
      </p>
    </div>
  );
}
