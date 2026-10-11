import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { cobaSatu, isDbConfigured, sql } from "@/lib/db";
import { fail, ok, type Result } from "@/lib/result";
import { bacaSesi, buatSesi, isAuthConfigured, SESI_COOKIE, SESI_UMUR_DETIK } from "@/lib/sesi";
import type { AdminUserRow } from "@/lib/types/database";
import { adminLoginSchema, zodFieldErrors } from "@/lib/validation/schemas";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/auth.ts hanya boleh dipakai di server.");
}

const LOGIN_PATH = "/drivetechadmin/login";

/** Kolom admin_users yang boleh keluar dari modul ini; password_hash tidak pernah ikut. */
const kolomAdmin = () => sql`id, email, username, full_name, role, created_at`;

/** Admin yang sedang login, atau null. Tidak pernah melempar. */
export async function getCurrentAdmin(): Promise<AdminUserRow | null> {
  if (!isDbConfigured()) return null;

  try {
    const adminId = await bacaSesi((await cookies()).get(SESI_COOKIE)?.value);
    if (!adminId) return null;
    // Cookie yang sah belum cukup: barisnya harus masih ada di admin_users.
    const { data } = await cobaSatu(
      sql<AdminUserRow[]>`select ${kolomAdmin()} from admin_users where id = ${adminId}`,
    );
    return data;
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
 * requireAdmin + wajib role 'superadmin'. Role 'admin' hanya untuk
 * verifikasi pembayaran (lihat README bagian peran), jadi seluruh aksi mutasi
 * lain harus lewat gate ini; middleware/requireAdmin saja tidak memeriksa role.
 */
export async function requireFullAdmin(): Promise<Result<AdminUserRow>> {
  const admin = await requireAdmin();
  if (admin.role !== "superadmin") {
    return fail<AdminUserRow>(
      "Aksi ini khusus superadmin. Akun admin hanya bisa memverifikasi pembayaran.",
      "FORBIDDEN",
    );
  }
  return ok(admin);
}

/**
 * Gerbang HALAMAN khusus superadmin: role 'admin' mendapat 404, sama seperti
 * orang tanpa sesi (lihat middleware), jadi menunya tidak bisa dibuka lewat alamat langsung.
 */
export async function requireSuperadmin(): Promise<AdminUserRow> {
  const admin = await requireAdmin();
  if (admin.role !== "superadmin") notFound();
  return admin;
}

/**
 * Login admin memakai USERNAME + kata sandi. Sandi dicocokkan di database
 * lewat pgcrypto crypt() terhadap hash bcrypt di admin_users.password_hash,
 * lalu sesi disimpan sebagai cookie bertanda tangan (lihat lib/sesi.ts).
 */
export async function signInAdmin(
  username: string,
  password: string,
): Promise<Result<AdminUserRow>> {
  const parsed = adminLoginSchema.safeParse({ username, password });
  if (!parsed.success) {
    const errors = zodFieldErrors(parsed.error);
    const first = Object.values(errors)[0] ?? "Data login tidak valid.";
    return fail<AdminUserRow>(first, "VALIDATION");
  }

  if (!isDbConfigured() || !isAuthConfigured()) {
    return fail<AdminUserRow>(
      "Database belum dikonfigurasi. Salin .env.example ke .env.local dan isi DATABASE_URL serta AUTH_SECRET.",
      "NO_CONFIG",
    );
  }

  const { data: admin, error } = await cobaSatu(sql<AdminUserRow[]>`
    select ${kolomAdmin()} from admin_users
     where username = ${parsed.data.username.trim().toLowerCase()}
       and password_hash = crypt(${parsed.data.password}, password_hash)`);
  if (error) console.warn(`[auth] login gagal diperiksa: ${error.message}`);
  const sesi = admin ? await buatSesi(admin.id) : null;
  if (!admin || !sesi) {
    return fail<AdminUserRow>("Username atau kata sandi salah.", "INVALID_CREDENTIALS");
  }

  (await cookies()).set(SESI_COOKIE, sesi, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESI_UMUR_DETIK,
  });
  return ok(admin);
}

/** Keluar dari sesi admin. */
export async function signOutAdmin(): Promise<Result<null>> {
  try {
    (await cookies()).delete(SESI_COOKIE);
  } catch {
    // Dipanggil di luar Server Action: cookie tidak bisa dihapus, biarkan kedaluwarsa.
  }
  return ok(null);
}
