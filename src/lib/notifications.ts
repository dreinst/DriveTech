/**
 * Notifikasi keluar ke tenant lewat WhatsApp & email.
 *
 * WhatsApp punya TIGA mode, dipilih lewat env WA_PROVIDER:
 *
 *   outbox  (DEFAULT, keputusan pemilik 2026-09-03) — pesan TIDAK dikirim dari
 *           Vercel. Aplikasi menulis satu baris ke tabel public.notification_outbox
 *           (PostgREST + service_role), lalu worker di VPS
 *           (tools/vps/drivetech-wa-outbox.py, timer tiap menit) mengirimnya lewat
 *           `hermes send` = bot WhatsApp Hermes di NOMOR KANTOR 6282232999900.
 *           Jadi penyewa menerima kode booking dari nomor kantor. Butuh
 *           NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (sudah ada untuk
 *           aplikasi); tanpa keduanya jatuh ke dry-run.
 *   fonnte  — kirim langsung ke API Fonnte (https://fonnte.com):
 *     WA_API_TOKEN   token perangkat Fonnte (WAJIB agar WA aktif)
 *     WA_API_URL     endpoint kirim (default https://api.fonnte.com/send)
 *   off     — WhatsApp dimatikan (dicatat ke log saja).
 *
 * Selama kredensial mode yang dipilih belum ada, pengiriman berjalan DRY-RUN
 * (payload dicatat ke log, tidak ada panggilan keluar) sehingga aman dijalankan
 * di produksi maupun skrip tes.
 *
 *   Email (default provider Resend — https://resend.com):
 *     RESEND_API_KEY   api key Resend (WAJIB agar email aktif)
 *     NOTIF_EMAIL_FROM pengirim (default "Drive Tech <no-reply@drivetech.local>")
 *   Umum:
 *     WA_OVERRIDE_RECIPIENT  kalau diisi, SEMUA WA dialihkan ke nomor ini
 *                            (mode uji: pakai nomor dummy dulu sebelum go-live)
 *
 * Modul KHUSUS SERVER, TAPI sengaja SELF-CONTAINED (tanpa import next/server,
 * tanpa alias "@/…") supaya bisa dijalankan langsung oleh Node untuk pengetesan
 * (scripts/test-notifikasi.ts). Penjadwalan fire-and-forget lewat next `after()`
 * dilakukan dengan dynamic import ber-fallback agar tidak menggagalkan skrip.
 */

/** Nomor WhatsApp dummy untuk uji coba sebelum nomor asli disetel. */
export const DUMMY_WA_RECIPIENT = "6281200000000";

/** Batas tunggu panggilan provider (ms) — jangan menahan respons ke pengguna. */
const NOTIF_TIMEOUT_MS = 5000;

export type NotifChannelResult = {
  channel: "whatsapp" | "email";
  /** true = benar-benar terkirim ke provider; false = dry-run / gagal / antre. */
  delivered: boolean;
  /** true = tidak ada kredensial, jadi hanya dicatat (bukan kegagalan). */
  dryRun: boolean;
  /**
   * true = pesan masuk antrean notification_outbox (mode outbox); pengiriman
   * sesungguhnya dilakukan worker VPS beberapa detik-menit kemudian.
   */
  queued?: boolean;
  to: string;
  info?: string;
};

/** Metadata opsional yang ikut disimpan di antrean (untuk penelusuran panitia). */
export type WaMeta = {
  /** created | verified | rejected | cancelled | other */
  kind?: string;
  bookingCode?: string | null;
};

type WaProvider = "outbox" | "fonnte" | "off";

/** Mode WhatsApp dari env; nilai tak dikenal/kosong = outbox (bawaan). */
function waProvider(): WaProvider {
  const raw = (process.env.WA_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "fonnte" || raw === "off" || raw === "outbox") return raw;
  return "outbox";
}

/* ------------------------------------------------------------------ */
/* Util kecil (inline supaya modul tetap tanpa dependensi)             */
/* ------------------------------------------------------------------ */

