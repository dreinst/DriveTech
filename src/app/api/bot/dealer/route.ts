import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, readJsonObject } from "@/app/api/_lib/respond";
import { botAuthorized } from "@/lib/services/bot";
import { hubungkanChatDealer } from "@/lib/services/formulir-dealer";
import { ringkasDealer } from "./ringkas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bot/dealer { kode, chat? } (khusus bot WhatsApp kantor, header x-bot-key)
 * Dealer mengirim kode DL-0001-XXXXXXXX ke nomor kantor. Chat disimpan supaya PDF versi berikutnya
 * dikirim ke sana, lalu dibalas ringkasan berisi alamat PDF untuk dikirim bot. Tanpa `chat` = hanya membaca.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute("POST /api/bot/dealer", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const body = (await readJsonObject(request)) ?? {};
    const chat = typeof body.chat === "string" && body.chat ? body.chat.slice(0, 100) : null;
    const hasil = await hubungkanChatDealer(String(body.kode ?? ""), chat);
    if (!hasil.ok) return jsonError(hasil.error, 502, { code: "DB" });
    if (!hasil.data) return jsonError("Formulir dealer tidak ditemukan.", 404, { code: "NOT_FOUND" });
    return jsonOk(ringkasDealer(hasil.data));
  });
}
