import { coba, cobaSatu, isDbConfigured, sql } from "@/lib/db";
import { fail, ok, type Result } from "@/lib/result";
import { dbFail, NO_CONFIG_MESSAGE } from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/log.ts hanya boleh dipakai di server.");
}

export type LogAdminRow = {
  id: number;
  waktu: string;
  username: string;
  aksi: string;
  rincian: string;
};

/** Jumlah entri yang ditampilkan dan diekspor di /drivetechadmin/log. */
export const BATAS_LOG = 300;

/**
 * Catat satu aksi admin ke tabel admin_log. Username diambil dari admin_users
 * saat itu juga, jadi log tetap terbaca walau namanya kelak diganti.
 * Tidak pernah melempar: log yang gagal dicatat tidak boleh menggagalkan
 * aksinya. JANGAN pernah menaruh sandi di `rincian`.
 */
export async function catatLog(adminId: string, aksi: string, rincian = ""): Promise<void> {
  try {
    await sql`
      insert into admin_log (admin_id, username, aksi, rincian)
      select u.id, coalesce(u.username, u.email), ${aksi}, ${rincian.slice(0, 300)}
        from admin_users u where u.id = ${adminId}`;
  } catch (err) {
    console.warn(`[log] gagal mencatat ${aksi}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Kode booking dari id booking atau id pembayaran, untuk rincian log; id apa adanya kalau tidak ketemu. */
export async function kodeBooking(id: string): Promise<string> {
  const { data } = await cobaSatu(sql<{ booking_code: string }[]>`
    select b.booking_code
      from bookings b left join admin_fee_payments p on p.booking_id = b.id
     where b.id = ${id} or p.id = ${id} limit 1`);
  return data?.booking_code ?? id;
}

/** Entri log terbaru (maksimal BATAS_LOG), bisa disaring teks pada username, aksi, atau rincian. */
export async function listLog(q?: string): Promise<Result<LogAdminRow[]>> {
  if (!isDbConfigured()) return fail<LogAdminRow[]>(NO_CONFIG_MESSAGE, "NO_CONFIG");
  const kata = q?.trim().toLowerCase() ?? "";
  const { data, error } = await coba(sql<LogAdminRow[]>`
    select id, waktu, username, aksi, rincian from admin_log
     where ${kata ? sql`strpos(lower(username || ' ' || aksi || ' ' || rincian), ${kata}) > 0` : sql`true`}
     order by waktu desc, id desc limit ${BATAS_LOG}`);
  if (error) return dbFail<LogAdminRow[]>(error, "Gagal memuat log aktivitas");
  return ok([...data]);
}
