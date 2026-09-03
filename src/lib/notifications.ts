/**
 * Notifikasi keluar ke tenant: EMAIL (jalur utama) dan WhatsApp (opsional).
 *
 * Keputusan pemilik 2026-09-03: nomor WhatsApp kantor diblokir, jadi SEMUA kode
 * booking & notifikasi penyewa dikirim lewat EMAIL. WhatsApp 0822-2855-5254
 * hanya untuk bantuan bila penyewa bingung (disebut di badan email).
 *
 *   Email — urutan pemilihan transport:
 *     1. SMTP generik (nodemailer): SMTP_HOST, SMTP_PORT (465 = TLS langsung,
 *        selain itu STARTTLS), SMTP_USER, SMTP_PASS, SMTP_FROM
 *        (mis. "Drive Tech <alamat@gmail.com>"; fallback NOTIF_EMAIL_FROM).
 *     2. Resend (https://resend.com): RESEND_API_KEY (+ NOTIF_EMAIL_FROM).
 *     3. Tanpa keduanya → DRY-RUN (dicatat ke log, tidak ada panggilan keluar).
 *     Batas tunggu 8 detik. `sendEmailNow()` dipakai alur OTP (menunggu hasil);
 *     `notifyBooking()` fire-and-forget.
 *
 *   WhatsApp punya TIGA mode lewat env WA_PROVIDER (DEFAULT kini `off`):
 *     off     — tidak dikirim (dicatat ke log saja).
 *     outbox  — pesan ditulis ke tabel public.notification_outbox (PostgREST +
 *               service_role) lalu dikirim worker VPS (tools/vps/
 *               drivetech-wa-outbox.py) lewat `hermes send` bila ada nomor bot.
 *     fonnte  — kirim langsung ke API Fonnte: WA_API_TOKEN (wajib), WA_API_URL.
 *     WA_OVERRIDE_RECIPIENT mengalihkan SEMUA WA ke satu nomor (mode uji).
 *
 * Modul KHUSUS SERVER, TAPI sengaja SELF-CONTAINED (tanpa import next/server,
 * tanpa alias "@/…") supaya bisa dijalankan langsung oleh Node untuk pengetesan
 * (scripts/test-notifikasi.ts). Penjadwalan fire-and-forget lewat next `after()`
 * dilakukan dengan dynamic import ber-fallback agar tidak menggagalkan skrip.
 */
import nodemailer from "nodemailer";

/** Nomor WhatsApp dummy untuk uji coba sebelum nomor asli disetel. */
export const DUMMY_WA_RECIPIENT = "6281200000000";

/** Batas tunggu panggilan provider WhatsApp (ms) — jangan menahan respons ke pengguna. */
const NOTIF_TIMEOUT_MS = 5000;
/** Batas tunggu pengiriman email (ms): OTP menunggu hasil ini, jadi tetap singkat. */
const EMAIL_TIMEOUT_MS = 8000;
/** Nomor bantuan panitia yang disebut di setiap email (keputusan pemilik 2026-09-03). */
const WA_BANTUAN = "0822-2855-5254";
/** Tautan bantuan standar (keputusan pemilik 2026-09-03), tanpa import @/ agar modul tetap mandiri. */
const WA_BANTUAN_LINK = `https://wa.me/6282228555254?text=${encodeURIComponent("Halo, saya mengalami kendala saat pemesanan slot")}`;

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

