import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, mapResultToResponse, readJsonObject } from "@/app/api/_lib/respond";
import { bookingByCode, botAuthorized, ringkasanBot, simpanChat } from "@/lib/services/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

/**
 * POST /api/bot/booking/{kode} (khusus bot WhatsApp kantor, header x-bot-key)
 * Body opsional { chat } = JID chat penyewa yang mengirim kode booking; disimpan supaya kabar verifikasi,
 * penolakan, dan pengingat dikirim ke chat yang sama. Membalas ringkasan booking untuk kartu QRIS.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  return handleRoute("POST /api/bot/booking/[code]", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const { code } = await params;
    const found = await bookingByCode(code);
    if (!found.ok) return mapResultToResponse(found);
    const body = (await readJsonObject(request)) ?? {};
    const chat = typeof body.chat === "string" ? body.chat.trim() : "";
    if (chat && found.data.payment && found.data.payment.wa_chat !== chat) {
      await simpanChat(found.data.payment.id, chat);
      found.data.payment.wa_chat = chat;
    }
    return jsonOk(ringkasanBot(found.data));
  });
}
