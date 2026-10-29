import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, readJsonObject } from "@/app/api/_lib/respond";
import { botAuthorized } from "@/lib/services/bot";
import { pesananByKode, simpanChatPesanan } from "@/lib/services/jalan-sehat";
import { ringkasDenganTiket } from "../ringkas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ kode: string }> };

/**
 * POST /api/bot/jalan-sehat/{kode} (khusus bot, header x-bot-key)
 * Body opsional { chat }: JID chat yang menyebut kode pesanan (biasanya pemesan lewat web yang menekan tombol
 * WhatsApp). Disimpan supaya bukti bayar dan kabar lunas tertaut ke chat itu. Membalas ringkasan pesanan.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  return handleRoute("POST /api/bot/jalan-sehat/[kode]", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const p = await pesananByKode((await params).kode);
    if (!p) return jsonError("Pesanan tidak ditemukan.", 404, { code: "NOT_FOUND" });
    const body = (await readJsonObject(request)) ?? {};
    const chat = typeof body.chat === "string" ? body.chat.trim() : "";
    if (chat && p.wa_chat !== chat) {
      await simpanChatPesanan(p.id, chat);
      p.wa_chat = chat;
    }
    return jsonOk(await ringkasDenganTiket(p));
  });
}
