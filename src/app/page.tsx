import type { Metadata } from "next";
import Image, { getImageProps } from "next/image";
import Link from "next/link";

import { CekStatusForm } from "@/components/denah/CekStatusForm";
import { FloorPlanBoard } from "@/components/denah/FloorPlanBoard";
import { Hitung, MobilMasuk, Muncul } from "@/components/motion/motion";
import { Alert } from "@/components/ui/Alert";
import { EVENT_INFO, isBookableZoneType, waHref } from "@/lib/domain/constants";
import { fallbackZonesFromLayout } from "@/lib/domain/fallback";
import { zoneHasVariedFees, zoneMinAdminFee } from "@/lib/domain/harga";
import { slotStatusAcrossDates } from "@/lib/domain/ketersediaan";
import {
  CATEGORY_EXCLUSIVITY,
  NAMING_BUNDLE_NOTE,
  NAMING_RIGHTS,
  SPONSOR_INTRO,
  SPONSOR_TIERS,
  SPONSOR_WA_TEXT,
} from "@/lib/domain/sponsor";
import { listActivePartners } from "@/lib/services/leasing";
import { getFloorPlan } from "@/lib/services/slots";
import { getSiteUrl } from "@/lib/site-url";
import type { SlotRow, ZoneType, ZoneWithSlots } from "@/lib/types/database";
import { cn, formatRupiah } from "@/lib/utils";

// Dirender ulang paling lama tiap 30 detik (ISR). Status lapak tetap segar karena
// FloorPlanBoard berlangganan realtime, dan aksi booking memanggil revalidatePath("/").
export const revalidate = 30;

export const metadata: Metadata = { alternates: { canonical: "/" } };

/**
 * Tanggal yang ditulis di pita berjalan. Sementara hanya akhir pekan pembukaan
 * (permintaan pemilik 9 Oktober 2026) supaya pengunjung tidak salah info;
 * tanggal lain tetap bisa dipilih saat memesan lapak.
 */
const PITA_TANGGAL = ["Sabtu 07 November 2026", "Minggu 08 November 2026"] as const;

/**
 * Data terstruktur acara (schema.org Event) untuk hasil pencarian. Hanya memuat
 * akhir pekan pembukaan, sama dengan pita tanggal. Jam buka belum ditetapkan,
 * jadi tanggal ditulis tanpa jam.
 */
function dataTerstrukturAcara(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: "Drive Tech Malang 2026",
    description: EVENT_INFO.description,
    startDate: "2026-11-07",
    endDate: "2026-11-08",
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    isAccessibleForFree: true,
    image: [`${siteUrl}/gambar/og.jpg`],
    url: siteUrl,
    location: {
      "@type": "Place",
      name: "Kampung Tentara (Rest Area Singosari)",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Singosari, Malang",
        addressRegion: "Jawa Timur",
        addressCountry: "ID",
      },
      geo: { "@type": "GeoCoordinates", latitude: -7.8773823, longitude: 112.6773862 },
      hasMap: EVENT_INFO.mapsUrl,
    },
    organizer: { "@type": "Organization", name: "D'Production Event Organizer", url: "https://www.dpro.events" },
    offers: {
      "@type": "Offer",
      name: "Masuk pengunjung",
      price: 0,
      priceCurrency: "IDR",
      availability: "https://schema.org/InStock",
      url: siteUrl,
    },
  };
}

/** Jumlah area fisik di denah (A sampai H). */
const JUMLAH_AREA = 8;

// Dua gambar hero untuk dua lebar layar (art direction lewat <picture>).
const { props: gambarMotor } = getImageProps({
  src: "/gambar/motor.webp",
  alt: "",
  width: 1100,
  height: 978,
  sizes: "30vw",
});
const { props: gambarMobil } = getImageProps({
  src: "/gambar/mobil-klasik.webp",
  alt: "",
  width: 1500,
  height: 797,
  sizes: "105vw",
  loading: "eager",
});

