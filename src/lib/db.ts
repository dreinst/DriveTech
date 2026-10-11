import postgres from "postgres";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/db.ts hanya boleh dipakai di server.");
}

/** Apakah DATABASE_URL sudah diisi? Dicek pemanggil supaya halaman publik tetap jalan tanpa database. */
export function isDbConfigured(): boolean {
  return (process.env.DATABASE_URL ?? "").length > 0;
}

/**
 * Timestamp teks Postgres ("2026-10-11 03:00:00.12+00") jadi ISO 8601
 * ("2026-10-11T03:00:00.12+00:00"). Tanggal polos ("2026-11-07") dibiarkan apa adanya.
 */
const isoWaktu = (x: string) =>
  x.includes(" ") ? x.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00") : x;

function buatKlien() {
  return postgres(process.env.DATABASE_URL ?? "", {
    max: 5,
    idle_timeout: 30,
    connection: { TimeZone: "UTC" },
    onnotice: () => {},
    // Bentuk nilai disamakan dengan tipe baris di lib/types/database.ts:
    // tanggal dan waktu berupa string, numeric dan bigint berupa number.
    types: {
      date: {
        to: 1184,
        from: [1082, 1114, 1184],
        serialize: (x: string | Date) => (x instanceof Date ? x.toISOString() : x),
        parse: isoWaktu,
      },
      angka: { to: 1700, from: [1700, 20], serialize: String, parse: Number },
    },
  });
}

// Satu pool per proses; globalThis menjaga `next dev` tidak membuka pool baru tiap hot reload.
const wadah = globalThis as { __drivetechSql?: ReturnType<typeof buatKlien> };

/** Klien Postgres (tagged template). Koneksi baru dibuka saat query pertama. */
export const sql = (wadah.__drivetechSql ??= buatKlien());

/** Potongan SQL yang bisa disisipkan ke query lain. */
export type Potongan = postgres.PendingQuery<postgres.Row[]>;

type Galat = { message: string; code?: string };
type Hasil<T> = { data: T; error: null } | { data: null; error: Galat };

/** Jalankan query; galat database dikembalikan sebagai `error` (punya `.code` Postgres), tidak dilempar. */
export async function coba<T>(query: PromiseLike<T>): Promise<Hasil<T>> {
  try {
    return { data: await query, error: null };
  } catch (err) {
    const e = err as Galat;
    return { data: null, error: { message: e?.message ?? String(err), code: e?.code } };
  }
}

/** Seperti `coba`, tapi mengembalikan baris pertama saja (null kalau tidak ada). */
export async function cobaSatu<T>(query: PromiseLike<readonly T[]>): Promise<Hasil<T | null>> {
  const hasil = await coba(query);
  return hasil.error ? hasil : { data: hasil.data[0] ?? null, error: null };
}