function formatRupiah(n: number | null | undefined): string {
  const value = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Ubah nomor lokal jadi format internasional tanpa "+" untuk WhatsApp API
 * ("081234" -> "6281234"). Nomor yang sudah 62… dibiarkan; input kosong -> "".
 */
export function toWaNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

/**
 * Antrekan satu pesan WhatsApp ke tabel notification_outbox (mode outbox).
 * Dipanggil hanya dari sendWhatsApp; tidak pernah melempar.
 */
async function antrekanWhatsApp(
  tujuan: string,
  message: string,
  meta: WaMeta,
): Promise<NotifChannelResult> {
  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (baseUrl.length === 0 || serviceKey.length === 0) {
    console.info(`[notif][wa][outbox][dry-run] -> ${tujuan}\n${message}`);
    return { channel: "whatsapp", delivered: false, dryRun: true, to: tujuan, info: "outbox: Supabase belum dikonfigurasi" };
  }

  try {
    const response = await fetch(`${baseUrl}/rest/v1/notification_outbox`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        recipient: tujuan,
        body: message,
        kind: meta.kind ?? "other",
        booking_code: meta.bookingCode ?? null,
      }),
      signal: AbortSignal.timeout(NOTIF_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[notif][wa][outbox] Supabase membalas ${response.status}`);
      return { channel: "whatsapp", delivered: false, dryRun: false, queued: false, to: tujuan, info: `HTTP ${response.status}` };
    }
    return { channel: "whatsapp", delivered: false, dryRun: false, queued: true, to: tujuan };
  } catch (error) {
    console.warn("[notif][wa][outbox] gagal antre:", error);
    return { channel: "whatsapp", delivered: false, dryRun: false, queued: false, to: tujuan, info: "exception" };
  }
}

/**
 * Kirim satu pesan WhatsApp lewat mode yang aktif (lihat WA_PROVIDER di kepala
 * file). Mode outbox = antre ke database, dikirim worker VPS dari nomor kantor.
 * `meta` (jenis peristiwa + kode booking) ikut disimpan di antrean. Tidak pernah
 * melempar.
 */
export async function sendWhatsApp(
  to: string,
  message: string,
  meta: WaMeta = {},
): Promise<NotifChannelResult> {
  const tujuan = process.env.WA_OVERRIDE_RECIPIENT?.trim() || to;
  const provider = waProvider();

  if (tujuan.length === 0) {
    return { channel: "whatsapp", delivered: false, dryRun: false, to, info: "nomor kosong" };
  }
  if (provider === "off") {
    console.info(`[notif][wa][off] -> ${tujuan} (WA_PROVIDER=off, tidak dikirim)`);
    return { channel: "whatsapp", delivered: false, dryRun: true, to: tujuan, info: "WA_PROVIDER=off" };
  }
  if (provider === "outbox") {
    return antrekanWhatsApp(tujuan, message, meta);
  }

  // Mode fonnte: kirim langsung ke API provider.
  const token = process.env.WA_API_TOKEN?.trim() ?? "";
  const url = process.env.WA_API_URL?.trim() || "https://api.fonnte.com/send";
  if (token.length === 0) {
    console.info(`[notif][wa][dry-run] -> ${tujuan}\n${message}`);
    return { channel: "whatsapp", delivered: false, dryRun: true, to: tujuan };
  }

  try {
    const body = new URLSearchParams({ target: tujuan, message });
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(NOTIF_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[notif][wa] provider membalas ${response.status}`);
      return { channel: "whatsapp", delivered: false, dryRun: false, to: tujuan, info: `HTTP ${response.status}` };
    }
    return { channel: "whatsapp", delivered: true, dryRun: false, to: tujuan };
  } catch (error) {
    console.warn("[notif][wa] gagal kirim:", error);
    return { channel: "whatsapp", delivered: false, dryRun: false, to: tujuan, info: "exception" };
  }
}

