import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, mapResultToResponse } from "@/app/api/_lib/respond";
import { MAX_PROOF_BYTES, STORAGE_BUCKET_BUKTI } from "@/lib/domain/constants";
import { botAuthorized } from "@/lib/services/bot";
import { kirimBuktiPesanan, pesananByKode } from "@/lib/services/jalan-sehat";
import { simpanBerkas } from "@/lib/storage";
import { ringkasPesanan } from "../../ringkas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ kode: string }> };

const EKSTENSI: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * POST /api/bot/jalan-sehat/{kode}/bukti (khusus bot, header x-bot-key)
 * Body = gambar bukti bayar dari WhatsApp (Content-Type image/jpeg|png|webp). Disimpan di folder privat
 * bukti-transfer, pesanan berstatus "dicek" sampai admin memverifikasi. Membalas ringkasan pesanan.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  return handleRoute("POST /api/bot/jalan-sehat/[kode]/bukti", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const p = await pesananByKode((await params).kode);
    if (!p) return jsonError("Pesanan tidak ditemukan.", 404, { code: "NOT_FOUND" });
    if (p.status === "lunas") return jsonOk(ringkasPesanan(p));

    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim();
    const ext = EKSTENSI[mime];
    if (!ext) return jsonError("Bukti harus berupa gambar JPG, PNG, atau WEBP.", 415, { code: "PROOF_TYPE" });
    const data = Buffer.from(await request.arrayBuffer());
    if (data.length === 0 || data.length > MAX_PROOF_BYTES * 3) {
      return jsonError("Ukuran bukti tidak wajar.", 413, { code: "PROOF_TOO_LARGE" });
    }
    const url = await simpanBerkas(STORAGE_BUCKET_BUKTI, `js-${p.kode}-wa-${Date.now()}.${ext}`, data);
    if (!url) return jsonError("Bukti gagal disimpan.", 502, { code: "UPLOAD_FAILED" });

    const hasil = await kirimBuktiPesanan(p.id, url);
    return hasil.ok ? jsonOk(ringkasPesanan(hasil.data)) : mapResultToResponse(hasil);
  });
}
