import { redirect } from "next/navigation";

import { fail, ok, type Result } from "@/lib/result";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AdminUserRow } from "@/lib/types/database";
import { adminLoginSchema, zodFieldErrors } from "@/lib/validation/schemas";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/auth.ts hanya boleh dipakai di server.");
}

const LOGIN_PATH = "/admin/login";

/**
 * Tabel admin_users tidak punya policy RLS sama sekali (lihat kontrak), jadi
 * pembacaannya WAJIB lewat service role. Sesi loginnya sendiri tetap dibaca dari
 * cookie memakai client anon (createServerSupabase).
 */
async function ambilAdminById(userId: string): Promise<AdminUserRow | null> {
  if (!isServiceRoleConfigured()) return null;
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("admin_users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as AdminUserRow;
}

/** Admin yang sedang login, atau null. Tidak pernah melempar. */
export async function getCurrentAdmin(): Promise<AdminUserRow | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return await ambilAdminById(user.id);
  } catch {
    // Env belum lengkap atau sesi rusak: perlakukan sebagai belum login.
    return null;
  }
}

/** Sama seperti getCurrentAdmin, tapi mengalihkan ke halaman login kalau belum masuk. */
export async function requireAdmin(): Promise<AdminUserRow> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect(LOGIN_PATH); // redirect() melempar NEXT_REDIRECT
  return admin;
}

/**
 * requireAdmin + wajib role 'admin' penuh. Role 'verifikator' hanya untuk
 * verifikasi pembayaran (lihat README bagian peran), jadi seluruh aksi mutasi
 * lain harus lewat gate ini — middleware/requireAdmin saja tidak memeriksa role.
 */
export async function requireFullAdmin(): Promise<Result<AdminUserRow>> {
  const admin = await requireAdmin();
  if (admin.role !== "admin") {
    return fail<AdminUserRow>(
      "Aksi ini khusus role admin. Akun verifikator hanya bisa memverifikasi pembayaran.",
      "FORBIDDEN",
    );
  }
  return ok(admin);
}

/** Login admin memakai Supabase Auth email/password. */
export async function signInAdmin(
  email: string,
  password: string,
): Promise<Result<AdminUserRow>> {
  const parsed = adminLoginSchema.safeParse({ email, password });
  if (!parsed.success) {
    const errors = zodFieldErrors(parsed.error);
    const first = Object.values(errors)[0] ?? "Data login tidak valid.";
    return fail<AdminUserRow>(first, "VALIDATION");
  }

  if (!isSupabaseConfigured()) {
    return fail<AdminUserRow>(
      "Supabase belum dikonfigurasi. Salin .env.example ke .env.local dan isi kredensialnya.",
      "NO_CONFIG",
    );
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return fail<AdminUserRow>("Email atau kata sandi salah.", "INVALID_CREDENTIALS");
  }

  const admin = await ambilAdminById(data.user.id);
  if (!admin) {
    // Punya akun auth tapi bukan admin pameran: sesinya langsung dicabut.
    // Pesan sengaja disamakan dengan kredensial salah supaya tidak bisa dipakai
    // memastikan sepasang email+password valid (user enumeration).
    await supabase.auth.signOut();
    console.warn(`[auth] login ditolak: ${parsed.data.email} bukan baris admin_users.`);
    return fail<AdminUserRow>("Email atau kata sandi salah.", "NOT_ADMIN");
  }

  return ok(admin);
}

/** Keluar dari sesi admin. */
export async function signOutAdmin(): Promise<Result<null>> {
  if (!isSupabaseConfigured()) return ok(null);

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) return fail<null>("Gagal keluar dari sesi admin.", "SIGN_OUT_FAILED");
    return ok(null);
  } catch {
    return ok(null);
  }
}
