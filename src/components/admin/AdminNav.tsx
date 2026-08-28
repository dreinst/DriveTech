"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/admin/LogoutButton";
import { EVENT_INFO } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Ikon inline (tanpa dependency ikon eksternal)                       */
/* ------------------------------------------------------------------ */

const ICON_PROPS = {
  width: 17,
  height: 17,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "shrink-0",
  "aria-hidden": true,
} as const;

function IconIkhtisar() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.4" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.4" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.4" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.4" />
    </svg>
  );
}

function IconPemesanan() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3.5" width="14" height="13" rx="2" />
      <path d="M6.5 7.5h7" />
      <path d="M6.5 10.5h7" />
      <path d="M6.5 13.5h4" />
    </svg>
  );
}

function IconPembayaran() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2" y="4.5" width="16" height="11" rx="2" />
      <path d="M2 8.5h16" />
      <path d="M5 12.5h3.5" />
    </svg>
  );
}

function IconInventaris() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="2" />
      <path d="M2.5 7.5h15" />
      <path d="M7.5 7.5v10" />
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

function IconAnalitik() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 16.5 8 11l3.2 3.2 5.8-6.4" />
      <path d="M13 7.5h4v4" />
    </svg>
  );
}

function IconPengaturan() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.8v2.1M10 15.1v2.1M2.8 10h2.1M15.1 10h2.1M4.9 4.9l1.5 1.5M13.6 13.6l1.5 1.5M15.1 4.9l-1.5 1.5M6.4 13.6l-1.5 1.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Daftar menu                                                         */
/* ------------------------------------------------------------------ */

type NavItem = {
  href: string;
  label: string;
  icon: () => ReactNode;
  /** Cara menentukan aktif dari pathname + query. */
  match: (pathname: string, payment: string | null) => boolean;
};

const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: IconIkhtisar,
    match: (pathname) => pathname === "/admin",
  },
  {
    href: "/admin/bookings",
    label: "Pemesanan",
    icon: IconPemesanan,
    match: (pathname, payment) =>
      (pathname === "/admin/bookings" || pathname.startsWith("/admin/bookings/")) &&
      payment !== "submitted",
  },
  {
    // Pintasan langsung ke antrean bukti transfer yang menunggu verifikasi.
    href: "/admin/bookings?payment=submitted",
    label: "Pembayaran",
    icon: IconPembayaran,
    match: (pathname, payment) =>
      (pathname === "/admin/bookings" || pathname.startsWith("/admin/bookings/")) &&
      payment === "submitted",
  },
  {
    href: "/admin/slots",
    label: "Inventaris",
    icon: IconInventaris,
    match: (pathname) => pathname === "/admin/slots" || pathname.startsWith("/admin/slots/"),
  },
  {
    href: "/admin/tenants",
    label: "Tenant",
    icon: IconTenant,
    match: (pathname) => pathname === "/admin/tenants" || pathname.startsWith("/admin/tenants/"),
  },
  {
    href: "/admin/leasing",
    label: "Leasing",
    icon: IconLeasing,
    match: (pathname) => pathname === "/admin/leasing" || pathname.startsWith("/admin/leasing/"),
  },
  {
    href: "/admin/analitik",
    label: "Analitik",
    icon: IconAnalitik,
    match: (pathname) => pathname === "/admin/analitik" || pathname.startsWith("/admin/analitik/"),
  },
  {
    href: "/admin/pengaturan",
    label: "Pengaturan",
    icon: IconPengaturan,
    match: (pathname) =>
      pathname === "/admin/pengaturan" || pathname.startsWith("/admin/pengaturan/"),
  },
];

export type AdminNavProps = {
  /** Info admin yang sedang login untuk bagian bawah sidebar. */
  admin?: {
    name: string;
    email: string;
    roleLabel: string;
  };
};

function NavInner({ admin }: AdminNavProps) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const payment = searchParams?.get("payment") ?? null;

  const inisial = (admin?.name ?? "A").trim().charAt(0).toUpperCase() || "A";

  return (
    <>
      {/* ---------- Layar >= lg: sidebar penuh ---------- */}
      <div className="hidden lg:flex lg:h-full lg:flex-col lg:overflow-y-auto lg:px-4 lg:py-6">
        <div className="flex items-start gap-2.5 px-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG statis */}
          <img src="/logo-drivetech.svg" alt="" aria-hidden="true" className="mt-0.5 h-8 w-auto shrink-0" />
          <div className="min-w-0">
          <p className="text-lg font-semibold leading-snug tracking-tight text-ink">
            {EVENT_INFO.name} Admin
          </p>
          <p className="mt-0.5 truncate text-xs text-subtle">Pengelola Pameran</p>
          </div>
        </div>

        <nav aria-label="Navigasi admin" className="mt-6">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const aktif = item.match(pathname, payment);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={aktif ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-2.5 rounded-full px-4 text-sm transition-[background-color,color,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      aktif
                        ? "bg-accent font-semibold text-[#0a0a0a] hover:opacity-90"
                        : "font-medium text-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <item.icon />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto space-y-4 border-t border-line pt-5">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 text-xs font-medium text-muted transition-colors duration-150 hover:text-ink"
          >
            <svg {...ICON_PROPS} width={15} height={15}>
              <path d="M11.5 4.5 6 10l5.5 5.5" />
            </svg>
            Lihat Denah Publik
          </Link>

          {admin ? (
            <div className="flex min-w-0 items-center gap-2.5 px-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-semibold text-ink"
              >
                {inisial}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-ink">
                  {admin.name}
                </p>
                <p className="truncate text-xs text-subtle">{admin.email}</p>
                <p className="text-[11px] uppercase tracking-[0.08em] text-subtle">
                  {admin.roleLabel}
                </p>
              </div>
            </div>
          ) : null}

          <div className="px-1">
            <LogoutButton />
          </div>
        </div>
      </div>

      {/* ---------- Layar < lg: bar atas yang bisa digeser ---------- */}
      <div className="lg:hidden">
        <nav aria-label="Navigasi admin" className="no-scrollbar overflow-x-auto">
          <ul className="flex items-center gap-1 px-3 py-2">
            {NAV_ITEMS.map((item) => {
              const aktif = item.match(pathname, payment);
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={aktif ? "page" : undefined}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs transition-[background-color,color] duration-150",
                      aktif
                        ? "bg-accent font-semibold text-[#0a0a0a]"
                        : "font-medium text-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <item.icon />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li className="shrink-0 border-l border-line pl-1">
              <LogoutButton />
            </li>
          </ul>
        </nav>
      </div>
    </>
  );
}

/**
 * Navigasi admin ala mockup dasbor gelap:
 * - Layar >= lg : sidebar hitam pekat border-r (dipasang oleh layout admin),
 *   item aktif berbentuk pil oranye berteks gelap, info admin + keluar di bawah.
 * - Layar kecil : bar atas yang bisa digeser mendatar.
 *
 * Dibungkus <Suspense> karena useSearchParams() (penanda aktif "Pembayaran")
 * bisa menangguhkan render di luar mode dynamic.
 */
export function AdminNav({ admin }: AdminNavProps) {
  return (
    <Suspense fallback={null}>
      <NavInner admin={admin} />
    </Suspense>
  );
}
