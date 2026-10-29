import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, readJsonObject } from "@/app/api/_lib/respond";
import { botAuthorized } from "@/lib/services/bot";
import { kabarDealer, kabarDealerTerkirim } from "@/lib/services/formulir-dealer";
import { ringkasDealer } from "../ringkas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/dealer/kabar (khusus bot, header x-bot-key)
 * Formulir yang PDF-nya berubah sejak dikirim: jenis 'ditandatangani' (tanda tangan menyusul) atau
 * 'diterima' (panitia menerima). Hanya chat yang pernah meminta PDF ke nomor kantor.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/bot/dealer/kabar", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const hasil = await kabarDealer();
    if (!hasil.ok) return jsonError(hasil.error, 502, { code: "DB" });
    return jsonOk({ kabar: hasil.data.map((d) => ({ ...ringkasDealer(d), jenis: d.kabar, chat: d.wa_chat })) });
  });
}

/** POST /api/bot/dealer/kabar { id }: PDF terbaru sudah terkirim. */
export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute("POST /api/bot/dealer/kabar", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const body = (await readJsonObject(request)) ?? {};
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return jsonError("id wajib diisi.", 400, { code: "VALIDATION" });
    await kabarDealerTerkirim(id);
    return jsonOk({ ok: true });
  });
}
