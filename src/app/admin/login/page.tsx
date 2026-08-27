import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/LoginForm";
import { Alert } from "@/components/ui/Alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { getCurrentAdmin } from "@/lib/services/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Halaman masuk panel admin pameran.",
};

type PageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

/** Hanya izinkan tujuan internal supaya tidak bisa dipakai open redirect. */
function tujuanAman(next: string | string[] | undefined): string {
  const nilai = Array.isArray(next) ? next[0] : next;
  if (typeof nilai === "string" && nilai.startsWith("/") && !nilai.startsWith("//")) return nilai;
  return "/admin";
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const admin = await getCurrentAdmin();
  if (admin) redirect("/admin"); // redirect() melempar NEXT_REDIRECT

  const { next } = await searchParams;
  const terkonfigurasi = isSupabaseConfigured();

  return (
    <div className="mx-auto w-full max-w-md py-4 sm:py-10">
      <Card>
        <CardHeader>
          <CardTitle>Masuk Panel Admin</CardTitle>
          <CardDescription>
            Khusus panitia pameran. Gunakan email dan kata sandi akun admin Anda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {terkonfigurasi ? (
            <LoginForm next={tujuanAman(next)} />
          ) : (
            <Alert tone="warning" title="Koneksi database belum dikonfigurasi">
              Login belum bisa dipakai karena kredensial Supabase belum diisi. Salin{" "}
              <code className="rounded bg-white/70 px-1 py-0.5 text-xs">.env.example</code> menjadi{" "}
              <code className="rounded bg-white/70 px-1 py-0.5 text-xs">.env.local</code>, isi
              NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, dan
              SUPABASE_SERVICE_ROLE_KEY, lalu jalankan ulang server pengembangan.
            </Alert>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
            <p className="font-medium text-slate-700">Belum punya akun?</p>
            <p className="mt-0.5">
              Akun admin dibuat lebih dulu lewat Supabase Auth (email &amp; kata sandi), lalu
              didaftarkan pada tabel <code className="font-mono">admin_users</code> beserta perannya
              (<span className="font-medium">admin</span> atau{" "}
              <span className="font-medium">verifikator</span>). Langkah lengkapnya ada di{" "}
              <code className="font-mono">supabase/README.md</code>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
