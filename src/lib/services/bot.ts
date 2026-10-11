import { timingSafeEqual } from "node:crypto";

import { coba, cobaSatu, sql } from "@/lib/db";
import { totalBayar } from "@/lib/domain/harga";
import { batasPembayaran } from "@/lib/domain/tenggat";
import { fail, ok, type Result } from "@/lib/result";
import { getBookingDetail } from "@/lib/services/booking";
import { getSiteUrl } from "@/lib/site-url";
import type { BookingDetail } from "@/lib/types/database";
import { formatRupiah, formatTanggal, formatTanggalWaktu, slotDisplayName } from "@/lib/utils";

// Modul KHUSUS SERVER: dipakai API /api/bot/* yang dipanggil bot WhatsApp kantor (bot yang sama dengan KUWERA 5K).
if (typeof window !== "undefined") {
  throw new Error("src/lib/services/bot.ts hanya boleh dipakai di server.");
}

export const BOOKING_CODE_RE = /^BK-[0-9A-F]{10}$/;

/** Bot mengirim header x-bot-key = BOT_API_KEY. Tanpa env, semua permintaan ditolak (fail closed). */
export function botAuthorized(request: Request): boolean {
  const kunci = process.env.BOT_API_KEY ?? "";
  const kiriman = request.headers.get("x-bot-key") ?? "";
  if (kunci.length < 16 || kiriman.length !== kunci.length) return false;
  return timingSafeEqual(Buffer.from(kiriman), Buffer.from(kunci));
}

export async function bookingByCode(code: string): Promise<Result<BookingDetail>> {
  const kode = code.trim().toUpperCase();
  if (!BOOKING_CODE_RE.test(kode)) return fail("Kode booking tidak valid.", "VALIDATION");
  const cari = await cobaSatu(sql<{ id: string }[]>`select id from bookings where booking_code = ${kode}`);
  if (cari.error) return fail("Gagal memuat booking.", "DB");
  if (!cari.data) return fail("Booking tidak ditemukan.", "NOT_FOUND");
  return getBookingDetail(cari.data.id);
}

/** Ringkasan yang dibutuhkan bot untuk membalas penyewa dan mengabari admin. */
export function ringkasanBot(b: BookingDetail) {
  const batas = batasPembayaran(b, b.payment);
  const total = b.payment ? totalBayar(b.payment) : null;
  return {
    id: b.id,
    kode: b.booking_code,
    status: b.status,
    statusBayar: b.payment?.status ?? null,
    nama: b.tenant.name,
    hp: b.tenant.phone,
    lapak: `${slotDisplayName(b.slot)} (${b.slot.zone.name})`,
    tanggal: b.dates.map((d) => formatTanggal(d)),
    tagihan: b.payment ? Number(b.payment.amount) : null,
    kodeUnik: b.payment?.unique_code ?? null,
    total,
    totalTeks: total === null ? null : formatRupiah(total),
    batas: batas?.toISOString() ?? null,
    batasTeks: batas ? `${formatTanggalWaktu(batas)} WIB` : null,
    lewatBatas: batas !== null && batas.getTime() <= Date.now(),
    punyaBukti: Boolean(b.payment?.proof_url),
    waChat: b.payment?.wa_chat ?? null,
    kartuQris: `${getSiteUrl()}/api/qris/${b.booking_code}`,
    statusUrl: `${getSiteUrl()}/booking/${b.id}/status`,
  };
}

/** Catat chat WhatsApp penyewa; bot hanya mengirim kabar ke chat yang pernah menghubungi nomor kantor. */
export async function simpanChat(paymentId: string, chat: string): Promise<void> {
  await coba(sql`update admin_fee_payments set wa_chat = ${chat} where id = ${paymentId}`);
}

/** Akun admin yang dicatat sebagai pemverifikasi saat superadmin menyetujui lewat Discord. */
export async function adminPenyetuju(): Promise<Result<string>> {
  const r = await cobaSatu(
    sql<{ id: string }[]>`select id from admin_users where role = 'admin' order by created_at limit 1`,
  );
  if (r.error || !r.data) return fail("Akun admin DriveTech tidak ditemukan.", "NO_ADMIN");
  return ok(r.data.id);
}

const JAM_PENGINGAT = 3;

/**
 * Antrekan pengingat bayar (sekali per tagihan) untuk tagihan unpaid yang tenggatnya tinggal kurang dari
 * JAM_PENGINGAT jam, dan hanya kalau penyewa sudah pernah chat bot.
 */
export async function antrePengingat(): Promise<number> {
  type Baris = {
    id: string; amount: number; unique_code: number | null; wa_chat: string;
    booking: { booking_code: string; status: "pending_payment"; created_at: string; tenant: { name: string; phone: string | null } | null };
  };
  const r = await coba(sql<Baris[]>`
    select p.id, p.amount, p.unique_code, p.wa_chat,
           jsonb_build_object('booking_code', b.booking_code, 'status', b.status, 'created_at', b.created_at,
             'tenant', (select jsonb_build_object('name', t.name, 'phone', t.phone) from tenants t where t.id = b.tenant_id)) as booking
      from admin_fee_payments p
      join bookings b on b.id = p.booking_id
     where p.status = 'unpaid' and p.reminded_at is null and p.wa_chat is not null
       and b.status = 'pending_payment'`);
  if (r.error) return 0;
  let jumlah = 0;
  for (const p of r.data) {
    const batas = batasPembayaran(p.booking, { status: "unpaid", updated_at: p.booking.created_at });
    if (!batas) continue;
    const sisa = batas.getTime() - Date.now();
    if (sisa <= 0 || sisa > JAM_PENGINGAT * 60 * 60 * 1000) continue;
    const nama = p.booking.tenant?.name ?? "Bapak/Ibu";
    const body =
      `Halo ${nama}, kami mengingatkan pembayaran booking DriveTech *${p.booking.booking_code}* sebesar ` +
      `*${formatRupiah(totalBayar(p))}* kami tunggu sebelum *${formatTanggalWaktu(batas)} WIB*. ` +
      `Kalau sudah membayar, mohon kirimkan screenshot buktinya di chat ini ya. Terima kasih 🙏`;
    const tandai = await coba(sql`
      update admin_fee_payments set reminded_at = now()
       where id = ${p.id} and reminded_at is null returning id`);
    if (tandai.error || tandai.data.length === 0) continue;
    await coba(sql`
      insert into notification_outbox ${sql({
        recipient: p.booking.tenant?.phone ?? "-",
        body,
        kind: "pengingat",
        booking_code: p.booking.booking_code,
      })}`);
    jumlah += 1;
  }
  return jumlah;
}
