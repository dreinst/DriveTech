import { fail, ok, type Result } from "@/lib/result";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { dbFail, NO_CONFIG_MESSAGE, tanggalHariIniJakarta, type PgError } from "./slots";

/**
 * Pencatatan scan QR promosi (tabel public.qr_scans, migrasi 20260904100000).
 * Satu baris per kunjungan /go?dari=<media>; tanpa IP atau data pribadi.
 * Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
 */
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/qr.ts hanya boleh dipakai di server.");
}

export type QrPlatform = "android" | "ios" | "lain";

/** Platform kasar dari User-Agent — cukup untuk tahu proporsi Android vs iPhone. */
export function platformDariUa(ua: string | null | undefined): QrPlatform {
  if (!ua) return "lain";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "lain";
}

/**
 * Pengambil pratinjau tautan (WhatsApp/Telegram/Facebook membuka URL untuk
 * membuat kartu preview), crawler, dan alat uji — bukan manusia yang men-scan.
 * UA kosong juga dianggap bot: browser sungguhan selalu mengirimkannya.
 */
const BOT_UA_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|skype|twitterbot|linkedin|headless|lighthouse|python-requests|curl\/|wget\//i;

export function adalahBot(ua: string | null | undefined): boolean {
  return !ua || BOT_UA_RE.test(ua);
}

/** Pesan galat yang sudah pernah dicatat — supaya log tidak banjir saat DB bermasalah. */
const galatTercatat = new Set<string>();

function peringatkanSekali(pesan: string): void {
  if (galatTercatat.has(pesan)) return;
  galatTercatat.add(pesan);
  console.warn(`[qr-scan] ${pesan}`);
}

/**
 * Catat satu scan. FAIL-OPEN dan tidak pernah melempar: gangguan database
 * tidak boleh menghalangi pengunjung masuk ke situs.
 */
export async function catatScanQr(input: { media: string; platform: QrPlatform }): Promise<void> {
  if (!isServiceRoleConfigured()) return;
  try {
    const supabase = createAdminSupabase();
    const { error } = await supabase
      .from("qr_scans")
      .insert({ media: input.media, platform: input.platform });
    if (error) peringatkanSekali(`insert qr_scans gagal: ${error.message}`);
  } catch (err) {
    peringatkanSekali(`insert qr_scans exception: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export type RingkasanScanMedia = {
  media: string;
  total: number;
  /** 7 hari terakhir termasuk hari ini (WIB). */
  tujuhHari: number;
  hariIni: number;
  android: number;
  ios: number;
  /** ISO waktu scan terakhir. */
  terakhir: string | null;
};

export type RingkasanScanQr = {
  total: number;
  tujuhHari: number;
  hariIni: number;
  perMedia: RingkasanScanMedia[];
};

/** Batas baris yang diagregasi — jauh di atas skala satu musim pameran. */
const MAKS_BARIS = 50_000;

/** Statistik scan per media untuk panel admin, dihitung di server dari baris mentah. */
export async function ringkasanScanQr(): Promise<Result<RingkasanScanQr>> {
  if (!isServiceRoleConfigured()) return fail<RingkasanScanQr>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("qr_scans")
    .select("media, platform, created_at")
    .order("created_at", { ascending: false })
    .limit(MAKS_BARIS);

  if (error) return dbFail<RingkasanScanQr>(error as PgError, "Gagal memuat statistik scan QR");

  // Batas hari mengikuti WIB, sama dengan tanggal gelaran.
  const awalHariIni = new Date(`${tanggalHariIniJakarta()}T00:00:00+07:00`).getTime();
  const awalTujuhHari = awalHariIni - 6 * 86_400_000;

  const perMedia = new Map<string, RingkasanScanMedia>();
  let total = 0;
  let tujuhHari = 0;
  let hariIni = 0;

  for (const row of data ?? []) {
    const waktu = new Date(row.created_at).getTime();
    const entri = perMedia.get(row.media) ?? {
      media: row.media,
      total: 0,
      tujuhHari: 0,
      hariIni: 0,
      android: 0,
      ios: 0,
      terakhir: null,
    };
    entri.total += 1;
    total += 1;
    if (waktu >= awalTujuhHari) {
      entri.tujuhHari += 1;
      tujuhHari += 1;
    }
    if (waktu >= awalHariIni) {
      entri.hariIni += 1;
      hariIni += 1;
    }
    if (row.platform === "android") entri.android += 1;
    else if (row.platform === "ios") entri.ios += 1;
    // Baris sudah urut terbaru dulu: entri pertama per media = scan terakhir.
    if (entri.terakhir === null) entri.terakhir = row.created_at;
    perMedia.set(row.media, entri);
  }

  const daftar = Array.from(perMedia.values()).sort((a, b) => b.total - a.total);
  return ok({ total, tujuhHari, hariIni, perMedia: daftar });
}
