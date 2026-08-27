import Link from "next/link";

import { CekStatusForm } from "@/components/denah/CekStatusForm";
import { FloorPlanBoard } from "@/components/denah/FloorPlanBoard";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { EVENT_INFO } from "@/lib/domain/constants";
import { fallbackZonesFromLayout } from "@/lib/domain/fallback";
import { ZONE_TYPE_LABEL } from "@/lib/domain/labels";
import { getFloorPlan } from "@/lib/services/slots";
import type { ZoneWithSlots } from "@/lib/types/database";
import { formatRupiah, formatTanggal } from "@/lib/utils";

// Halaman ini selalu mengambil status slot terbaru, jadi jangan dirender saat build.
export const dynamic = "force-dynamic";

const LANGKAH = [
  {
    judul: "Pilih slot di denah",
    detail: "Ketuk kotak hijau pada denah untuk melihat zona, nomor slot, dan biaya adminnya.",
  },
  {
    judul: "Isi data & booking",
    detail: "Lengkapi data penyewa. Slot langsung dikunci sementara agar tidak diambil orang lain.",
  },
  {
    judul: "Bayar biaya admin",
    detail: "Pilih tunai atau transfer. Setelah panitia memverifikasi, slot resmi jadi milik Anda.",
  },
];

const FAQ = [
  {
    tanya: "Bagaimana cara membayar biaya admin?",
    jawab:
      "Ada dua pilihan. Tunai: bayar langsung di sekretariat pameran, panitia yang menandai lunas. Transfer: kirim ke rekening panitia lalu unggah bukti transfer pada halaman pembayaran.",
  },
  {
    tanya: "Berapa lama slot saya ditahan sebelum pembayaran?",
    jawab:
      "Slot berstatus Menunggu Pembayaran sejak booking dibuat dan tidak bisa dipesan orang lain. Status berubah jadi Terisi setelah pembayaran diverifikasi panitia.",
  },
  {
    tanya: "Slot yang saya mau sudah terisi, apa yang bisa dilakukan?",
    jawab:
      "Pilih slot tersebut di denah, sistem akan menampilkan saran slot lain yang masih kosong di zona yang sama atau zona bertipe serupa. Sarannya tidak otomatis dipesan, Anda tetap memilih sendiri.",
  },
  {
    tanya: "Saya pengunjung yang mau beli mobil atau motor, bisa lewat sini?",
    jawab:
      "Bisa. Pilih slot penjualnya di denah lalu tekan Beli Unit di Slot Ini. Metode tunai, transfer, atau kredit. Untuk kredit, pengajuan diteruskan ke partner leasing rekanan pameran.",
  },
];

