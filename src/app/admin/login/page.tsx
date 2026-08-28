import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/LoginForm";
import { Alert } from "@/components/ui/Alert";
import { EVENT_INFO } from "@/lib/domain/constants";
import { getCurrentAdmin } from "@/lib/services/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { tujuanAdminAman } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Halaman masuk panel admin pameran.",
};

type PageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const admin = await getCurrentAdmin();
  if (admin) redirect("/admin"); // redirect() melempar NEXT_REDIRECT

  const { next } = await searchParams;
  const terkonfigurasi = isSupabaseConfigured();

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-app px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Wordmark oranye */}
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
            {EVENT_INFO.name}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
            Panel Admin
          </h1>
          <p className="mt-1.5 text-sm text-muted">Khusus panitia pameran.</p>
        </div>

        {/* Kartu kecil terpusat */}
        <div className="rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow-md)] sm:p-7">
          {terkonfigurasi ? (
            <LoginForm next={tujuanAdminAman(next)} />
          ) : (
            <Alert tone="warning" title="Supabase belum dikonfigurasi">
              Isi kredensial Supabase di{" "}
              <code className="rounded bg-surface-3 px-1 py-0.5 text-xs">.env.local</code> (contoh di{" "}
              <code className="rounded bg-surface-3 px-1 py-0.5 text-xs">.env.example</code>), lalu
              jalankan ulang server.
            </Alert>
          )}
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-muted">
          Akun admin dibuat panitia lewat Supabase Auth — langkahnya ada di{" "}
          <code className="font-mono">supabase/README.md</code>.
        </p>
      </div>
    </div>
  );
}
