import { coba, cobaSatu, isDbConfigured, sql } from "@/lib/db";
import { fail, ok, type Result } from "@/lib/result";
import type { AdminRole, AdminUserRow } from "@/lib/types/database";
import { dbFail, NO_CONFIG_MESSAGE } from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/akun.ts hanya boleh dipakai di server.");
}

/** Hash bcrypt dibuat di database (pgcrypto), sama dengan cara login mencocokkannya. */
const hashSandi = (sandi: string) => sql`crypt(${sandi}, gen_salt('bf', 10))`;

/** Semua akun admin, yang paling lama dibuat di atas. password_hash tidak pernah ikut. */
export async function listAkun(): Promise<Result<AdminUserRow[]>> {
  if (!isDbConfigured()) return fail<AdminUserRow[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await coba(sql<AdminUserRow[]>`
    select id, email, username, full_name, role, created_at, aktif
      from admin_users order by created_at`);
  if (error) return dbFail<AdminUserRow[]>(error, "Gagal memuat daftar akun");
  return ok([...data]);
}

/** Buat akun admin baru. Email diisi alamat internal karena kolomnya wajib dan tidak dipakai mengirim apa pun. */
export async function buatAkun(input: {
  username: string;
  fullName: string;
  role: AdminRole;
  password: string;
}): Promise<Result<null>> {
  if (!isDbConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { error } = await coba(sql`
    insert into admin_users (email, username, full_name, role, password_hash)
    values (${`${input.username}@drivetech.local`}, ${input.username}, ${input.fullName},
            ${input.role}, ${hashSandi(input.password)})`);
  if (error?.code === "23505") return fail<null>("Username itu sudah dipakai.", "ALREADY_EXISTS");
  if (error) return dbFail<null>(error, "Gagal membuat akun");
  return ok(null);
}

/** Ganti sandi akun mana pun (oleh superadmin). Mengembalikan username untuk log. */
export async function setSandiAkun(id: string, sandiBaru: string): Promise<Result<string>> {
  if (!isDbConfigured()) return fail<string>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await cobaSatu(sql<{ username: string | null }[]>`
    update admin_users set password_hash = ${hashSandi(sandiBaru)} where id = ${id} returning username`);
  if (error) return dbFail<string>(error, "Gagal mengganti sandi");
  if (!data) return fail<string>("Akun tidak ditemukan.", "NOT_FOUND");
  return ok(data.username ?? id);
}

/** Ganti sandi sendiri: sandi lama wajib cocok. */
export async function gantiSandiSendiri(
  id: string,
  sandiLama: string,
  sandiBaru: string,
): Promise<Result<null>> {
  if (!isDbConfigured()) return fail<null>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const { data, error } = await cobaSatu(sql<{ id: string }[]>`
    update admin_users set password_hash = ${hashSandi(sandiBaru)}
     where id = ${id} and password_hash = crypt(${sandiLama}, password_hash)
    returning id`);
  if (error) return dbFail<null>(error, "Gagal mengganti sandi");
  if (!data) return fail<null>("Sandi lama salah.", "INVALID_CREDENTIALS");
  return ok(null);
}

/**
 * Nonaktifkan atau aktifkan lagi sebuah akun. Akun nonaktif tidak bisa login
 * dan sesinya langsung ditolak getCurrentAdmin. Yang tidak boleh dinonaktifkan:
 * akun sendiri dan superadmin aktif terakhir. Kunci advisory membuat dua
 * superadmin yang saling menonaktifkan pada saat yang sama diproses bergantian.
 */
export async function setAkunAktif(
  id: string,
  aktif: boolean,
  olehId: string,
): Promise<Result<string>> {
  if (!isDbConfigured()) return fail<string>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  if (!aktif && id === olehId) {
    return fail<string>("Akun sendiri tidak bisa dinonaktifkan.", "VALIDATION");
  }
  const hasil = await coba(
    sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('drivetech:akun'))`;
      const [akun] = await tx<{ username: string | null; role: AdminRole }[]>`
        select username, role from admin_users where id = ${id}`;
      if (!akun) return fail<string>("Akun tidak ditemukan.", "NOT_FOUND");
      if (!aktif && akun.role === "superadmin") {
        const [{ sisa }] = await tx<{ sisa: number }[]>`
          select count(*)::int as sisa from admin_users
           where role = 'superadmin' and aktif and id <> ${id}`;
        if (sisa === 0) {
          return fail<string>("Superadmin aktif terakhir tidak bisa dinonaktifkan.", "VALIDATION");
        }
      }
      await tx`update admin_users set aktif = ${aktif} where id = ${id}`;
      return ok(akun.username ?? id);
    }),
  );
  if (hasil.error) return dbFail<string>(hasil.error, "Gagal mengubah status akun");
  return hasil.data;
}