export default async function BerandaPage() {
  const result = await getFloorPlan();
  const data = result.ok ? result.data : null;
  const errorMessage = result.ok ? null : result.error;

  const hasZones = data !== null && data.zones.length > 0;
  const zones: ZoneWithSlots[] = hasZones && data ? data.zones : fallbackZonesFromLayout();
  const isFallback = !hasZones;

  const namaEvent = data?.event?.name ?? EVENT_INFO.name;
  const lokasi = data?.event?.location ?? EVENT_INFO.location;
  const tanggalMulai = data?.event?.start_date ?? EVENT_INFO.startDate;
  const tanggalSelesai = data?.event?.end_date ?? EVENT_INFO.endDate;

  const zonaSewa = zones.filter((zone) => zone.zone_type !== "facility");
  const totalSlot = zonaSewa.reduce((sum, zone) => sum + zone.slots.length, 0);
  const totalTersedia = zonaSewa.reduce(
    (sum, zone) => sum + zone.slots.filter((slot) => slot.status === "available").length,
    0,
  );

  return (
    <div className="space-y-10 pb-12">
      {/* ---------- Hero ---------- */}
      <section className="mx-auto w-full max-w-5xl px-4 pt-8">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Booking Slot Pameran
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{namaEvent}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {lokasi} &middot; {formatTanggal(tanggalMulai)} &ndash;{" "}
          {formatTanggal(tanggalSelesai)}
        </p>
        <p className="mt-3 max-w-2xl text-sm text-slate-600">{EVENT_INFO.description}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href="#denah" className={buttonClass("primary", "md")}>
            Lihat Denah &amp; Pilih Slot
          </Link>
          <Link href="#cek-status" className={buttonClass("secondary", "md")}>
            Cek Status Booking
          </Link>
          <span className="text-xs text-slate-500">
            {totalTersedia} dari {totalSlot} slot masih tersedia
          </span>
        </div>

        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {LANGKAH.map((langkah, index) => (
            <li
              key={langkah.judul}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {index + 1}
              </span>
              <p className="mt-2 text-sm font-semibold text-slate-900">{langkah.judul}</p>
              <p className="mt-1 text-xs text-slate-600">{langkah.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Denah ---------- */}
      <section id="denah" className="mx-auto w-full max-w-5xl scroll-mt-4 px-4">
        <h2 className="text-lg font-semibold text-slate-900">Denah Lokasi</h2>
        <p className="mt-1 text-sm text-slate-600">
          Denah tersinkron langsung dengan status pemesanan. Ketuk kotak untuk memilih slot.
        </p>

        {errorMessage ? (
          <div className="mt-3">
            <Alert tone="warning" title="Data denah belum bisa dimuat">
              {errorMessage} Denah di bawah ditampilkan sebagai contoh (semua slot dianggap
              tersedia). Isi variabel lingkungan Supabase pada file .env.local lalu jalankan seed
              database untuk memakai data asli.
            </Alert>
          </div>
        ) : isFallback ? (
          <div className="mt-3">
            <Alert tone="info" title="Belum ada data zona di database">
              Denah di bawah memakai tata letak bawaan. Jalankan migrasi dan seed Supabase agar slot
              bisa dipesan.
            </Alert>
          </div>
        ) : null}

        <div className="mx-auto mt-4 w-full max-w-3xl">
          <FloorPlanBoard zones={zones} isFallback={isFallback} />
        </div>
      </section>

      {/* ---------- Ringkasan ketersediaan per zona ---------- */}
      <section className="mx-auto w-full max-w-5xl px-4">
        <h2 className="text-lg font-semibold text-slate-900">Ketersediaan per Zona</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {zonaSewa.map((zone) => {
            const total = zone.slots.length;
            const tersedia = zone.slots.filter((slot) => slot.status === "available").length;
            const persen = total > 0 ? Math.round((tersedia / total) * 100) : 0;
            return (
              <li
                key={zone.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-sm font-semibold text-slate-900">{zone.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{ZONE_TYPE_LABEL[zone.zone_type]}</p>
                <p className="mt-3 text-sm text-slate-700">
                  <span className="text-lg font-bold text-slate-900">{tersedia}</span> / {total} slot
                  tersedia
                </p>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                  aria-hidden="true"
                >
                  <div className="h-full rounded-full bg-green-500" style={{ width: `${persen}%` }} />
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  Biaya admin{" "}
                  <span className="font-semibold text-slate-900">
                    {formatRupiah(zone.admin_fee)}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------- Cek status booking ---------- */}
      <section id="cek-status" className="mx-auto w-full max-w-5xl scroll-mt-4 px-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Cek Status Booking</h2>
          <p className="mt-1 text-sm text-slate-600">
            Sudah pernah memesan? Masukkan kode booking untuk melihat status pembayaran Anda.
          </p>
          <CekStatusForm className="mt-4 max-w-lg" />
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="mx-auto w-full max-w-5xl px-4">
        <h2 className="text-lg font-semibold text-slate-900">Pertanyaan yang Sering Diajukan</h2>
        <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {FAQ.map((item) => (
            <details key={item.tanya} className="group px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-900 marker:hidden">
                <span className="mr-2 inline-block text-slate-400 transition-transform group-open:rotate-90">
                  &rsaquo;
                </span>
                {item.tanya}
              </summary>
              <p className="mt-2 pl-5 text-sm text-slate-600">{item.jawab}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Butuh bantuan? Hubungi {EVENT_INFO.organizer} di {EVENT_INFO.contact}.
        </p>
      </section>
    </div>
  );
}
