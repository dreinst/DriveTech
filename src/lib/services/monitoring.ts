import { fail, ok, type Result } from "@/lib/result";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { getSiteUrl } from "@/lib/site-url";
import type { MonitoringCheckRow } from "@/lib/types/database";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/monitoring.ts hanya boleh dipakai di server.");
}

/**
 * Layanan monitoring custom untuk /admin/monitoring (branch feature/monitoring).
 * Tidak memakai vendor eksternal (Sentry tetap opsional & terpisah untuk error
 * tracking) — semua sampel disimpan di public.monitoring_checks lewat
 * service_role (lihat migrasi 20260905090000_monitoring_checks.sql).
 *
 * Lima kategori yang diminta pemilik dipetakan begini:
 * - Health & Availability -> runChecks() menyondir DB + halaman publik kunci.
 * - Performance           -> latency_ms tiap sampel + agregasi p50/p95/rata-rata.
 * - Security              -> ringkasan percobaan login gagal (rate_limit_events
 *   kunci "login:*") + status env sensitif (service role, RLS aktif, dst).
 * - SLA & Usage           -> uptime % dari histori sampel + hitungan booking/
 *   purchase harian sebagai proksi traffic (tanpa nyimpan data pribadi baru).
 */

export type CheckType = "db" | "site" | "cron";
export type CheckStatus = "ok" | "degraded" | "down";

export type CheckTarget = {
  type: CheckType;
  target: string;
  /** Halaman yang disondir untuk type "site"; diabaikan untuk tipe lain. */
  path?: string;
};

/** Target tetap yang disondir tiap kali /api/cron/monitoring-check dipanggil. */
export const MONITORING_TARGETS: readonly CheckTarget[] = [
  { type: "db", target: "supabase" },
  { type: "site", target: "beranda", path: "/" },
  { type: "site", target: "denah", path: "/denah" },
  { type: "site", target: "katalog", path: "/katalog" },
];

const DEGRADED_LATENCY_MS = 1500;
const TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
  }
}

async function checkDb(): Promise<{ status: CheckStatus; latencyMs: number; detail?: string }> {
  const mulai = Date.now();
  if (!isServiceRoleConfigured()) {
    return { status: "down", latencyMs: Date.now() - mulai, detail: "Supabase belum dikonfigurasi." };
  }
  try {
    const supabase = createAdminSupabase();
    const { error } = await supabase.from("events").select("id", { count: "exact", head: true });
    const latencyMs = Date.now() - mulai;
    if (error) return { status: "down", latencyMs, detail: error.message.slice(0, 200) };
    return { status: latencyMs > DEGRADED_LATENCY_MS ? "degraded" : "ok", latencyMs };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - mulai,
      detail: error instanceof Error ? error.message.slice(0, 200) : "Galat tak dikenal.",
    };
  }
}

async function checkSite(path: string): Promise<{ status: CheckStatus; latencyMs: number; detail?: string }> {
  const url = `${getSiteUrl()}${path}`;
  const mulai = Date.now();
  try {
    const res = await withTimeout(
      fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }),
      TIMEOUT_MS,
    );
    const latencyMs = Date.now() - mulai;
    if (!res.ok) return { status: "down", latencyMs, detail: `HTTP ${res.status}` };
    return { status: latencyMs > DEGRADED_LATENCY_MS ? "degraded" : "ok", latencyMs };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - mulai,
      detail: error instanceof Error ? error.message.slice(0, 200) : "Galat tak dikenal.",
    };
  }
}

/** Jalankan seluruh MONITORING_TARGETS dan simpan hasilnya ke monitoring_checks. */
export async function runChecks(): Promise<Result<MonitoringCheckRow[]>> {
  if (!isServiceRoleConfigured()) {
    return fail("Supabase belum dikonfigurasi.", "NO_CONFIG");
  }

  const hasil = await Promise.all(
    MONITORING_TARGETS.map(async (t) => {
      const r = t.type === "db" ? await checkDb() : await checkSite(t.path ?? "/");
      return {
        check_type: t.type,
        target: t.target,
        status: r.status,
        latency_ms: r.latencyMs,
        detail: r.detail ?? null,
        meta: t.path ? { path: t.path } : {},
      };
    }),
  );

  try {
    const supabase = createAdminSupabase();
    const { data, error } = await supabase.from("monitoring_checks").insert(hasil).select("*");
    if (error) return fail(`Gagal menyimpan hasil monitoring: ${error.message}`, "DB_ERROR");
    return ok(data ?? []);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Gagal menjalankan monitoring.",
      "INTERNAL",
    );
  }
}

/* ------------------------------------------------------------------ */
/* Ringkasan untuk dashboard                                           */
/* ------------------------------------------------------------------ */

export type MonitoringSummaryRow = {
  target: string;
  checkType: CheckType;
  latestStatus: CheckStatus;
  latestLatencyMs: number | null;
  latestDetail: string | null;
  latestAt: string;
  uptimePct24h: number;
  avgLatencyMs24h: number | null;
  p95LatencyMs24h: number | null;
};

