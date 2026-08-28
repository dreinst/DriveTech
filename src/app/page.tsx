import Link from "next/link";
import type { ReactNode } from "react";

import { CekStatusForm } from "@/components/denah/CekStatusForm";
import { FloorPlanBoard } from "@/components/denah/FloorPlanBoard";
import { FadeUp, Stagger, StaggerItem } from "@/components/motion/motion";
import { Alert } from "@/components/ui/Alert";
import { EVENT_INFO, isBookableZoneType } from "@/lib/domain/constants";
import { fallbackZonesFromLayout } from "@/lib/domain/fallback";
import { zoneHasVariedFees, zoneMinAdminFee } from "@/lib/domain/harga";
import { slotStatusAcrossDates } from "@/lib/domain/ketersediaan";
import { FLOOR_PLAN_ZONES } from "@/lib/domain/layout";
import { listActivePartners } from "@/lib/services/leasing";
import { getFloorPlan } from "@/lib/services/slots";
import type { SlotRow, ZoneType, ZoneWithSlots } from "@/lib/types/database";
import { cn, formatRupiah, formatTanggal } from "@/lib/utils";

// Halaman ini selalu mengambil status slot terbaru, jadi jangan dirender saat build.
export const dynamic = "force-dynamic";

/**
 * Warna aksen zona diambil dari data denah (domain/layout.ts) supaya kartu zona
 * senada dengan pita judul zona di SVG — dipakai HANYA sebagai tint gradien 10-14%.
 */
const ZONE_ACCENT: Partial<Record<ZoneType, string>> = Object.fromEntries(
  FLOOR_PLAN_ZONES.map((zone) => [zone.zoneType, zone.accent]),
);

/** Foto latar kartu zona (public/gambar, sudah dioptimalkan). */
const ZONE_IMAGE: Partial<Record<ZoneType, string>> = {
  mobil_baru: "/gambar/zona-mobil-baru.jpg",
  mobil_bekas: "/gambar/zona-mobil-bekas.jpg",
  mobil_motor_bekas: "/gambar/zona-mobil-motor.jpg",
  umkm: "/gambar/zona-umkm.jpg",
};

function zoneTint(zoneType: ZoneType): string {
  const image = ZONE_IMAGE[zoneType];
  if (image) {
    // Gradasi gelap dari bawah supaya judul & chip tetap terbaca di atas foto.
    return `linear-gradient(to top, rgba(10,10,10,0.88) 0%, rgba(10,10,10,0.42) 48%, rgba(10,10,10,0.12) 100%), url(${image}) center / cover no-repeat`;
  }
  const accent = ZONE_ACCENT[zoneType];
  if (!accent) return "var(--card)";
  return `linear-gradient(150deg, color-mix(in srgb, ${accent} 12%, var(--card)) 0%, var(--card) 62%)`;
}

