import type { Metadata } from "next";

import { FormAksi } from "@/components/admin/FormAksi";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { buatAkunAction, gantiSandiAkunAction, setAkunAktifAction } from "@/lib/actions/alat";
import { ADMIN_ROLE_LABEL } from "@/lib/domain/labels";
import { listAkun } from "@/lib/services/akun";
import { requireSuperadmin } from "@/lib/services/auth";
import { formatTanggal } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Akun Admin",
  description: "Buat akun admin, ganti sandi, dan nonaktifkan akun.",
};

export default async function AdminAkunPage() {
  const saya = await requireSuperadmin();
  const hasil = await listAkun();

  return (
    <div className="space-y-6">
      <header className="min-w-0 space-y-2">
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-ink sm:text-4xl">Akun Admin</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Superadmin punya akses penuh. Admin bisa melihat semua halaman, memverifikasi
          pembayaran, dan mencatat registrasi ulang. Akun yang dinonaktifkan langsung keluar dan
          tidak bisa login sampai diaktifkan lagi.
        </p>
      </header>

      {!hasil.ok ? (
        <Alert tone="error" title="Daftar akun belum bisa dimuat">
          {hasil.error}
        </Alert>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {hasil.data.map((akun) => (
              <li key={akun.id} className="space-y-3 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {akun.full_name?.trim() || akun.username || akun.email}
                      {akun.id === saya.id ? (
                        <span className="ml-2 text-xs font-normal text-subtle">(Anda)</span>
                      ) : null}
                    </p>
                    <p className="truncate font-mono text-xs text-muted">
                      {akun.username ?? akun.email}
                      <span className="font-sans text-subtle">
                        {" "}
                        · dibuat {formatTanggal(akun.created_at)}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge tone={akun.role === "superadmin" ? "blue" : "slate"}>
                      {ADMIN_ROLE_LABEL[akun.role]}
                    </Badge>
                    <Badge tone={akun.aktif ? "green" : "red"} dot>
                      {akun.aktif ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                  <FormAksi action={gantiSandiAkunAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={akun.id} />
                    <label htmlFor={`sandi-${akun.id}`} className="sr-only">
                      Sandi baru untuk {akun.username ?? akun.email}
                    </label>
                    <Input
                      id={`sandi-${akun.id}`}
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      placeholder="Sandi baru (min. 8 karakter)"
                      className="w-60"
                    />
                    <SubmitButton variant="secondary" size="sm" pendingText="Menyimpan…">
                      Ganti sandi
                    </SubmitButton>
                  </FormAksi>

                  {akun.id !== saya.id ? (
                    <FormAksi
                      action={setAkunAktifAction}
                      className="flex flex-wrap items-center gap-2"
                      konfirmasi={
                        akun.aktif
                          ? `Nonaktifkan akun ${akun.username ?? akun.email}? Akun ini langsung keluar dari panel.`
                          : undefined
                      }
                    >
                      <input type="hidden" name="id" value={akun.id} />
                      <input type="hidden" name="aktif" value={akun.aktif ? "0" : "1"} />
                      <SubmitButton
                        variant={akun.aktif ? "danger" : "secondary"}
                        size="sm"
                        pendingText="Menyimpan…"
                      >
                        {akun.aktif ? "Nonaktifkan" : "Aktifkan lagi"}
                      </SubmitButton>
                    </FormAksi>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Buat akun</h2>
        <FormAksi action={buatAkunAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Username" htmlFor="akun-username" hint="Huruf kecil, tanpa spasi." required>
            <Input
              id="akun-username"
              name="username"
              autoComplete="off"
              autoCapitalize="none"
              pattern="[a-z0-9._\-]{3,50}"
              required
            />
          </Field>
          <Field label="Nama" htmlFor="akun-nama" required>
            <Input id="akun-nama" name="fullName" autoComplete="off" required />
          </Field>
          <Field label="Peran" htmlFor="akun-peran" required>
            <Select id="akun-peran" name="role" defaultValue="admin">
              <option value="admin">{ADMIN_ROLE_LABEL.admin}</option>
              <option value="superadmin">{ADMIN_ROLE_LABEL.superadmin}</option>
            </Select>
          </Field>
          <Field label="Sandi" htmlFor="akun-sandi" hint="Minimal 8 karakter." required>
            <Input
              id="akun-sandi"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Membuat akun…">Buat akun</SubmitButton>
          </div>
        </FormAksi>
      </Card>
    </div>
  );
}
