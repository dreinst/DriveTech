"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Ikon inline (tanpa dependency ikon eksternal)                       */
/* ------------------------------------------------------------------ */

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "shrink-0",
  "aria-hidden": true,
} as const;

function IconDashboard() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.4" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.4" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.4" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.4" />
    </svg>
  );
}

function IconSlot() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="2" />
      <path d="M2.5 7.5h15" />
      <path d="M7.5 7.5v10" />
    </svg>
  );
}

function IconBooking() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2" y="4.5" width="16" height="11" rx="2" />
      <path d="M2 8.5h16" />
      <path d="M5 12.5h3.5" />
    </svg>
  );
}

function IconLeasing() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4.5 2.5h7L15.5 6.5v11h-11z" />
      <path d="M11.5 2.5v4h4" />
      <path d="M7 11h6" />
      <path d="M7 14h4" />
    </svg>
  );
}

function IconTenant() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="7.5" cy="7" r="2.8" />
      <path d="M2.6 16.5c.6-2.6 2.5-4 4.9-4s4.3 1.4 4.9 4" />
      <path d="M13.4 5.1a2.6 2.6 0 0 1 0 4.9" />
      <path d="M14.6 12.9c1.6.5 2.6 1.7 3 3.6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Daftar menu                                                         */
/* ------------------------------------------------------------------ */

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /** true = hanya aktif kalau path persis sama (dipakai dashboard "/admin"). */
  exact?: boolean;
};

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <IconDashboard />, exact: true },
  { href: "/admin/slots", label: "Slot", icon: <IconSlot /> },
  { href: "/admin/bookings", label: "Booking & Pembayaran", icon: <IconBooking /> },
  { href: "/admin/leasing", label: "Leasing", icon: <IconLeasing /> },
  { href: "/admin/tenants", label: "Tenant", icon: <IconTenant /> },
];

function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Navigasi admin.
 * - Layar >= lg : sidebar vertikal yang menempel (sticky).
 * - Layar kecil : bar mendatar yang bisa digeser.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigasi admin" className="lg:sticky lg:top-20">
      <ul className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {NAV_ITEMS.map((item) => {
          const aktif = isActive(pathname, item);
          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={aktif ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors",
                  aktif
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