/** Kirim satu email. Tidak pernah melempar. */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<NotifChannelResult> {
  const key = process.env.RESEND_API_KEY?.trim() ?? "";
  const from = process.env.NOTIF_EMAIL_FROM?.trim() || "Drive Tech <no-reply@drivetech.local>";

  if (!to || to.trim().length === 0) {
    return { channel: "email", delivered: false, dryRun: false, to: "", info: "email kosong" };
  }
  if (key.length === 0) {
    console.info(`[notif][email][dry-run] -> ${to} | ${subject}\n${text}`);
    return { channel: "email", delivered: false, dryRun: true, to };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(NOTIF_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[notif][email] provider membalas ${response.status}`);
      return { channel: "email", delivered: false, dryRun: false, to, info: `HTTP ${response.status}` };
    }
    return { channel: "email", delivered: true, dryRun: false, to };
  } catch (error) {
    console.warn("[notif][email] gagal kirim:", error);
    return { channel: "email", delivered: false, dryRun: false, to, info: "exception" };
  }
}

/* ------------------------------------------------------------------ */
/* Template pesan (murni)                                              */
/* ------------------------------------------------------------------ */

/** Data minimum untuk menyusun pesan notifikasi booking. */
export type BookingNotif = {
  tenantName: string;
  tenantPhone: string | null;
  tenantEmail?: string | null;
  bookingCode: string;
  slotName: string;
  zoneName: string;
  dates: string[];
  amount: number;
  /** Tenggat bayar (teks siap tampil, mis. "30 Agustus 2026, 14.05 WIB"). */
  deadlineText?: string | null;
  /** Alasan penolakan/pembatalan bila relevan. */
  reason?: string | null;
};

export type BookingNotifKind = "created" | "verified" | "rejected" | "cancelled";

const KONTAK_PANITIA = "Panitia Drive Tech";

/** Susun pesan WhatsApp untuk satu peristiwa booking. */
export function buildBookingWa(kind: BookingNotifKind, d: BookingNotif): string {
  const tanggal = d.dates.length > 0 ? d.dates.join(", ") : "-";
  const kepala = `Halo ${d.tenantName},`;
  const lapak = `Lapak ${d.slotName} (${d.zoneName})\nTanggal: ${tanggal}\nKode booking: *${d.bookingCode}*`;

  switch (kind) {
    case "created":
      return `${kepala}\nBooking Anda kami terima. ${lapak}\nBiaya admin: *${formatRupiah(d.amount)}*.\n${
        d.deadlineText
          ? `Bayar lewat QRIS lalu unggah bukti sebelum *${d.deadlineText}* agar slot tidak dilepas otomatis.`
          : "Bayar lewat QRIS lalu unggah bukti agar slot dikonfirmasi."
      }`;
    case "verified":
      return `${kepala}\nPembayaran Anda TERVERIFIKASI. Booking dikonfirmasi. ${lapak}\nTunjukkan kode booking saat registrasi ulang di lokasi. Sampai jumpa di pameran!`;
    case "rejected":
      return `${kepala}\nMohon maaf, bukti pembayaran Anda DITOLAK.${
        d.reason ? `\nAlasan: ${d.reason}.` : ""
      }\n${lapak}\n${
        d.deadlineText
          ? `Silakan unggah ulang bukti yang benar sebelum *${d.deadlineText}*.`
          : "Silakan unggah ulang bukti yang benar dari halaman status booking."
      }`;
    case "cancelled":
      return `${kepala}\nBooking Anda DIBATALKAN.${d.reason ? `\nAlasan: ${d.reason}.` : ""}\n${lapak}\nTanggal sewa telah dilepas. Anda bisa memesan slot lain kapan saja. — ${KONTAK_PANITIA}`;
  }
}

/** Judul + isi email untuk satu peristiwa booking. */
export function buildBookingEmail(kind: BookingNotifKind, d: BookingNotif): { subject: string; text: string } {
  const subjectByKind: Record<BookingNotifKind, string> = {
    created: `Booking ${d.bookingCode} diterima — selesaikan pembayaran`,
    verified: `Booking ${d.bookingCode} terkonfirmasi`,
    rejected: `Bukti pembayaran ${d.bookingCode} ditolak`,
    cancelled: `Booking ${d.bookingCode} dibatalkan`,
  };
  return { subject: subjectByKind[kind], text: buildBookingWa(kind, d) };
}

/* ------------------------------------------------------------------ */
/* Orkestrasi fire-and-forget                                          */
/* ------------------------------------------------------------------ */

/**
 * Jadwalkan promise agar selesai setelah respons terkirim (pakai next `after()`
 * bila tersedia). Di luar konteks Next (mis. skrip), `after` tidak ada / melempar
 * -> promise ditunggu langsung. Tidak pernah melempar ke pemanggil.
 */
async function jadwalkan(promise: Promise<unknown>): Promise<void> {
  try {
    const mod = (await import("next/server")) as { after?: (p: Promise<unknown>) => void };
    if (typeof mod.after === "function") {
      mod.after(promise);
      return;
    }
  } catch {
    // next/server tidak tersedia (skrip) — jatuh ke penantian langsung.
  }
  try {
    await promise;
  } catch {
    // sudah ditangani di transport; abaikan.
  }
}

/**
 * Kirim notifikasi satu peristiwa booking ke WhatsApp (dan email bila ada
 * alamatnya). Fire-and-forget: panggil dengan `void notifyBooking(...)` SETELAH
 * operasi utama sukses. Tidak pernah menggagalkan operasi utama.
 */
export async function notifyBooking(kind: BookingNotifKind, d: BookingNotif): Promise<void> {
  const kirim = (async () => {
    const waNumber = toWaNumber(d.tenantPhone);
    await sendWhatsApp(waNumber, buildBookingWa(kind, d), { kind, bookingCode: d.bookingCode });
    if (d.tenantEmail && d.tenantEmail.trim().length > 0) {
      const { subject, text } = buildBookingEmail(kind, d);
      await sendEmail(d.tenantEmail.trim(), subject, text);
    }
  })();
  await jadwalkan(kirim);
}