/** Mode WhatsApp dari env; nilai tak dikenal/kosong = off (bawaan sejak 2026-09-03). */
function waProvider(): WaProvider {
  const raw = (process.env.WA_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "fonnte" || raw === "off" || raw === "outbox") return raw;
  return "off";
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

/**
 * True bila ada transport email sungguhan (SMTP lengkap atau Resend). Dipakai
 * alur booking untuk memutuskan apakah OTP email DIWAJIBKAN: tanpa transport,
 * kode tidak mungkin sampai ke penyewa, jadi verifikasi dilewati (email tetap
 * wajib diisi) — keputusan pemilik 2026-09-03 agar rilis tidak tertahan
 * kredensial SMTP.
 */
export function isEmailConfigured(): boolean {
  const smtpLengkap =
    (process.env.SMTP_HOST ?? "").trim().length > 0 &&
    (process.env.SMTP_USER ?? "").trim().length > 0 &&
    (process.env.SMTP_PASS ?? "").length > 0;
  const resend = (process.env.RESEND_API_KEY ?? "").trim().length > 0;
  return smtpLengkap || resend;
}

type SmtpConfig = { host: string; port: number; user: string; pass: string; from: string };

/** Konfigurasi SMTP dari env; null bila SMTP_HOST kosong. */
function smtpConfig(): SmtpConfig | null {
  const host = (process.env.SMTP_HOST ?? "").trim();
  if (host.length === 0) return null;
  const port = Number.parseInt((process.env.SMTP_PORT ?? "465").trim(), 10) || 465;
  const from =
    (process.env.SMTP_FROM ?? "").trim() ||
    (process.env.NOTIF_EMAIL_FROM ?? "").trim() ||
    "Drive Tech <no-reply@drivetech.local>";
  return {
    host,
    port,
    user: (process.env.SMTP_USER ?? "").trim(),
    pass: process.env.SMTP_PASS ?? "",
    from,
  };
}

/** Kirim lewat SMTP (nodemailer). Dipanggil sendEmail; tidak pernah melempar. */
async function kirimSmtp(cfg: SmtpConfig, to: string, subject: string, text: string): Promise<NotifChannelResult> {
  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: cfg.user.length > 0 ? { user: cfg.user, pass: cfg.pass } : undefined,
      connectionTimeout: EMAIL_TIMEOUT_MS,
      greetingTimeout: EMAIL_TIMEOUT_MS,
      socketTimeout: EMAIL_TIMEOUT_MS,
    });
    await transport.sendMail({ from: cfg.from, to, subject, text });
    return { channel: "email", delivered: true, dryRun: false, to };
  } catch (error) {
    console.warn("[notif][email][smtp] gagal kirim:", error instanceof Error ? error.message : error);
    return { channel: "email", delivered: false, dryRun: false, to, info: "smtp" };
  }
}

