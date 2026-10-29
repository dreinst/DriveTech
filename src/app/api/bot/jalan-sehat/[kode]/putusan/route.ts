import type { NextResponse } from "next/server";

import { handleRoute, jsonError, jsonOk, mapResultToResponse, readJsonObject } from "@/app/api/_lib/respond";
import { nomorTiket } from "@/lib/domain/jalan-sehat";
import { adminPenyetuju, botAuthorized } from "@/lib/services/bot";
import { pesananByKode, tolakPesanan, verifikasiPesanan } from "@/lib/services/jalan-sehat";
import { catatLog } from "@/lib/services/log";
import { ringkasDenganTiket } from "../../ringkas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ kode: string }> };

/**
 * POST /api/bot/jalan-sehat/{kode}/putusan (khusus bot D'Pro Ops, header x-bot-key)
 * Body { aksi: "setujui" | "tolak", alasan? } dari tombol Setujui/Tolak di Discord. Memakai verifikasiPesanan/
 * tolakPesanan yang sama dengan /drivetechadmin/jalan-sehat, jadi tiket dibuat dan kabar ke pemesan dikirim bot WA.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  return handleRoute("POST /api/bot/jalan-sehat/[kode]/putusan", async () => {
    if (!botAuthorized(request)) return jsonError("Tidak diizinkan.", 401, { code: "UNAUTHORIZED" });
    const body = (await readJsonObject(request)) ?? {};
    const aksi = body.aksi;
    if (aksi !== "setujui" && aksi !== "tolak") return jsonError("Aksi harus setujui atau tolak.", 400, { code: "VALIDATION" });
    const alasan = typeof body.alasan === "string" && body.alasan.trim().length >= 3
      ? body.alasan.trim().slice(0, 200)
      : "Pembayaran belum kami temukan";

    const p = await pesananByKode((await params).kode);
    if (!p) return jsonError("Pesanan tidak ditemukan.", 404, { code: "NOT_FOUND" });
    const admin = await adminPenyetuju();
    if (!admin.ok) return mapResultToResponse(admin);

    if (aksi === "setujui") {
      const hasil = await verifikasiPesanan(p.id);
      if (!hasil.ok) return mapResultToResponse(hasil);
      const ids = hasil.data;
      const rentang = ids.length > 1 ? `${nomorTiket(ids[0])} sampai ${nomorTiket(ids.at(-1) ?? ids[0])}` : nomorTiket(ids[0]);
      await catatLog(admin.data, "jalan_sehat_lunas", `pesanan ${p.id}, tiket ${rentang} lewat Discord`);
    } else {
      const hasil = await tolakPesanan(p.id, alasan);
      if (!hasil.ok) return mapResultToResponse(hasil);
      await catatLog(admin.data, "jalan_sehat_tolak", `pesanan ${p.id} lewat Discord: ${alasan}`);
    }

    const terbaru = await pesananByKode(p.kode);
    return terbaru ? jsonOk(await ringkasDenganTiket(terbaru)) : jsonError("Pesanan tidak ditemukan.", 404, { code: "NOT_FOUND" });
  });
}
