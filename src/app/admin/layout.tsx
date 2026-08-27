import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/AdminNav";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { ADMIN_ROLE_LABEL } from "@/lib/domain/labels";
import { getCurrentAdmin } from "@/lib/services/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Panel Admin",
    template: "%s | Admin",
  },
  robots: { index: false, follow: false },
};

/**
 * Kerangka seluruh area /admin.
 *
 * Layout ini SENGAJA tidak pernah memanggil redirect(): /admin/login berada di
 * bawahnya, jadi kalau belum ada sesi admin kita cukup merender children polos
 * dan biarkan tiap halaman (lewat requireAdmin) yang menjaga aksesnya sendiri.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return <>{children}</>;
  }

  const nama = admin.full_name?.trim() || admin.email;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Panel Admin</p>
          <p className="truncate text-sm font-semibold text-slate-900">{nama}</p>
          <p className="truncate text-xs text-slate-500">{admin.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={admin.role === "admin" ? "blue" : "slate"}>
            {ADMIN_ROLE_LABEL[admin.role]}
          </Badge>
          <Link href="/" className={buttonClass("secondary", "sm")}>
            Lihat Denah Publik
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-6">
        <aside className="mb-4 lg:mb-0">
          <AdminNav />
        </aside>
        {/* Bukan <main>: layout root sudah menyediakan landmark <main>. */}
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
