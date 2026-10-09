import Link from "next/link";
import { EVENT_INFO, WA_BOT_PHONE, WA_KANTOR_TAMPIL, waHref } from "@/lib/domain/constants";

const FOOTER_LINKS = [
  { href: "/katalog", label: "Katalog" },
  { href: "/#denah", label: "Denah" },
  { href: "/#sponsor", label: "Sponsor" },
  { href: "/#cek-status", label: "Cek Status" },
  { href: "/admin", label: "Admin" },
] as const;

/** Footer hitam: merek, lokasi, WhatsApp, tautan, lalu kredit pembuat. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-[#0a0a0a]">
      <div className="mx-auto w-full max-w-[90rem] px-4 pt-16 pb-8 sm:px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <Link href="/" className="flex items-center gap-4 text-ink">
            {/* eslint-disable-next-line @next/next/no-img-element -- emblem kecil 10 KB, tanpa optimasi */}
            <img src="/gambar/emblem.webp" alt="" aria-hidden="true" width={56} height={56} className="h-14 w-14" />
            <span className="judul text-5xl">{EVENT_INFO.name}</span>
          </Link>

          <div className="grid gap-8 sm:grid-cols-3 sm:gap-14">
            <div>
              <p className="label text-sm text-accent">Lokasi</p>
              <p className="mt-3 text-sm leading-relaxed text-ink/85">
                Kampung Tentara
                <br />
                Rest Area Singosari, Malang
              </p>
              <a
                href={EVENT_INFO.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-ink/85 underline-offset-4 hover:text-accent hover:underline"
              >
                Lihat di Google Maps
              </a>
            </div>
            <div>
              <p className="label text-sm text-accent">WhatsApp</p>
              <a
                href={waHref(WA_BOT_PHONE)}
                target="_blank"
                rel="noopener noreferrer"
                className="tabular mt-3 inline-block text-sm text-ink/85 underline-offset-4 hover:text-accent hover:underline"
              >
                {WA_KANTOR_TAMPIL}
              </a>
            </div>
            <div>
              <p className="label text-sm text-accent">Jelajahi</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {FOOTER_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-ink/85 underline-offset-4 hover:text-accent hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-4 text-xs text-ink/60">
            <span>
              Made by{" "}
              <a href="https://www.instagram.com/dreiinst/" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                dreinst
              </a>
            </span>
            <span aria-hidden="true" className="h-4 w-px bg-ink/25" />
            <span className="flex items-center gap-2.5">
              Organized by
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG statis, tanpa optimasi */}
              <img src="/logo-dpro-ringkas.svg?v=2" alt="D'PRO" className="h-5 w-auto shrink-0" />
            </span>
          </p>
          <p className="text-xs text-ink/60">Pembukaan Sabtu dan Minggu, 7 dan 8 November 2026</p>
        </div>
      </div>
    </footer>
  );
}
