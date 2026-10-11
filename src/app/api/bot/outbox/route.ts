import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, readJsonObject } from "@/app/api/_lib/respond";
import { coba, sql } from "@/lib/db";
import { antrePengingat, botAuthorized } from "@/lib/services/bot";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS_PERCOBAAN = 10;

/**
 * GET /api/bot/outbox (khusus bot WhatsApp kantor, header x-bot-key)
 * Mengantrekan pengingat bayar yang jatuh tempo, lalu membalas pesan WhatsApp yang menunggu dikirim beserta
 * chat tujuannya. Pesan untuk penyewa yang belum pernah chat bot ditandai skipped: nomor kantor tidak pernah
 * mengirim pesan pertama (risiko diblokir WhatsApp); penyewa tetap mendapat email. Pesan "created" juga dilewati
 * karena bot sudah membalas kartu QRIS saat penyewa pertama kali chat.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/bot/outbox", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    await antrePengingat();

    const antre = await coba(
      sql<{ id: string; body: string; kind: string; booking_code: string | null }[]>`
        select id, body, kind, booking_code from notification_outbox
         where status = 'pending' order by created_at limit 20`,
    );
    if (antre.error) return jsonError("Gagal membaca antrean.", 502, { code: "DB" });

    const kode = [...new Set(antre.data.map((m) => m.booking_code).filter((k): k is string => Boolean(k)))];
    const chats = new Map<string, string>();
    const sudahBayar = new Set<string>(); // pengingat yang antre sebelum bukti masuk atau ditolak tidak dikirim lagi
    if (kode.length > 0) {
      const r = await coba(sql<{ booking_code: string; wa_chat: string | null; status: string }[]>`
        select b.booking_code, p.wa_chat, p.status
          from bookings b join admin_fee_payments p on p.booking_id = b.id
         where b.booking_code in ${sql(kode)}`);
      for (const b of r.data ?? []) {
        if (b.wa_chat) chats.set(b.booking_code, b.wa_chat);
        if (b.status !== "unpaid") sudahBayar.add(b.booking_code);
      }
    }

    const kirim: { id: string; chat: string; text: string; kode: string | null; jenis: string }[] = [];
    const lewati: string[] = [];
    for (const m of antre.data) {
      // "created" dilewati: penyewa baru mendapat kartu QRIS langsung dari bot saat chat pertama.
      const basi = m.kind === "created" || (m.kind === "pengingat" && m.booking_code !== null && sudahBayar.has(m.booking_code));
      const chat = m.booking_code && !basi ? chats.get(m.booking_code) : undefined;
      if (chat) kirim.push({ id: m.id, chat, text: m.body, kode: m.booking_code, jenis: m.kind });
      else lewati.push(m.id);
    }
    if (lewati.length > 0) {
      await coba(sql`
        update notification_outbox
           set status = 'skipped', last_error = 'dilewati: belum pernah chat bot, atau pesan created'
         where id in ${sql(lewati)}`);
    }
    return jsonOk({ pesan: kirim });
  });
}

/** POST /api/bot/outbox { id, ok, error? }: hasil pengiriman satu pesan. */
export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute("POST /api/bot/outbox", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const body = (await readJsonObject(request)) ?? {};
    if (typeof body.id !== "string") return jsonError("id wajib diisi.", 400, { code: "VALIDATION" });
    if (body.ok === true) {
      await coba(sql`update notification_outbox set status = 'sent', sent_at = now() where id = ${body.id}`);
    } else {
      await coba(sql`
        update notification_outbox
           set attempts = attempts + 1,
               last_error = ${String(body.error ?? "gagal").slice(0, 300)},
               status = case when attempts + 1 >= ${MAKS_PERCOBAAN} then 'failed' else 'pending' end
         where id = ${body.id}`);
    }
    return jsonOk({ ok: true });
  });
}
