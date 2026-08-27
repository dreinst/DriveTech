import Link from "next/link";
import { EVENT_INFO } from "@/lib/domain/constants";

type NavItem = { href: string; label: string };

/** Rute /booking/status tidak ada; pengecekan status diarahkan ke bagian #cek-status di beranda. */
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Denah" },
  { href: "/#cek-status", label: "Cek Status Booking" },
  { href: "/admin", label: "Admin" },
];

/** Header sticky tanpa JavaScript: nav digeser mendatar di layar kecil. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white"
            aria-hidden="true"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2.5" />
              <path d="M3 9.5h18" />
              <path d="M9.5 9.5V21" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight text-slate-900">
              {EVENT_INFO.name}
            </span>
            <span className="block truncate text-xs leading-tight text-slate-500">
              Booking slot & denah lokasi
            </span>
          </span>
        </Link>

        <nav aria-label="Navigasi utama" className="no-scrollbar -mx-1 overflow-x-auto sm:mx-0">
          <ul className="flex items-center gap-1 px-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex h-8 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
