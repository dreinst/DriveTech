import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/AdminNav";
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
 * Kerangka seluruh area /admin ala mockup dasbor gelap:
 * sidebar hitam pekat border-r di kiri (>= lg), bar atas yang bisa digeser
 * di layar kecil, dan area konten lega di kanan.
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
    <div className="flex min-h-[calc(100dvh-4rem)] w-full flex-col lg:flex-row">
      {/* Sidebar (>= lg) / bar navigasi atas (< lg) — hitam lebih pekat dari kanvas. */}
      <aside className="sticky top-16 z-30 shrink-0 border-b border-line bg-[#050505] lg:h-[calc(100dvh-4rem)] lg:w-64 lg:border-b-0 lg:border-r">
        <AdminNav
          admin={{
            name: nama,
            email: admin.email,
            roleLabel: ADMIN_ROLE_LABEL[admin.role],
          }}
        />
      </aside>

      {/* Bukan <main>: layout root sudah menyediakan landmark <main>. */}
      <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </section>
    </div>
  );
}