/** Kirim lewat Resend. Dipanggil sendEmail; tidak pernah melempar. */
async function kirimResend(key: string, to: string, subject: string, text: string): Promise<NotifChannelResult> {
  const from = process.env.NOTIF_EMAIL_FROM?.trim() || "Drive Tech <no-reply@drivetech.local>";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[notif][email][resend] provider membalas ${response.status}`);
      return { channel: "email", delivered: false, dryRun: false, to, info: `HTTP ${response.status}` };
    }
    return { channel: "email", delivered: true, dryRun: false, to };
  } catch (error) {
    console.warn("[notif][email][resend] gagal kirim:", error);
    return { channel: "email", delivered: false, dryRun: false, to, info: "exception" };
  }
}

/**
 * Kirim satu email: SMTP bila SMTP_HOST ada, lalu Resend bila RESEND_API_KEY
 * ada, selain itu dry-run. Tidak pernah melempar.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<NotifChannelResult> {
  const tujuan = (to ?? "").trim();
  if (tujuan.length === 0) {
    return { channel: "email", delivered: false, dryRun: false, to: "", info: "email kosong" };
  }

  const smtp = smtpConfig();
  if (smtp) return kirimSmtp(smtp, tujuan, subject, text);

  const key = process.env.RESEND_API_KEY?.trim() ?? "";
  if (key.length > 0) return kirimResend(key, tujuan, subject, text);

  console.info(`[notif][email][dry-run] -> ${tujuan} | ${subject}\n${text}`);
  return { channel: "email", delivered: false, dryRun: true, to: tujuan };
}

/**
 * Varian SINKRON untuk alur yang harus tahu hasilnya sebelum membalas pengguna
 * (mis. kode verifikasi OTP). Sama dengan sendEmail — dinamai eksplisit supaya
 * pemanggil tidak keliru memakai jalur fire-and-forget.
 */
export async function sendEmailNow(
  to: string,
  subject: string,
  text: string,
): Promise<NotifChannelResult> {
  return sendEmail(to, subject, text);
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
  /** Tautan halaman status booking (absolut), disertakan di email. */
  statusUrl?: string | null;
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

/**
 * Judul + isi email untuk satu peristiwa booking. Email adalah jalur UTAMA kode
 * booking, jadi kodenya ditulis tegas, disertai tautan status dan nomor bantuan.
 */
export function buildBookingEmail(kind: BookingNotifKind, d: BookingNotif): { subject: string; text: string } {
  const subjectByKind: Record<BookingNotifKind, string> = {
    created: `Kode booking ${d.bookingCode} — selesaikan pembayaran`,
    verified: `Booking ${d.bookingCode} terkonfirmasi`,
    rejected: `Bukti pembayaran ${d.bookingCode} ditolak`,
    cancelled: `Booking ${d.bookingCode} dibatalkan`,
  };
  const tanggal = d.dates.length > 0 ? d.dates.join(", ") : "-";
  const badan: Record<BookingNotifKind, string> = {
    created: `Booking Anda kami terima.\nBiaya admin: ${formatRupiah(d.amount)}.\n${
      d.deadlineText
        ? `Bayar lewat QRIS lalu unggah bukti sebelum ${d.deadlineText} agar slot tidak dilepas otomatis.`
        : "Bayar lewat QRIS lalu unggah bukti agar slot dikonfirmasi."
    }`,
    verified:
      "Pembayaran Anda TERVERIFIKASI dan booking dikonfirmasi. Tunjukkan kode booking (atau QR di halaman status) saat registrasi ulang di lokasi. Sampai jumpa di pameran!",
    rejected: `Mohon maaf, bukti pembayaran Anda DITOLAK.${d.reason ? `\nAlasan: ${d.reason}.` : ""}\n${
      d.deadlineText
        ? `Silakan unggah ulang bukti yang benar sebelum ${d.deadlineText}.`
        : "Silakan unggah ulang bukti yang benar dari halaman status booking."
    }`,
    cancelled: `Booking Anda DIBATALKAN.${d.reason ? `\nAlasan: ${d.reason}.` : ""}\nTanggal sewa telah dilepas. Anda bisa memesan slot lain kapan saja.`,
  };
  const text = [
    `Halo ${d.tenantName},`,
    "",
    `KODE BOOKING ANDA: ${d.bookingCode}`,
    `Lapak: ${d.slotName} (${d.zoneName})`,
    `Tanggal: ${tanggal}`,
    "",
    badan[kind],
    d.statusUrl ? `\nCek status booking: ${d.statusUrl}` : "",
    "",
    `Butuh bantuan verifikasi kode booking? WhatsApp ${WA_BANTUAN}`,
    `Klik untuk chat langsung: ${WA_BANTUAN_LINK}`,
    `— ${KONTAK_PANITIA}`,
  ]
    .filter((baris) => baris !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { subject: subjectByKind[kind], text };
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
 * Kirim notifikasi satu peristiwa booking: EMAIL (jalur utama, wajib ada
 * alamatnya) lalu WhatsApp bila WA_PROVIDER aktif. Fire-and-forget: panggil
 * dengan `void notifyBooking(...)` SETELAH operasi utama sukses. Tidak pernah
 * menggagalkan operasi utama.
 */
export async function notifyBooking(kind: BookingNotifKind, d: BookingNotif): Promise<void> {
  const kirim = (async () => {
    if (d.tenantEmail && d.tenantEmail.trim().length > 0) {
      const { subject, text } = buildBookingEmail(kind, d);
      await sendEmail(d.tenantEmail.trim(), subject, text);
    } else {
      console.warn(`[notif][email] booking ${d.bookingCode} tanpa alamat email — kode booking tidak terkirim`);
    }
    if (waProvider() !== "off") {
      const waNumber = toWaNumber(d.tenantPhone);
      await sendWhatsApp(waNumber, buildBookingWa(kind, d), { kind, bookingCode: d.bookingCode });
    }
  })();
  await jadwalkan(kirim);
}
