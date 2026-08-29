/**
 * Pembatas laju sederhana per-instance (fixed window, in-memory) untuk endpoint
 * API publik. KETERBATASAN SERVERLESS: hitungannya per instance Vercel, jadi ini
 * pengaman kasar terhadap spam/bot sederhana — bukan pengganti WAF. Pertahanan
 * bisnisnya ada di lapisan service (mis. MAX_PENDING_BOOKINGS_PER_PHONE).
 *
 * Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
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
