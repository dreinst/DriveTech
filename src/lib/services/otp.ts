import { createHash, randomInt } from "node:crypto";

import { sendEmailNow } from "@/lib/notifications";
import { rateLimitShared } from "@/lib/rate-limit";
import { fail, ok, type Result } from "@/lib/result";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { dbFail, NO_CONFIG_MESSAGE, type PgError } from "./slots";

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
 * env OTP_PEPPER, fallback SUPABASE_SERVICE_ROLE_KEY (rahasia server yang
 * sudah ada). Masa berlaku 10 menit, maksimal 5 percobaan per kode.
 */

const MASA_BERLAKU_MENIT = 10;
const MAKS_PERCOBAAN = 5;

function normalisasiEmail(email: string): string {
  return email.trim().toLowerCase();
}

function pepper(): string {
  return (process.env.OTP_PEPPER ?? "").trim() || (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
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
  if (!isServiceRoleConfigured()) return fail<RequestEmailCodeOut>(NO_CONFIG_MESSAGE, "NO_CONFIG");

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

  const kode = buatKode();
  const supabase = createAdminSupabase();
  const kedaluwarsa = new Date(Date.now() + MASA_BERLAKU_MENIT * 60 * 1000).toISOString();
  const inserted = await supabase.from("email_verifications").insert({
    email: alamat,
    code_hash: hashKode(alamat, kode),
    expires_at: kedaluwarsa,
  });
  if (inserted.error) {
    return dbFail<RequestEmailCodeOut>(inserted.error as PgError, "Gagal menyimpan kode verifikasi");
  }

  const hasil = await sendEmailNow(
    alamat,
    `Kode verifikasi Drive Tech: ${kode}`,
    [
      `Kode verifikasi Drive Tech Anda: ${kode}`,
      "",
      `Masukkan kode ini di formulir booking. Berlaku ${MASA_BERLAKU_MENIT} menit.`,
      "Kalau Anda tidak merasa memesan lapak Drive Tech, abaikan email ini.",
      "",
      "Butuh bantuan? WhatsApp 0822-2855-5254 — Panitia Drive Tech",
      `Klik untuk chat langsung: https://wa.me/6282228555254?text=${encodeURIComponent("Halo, saya mengalami kendala saat pemesanan slot")}`,
    ].join("\n"),
  );

  if (hasil.dryRun) {
    // Tanpa SMTP: di luar produksi kembalikan kodenya supaya alur bisa diuji;
    // di produksi jangan pernah bocorkan kode.
    if (process.env.NODE_ENV !== "production") return ok<RequestEmailCodeOut>({ devCode: kode });
    return fail<RequestEmailCodeOut>(
      "Pengiriman email belum dikonfigurasi. Hubungi panitia lewat WhatsApp 0822-2855-5254.",
      "EMAIL_NOT_CONFIGURED",
    );
  }
  if (!hasil.delivered) {
    return fail<RequestEmailCodeOut>(
      "Email verifikasi gagal dikirim. Periksa alamatnya lalu coba lagi, atau hubungi WhatsApp 0822-2855-5254.",
      "EMAIL_FAILED",
    );
  }
  return ok<RequestEmailCodeOut>({});
}

/**
 * Cocokkan kode dengan record TERBARU yang belum dipakai & belum kedaluwarsa.
 * Sukses → verified_at & used_at diisi (kode sekali pakai); gagal → attempts+1.
 * Mengembalikan true hanya bila cocok. Tidak pernah melempar.
 */
export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  if (!isServiceRoleConfigured()) return false;
  const alamat = normalisasiEmail(email);
  const kode = code.trim();
  if (!/^\d{6}$/.test(kode)) return false;

  try {
    const supabase = createAdminSupabase();
    const now = new Date().toISOString();
    const terbaru = await supabase
      .from("email_verifications")
      .select("id, code_hash, attempts, expires_at")
      .eq("email", alamat)
      .is("used_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (terbaru.error || !terbaru.data) return false;

    const row = terbaru.data as { id: string; code_hash: string; attempts: number; expires_at: string };
    if (row.attempts >= MAKS_PERCOBAAN) return false;

    if (row.code_hash !== hashKode(alamat, kode)) {
      await supabase
        .from("email_verifications")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      return false;
    }

    const dipakai = await supabase
      .from("email_verifications")
      .update({ verified_at: now, used_at: now })
      .eq("id", row.id)
      .is("used_at", null) // sekali pakai: tolak balapan dua submit dengan kode sama
      .select("id")
      .maybeSingle();
    return Boolean(dipakai.data) && !dipakai.error;
  } catch {
    return false;
  }
}
