import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, readJsonObject } from "@/app/api/_lib/respond";
import { antrePengingat, botAuthorized } from "@/lib/services/bot";
import { createAdminSupabase } from "@/lib/supabase/admin";

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

    const supabase = createAdminSupabase();
    const antre = await supabase
      .from("notification_outbox")
      .select("id, body, kind, booking_code")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20);
    if (antre.error) return jsonError("Gagal membaca antrean.", 502, { code: "DB" });

    const kode = [...new Set(antre.data.map((m) => m.booking_code).filter((k): k is string => Boolean(k)))];
    const chats = new Map<string, string>();
    if (kode.length > 0) {
      const r = await supabase.from("bookings").select("booking_code, payment:admin_fee_payments(wa_chat)").in("booking_code", kode);
      for (const b of (r.data ?? []) as unknown as { booking_code: string; payment: { wa_chat: string | null } | null }[]) {
        if (b.payment?.wa_chat) chats.set(b.booking_code, b.payment.wa_chat);
      }
    }

    const kirim: { id: string; chat: string; text: string; kode: string | null; jenis: string }[] = [];
    const lewati: string[] = [];
    for (const m of antre.data) {
      // "created" dilewati: penyewa baru mendapat kartu QRIS langsung dari bot saat chat pertama.
      const chat = m.booking_code && m.kind !== "created" ? chats.get(m.booking_code) : undefined;
      if (chat) kirim.push({ id: m.id, chat, text: m.body, kode: m.booking_code, jenis: m.kind });
      else lewati.push(m.id);
    }
    if (lewati.length > 0) {
      await supabase
        .from("notification_outbox")
        .update({ status: "skipped", last_error: "dilewati: belum pernah chat bot, atau pesan created" })
        .in("id", lewati);
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
    const supabase = createAdminSupabase();
    if (body.ok === true) {
      await supabase.from("notification_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", body.id);
    } else {
      const lama = await supabase.from("notification_outbox").select("attempts").eq("id", body.id).maybeSingle();
      const attempts = (lama.data?.attempts ?? 0) + 1;
      await supabase
        .from("notification_outbox")
        .update({ attempts, last_error: String(body.error ?? "gagal").slice(0, 300), status: attempts >= MAKS_PERCOBAAN ? "failed" : "pending" })
        .eq("id", body.id);
    }
    return jsonOk({ ok: true });
  });
}
