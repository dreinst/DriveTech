import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, readJsonObject } from "@/app/api/_lib/respond";
import { totalBayar } from "@/lib/domain/harga";
import { botAuthorized } from "@/lib/services/bot";
import { kabarBayarDealer, kabarBayarDealerTerkirim } from "@/lib/services/formulir-dealer";
import { getSiteUrl } from "@/lib/site-url";
import { formatRupiah } from "@/lib/utils";
import { ringkasDealer } from "../ringkas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bot/dealer/kwitansi (khusus bot, header x-bot-key)
 * Kabar pembayaran lapak dealer untuk chat WhatsApp yang pernah meminta PDF formulir: jenis 'lunas' (kirim
 * kwitansi PDF) atau 'ditolak' (minta bukti bayar ulang di halaman formulir).
 */
export async function GET(request: Request): Promise<NextResponse> {
  return handleRoute("GET /api/bot/dealer/kwitansi", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const hasil = await kabarBayarDealer();
    if (!hasil.ok) return jsonError(hasil.error, 502, { code: "DB" });
    const situs = getSiteUrl().replace(/\/+$/, "");
    return jsonOk({
      kabar: hasil.data.map((d) => ({
        ...ringkasDealer(d),
        jenis: d.kabar_bayar,
        chat: d.wa_chat,
        nomor: d.kwitansi_no,
        totalTeks: formatRupiah(totalBayar({ amount: d.amount ?? 0, unique_code: d.unique_code })),
        alasan: d.alasan_tolak,
        kwitansi: d.kabar_bayar === "lunas" ? `${situs}/dealer/${d.token}/kwitansi` : null,
      })),
    });
  });
}

/** POST /api/bot/dealer/kwitansi { id }: kabar pembayaran sudah terkirim. */
export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute("POST /api/bot/dealer/kwitansi", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const body = (await readJsonObject(request)) ?? {};
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return jsonError("id wajib diisi.", 400, { code: "VALIDATION" });
    await kabarBayarDealerTerkirim(id);
    return jsonOk({ ok: true });
  });
}