export type SecuritySummary = {
  failedLoginAttempts24h: number;
  serviceRoleConfigured: boolean;
  sentryConfigured: boolean;
  cronSecretConfigured: boolean;
};

export type UsageSummary = {
  bookingsToday: number;
  bookingsYesterday: number;
  purchasesToday: number;
  pendingVerification: number;
};

export type MonitoringDashboardData = {
  checks: MonitoringSummaryRow[];
  overallStatus: CheckStatus;
  security: SecuritySummary;
  usage: UsageSummary;
  lastRunAt: string | null;
  sampleCount24h: number;
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? null;
}

function worstStatus(a: CheckStatus, b: CheckStatus): CheckStatus {
  const rank: Record<CheckStatus, number> = { ok: 0, degraded: 1, down: 2 };
  return rank[b] > rank[a] ? b : a;
}

/** Ambil ringkasan 24 jam terakhir untuk dashboard /admin/monitoring. */
export async function getMonitoringDashboard(): Promise<Result<MonitoringDashboardData>> {
  if (!isServiceRoleConfigured()) {
    return fail("Supabase belum dikonfigurasi.", "NO_CONFIG");
  }

  try {
    const supabase = createAdminSupabase();
    const sejak = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: rows, error: checksErr }, { count: failedLoginCount }, bookingCounts, purchaseCount, pendingCount] =
      await Promise.all([
        supabase
          .from("monitoring_checks")
          .select("*")
          .gte("created_at", sejak)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("rate_limit_events")
          .select("id", { count: "exact", head: true })
          .like("key", "login:%")
          .gte("created_at", sejak),
        hitungBookingHarian(supabase),
        supabase
          .from("purchase_transactions")
          .select("id", { count: "exact", head: true })
          .gte("created_at", new Date().toISOString().slice(0, 10)),
        supabase
          .from("admin_fee_payments")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
      ]);

    if (checksErr) return fail(`Gagal mengambil histori monitoring: ${checksErr.message}`, "DB_ERROR");

    const byTarget = new Map<string, MonitoringCheckRow[]>();
    for (const row of rows ?? []) {
      const list = byTarget.get(row.target) ?? [];
      list.push(row);
      byTarget.set(row.target, list);
    }

    const checks: MonitoringSummaryRow[] = MONITORING_TARGETS.map((t) => {
      const list = byTarget.get(t.target) ?? [];
      const terbaru = list[0];
      const latencies = list
        .map((r) => r.latency_ms)
        .filter((n): n is number => typeof n === "number")
        .sort((a, b) => a - b);
      const okCount = list.filter((r) => r.status !== "down").length;
      const uptimePct = list.length > 0 ? Math.round((okCount / list.length) * 1000) / 10 : 100;
      const avg =
        latencies.length > 0
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : null;

      return {
        target: t.target,
        checkType: t.type,
        latestStatus: terbaru?.status ?? "down",
        latestLatencyMs: terbaru?.latency_ms ?? null,
        latestDetail: terbaru?.detail ?? null,
        latestAt: terbaru?.created_at ?? sejak,
        uptimePct24h: uptimePct,
        avgLatencyMs24h: avg,
        p95LatencyMs24h: percentile(latencies, 95),
      };
    });

    const overallStatus = checks.reduce<CheckStatus>((acc, c) => worstStatus(acc, c.latestStatus), "ok");

    return ok({
      checks,
      overallStatus,
      security: {
        failedLoginAttempts24h: failedLoginCount ?? 0,
        serviceRoleConfigured: isServiceRoleConfigured(),
        sentryConfigured: (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").length > 0,
        cronSecretConfigured: (process.env.CRON_SECRET ?? "").length > 0,
      },
      usage: {
        bookingsToday: bookingCounts.today,
        bookingsYesterday: bookingCounts.yesterday,
        purchasesToday: purchaseCount.count ?? 0,
        pendingVerification: pendingCount.count ?? 0,
      },
      lastRunAt: rows?.[0]?.created_at ?? null,
      sampleCount24h: rows?.length ?? 0,
    });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Gagal memuat data monitoring.",
      "INTERNAL",
    );
  }
}

async function hitungBookingHarian(
  supabase: ReturnType<typeof createAdminSupabase>,
): Promise<{ today: number; yesterday: number }> {
  const sekarang = new Date();
  const awalHariIni = new Date(sekarang);
  awalHariIni.setUTCHours(0, 0, 0, 0);
  const awalKemarin = new Date(awalHariIni);
  awalKemarin.setUTCDate(awalKemarin.getUTCDate() - 1);

  const [hariIni, kemarin] = await Promise.all([
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", awalHariIni.toISOString()),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", awalKemarin.toISOString())
      .lt("created_at", awalHariIni.toISOString()),
  ]);

  return { today: hariIni.count ?? 0, yesterday: kemarin.count ?? 0 };
}
