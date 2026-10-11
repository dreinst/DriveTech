import { createHash, randomInt } from "node:crypto";

import { bantuanEmailText, sendEmailNow } from "@/lib/notifications";
import { rateLimitShared } from "@/lib/rate-limit";
import { fail, ok, type Result } from "@/lib/result";
import { coba, isDbConfigured, sql } from "@/lib/db";
import { dbFail, NO_CONFIG_MESSAGE } from "./slots";

// Modul KHUSUS SERVER (lihat catatan "server-only" di services/slots.ts).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/otp.ts hanya boleh dipakai di server.");
}

/**
 * Verifikasi email lewat kode 6 digit (OTP) — pengaman anti-penimbunan slot
 * (keputusan pemilik 2026-09-03): booking publik hanya bisa dikunci bila
 * penyewa membuktikan ia menerima kode di alamat email yang diisi. Email juga
 * jalur pengiriman kode booking, jadi alamat yang salah langsung ketahuan.
 *
 * Kode tidak pernah disimpan mentah: hanya sha256(email:kode:pepper). Pepper =
 * env OTP_PEPPER, fallback AUTH_SECRET (rahasia server yang sudah ada). Masa berlaku 10 menit, maksimal 5 percobaan per kode.
 */

const MASA_BERLAKU_MENIT = 10;
const MAKS_PERCOBAAN = 5;

function normalisasiEmail(email: string): string {
  return email.trim().toLowerCase();
}

function pepper(): string {
  return (process.env.OTP_PEPPER ?? "").trim() || (process.env.AUTH_SECRET ?? "");
}

