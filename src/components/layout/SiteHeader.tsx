import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { LogoLengkap } from "@/components/brand/LogoDriveTech";

type NavItem = { href: string; label: string };

/**
 * Anchor menuju bagian beranda + halaman katalog kendaraan.
 * "Denah" menuju halaman /denah yang hanya untuk melihat tata letak lengkap;
 * alur pemesanan (peta terkunci per zona) tetap lewat tombol "Pesan Lapak".
 */
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/katalog", label: "Katalog" },
  { href: "/#area", label: "Area" },
  { href: "/denah", label: "Denah" },
  { href: "/#sponsor", label: "Sponsor" },
  { href: "/#cek-status", label: "Cek Status" },
];

/** Header sticky hitam. Tanpa JavaScript: menu mobile memakai <details>/<summary>. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[#0a0a0a]/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3 text-ink">
          <LogoLengkap className="text-[1.05rem] sm:text-[1.2rem]" />
        </Link>

        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <nav aria-label="Navigasi utama" className="hidden md:block">
            <ul className="flex items-center">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="label inline-flex min-h-11 items-center whitespace-nowrap px-3 text-[0.9375rem] text-ink/75 transition-colors duration-150 hover:text-accent"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Tautan admin sengaja tidak ditampilkan ke publik: panitia masuk lewat /drivetechadmin/login. */}
          <Link href="/#denah" className={buttonClass("primary", "sm")}>
            Pesan Lapak
          </Link>

          <details className="relative md:hidden">
            <summary
              className="flex h-11 w-11 cursor-pointer list-none items-center justify-center text-ink transition-colors duration-150 hover:bg-ink/5 [&::-webkit-details-marker]:hidden"
              aria-label="Buka menu navigasi"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            </summary>
            <nav
              aria-label="Navigasi mobile"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 border border-line bg-[#0a0a0a] p-2"
            >
              <ul>
                {NAV_ITEMS.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="label block px-3 py-3 text-base text-ink transition-colors duration-150 hover:bg-accent hover:text-[#0a0a0a]"
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