const TOMBOL =
  "judul inline-flex h-13 items-center justify-center px-7 text-xl tracking-[0.04em] transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]";

export default async function BerandaPage() {
  const [result, partnersResult] = await Promise.all([getFloorPlan(), listActivePartners()]);

  const data = result.ok ? result.data : null;
  const errorMessage = result.ok ? null : result.error;
  const noConfig = !result.ok && result.code === "NO_CONFIG";

  const hasZones = data !== null && data.zones.length > 0;
  const zones: ZoneWithSlots[] = hasZones && data ? data.zones : fallbackZonesFromLayout();
  const isFallback = !hasZones;

  // Mitra leasing: kalau service gagal atau belum ada mitra aktif, bagiannya tidak ditampilkan.
  const partners = partnersResult.ok ? partnersResult.data : [];

  const lokasi = data?.event?.location ?? EVENT_INFO.location;

  /* ---------- Model per tanggal: okupansi LINTAS seluruh tanggal mendatang ---------- */
  const eventDates = data?.eventDates ?? [];
  const occupancy = data?.occupancy ?? [];
  const activeDates = eventDates.map((d) => d.event_date);

  // "available" = masih ada minimal satu tanggal gelaran yang kosong.
  const verdictSlot = (slot: SlotRow, zoneType: ZoneType) =>
    slotStatusAcrossDates({ slot, zoneType, activeDates, occupancy });

  // Hanya zona yang bisa dipesan (warung dan fasilitas tidak disewakan online).
  const zonaBaris = zones
    .filter((zone) => isBookableZoneType(zone.zone_type))
    .map((zone) => ({
      zone,
      tersedia: zone.slots.filter((slot) => verdictSlot(slot, zone.zone_type) === "available").length,
      harga: zoneMinAdminFee(zone, zone.slots),
      hargaBeragam: zoneHasVariedFees(zone, zone.slots),
    }));
  const totalLapak = zonaBaris.reduce((n, baris) => n + baris.zone.slots.length, 0);
  const totalTersedia = zonaBaris.reduce((n, baris) => n + baris.tersedia, 0);

  return (
    <div>
      <script
        type="application/ld+json"
        // Isi berasal dari konstanta di berkas ini, bukan masukan pengguna.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dataTerstrukturAcara(getSiteUrl())) }}
      />
      {/* ================= HERO ================= */}
      <section className="gelap relative isolate overflow-hidden bg-[#0a0a0a]">
        {/* Desktop: bidang oranye miring + garis putih ala livery di sisi kanan. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 hidden bg-accent md:block md:[clip-path:polygon(71.5%_0,100%_0,100%_100%,53.5%_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 hidden bg-white md:block md:[clip-path:polygon(68.8%_0,69.9%_0,51.9%_100%,50.8%_100%)]"
        />

        <div className="mx-auto grid w-full max-w-[90rem] gap-6 px-4 pt-8 sm:px-8 md:min-h-[46rem] md:grid-cols-[1fr_17rem] md:content-between md:gap-8 md:pt-10 md:pb-10">
          <div>
            <p className="label text-sm text-ink/70 sm:text-base">
              Musim 1 <span aria-hidden="true">/</span> 07 + 08 Nov 2026{" "}
              <span aria-hidden="true">/</span> {lokasi}
            </p>
            <h1 className="judul mt-3 text-[34vw] leading-[0.8] md:text-[clamp(11rem,27vw,21rem)]">
              <span className="baris-naik text-ink">
                <span>Drive</span>
              </span>
              <span className="baris-naik text-accent">
                <span>Tech</span>
              </span>
            </h1>
          </div>

          {/* Aset resmi (latar dipotong), melaju masuk dari kanan. Mobile: mobil klasik oranye di
              atas latar hitam. Desktop: motor hitam di atas bidang oranye. Satu <picture> supaya
              peramban hanya mengunduh gambar yang dipakai. */}
          <div className="mobil-masuk pointer-events-none relative z-10 -mt-[8%] -mr-[10%] ml-[6%] md:absolute md:right-[3.5%] md:bottom-[2%] md:m-0 md:w-[30%]">
            <picture>
              <source media="(min-width: 768px)" srcSet={gambarMotor.srcSet} sizes="30vw" />
              {/* eslint-disable-next-line @next/next/no-img-element -- atribut berasal dari getImageProps */}
              <img
                {...gambarMobil}
                alt="Mobil klasik oranye di layar kecil, motor klasik hitam di layar lebar"
                fetchPriority="high"
                className="h-auto w-full drop-shadow-[0_24px_20px_rgba(0,0,0,0.45)]"
              />
            </picture>
          </div>

          {/* Fakta singkat. Desktop: di atas bidang oranye. Mobile: pita oranye miring di bawah. */}
          <dl className="order-last -mx-4 flex gap-6 bg-accent px-4 pt-12 pb-7 text-[#0a0a0a] [clip-path:polygon(0_26%,100%_0,100%_100%,0_100%)] sm:-mx-8 sm:px-8 md:order-none md:mx-0 md:flex-col md:bg-transparent md:p-0 md:pt-14 md:[clip-path:none]">
            <div>
              <dd className="judul text-5xl md:text-7xl">
                <Hitung nilai={totalLapak} />
              </dd>
              <dt className="label mt-1 text-xs md:text-sm">Lapak di {JUMLAH_AREA} area</dt>
            </div>
            <div>
              <dd className="judul text-5xl md:text-7xl">
                7 + 8
              </dd>
              <dt className="label mt-1 text-xs md:text-sm">November 2026</dt>
            </div>
            <div>
              <dd className="judul text-5xl md:text-7xl">Gratis</dd>
              <dt className="label mt-1 text-xs md:text-sm">Masuk untuk pengunjung</dt>
            </div>
          </dl>

          <div className="anim-fade-up max-w-sm md:col-span-2">
            <p className="text-base leading-relaxed text-ink/80">
              Pameran dan pasar otomotif akhir pekan di Kampung Tentara, Singosari, Malang. Mobil dan
              motor, baru maupun bekas, ditambah UMKM. Mau buka lapak? Pilih zona, pilih lapak di
              denah, pilih tanggal, lalu bayar lewat QRIS.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/#denah" className={cn(TOMBOL, "bg-accent text-[#0a0a0a] hover:bg-white")}>
                Pesan lapak
              </Link>
              <Link
                href="/denah"
                className={cn(TOMBOL, "border border-ink/50 text-ink hover:bg-ink hover:text-[#0a0a0a]")}
              >
                Lihat denah
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================= PITA TANGGAL ================= */}
      <div
        className="overflow-hidden border-t border-[#0a0a0a]/25 bg-accent py-4 text-[#0a0a0a]"
        aria-label="Pembukaan Sabtu dan Minggu, 7 dan 8 November 2026"
      >
        <ul className="pita-jalan flex w-max" aria-hidden="true">
          {Array.from({ length: 8 }, (_, salinan) =>
            PITA_TANGGAL.map((tanggal) => (
              <li
                key={`${salinan}-${tanggal}`}
                className="judul flex items-center gap-8 pl-8 text-2xl leading-none tracking-[0.04em] sm:text-3xl"
              >
                {tanggal}
                <span aria-hidden="true" className="h-2 w-2 rotate-45 bg-[#0a0a0a]" />
              </li>
            )),
          )}
        </ul>
      </div>

      {/* ================= AREA (tabel jenis lapak) ================= */}
      <section id="area" className="scroll-mt-16 overflow-hidden bg-krem">
        <div className="mx-auto w-full max-w-[90rem] px-4 pt-20 sm:px-8 md:pt-28">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <Muncul>
              <p className="label text-sm text-ink/60">01 / Area pameran</p>
              <h2 className="judul mt-2 text-[clamp(4rem,12vw,10.5rem)]">
                {JUMLAH_AREA} area,
                <br />
                <Hitung nilai={totalLapak} /> lapak
              </h2>
            </Muncul>
            <Muncul className="max-w-xs" delay={0.1}>
              <p className="text-base leading-relaxed text-ink/75">
                Tarif dihitung per lapak per tanggal gelaran. Satu lapak bisa dipesan untuk beberapa
                tanggal sekaligus. Saat ini {totalTersedia} lapak masih punya tanggal kosong.
              </p>
            </Muncul>
          </div>

          <ul className="mt-12 border-b border-ink">
            {zonaBaris.map(({ zone, tersedia, harga, hargaBeragam }, index) => (
              <li key={zone.id}>
                <Muncul delay={index * 0.04} y={18}>
                  <Link
                    href="/#denah"
                    className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-4 gap-y-1 border-t border-ink px-0 py-5 transition-[background-color,color,padding] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-ink hover:px-4 hover:text-krem md:grid-cols-[3rem_minmax(0,22rem)_1fr_7rem_12rem_6rem] md:gap-x-8 md:py-6"
                  >
                    <span className="judul text-3xl text-[#ff7b00]">{String(index + 1).padStart(2, "0")}</span>
                    <span className="judul text-[clamp(2rem,5vw,3.25rem)] leading-none">
                      {zone.name.replace(/^Area\s+/i, "")}
                    </span>
                    <span className="judul row-span-2 text-right text-3xl leading-none md:order-5 md:row-span-1 md:text-[2.5rem]">
                      {hargaBeragam ? <span className="label mr-1 text-xs not-italic">mulai</span> : null}
                      {formatRupiah(harga)}
                    </span>
                    <span className="col-start-2 text-sm leading-relaxed opacity-70 md:col-start-auto">
                      {zone.description}
                    </span>
                    <span className="label col-start-2 text-sm md:col-start-auto md:text-base">
                      {tersedia} dari {zone.slots.length}
                      <span className="md:hidden"> lapak tersedia</span>
                    </span>
                    <span className="label hidden text-right text-base md:order-6 md:block">
                      Pesan{" "}
                      <span
                        aria-hidden="true"
                        className="inline-block transition-transform duration-200 group-hover:translate-x-1.5"
                      >
                        →
                      </span>
                    </span>
                  </Link>
                </Muncul>
              </li>
            ))}
          </ul>
        </div>

        {/* Slogan + foto mobil asli kedua. */}
        <div className="relative mx-auto mt-14 w-full max-w-[90rem] px-4 pb-10 sm:px-8 md:mt-20">
          <Muncul>
            <p aria-hidden="true" className="judul text-[19vw] text-ink md:text-[clamp(3.2rem,11.5vw,10rem)] md:whitespace-nowrap">
              Lihat. Cek. Coba. Deal.
            </p>
          </Muncul>
          <MobilMasuk className="pointer-events-none relative z-10 -mt-[4%] ml-auto w-[92%] md:-mt-[3.5%] md:w-[50%]">
            <Image
              src="/gambar/mobil-klasik.webp"
              alt="Mobil klasik oranye bergaris hitam tampak depan samping"
              width={1500}
              height={797}
              sizes="(min-width: 768px) 50vw, 92vw"
              className="h-auto w-full drop-shadow-[0_22px_18px_rgba(0,0,0,0.3)]"
            />
          </MobilMasuk>
        </div>
      </section>

      {/* ================= DENAH (alur pilih zona, lapak, tanggal) ================= */}
      <section id="denah" className="scroll-mt-16 bg-krem">
        <div className="mx-auto w-full max-w-[90rem] px-4 pt-14 pb-20 sm:px-8 md:pb-28">
          <Muncul>
            <p className="label text-sm text-ink/60">02 / Denah</p>
            <h2 className="judul mt-2 max-w-4xl text-[clamp(3.2rem,8.5vw,7rem)]">Pilih lapak langsung di denah</h2>
          </Muncul>

          {errorMessage ? (
            <div className="mt-6">
              <Alert tone={noConfig ? "info" : "warning"}>
                {noConfig
                  ? "Supabase belum dikonfigurasi. Denah di bawah hanya contoh dan lapak belum bisa dipesan."
                  : `Denah gagal dimuat (${errorMessage}). Sementara ditampilkan denah contoh.`}
              </Alert>
            </div>
          ) : isFallback ? (
            <div className="mt-6">
              <Alert tone="info">
                Belum ada data zona di database. Denah di bawah memakai tata letak bawaan.
              </Alert>
            </div>
          ) : null}

          <Muncul className="mt-10" delay={0.05}>
            <FloorPlanBoard zones={zones} isFallback={isFallback} eventDates={eventDates} occupancy={occupancy} />
          </Muncul>
        </div>
      </section>

      {/* ================= MITRA KREDIT (hanya bila ada mitra aktif) ================= */}
      {partners.length > 0 ? (
        <section aria-label="Beli kendaraan secara kredit" className="gelap border-y border-line bg-[#0a0a0a]">
          <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-12 sm:px-8 md:flex-row md:items-center md:justify-between">
            <p className="label text-sm text-accent">Beli kendaraan secara kredit</p>
            <ul className="flex flex-wrap items-center gap-x-12 gap-y-4">
              {partners.map((partner) => (
                <li key={partner.id} className="judul text-3xl text-ink/70">
                  {partner.name}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ================= SPONSOR ================= */}
      <section id="sponsor" className="gelap scroll-mt-16 bg-[#0a0a0a]">
        <div className="mx-auto w-full max-w-[90rem] px-4 py-20 sm:px-8 md:py-28">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <Muncul>
              <p className="label text-sm text-ink/60">03 / Sponsor</p>
              <h2 className="judul mt-2 text-[clamp(4rem,12vw,10.5rem)]">
                Paket sponsor
                <br />
                <span className="text-accent">Musim 1</span>
              </h2>
            </Muncul>
            <Muncul className="max-w-sm" delay={0.1}>
              <Image
                src="/gambar/mobil-depan.webp"
                alt="Mobil sport oranye tampak depan"
                width={900}
                height={589}
                sizes="(min-width: 768px) 24rem, 80vw"
                className="mb-6 h-auto w-full drop-shadow-[0_20px_18px_rgba(0,0,0,0.6)]"
              />
              <ul className="space-y-2 text-base leading-relaxed text-ink/75">
                {SPONSOR_INTRO.points.map((poin) => (
                  <li key={poin}>{poin}</li>
                ))}
              </ul>
            </Muncul>
          </div>

          <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-4">
            {SPONSOR_TIERS.map((tier, index) => (
              <Muncul key={tier.id} delay={index * 0.06} className="h-full">
                <article
                  className={cn(
                    "flex h-full flex-col gap-5 px-7 pt-8 pb-9",
                    tier.highlighted
                      ? "bg-accent text-[#0a0a0a]"
                      : "border-t border-l border-ink/25 text-ink last:border-r",
                  )}
                >
                  <p className={cn("label text-sm", !tier.highlighted && "text-ink/60")}>
                    {tier.slots} slot{tier.tagline ? `, ${tier.tagline}` : ""}
                  </p>
                  <h3 className="judul text-6xl">{tier.name}</h3>
                  <p>
                    <span className={cn("judul block text-[2.5rem]", !tier.highlighted && "text-accent")}>
                      {formatRupiah(tier.pricePerWeek)}
                    </span>
                    <span className="text-sm opacity-70">per minggu</span>
                  </p>
                  <ul
                    className={cn(
                      "space-y-2 border-t pt-4 text-[0.9375rem] leading-relaxed",
                      tier.highlighted ? "border-[#0a0a0a]/30" : "border-ink/25 text-ink/85",
                    )}
                  >
                    {tier.benefits.map((manfaat) => (
                      <li key={manfaat}>{manfaat}</li>
                    ))}
                  </ul>
                </article>
              </Muncul>
            ))}
          </div>

          <Muncul className="mt-16">
            <p className="label text-sm text-ink/60">Hak penamaan, satu slot per titik</p>
            <ul className="mt-5">
              {[...NAMING_RIGHTS, CATEGORY_EXCLUSIVITY].map((titik) => (
                <li
                  key={titik.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 border-t border-ink/25 py-4"
                >
                  <span className="judul text-3xl sm:text-4xl">{titik.name}</span>
                  <span className="judul text-3xl text-accent sm:text-4xl">
                    {formatRupiah(titik.pricePerWeek)}
                    <span className="ml-2 font-sans text-sm font-normal normal-case not-italic tracking-normal text-ink/60">
                      per minggu
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 max-w-3xl text-sm leading-relaxed text-ink/60">
              {NAMING_BUNDLE_NOTE} {CATEGORY_EXCLUSIVITY.futureNote} {SPONSOR_INTRO.note}
            </p>
          </Muncul>

          <Muncul className="mt-10 flex flex-wrap gap-3">
            {EVENT_INFO.contacts.map((kontak) => (
              <a
                key={kontak.phone}
                href={waHref(kontak.phone, SPONSOR_WA_TEXT)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(TOMBOL, "bg-accent text-[#0a0a0a] hover:bg-white")}
              >
                WhatsApp {kontak.label}, {kontak.phone}
              </a>
            ))}
          </Muncul>
        </div>
      </section>

      {/* ================= CEK STATUS ================= */}
      <section id="cek-status" className="scroll-mt-16 bg-accent">
        <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 px-4 py-16 sm:px-8 md:flex-row md:items-end md:justify-between md:py-24">
          <Muncul>
            <p className="label text-sm text-ink/70">04 / Cek status</p>
            <h2 className="judul mt-2 text-[clamp(5rem,15vw,13.5rem)] leading-[0.82]">
              Sudah
              <br />
              pesan?
            </h2>
          </Muncul>
          <Muncul className="w-full max-w-lg" delay={0.1}>
            <p className="text-base leading-relaxed">
              Masukkan kode booking dari email Anda untuk melihat status pembayaran dan lapak.
            </p>
            <CekStatusForm className="mt-4 [&_button]:bg-[#0a0a0a] [&_button]:text-white [&_button:hover]:bg-[#2a2a2a]" />
          </Muncul>
        </div>
      </section>

      {/* ================= LOKASI ================= */}
      <section aria-label="Lokasi acara" className="gelap bg-[#0a0a0a]">
        <div className="mx-auto grid w-full max-w-[90rem] gap-8 px-4 py-16 sm:px-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="label text-sm text-ink/60">05 / Lokasi</p>
            <h2 className="judul mt-2 text-6xl sm:text-7xl">{lokasi.split(",")[0]}</h2>
            <p className="mt-4 text-base leading-relaxed text-ink/75">
              {lokasi}. Pembukaan Sabtu dan Minggu, 7 dan 8 November 2026.
            </p>
            <a
              href={EVENT_INFO.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(TOMBOL, "mt-6 border border-ink/50 text-ink hover:bg-ink hover:text-[#0a0a0a]")}
            >
              Buka di Google Maps
            </a>
          </div>
          <div className="h-72 w-full border border-ink/25 lg:col-span-3 lg:h-96">
            <iframe
              src={EVENT_INFO.mapsEmbedUrl}
              title="Peta lokasi Drive Tech di Rest Area Singosari Malang (Kampung Tentara)"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
