import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { EVENT_INFO } from "@/lib/domain/constants";

type NavItem = { href: string; label: string };

/** Anchor menuju bagian-bagian beranda + halaman katalog kendaraan per jenis. */
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/katalog?jenis=mobil", label: "Katalog Mobil" },
  { href: "/katalog?jenis=motor", label: "Katalog Motor" },
  { href: "/#zona", label: "Zona" },
  { href: "/#denah", label: "Peta Lokasi" },
  { href: "/#cek-status", label: "Cek Status" },
];

/**
 * Header sticky gelap semi-transparan ala referensi Stitch.
 * Tanpa JavaScript: menu mobile memakai <details>/<summary>.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[#0a0a0a]/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Monogram + wordmark oranye */}
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 text-[15px] font-bold tracking-tight text-accent"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG statis, tanpa optimasi */}
          <img src="/logo-drivetech.svg" alt="" aria-hidden="true" className="h-7 w-auto shrink-0" />
          <span className="truncate">{EVENT_INFO.name}</span>
        </Link>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {/* Nav desktop */}
          <nav aria-label="Navigasi utama" className="hidden md:block">
            <ul className="flex items-center">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center whitespace-nowrap px-3 text-sm font-medium text-muted transition-colors duration-150 hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* CTA pil oranye. Tautan admin sengaja tidak ditampilkan ke publik —
              panitia mengakses langsung lewat /admin/login. */}
          <Link href="/#denah" className={buttonClass("primary", "sm")}>
            Pesan Slot
          </Link>

          {/* Menu mobile */}
          <details className="relative md:hidden">
            <summary
              className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full text-ink transition-colors duration-150 hover:bg-ink/5 [&::-webkit-details-marker]:hidden"
              aria-label="Buka menu navigasi"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            </summary>
            <nav
              aria-label="Navigasi mobile"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 rounded-[var(--radius)] border border-line bg-card p-2 shadow-[var(--shadow-md)]"
            >
              <ul className="space-y-0.5">
                {NAV_ITEMS.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-3"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