export default async function BerandaPage() {
  const [result, partnersResult] = await Promise.all([getFloorPlan(), listActivePartners()]);

  const data = result.ok ? result.data : null;
  const errorMessage = result.ok ? null : result.error;
  const noConfig = !result.ok && result.code === "NO_CONFIG";

  const hasZones = data !== null && data.zones.length > 0;
  const zones: ZoneWithSlots[] = hasZones && data ? data.zones : fallbackZonesFromLayout();
  const isFallback = !hasZones;

  // Mitra leasing: kalau service gagal, wordmark disembunyikan (tanpa hardcode).
  const partners = partnersResult.ok ? partnersResult.data : [];

  const namaEvent = data?.event?.name ?? EVENT_INFO.name;
  const lokasi = data?.event?.location ?? EVENT_INFO.location;

  /* ---------- Model per tanggal: okupansi LINTAS seluruh tanggal mendatang ---------- */
  const eventDates = data?.eventDates ?? [];
  const occupancy = data?.occupancy ?? [];
  const tanggalTerdekat = eventDates[0]?.event_date ?? null;
  const activeDates = eventDates.map((d) => d.event_date);

  // Verdict slot lintas tanggal (alur "slot dulu, tanggal belakangan"):
  // "available" = masih ada minimal satu tanggal gelaran yang kosong.
  // Tanpa tanggal (fallback / belum ada jadwal) semua slot non-blokir dianggap tersedia.
  const verdictSlot = (slot: SlotRow, zoneType: ZoneType) =>
    slotStatusAcrossDates({
      slot,
      zoneType,
      activeDates,
      occupancy,
    });

  /* ---------- Statistik dari zona bookable (konsisten dengan panel peta) ---------- */
  let totalSlot = 0;
  let tersedia = 0;
  let tertunda = 0;
  let terisi = 0;
  for (const zone of zones) {
    if (!isBookableZoneType(zone.zone_type)) continue;
    for (const slot of zone.slots) {
      totalSlot += 1;
      const verdict = verdictSlot(slot, zone.zone_type);
      if (verdict === "available") tersedia += 1;
      else if (verdict === "pending") tertunda += 1;
      else if (verdict === "confirmed") terisi += 1;
      // "blocked" (diblokir panitia) hanya masuk hitungan total.
    }
  }

  /* ---------- Kartu zona: hanya zona yang bisa dibooking (warung & fasilitas
     tidak diperjualbelikan online, jadi tidak dipajang di sini) ---------- */
  const zonaKartu = zones.filter((zone) => isBookableZoneType(zone.zone_type));

  return (
    <div className="pb-16">
      {/* ================= HERO sinematik gelap-oranye ================= */}
      <section className="relative flex min-h-[72vh] items-center justify-center overflow-hidden px-4 py-20">
        {/* Foto hero (hall pameran neon oranye) sebagai layer dasar. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- latar dekoratif full-bleed */}
        <img
          src="/gambar/hero.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Overlay gelap supaya judul tetap kontras di atas foto. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,10,0.72) 0%, rgba(10,10,10,0.45) 45%, rgba(10,10,10,0.82) 100%)",
          }}
        />
        {/* Sorot lampu halus + pendar aksen oranye ala showroom malam. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(90% 65% at 50% 30%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 45%, transparent 72%)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: "radial-gradient(60% 45% at 50% 64%, var(--accent-soft) 0%, transparent 70%)",
          }}
        />
        {/* Vignette: tepi menggelap supaya fokus ke judul. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 42%, transparent 55%, rgba(0,0,0,0.55) 100%)",
          }}
        />

        <FadeUp className="relative z-10 w-full max-w-3xl text-center">
          <h1 className="text-[clamp(2.5rem,6vw,4rem)] font-bold leading-[1.05] tracking-[-0.02em] text-ink">
            {namaEvent}
          </h1>
          <p className="mt-5 text-base font-medium text-accent sm:text-lg">
            {EVENT_INFO.scheduleText} &middot; {lokasi}
          </p>
          {tanggalTerdekat ? (
            <p className="mt-2 text-sm text-muted">
              Gelaran terdekat: {formatTanggal(tanggalTerdekat)}
            </p>
          ) : null}

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/#denah"
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-8 text-sm font-semibold text-app transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-accent-hover active:scale-[0.98] sm:w-auto"
            >
              Pesan Slot
            </Link>
            <Link
              href="/#denah"
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-line bg-surface-3 px-8 text-sm font-semibold text-ink transition-[border-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-line-strong active:scale-[0.98] sm:w-auto"
            >
              Lihat Denah
            </Link>
          </div>
        </FadeUp>
      </section>

      {/* ================= STATS BAND (okupansi lintas tanggal mendatang) ================= */}
      <section aria-label="Statistik slot" className="border-y border-line bg-card">
        <Stagger
          inView
          className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-x-4 gap-y-8 px-4 pt-10 pb-4 sm:px-6 md:grid-cols-4"
        >
          <StatAngka nilai={totalSlot} label="Total Slot" warna="text-ink" />
          <StatAngka nilai={tersedia} label="Tersedia" warna="text-ok" />
          <StatAngka nilai={tertunda} label="Tertunda" warna="text-warn" />
          <StatAngka nilai={terisi} label="Terisi" warna="text-subtle" />
        </Stagger>
      </section>

      {/* ================= ZONA PAMERAN (bento) ================= */}
      <section id="zona" className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 pt-16 sm:px-6">
        <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.01em] text-ink">
          Zona Pameran
        </h2>
        <Stagger inView className="mt-6 grid gap-4 md:grid-cols-3">
          {zonaKartu.map((zone, index) => (
            <StaggerItem
              key={zone.id}
              className={cn(
                index === 0 && "md:col-span-2 md:row-span-2",
                zone.zone_type === "umkm" && "md:col-span-3",
              )}
            >
              <KartuZona
                zone={zone}
                besar={index === 0}
                tersedia={
                  zone.slots.filter((slot) => verdictSlot(slot, zone.zone_type) === "available")
                    .length
                }
                harga={zoneMinAdminFee(zone, zone.slots)}
                hargaBeragam={zoneHasVariedFees(zone, zone.slots)}
              />
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ================= PETA ================= */}
      <section id="denah" className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 pt-16 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.01em] text-ink">
            Denah Lokasi
          </h2>
        </div>

        {errorMessage ? (
          <div className="mt-4">
            <Alert tone={noConfig ? "info" : "warning"}>
              {noConfig
                ? "Supabase belum dikonfigurasi — denah di bawah hanya contoh dan slot belum bisa dipesan."
                : `Denah gagal dimuat (${errorMessage}) — sementara ditampilkan denah contoh.`}
            </Alert>
          </div>
        ) : isFallback ? (
          <div className="mt-4">
            <Alert tone="info">
              Belum ada data zona di database — denah di bawah memakai tata letak bawaan.
            </Alert>
          </div>
        ) : null}

        <div className="mx-auto mt-6 w-full max-w-3xl">
          <FloorPlanBoard
            zones={zones}
            isFallback={isFallback}
            eventDates={eventDates}
            occupancy={occupancy}
          />
        </div>
      </section>

      {/* ================= BELI KENDARAAN SECARA KREDIT (strip premium) ================= */}
      <section
        aria-label="Beli kendaraan secara kredit"
        className="mt-16 border-y border-line bg-surface-2"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-14 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Beli Kendaraan Secara Kredit
          </p>
          {partners.length > 0 ? (
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 sm:gap-x-14">
              {partners.map((partner) => (
                <li
                  key={partner.id}
                  className="text-base font-semibold uppercase tracking-[0.14em] text-subtle sm:text-lg"
                >
                  {partner.name}
                </li>
              ))}
            </ul>
          ) : null}

        </div>
      </section>

      {/* ================= CEK STATUS + KONTAK ================= */}
      {/* Satu panel komposit: peta mengisi kiri, cek status + kontak rapat di kanan.
          Sengaja tanpa kartu bersarang & subjudul supaya nyaris tanpa whitespace. */}
      <section id="cek-status" className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 pt-12 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-line bg-card lg:grid lg:grid-cols-5">
          <div className="h-64 w-full lg:col-span-3 lg:h-auto lg:min-h-[400px]">
            <iframe
              src={EVENT_INFO.mapsEmbedUrl}
              title="Peta lokasi Mokas Festival di Rest Area Singosari Malang (Kampung Tentara)"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>

          <div className="flex flex-col gap-4 p-5 lg:col-span-2 lg:border-l lg:border-line">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-ink">Cek Status Booking</h2>
              <CekStatusForm className="mt-2.5" />
            </div>

            <div className="border-t border-line" />

            <dl className="space-y-2.5">
              <BarisKontak label="Lokasi">{lokasi}</BarisKontak>
              <BarisKontak label="Jadwal">{EVENT_INFO.scheduleText}</BarisKontak>
              {tanggalTerdekat ? (
                <BarisKontak label="Gelaran terdekat">{formatTanggal(tanggalTerdekat)}</BarisKontak>
              ) : null}
              <BarisKontak label="Penyelenggara">{EVENT_INFO.organizer}</BarisKontak>
              <BarisKontak label="Telepon / WhatsApp">
                <a
                  href={`tel:${EVENT_INFO.contact.replace(/[^0-9+]/g, "")}`}
                  className="tabular font-semibold text-accent underline-offset-2 hover:underline"
                >
                  {EVENT_INFO.contact}
                </a>
              </BarisKontak>
            </dl>

            <a
              href={EVENT_INFO.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              Buka di Google Maps <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bagian kecil                                                        */
/* ------------------------------------------------------------------ */

function StatAngka({ nilai, label, warna }: { nilai: number; label: string; warna: string }) {
  return (
    <StaggerItem className="text-center">
      <p className={cn("tabular text-4xl font-semibold tracking-[-0.02em] sm:text-5xl", warna)}>
        {nilai}
      </p>
      <p className="mt-2 text-[0.8125rem] font-medium uppercase tracking-[0.08em] text-subtle">
        {label}
      </p>
    </StaggerItem>
  );
}

function KartuZona({
  zone,
  besar,
  tersedia,
  harga,
  hargaBeragam,
}: {
  zone: ZoneWithSlots;
  besar: boolean;
  /** Jumlah slot yang masih punya minimal satu tanggal gelaran kosong. */
  tersedia: number;
  /** Biaya admin terendah di zona (harga efektif per slot). */
  harga: number;
  /** True bila ada slot dengan harga override berbeda -> "mulai Rp X". */
  hargaBeragam: boolean;
}) {
  const total = zone.slots.length;

  return (
    <Link
      href="/#denah"
      className={cn(
        "group flex h-full flex-col justify-end rounded-2xl border border-line p-6 transition-[border-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-line-strong hover:shadow-[var(--shadow-md)] active:scale-[0.99] sm:p-7",
        besar ? "min-h-64 md:min-h-96" : "min-h-40",
      )}
      style={{ backgroundColor: "var(--card)", background: zoneTint(zone.zone_type) }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular rounded-full border border-line bg-card/80 px-3 py-1 text-xs font-medium text-ink backdrop-blur-sm">
          {total} slot
        </span>
        <span className="tabular rounded-full bg-ok-soft px-3 py-1 text-xs font-medium text-ok">
          {tersedia} tersedia
        </span>
        <span className="tabular rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
          {hargaBeragam ? "mulai " : ""}
          {formatRupiah(harga)}/tanggal
        </span>
      </div>

      <h3
        className={cn(
          "mt-3 font-semibold tracking-[-0.01em] text-ink",
          besar ? "text-2xl sm:text-3xl" : "text-xl",
        )}
      >
        {zone.name}
      </h3>

      {zone.description ? (
        <p className={cn("mt-1.5 text-sm leading-relaxed text-muted", !besar && "line-clamp-2")}>
          {zone.description}
        </p>
      ) : null}
    </Link>
  );
}

function BarisKontak({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}
