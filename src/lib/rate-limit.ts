import { headers } from "next/headers";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";

/**
 * Dua lapis pembatas laju:
 *
 * 1. `checkRateLimit` — fixed window in-memory PER INSTANCE. Murah, menahan
 *    spam/bot sederhana di satu instance, tapi di serverless Vercel hitungannya
 *    tidak dibagi antar instance dan tidak menyentuh Server Action.
 * 2. `rateLimitShared` — BERSAMA lintas instance, dicatat di tabel
 *    public.rate_limit_events lewat fungsi public.rate_limit_hit (migrasi
 *    20260903121000_rate_limit_bersama.sql) memakai service_role. Ini yang
 *    menutup temuan audit 2026-09-03: form web (Server Action), API, pembatalan
 *    mandiri, dan login admin semua memakai kunci yang sama sehingga penyerang
 *    tidak bisa menggandakan jatah lewat jalur berbeda.
 *
 * Pertahanan bisnisnya tetap ada di lapisan service (mis.
 * MAX_PENDING_BOOKINGS_PER_PHONE). Modul KHUSUS SERVER (lihat catatan
 * "server-only" di services/slots.ts).
 */

if (typeof window !== "undefined") {
  throw new Error("src/lib/rate-limit.ts hanya boleh dipakai di server.");
}

type Jendela = { count: number; resetAt: number };

const jendelaPerKunci = new Map<string, Jendela>();

/** Pengaman memori: di atas ini entri kedaluwarsa dibersihkan (lalu di-reset total). */
const MAKS_ENTRI = 2000;

export type RateLimitResult = {
  allowed: boolean;
  /** Detik sampai jendela di-reset — isi header Retry-After saat ditolak. */
  retryAfterSeconds: number;
};

/** Catat satu permintaan untuk `key`; tolak kalau melebihi `limit` per `windowMs`. */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = jendelaPerKunci.get(key);

  if (!entry || entry.resetAt <= now) {
    if (jendelaPerKunci.size >= MAKS_ENTRI) {
      for (const [k, v] of jendelaPerKunci) {
        if (v.resetAt <= now) jendelaPerKunci.delete(k);
      }
      if (jendelaPerKunci.size >= MAKS_ENTRI) jendelaPerKunci.clear();
    }
    jendelaPerKunci.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** IP klien dari header proxy Vercel; "unknown" kalau tidak ada (mis. dev lokal). */
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** IP klien dari header proxy Vercel untuk SERVER ACTION (tanpa objek Request). */
export async function clientIpFromHeaders(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}

/** Pesan galat yang sudah pernah dicatat — supaya log tidak banjir saat DB bermasalah. */
const galatTercatat = new Set<string>();

function peringatkanSekali(pesan: string): void {
  if (galatTercatat.has(pesan)) return;
  galatTercatat.add(pesan);
  console.warn(`[rate-limit] ${pesan}`);
}

/**
 * Pembatas laju BERSAMA lintas instance: catat satu permintaan untuk `key`
 * dan kembalikan true bila masih di bawah `limit` per `windowSeconds`.
 *
 * FAIL-OPEN: kalau Supabase belum dikonfigurasi atau RPC galat, kembalikan
 * true — gangguan database tidak boleh mematikan seluruh alur booking; galat
 * dicatat sekali per pesan. Jangan pernah melempar.
 */
export async function rateLimitShared(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!isServiceRoleConfigured()) return true;
  try {
    const supabase = createAdminSupabase();
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      peringatkanSekali(`rate_limit_hit gagal: ${error.message}`);
      return true;
    }
    return data !== false;
  } catch (err) {
    peringatkanSekali(`rate_limit_hit exception: ${err instanceof Error ? err.message : String(err)}`);
    return true;
  }
}