function hashKode(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}:${pepper()}`).digest("hex");
}

/** Kode 6 digit acak kriptografis, selalu dengan nol di depan bila perlu. */
function buatKode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type RequestEmailCodeOut = {
  /** Kode mentah HANYA di luar produksi saat email dry-run (untuk uji lokal). */
  devCode?: string;
};

/**
 * Buat + kirim kode verifikasi ke `email`. Dibatasi 3 kode / 10 menit per email
 * dan 10 / 10 menit per IP (pembatas bersama lintas instance).
 */
export async function requestEmailCode(
  email: string,
  ip: string,
): Promise<Result<RequestEmailCodeOut>> {
  if (!isDbConfigured()) return fail<RequestEmailCodeOut>(NO_CONFIG_MESSAGE, "NO_CONFIG");

  const alamat = normalisasiEmail(email);
  if (!(await rateLimitShared(`otp:email:${alamat}`, 3, 600))) {
    return fail<RequestEmailCodeOut>(
      "Kode sudah dikirim beberapa kali ke email ini. Cek kotak masuk/spam, atau coba lagi 10 menit lagi.",
      "RATE_LIMITED",
    );
  }
  if (!(await rateLimitShared(`otp:ip:${ip}`, 10, 600))) {
    return fail<RequestEmailCodeOut>("Terlalu banyak permintaan kode. Coba lagi 10 menit lagi.", "RATE_LIMITED");
  }
  // Audit 2026-09-03: cegah endpoint ini dipakai "mengganggu" kotak masuk orang
  // lain dan menguras kuota harian Gmail pengirim — batas harian per alamat dan
  // batas global pengiriman kode per hari.
  if (!(await rateLimitShared(`otp:email:${alamat}:24h`, 6, 86_400))) {
    return fail<RequestEmailCodeOut>(
      "Batas permintaan kode harian untuk email ini tercapai. Hubungi panitia lewat WhatsApp bila perlu bantuan.",
      "RATE_LIMITED",
    );
  }
  if (!(await rateLimitShared("otp:global:24h", 300, 86_400))) {
    return fail<RequestEmailCodeOut>(
      "Pengiriman kode verifikasi sedang penuh. Coba lagi beberapa saat lagi atau hubungi panitia lewat WhatsApp.",
      "RATE_LIMITED",
    );
  }

  const kode = buatKode();
  const kedaluwarsa = new Date(Date.now() + MASA_BERLAKU_MENIT * 60 * 1000).toISOString();
  const inserted = await coba(sql`
    insert into email_verifications ${sql({
      email: alamat,
      code_hash: hashKode(alamat, kode),
      expires_at: kedaluwarsa,
    })}`);
  if (inserted.error) {
    return dbFail<RequestEmailCodeOut>(inserted.error, "Gagal menyimpan kode verifikasi");
  }

  const hasil = await sendEmailNow(
    alamat,
    // Kode sengaja TIDAK di subjek (audit 2026-09-03): pratinjau notifikasi HP
    // jangan menampilkan kode tanpa membuka email.
    "Kode verifikasi Drive Tech",
    [
      `Kode verifikasi Drive Tech Anda: ${kode}`,
      "",
      `Masukkan kode ini di formulir booking. Berlaku ${MASA_BERLAKU_MENIT} menit.`,
      "Kalau Anda tidak merasa memesan lapak Drive Tech, abaikan email ini.",
      "",
      ...bantuanEmailText(),
    ].join("\n"),
  );

  if (hasil.dryRun) {
    // Tanpa SMTP: di luar produksi kembalikan kodenya supaya alur bisa diuji;
    // di produksi jangan pernah bocorkan kode.
    if (process.env.NODE_ENV !== "production") return ok<RequestEmailCodeOut>({ devCode: kode });
    return fail<RequestEmailCodeOut>(
      "Pengiriman email belum dikonfigurasi. Hubungi panitia lewat WhatsApp 0822-3299-9900.",
      "EMAIL_NOT_CONFIGURED",
    );
  }
  if (!hasil.delivered) {
    return fail<RequestEmailCodeOut>(
      "Email verifikasi gagal dikirim. Periksa alamatnya lalu coba lagi, atau hubungi WhatsApp 0822-3299-9900.",
      "EMAIL_FAILED",
    );
  }
  return ok<RequestEmailCodeOut>({});
}

/** Berapa kode terakhir (belum dipakai, belum kedaluwarsa) yang masih diterima. */
const KODE_AKTIF_DIPERIKSA = 3;

/**
 * Cocokkan kode dengan kode-kode AKTIF terbaru milik email (belum dipakai &
 * belum kedaluwarsa; hingga 3 kode terakhir, supaya penyewa yang menekan
 * "kirim kode" dua kali tidak ditolak hanya karena membaca email pertama).
 * Cocok → verified_at diisi dan id record dikembalikan; TIDAK langsung
 * dianggap terpakai — pemanggil memanggil consumeEmailCode() setelah booking
 * benar-benar tersimpan, sehingga kode tidak hangus bila booking gagal karena
 * hal lain (tanggal baru terisi, dsb). Gagal → attempts+1 pada kode terbaru.
 * Mengembalikan null bila tidak cocok. Tidak pernah melempar.
 */
export async function verifyEmailCode(email: string, code: string): Promise<string | null> {
  if (!isDbConfigured()) return null;
  const alamat = normalisasiEmail(email);
  const kode = code.trim();
  if (!/^\d{6}$/.test(kode)) return null;

  try {
    const rows = await sql<{ id: string; code_hash: string; attempts: number }[]>`
      select id, code_hash, attempts from email_verifications
       where email = ${alamat} and used_at is null and expires_at > now()
       order by created_at desc limit ${KODE_AKTIF_DIPERIKSA}`;
    if (rows.length === 0) return null;

    const hash = hashKode(alamat, kode);
    const cocok = rows.find((r) => r.attempts < MAKS_PERCOBAAN && r.code_hash === hash);

    if (!cocok) {
      await sql`update email_verifications set attempts = attempts + 1 where id = ${rows[0].id}`;
      return null;
    }

    await sql`
      update email_verifications set verified_at = now()
       where id = ${cocok.id} and verified_at is null`;
    return cocok.id;
  } catch {
    return null;
  }
}

/**
 * Tandai kode sebagai TERPAKAI (sekali pakai) — dipanggil setelah booking
 * tersimpan. Tidak pernah melempar; kegagalan hanya berarti kode itu masih
 * bisa dipakai sampai kedaluwarsa (10 menit).
 */
export async function consumeEmailCode(id: string): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    await sql`update email_verifications set used_at = now() where id = ${id} and used_at is null`;
  } catch {
    /* diabaikan, lihat catatan di atas */
  }
}
