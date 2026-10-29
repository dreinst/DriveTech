import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, readJsonObject } from "@/app/api/_lib/respond";
import { botAuthorized } from "@/lib/services/bot";
import { kabarPesanan, kabarTerkirim, pesananByKode } from "@/lib/services/jalan-sehat";
import { ringkasDenganTiket } from "../ringkas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/jalan-sehat/kabar (khusus bot, header x-bot-key)
 * Pesanan yang perlu dikabari ke chat WhatsApp-nya: jenis 'lunas' (kirim tiket PDF) atau 'ditolak'
 * (minta bukti ulang, alasan di `alasan`). Hanya chat yang pernah menghubungi nomor kantor.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/bot/jalan-sehat/kabar", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const hasil = await kabarPesanan();
    if (!hasil.ok) return jsonError(hasil.error, 502, { code: "DB" });
    return jsonOk({
      kabar: await Promise.all(
        hasil.data.map(async (p) => ({ ...(await ringkasDenganTiket(p)), jenis: p.kabar, chat: p.wa_chat })),
      ),
    });
  });
}

/** POST /api/bot/jalan-sehat/kabar { kode }: kabar pesanan itu sudah terkirim. */
export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute("POST /api/bot/jalan-sehat/kabar", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const body = (await readJsonObject(request)) ?? {};
    const p = await pesananByKode(String(body.kode ?? ""));
    if (!p) return jsonError("Pesanan tidak ditemukan.", 404, { code: "NOT_FOUND" });
    await kabarTerkirim(p.id);
    return jsonOk({ ok: true });
  });
}
